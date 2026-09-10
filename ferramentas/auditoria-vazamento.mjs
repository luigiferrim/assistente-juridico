#!/usr/bin/env node
/**
 * Auditoria de vazamento — o repositório não pode conter dado real do escritório.
 *
 * Este é um projeto que lê processo judicial. O invariante "dado real nunca entra
 * no git" não pode depender da atenção de quem commita; precisa de um portão que
 * quebre o build. É o que este script faz, na árvore e — com `--historico` — em
 * todos os blobs de todos os commits de todas as refs, mais mensagens e autoria.
 *
 * O que procura:
 *   • números CNJ com dígito verificador VÁLIDO. Os exemplos do projeto têm DV
 *     inválido de propósito; um CNJ que fecha a conta é suspeito de ser real.
 *   • inscrições de OAB fora da família fictícia (10000–10099).
 *   • e-mails fora dos domínios de exemplo.
 *   • segredos em formato conhecido (chaves Google/GitHub/AWS/Anthropic, tokens
 *     OAuth, chave privada, URL de implantação do Apps Script) e atribuições
 *     `token = "..."` cujo valor não é um placeholder.
 *   • termos sigilosos de uma lista que NUNCA entra no repositório (nomes de
 *     pessoas, clientes, processos, telefones): por `--lista arquivo` na máquina
 *     do autor, ou pela variável SIGILO_DENYLIST (segredo do GitHub Actions).
 *     Sem lista, os detectores por padrão continuam valendo e o resumo declara
 *     a lacuna — não finge cobertura que não tem.
 *   • caminhos que o .gitignore deveria ter barrado (dados/, coleta/, *.db, *.pdf…).
 *   • o próprio .gitignore: as regras obrigatórias precisam continuar lá.
 *
 * Uso:
 *   node ferramentas/auditoria-vazamento.mjs                      # árvore rastreada
 *   node ferramentas/auditoria-vazamento.mjs --historico          # + histórico completo
 *   node ferramentas/auditoria-vazamento.mjs --lista ~/termos.txt # + lista sigilosa (um termo por linha)
 *
 * Qualquer achado → código de saída 1. O build quebra; não avisa.
 * A saída é REDIGIDA (3 caracteres + tamanho): o log do CI é público, e o relatório
 * de um vazamento não pode ser o segundo vazamento.
 */

import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// ---------------------------------------------------------------------------
// Convenções do projeto: o que é fictício por construção
// ---------------------------------------------------------------------------

/**
 * Família fictícia de OAB usada em código, testes e documentação: 10000–10099,
 * mais o sentinela 99999 ("advogado fora do cadastro" nos testes do briefing).
 */
export const OAB_FICTICIA = /^(?:100\d{2}|99999)$/;

/**
 * Números sintéticos cujo dígito verificador fechou por acaso. Cada entrada aqui
 * precisa de justificativa: este veio do mapa de substituição da higienização
 * (é um substituto, não um dado real) e foi corrigido para DV inválido no commit
 * 4137ff9 — mas continua no primeiro commit publicado, e o histórico é auditado.
 */
export const CNJ_SINTETICOS_COM_DV_VALIDO = new Set(["0900002-26.2025.5.12.0901"]);

/** Domínios de e-mail aceitos em exemplos. Qualquer outro é achado. */
export const DOMINIOS_DE_EXEMPLO = new Set([
  "exemplo.com",
  "exemplo.com.br",
  "exemplo-cliente.com",
  "escritorio.com.br",
  "example.com",
  "example.org",
  "example.net",
  "b.com",
]);

/**
 * Identidade pública do autor — decisão dele (README, package.json, autoria dos
 * commits). Não é dado de cliente; fica fora da varredura da lista sigilosa
 * porque o sobrenome casa dentro do próprio handle.
 */
export const IDENTIDADE_PUBLICA_DO_AUTOR = ["luigiferrimaines@gmail.com", "github.com/luigiferrim", "luigiferrim"];
const EMAILS_PERMITIDOS = new Set(["luigiferrimaines@gmail.com", "noreply@github.com"]);
const DOMINIOS_PERMITIDOS = new Set(["users.noreply.github.com", "github.com"]);

/** Regras que o .gitignore precisa conter — cada linha, literalmente. */
export const GITIGNORE_OBRIGATORIO = [
  "dados/",
  "*.db",
  "*.db-wal",
  "*.db-shm",
  "*.jsonl",
  "*.log",
  "atas das audiencias/",
  "spikes/amostras/",
  "tests/fixtures/reais/",
  "*.pdf",
  ".env",
  ".env.*",
  "*.pem",
  "*.pfx",
  "*.p12",
  "coleta/",
  "spikes/relatorios/",
  "node_modules/",
  ".DS_Store",
];

/** Caminhos que nunca podem estar versionados, em nenhum commit. */
const CAMINHOS_PROIBIDOS = [
  [/^dados\//, "pasta dados/ (config, banco, briefings, logs)"],
  [/^coleta\//, "pasta coleta/ (material de trabalho com casos reais)"],
  [/^spikes\/relatorios\//, "relatórios dos spikes (casos reais)"],
  [/^spikes\/amostras\//, "amostras dos spikes (documentos reais)"],
  [/^tests\/fixtures\/reais\//, "fixtures reais"],
  [/^atas/i, "atas de audiência"],
  [/(^|\/)\.env(\.|$)/, "arquivo .env"],
  [/\.(db|db-wal|db-shm|sqlite3?|jsonl|log|pdf|pem|p12|pfx|key|eml)$/i, "extensão de dado ou segredo"],
  [/(^|\/)\.DS_Store$/, "lixo do Finder"],
  [/^\.claude\//, "configuração local de ferramenta"],
];

// ---------------------------------------------------------------------------
// Detectores por padrão
// ---------------------------------------------------------------------------

const UFS = "AC|AL|AM|AP|BA|CE|DF|ES|GO|MA|MG|MS|MT|PA|PB|PE|PI|PR|RJ|RN|RO|RR|RS|SC|SE|SP|TO";
const RE_CNJ = /\b(\d{7})-?(\d{2})\.?(\d{4})\.?(\d)\.?(\d{2})\.?(\d{4})\b/g;
const RE_OAB_ROTULO = /\bOAB\b[\s:nº°./-]*(\d{3,6})\b/gi;
const RE_OAB_UF = new RegExp(`\\b(\\d{4,6})\\s*/\\s*(?:${UFS})\\b`, "g");
const RE_EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;

const PADROES_DE_SEGREDO = [
  ["chave-api-google", /\bAIza[0-9A-Za-z_-]{35}\b/g],
  ["token-github", /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})\b/g],
  ["token-oauth-google", /\b(?:ya29\.[0-9A-Za-z_-]{20,}|1\/\/0[0-9A-Za-z_-]{28,})/g],
  ["chave-privada", /-----BEGIN [A-Z ]*PRIVATE KEY-----/g],
  ["chave-aws", /\bAKIA[0-9A-Z]{16}\b/g],
  ["token-slack", /\bxox[abprs]-[0-9A-Za-z-]{10,}/g],
  ["chave-anthropic-openai", /\bsk-(?:ant-)?[0-9A-Za-z_-]{20,}\b/g],
  ["implantacao-apps-script", /script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,}/g],
  [
    "atribuicao-de-segredo",
    /\b(?:token|senha|password|passwd|secret|segredo|api[_-]?key|client[_-]?secret|refresh[_-]?token)\b["']?\s*[:=]\s*["']([^"'\s]{16,})["']/gi,
  ],
];
const PLACEHOLDER = /COLE|AQUI|EXEMPLO|TESTE|PLACEHOLDER|SUBSTITU|xxx|<|>|\{\{|\$\{|\.\.\./i;

/** Dígito verificador do CNJ (Res. CNJ 65/2008): 98 − (NNNNNNNAAAAJTROOOO00 mod 97). */
export function dvCnjValido({ numero, dv, ano, justica, tribunal, origem }) {
  const resto = BigInt(`${numero}${ano}${justica}${tribunal}${origem}00`) % 97n;
  return 98n - resto === BigInt(dv);
}

/** Sem acento, sem caixa — a lista sigilosa casa "José" com "jose". */
export function normalizar(s) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Lista sigilosa: um termo por linha; ignora vazias, comentários e termos curtos (ruído). */
export function carregarLista(texto) {
  const termos = texto
    .split(/\r?\n/)
    .map((t) => t.trim())
    .filter((t) => t && !t.startsWith("#") && t.length >= 4)
    .map(normalizar);
  return [...new Set(termos)];
}

/** Nunca reproduzir o dado: 3 caracteres e o tamanho bastam para localizar. */
export function redigir(s) {
  return s.length <= 3 ? "…" : `${s.slice(0, 3)}…(${s.length} caracteres)`;
}

function linhaDe(texto, indice) {
  let linha = 1;
  for (let i = 0; i < indice; i++) if (texto.charCodeAt(i) === 10) linha++;
  return linha;
}

function emailPermitido(email) {
  const [, dominio] = email.toLowerCase().split("@");
  return (
    EMAILS_PERMITIDOS.has(email.toLowerCase()) ||
    DOMINIOS_DE_EXEMPLO.has(dominio) ||
    DOMINIOS_PERMITIDOS.has(dominio)
  );
}

/**
 * Aplica todos os detectores de conteúdo a um texto. Devolve achados já redigidos:
 * { regra, origem, linha, detalhe }. `lista` são termos já normalizados.
 */
export function analisarTexto(texto, { origem, lista = [] } = {}) {
  const achados = [];
  const achar = (regra, indice, detalhe) => achados.push({ regra, origem, linha: linhaDe(texto, indice), detalhe });

  for (const m of texto.matchAll(RE_CNJ)) {
    const [, numero, dv, ano, justica, tribunal, orig] = m;
    if (CNJ_SINTETICOS_COM_DV_VALIDO.has(m[0])) continue;
    if (dvCnjValido({ numero, dv, ano, justica, tribunal, origem: orig })) {
      achar("cnj-valido", m.index, `número CNJ com DV válido ${redigir(m[0])}`);
    }
  }

  for (const re of [RE_OAB_ROTULO, RE_OAB_UF]) {
    for (const m of texto.matchAll(re)) {
      if (!OAB_FICTICIA.test(m[1])) achar("oab", m.index, `inscrição OAB fora da família fictícia ${redigir(m[1])}`);
    }
  }

  for (const m of texto.matchAll(RE_EMAIL)) {
    if (!emailPermitido(m[0])) achar("email", m.index, `e-mail fora dos domínios de exemplo ${redigir(m[0])}`);
  }

  for (const [nome, re] of PADROES_DE_SEGREDO) {
    for (const m of texto.matchAll(re)) {
      const valor = m[1] ?? m[0];
      if (nome === "atribuicao-de-segredo" && PLACEHOLDER.test(valor)) continue;
      achar("segredo", m.index, `${nome} ${redigir(valor)}`);
    }
  }

  if (lista.length) {
    let alvo = normalizar(texto);
    for (const trecho of IDENTIDADE_PUBLICA_DO_AUTOR) alvo = alvo.split(normalizar(trecho)).join(" ");
    lista.forEach((termo, i) => {
      const indice = alvo.indexOf(termo);
      if (indice < 0) return;
      let ocorrencias = 0;
      for (let p = indice; p >= 0; p = alvo.indexOf(termo, p + termo.length)) ocorrencias++;
      achar("termo-sigiloso", indice, `termo nº ${i + 1} da lista (${termo.length} caracteres), ${ocorrencias} ocorrência(s)`);
    });
  }

  return achados;
}

/** Um caminho versionado que nunca poderia ter entrado. O nome do arquivo também é redigido. */
export function verificarCaminho(caminho, origem = "árvore") {
  const regra = CAMINHOS_PROIBIDOS.find(([re]) => re.test(caminho));
  if (!regra) return [];
  const partes = caminho.split("/");
  const nome = partes.pop();
  const pasta = partes.length ? `${partes.join("/")}/` : "";
  return [{ regra: "caminho-proibido", origem, linha: 0, detalhe: `${regra[1]}: ${pasta}${redigir(nome)}` }];
}

export function verificarGitignore(conteudo) {
  const linhas = new Set(conteudo.split(/\r?\n/).map((l) => l.trim()));
  return GITIGNORE_OBRIGATORIO.filter((regra) => !linhas.has(regra)).map((regra) => ({
    regra: "gitignore",
    origem: ".gitignore",
    linha: 0,
    detalhe: `regra obrigatória ausente: \`${regra}\``,
  }));
}

export function ehBinario(buf) {
  return buf.subarray(0, 8000).includes(0);
}

// ---------------------------------------------------------------------------
// Git
// ---------------------------------------------------------------------------

function git(args, opcoes = {}) {
  return execFileSync("git", args, { cwd: RAIZ, encoding: "utf8", maxBuffer: 1 << 28, ...opcoes });
}

function arquivosDaArvore() {
  return git(["ls-files", "-z"]).split("\0").filter(Boolean);
}

function commitsDeTodasAsRefs() {
  return git(["rev-list", "--all"]).trim().split("\n").filter(Boolean);
}

function entradasDoCommit(sha) {
  return git(["ls-tree", "-r", "-z", sha])
    .split("\0")
    .filter(Boolean)
    .map((l) => {
      const [meta, caminho] = l.split("\t");
      const [, tipo, blob] = meta.split(" ");
      return { tipo, blob, caminho };
    })
    .filter((e) => e.tipo === "blob");
}

/** Lê vários blobs numa chamada só (`cat-file --batch`). Devolve Map sha → Buffer. */
function lerBlobs(shas) {
  const resultado = new Map();
  if (!shas.length) return resultado;
  const saida = spawnSync("git", ["cat-file", "--batch"], {
    cwd: RAIZ,
    input: `${shas.join("\n")}\n`,
    maxBuffer: 1 << 30,
  });
  if (saida.status !== 0) throw new Error(`git cat-file falhou: ${saida.stderr}`);
  const buf = saida.stdout;
  let pos = 0;
  while (pos < buf.length) {
    const fim = buf.indexOf(10, pos);
    if (fim < 0) break;
    const [sha, tipo, tamanho] = buf.subarray(pos, fim).toString("utf8").split(" ");
    pos = fim + 1;
    if (tipo === "blob") {
      const n = Number(tamanho);
      resultado.set(sha, buf.subarray(pos, pos + n));
      pos += n + 1;
    }
  }
  return resultado;
}

function mensagensDeCommit() {
  const bruto = git(["log", "--all", "--format=%H%x1f%an%x1f%ae%x1f%cn%x1f%ce%x1f%B%x1e"]);
  return bruto
    .split("\x1e")
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b) => {
      const [sha, autor, emailAutor, committer, emailCommitter, mensagem] = b.split("\x1f");
      return { sha, autor, emailAutor, committer, emailCommitter, mensagem };
    });
}

// ---------------------------------------------------------------------------
// Execução
// ---------------------------------------------------------------------------

function lerLista(argv) {
  const i = argv.indexOf("--lista");
  if (i >= 0) {
    if (!argv[i + 1]) throw new Error("--lista exige um caminho");
    return { lista: carregarLista(readFileSync(argv[i + 1], "utf8")), fonte: "arquivo" };
  }
  if (process.env.SIGILO_DENYLIST?.trim()) {
    return { lista: carregarLista(process.env.SIGILO_DENYLIST), fonte: "variável SIGILO_DENYLIST" };
  }
  return { lista: [], fonte: null };
}

export function auditar({ historico = false, lista = [] } = {}) {
  const achados = [];
  const contagem = { arquivos: 0, binarios: 0, commits: 0, blobs: 0, mensagens: 0 };

  for (const caminho of arquivosDaArvore()) {
    contagem.arquivos++;
    achados.push(...verificarCaminho(caminho, "árvore"));
    const buf = readFileSync(join(RAIZ, caminho));
    if (ehBinario(buf)) {
      contagem.binarios++;
      continue;
    }
    achados.push(...analisarTexto(buf.toString("utf8"), { origem: caminho, lista }));
  }
  achados.push(...verificarGitignore(readFileSync(join(RAIZ, ".gitignore"), "utf8")));

  if (historico) {
    const commits = commitsDeTodasAsRefs();
    contagem.commits = commits.length;
    const primeiraAparicao = new Map(); // blob → { caminho, sha }
    for (const sha of commits.reverse()) {
      for (const e of entradasDoCommit(sha)) {
        if (!primeiraAparicao.has(e.blob)) primeiraAparicao.set(e.blob, { caminho: e.caminho, sha });
        achados.push(...verificarCaminho(e.caminho, `commit ${sha.slice(0, 7)}`));
      }
    }
    const blobs = lerBlobs([...primeiraAparicao.keys()]);
    contagem.blobs = blobs.size;
    for (const [blob, conteudo] of blobs) {
      if (ehBinario(conteudo)) continue;
      const { caminho, sha } = primeiraAparicao.get(blob);
      achados.push(...analisarTexto(conteudo.toString("utf8"), { origem: `${caminho} @ ${sha.slice(0, 7)}`, lista }));
    }
    for (const c of mensagensDeCommit()) {
      contagem.mensagens++;
      const origem = `commit ${c.sha.slice(0, 7)}`;
      achados.push(...analisarTexto(c.mensagem, { origem: `${origem} (mensagem)`, lista }));
      for (const email of [c.emailAutor, c.emailCommitter]) {
        if (!emailPermitido(email)) {
          achados.push({ regra: "email", origem: `${origem} (autoria)`, linha: 0, detalhe: `e-mail de autoria fora da lista ${redigir(email)}` });
        }
      }
      for (const nome of [c.autor, c.committer]) {
        achados.push(...analisarTexto(nome, { origem: `${origem} (autoria)`, lista }).filter((a) => a.regra === "termo-sigiloso"));
      }
    }
  }

  // Um mesmo achado (mesma regra, origem, detalhe) conta uma vez.
  const vistos = new Set();
  const unicos = achados.filter((a) => {
    const chave = `${a.regra}|${a.origem}|${a.linha}|${a.detalhe}`;
    if (vistos.has(chave)) return false;
    vistos.add(chave);
    return true;
  });
  return { achados: unicos, contagem };
}

export function resumoMarkdown({ achados, contagem }, { historico, lista, fonteDaLista }) {
  const l = [];
  l.push("## Auditoria de vazamento");
  l.push("");
  l.push("| Escopo | Valor |");
  l.push("|---|---|");
  l.push(`| Arquivos na árvore | ${contagem.arquivos} (${contagem.binarios} binário(s) ignorado(s)) |`);
  l.push(`| Histórico | ${historico ? `${contagem.commits} commit(s), ${contagem.blobs} blob(s) únicos, ${contagem.mensagens} mensagem(ns)` : "não varrido (use --historico)"} |`);
  l.push(
    `| Lista sigilosa | ${lista.length ? `${lista.length} termo(s), via ${fonteDaLista}` : "**ausente** — só os detectores por padrão (CNJ, OAB, e-mail, segredo, caminho, .gitignore)"} |`,
  );
  l.push("| Detectores | cnj-valido · oab · email · segredo · termo-sigiloso · caminho-proibido · gitignore |");
  l.push("");
  if (!achados.length) {
    l.push("### ✅ Nenhum achado");
  } else {
    l.push(`### ❌ ${achados.length} achado(s) — o build falha`);
    l.push("");
    for (const a of achados) {
      l.push(`- \`${a.regra}\` em \`${a.origem}${a.linha ? `:${a.linha}` : ""}\` — ${a.detalhe}`);
    }
    l.push("");
    l.push("Os trechos estão redigidos de propósito. Localize pelo arquivo e linha, corrija e, se já foi commitado, reescreva o histórico antes de publicar.");
  }
  return l.join("\n");
}

function principal(argv) {
  const historico = argv.includes("--historico");
  const { lista, fonte } = lerLista(argv);
  const resultado = auditar({ historico, lista });
  const md = resumoMarkdown(resultado, { historico, lista, fonteDaLista: fonte });
  console.log(md);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${md}\n`);
  process.exit(resultado.achados.length ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  principal(process.argv.slice(2));
}
