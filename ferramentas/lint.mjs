#!/usr/bin/env node
/**
 * Lint — com o que o Node traz, sem devDependency.
 *
 * Não é um ESLint: não há análise semântica (variável não usada, escopo). O que há:
 *
 *  1. Sintaxe de todo `.mjs` (`node --check`), todo `.json` (JSON.parse) e todo
 *     `.py` (ast.parse, quando há python3).
 *  2. Higiene de texto: CRLF, tab em código, espaço no fim da linha, quebra final.
 *  3. Regras de ESM que, violadas, só estourariam em runtime: import relativo sem
 *     extensão, módulo nativo sem `node:`, `require` em módulo ESM.
 *  4. As regras que encodam DECISÕES do projeto — o que um linter genérico jamais
 *     saberia:
 *       log-estruturado        console só nos pontos de entrada e no próprio logger
 *       env-com-prefixo        variável de ambiente começa com ASSISTENTE_
 *       segredo-fora-do-disco  segredo não vem de env nem de .env; vem do Keychain
 *       sem-ia-em-src          nenhuma chamada de modelo no pipeline determinístico
 *       teste-sem-rede         a suíte é hermética: sem http/net/dns/fetch
 *       migracao-strict        toda tabela nasce STRICT
 *       auditoria-append-only  os triggers de audit_log existem e nenhuma migração os relaxa
 *       portao-de-prazos       APROVADO_PELA_ADVOGADA segue false até o gabarito
 *
 * Uso: node ferramentas/lint.mjs   → código 1 se houver qualquer achado.
 */

import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { builtinModules } from "node:module";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const achado = (caminho, linha, regra, mensagem) => ({ caminho, linha, regra, mensagem });
const ehComentario = (l) => /^\s*(\/\/|\*|\/\*)/.test(l);

const CODIGO_SEM_TAB = new Set([".mjs", ".js", ".json", ".yml", ".yaml", ".sql", ".py"]);
const CONSOLE_PERMITIDO = [/^src\/scripts\//, /^src\/worker\/principal\.mjs$/, /^src\/core\/diagnostico\.mjs$/, /^src\/core\/auditoria\.mjs$/];
const MODULOS_DE_REDE = /^node:(http|https|http2|net|dns|tls|dgram)$/;
const PACOTES_DE_IA = /^(@anthropic-ai\/|openai$|openai\/|@google\/generative-ai|langchain|@langchain\/)/;
const ENDPOINTS_DE_IA = /api\.anthropic\.com|api\.openai\.com|generativelanguage\.googleapis\.com/;

function ehBuiltinSemPrefixo(alvo) {
  if (alvo.startsWith("node:")) return false;
  const raiz = alvo.split("/")[0];
  return builtinModules.includes(raiz) || builtinModules.includes(`node:${raiz}`);
}

// ---------------------------------------------------------------------------
// 2. Higiene de texto
// ---------------------------------------------------------------------------

export function verificarTexto(caminho, texto) {
  const achados = [];
  const ext = extname(caminho);
  if (texto.includes("\r")) achados.push(achado(caminho, 0, "crlf", "quebra de linha CRLF — o repositório usa LF"));
  const linhas = texto.split("\n").map((l) => l.replace(/\r$/, "")); // o CRLF já foi acusado acima
  if (texto.length && !texto.endsWith("\n")) achados.push(achado(caminho, linhas.length, "quebra-final", "arquivo não termina com quebra de linha"));
  linhas.forEach((l, i) => {
    if (ext !== ".md" && /[ \t]+$/.test(l)) achados.push(achado(caminho, i + 1, "espaco-no-fim", "espaço em branco no fim da linha"));
    if (CODIGO_SEM_TAB.has(ext) && l.includes("\t")) achados.push(achado(caminho, i + 1, "tab", "tabulação em código — a indentação é de 2 espaços"));
  });
  return achados;
}

// ---------------------------------------------------------------------------
// 3 e 4. ESM e decisões do projeto, em arquivos .mjs
// ---------------------------------------------------------------------------

export function verificarCodigo(caminho, codigo) {
  const achados = [];
  const emSrc = caminho.startsWith("src/");
  const emTests = caminho.startsWith("tests/");
  const achar = (linha, regra, mensagem) => achados.push(achado(caminho, linha, regra, mensagem));

  codigo.split("\n").forEach((linha, i) => {
    if (ehComentario(linha)) return;
    const n = i + 1;

    // A mensagem é montada em partes para que este arquivo não acuse a si mesmo.
    if (/\brequire\s*\(|\bmodule\.exports\b/.test(linha)) achar(n, "esm-puro", `CommonJS (require ou module${"."}exports) em módulo ESM — use import/export`);

    for (const m of linha.matchAll(/\b(?:from|import)\s*\(?\s*["']([^"']+)["']/g)) {
      const alvo = m[1];
      if (alvo.startsWith(".") && !/\.(mjs|json)$/.test(alvo)) {
        achar(n, "import-com-extensao", `import relativo sem extensão ("${alvo}") — em ESM o Node não resolve; termine com .mjs`);
      } else if (ehBuiltinSemPrefixo(alvo)) {
        achar(n, "builtin-com-prefixo-node", `módulo nativo sem prefixo ("${alvo}") — escreva "node:${alvo}"`);
      }
      if (emSrc && PACOTES_DE_IA.test(alvo)) achar(n, "sem-ia-em-src", `pacote de modelo ("${alvo}") no pipeline determinístico — IA só na Fase 3, fora de src/`);
      if (emTests && MODULOS_DE_REDE.test(alvo)) achar(n, "teste-sem-rede", `teste importa ${alvo} — a suíte é hermética, injete a função de rede`);
    }

    if (emSrc && ENDPOINTS_DE_IA.test(linha)) achar(n, "sem-ia-em-src", "chamada a API de modelo em src/ — a triagem é determinística");
    if (emTests && /\bfetch\s*\(/.test(linha)) achar(n, "teste-sem-rede", "teste chama fetch — a suíte não toca a rede");

    if (emSrc) {
      if (/\bconsole\.\w+\s*\(/.test(linha) && !CONSOLE_PERMITIDO.some((re) => re.test(caminho))) {
        achar(n, "log-estruturado", "console.* fora dos pontos de entrada — o núcleo loga por criarLog() (auditoria.mjs), que sanitiza teor");
      }
      for (const m of linha.matchAll(/process\.env\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
        if (!m[1].startsWith("ASSISTENTE_")) achar(n, "env-com-prefixo", `variável de ambiente "${m[1]}" sem o prefixo ASSISTENTE_`);
        if (/TOKEN|SENHA|PASSWORD|SECRET|KEY|CHAVE/i.test(m[1])) {
          achar(n, "segredo-fora-do-disco", `"${m[1]}" parece segredo em variável de ambiente — segredo vem do Keychain via segredos.mjs`);
        }
      }
      if (/["'`]\.env(\.[a-z]+)?["'`]|["']dotenv["']/.test(linha)) achar(n, "segredo-fora-do-disco", "referência a .env/dotenv — não existe .env neste projeto; segredo fica no Keychain");
    }
  });

  if (caminho === "src/core/prazos/index.mjs" && !/^export const APROVADO_PELA_ADVOGADA = false;$/m.test(codigo)) {
    achar(0, "portao-de-prazos", "APROVADO_PELA_ADVOGADA só vira true com o gabarito calculado à mão pela advogada; ao ligar, remova esta regra no mesmo commit e cite o gabarito");
  }
  return achados;
}

// ---------------------------------------------------------------------------
// 4. Migrações SQL
// ---------------------------------------------------------------------------

export function verificarMigracoes(arquivos) {
  const achados = [];
  let triggerUpdate = false;
  let triggerDelete = false;
  for (const { caminho, sql } of arquivos) {
    const semComentarios = sql.replace(/--[^\n]*/g, "");
    for (const stmt of semComentarios.split(";").map((s) => s.trim()).filter(Boolean)) {
      const linha = sql.indexOf(stmt.split("\n")[0]) >= 0 ? sql.slice(0, sql.indexOf(stmt.split("\n")[0])).split("\n").length : 0;
      if (/^CREATE TABLE/i.test(stmt) && !/\)\s*STRICT$/i.test(stmt)) {
        const nome = stmt.match(/CREATE TABLE (?:IF NOT EXISTS )?(\w+)/i)?.[1] ?? "?";
        achados.push(achado(caminho, linha, "migracao-strict", `tabela "${nome}" sem STRICT — toda tabela deste banco é STRICT`));
      }
      if (/^(DROP TRIGGER|DROP TABLE\s+(IF EXISTS\s+)?audit_log|ALTER TABLE\s+audit_log|DELETE FROM\s+audit_log|UPDATE\s+audit_log)/i.test(stmt)) {
        achados.push(achado(caminho, linha, "auditoria-append-only", "migração mexe em audit_log ou em trigger — a auditoria é append-only e isso não se relaxa por migração"));
      }
      if (/^CREATE TRIGGER\s+\w+\s+BEFORE UPDATE ON audit_log/i.test(stmt)) triggerUpdate = true;
      if (/^CREATE TRIGGER\s+\w+\s+BEFORE DELETE ON audit_log/i.test(stmt)) triggerDelete = true;
    }
  }
  if (arquivos.length && !(triggerUpdate && triggerDelete)) {
    achados.push(achado("src/core/migrations", 0, "auditoria-append-only", "faltam os triggers BEFORE UPDATE e BEFORE DELETE em audit_log"));
  }
  return achados;
}

// ---------------------------------------------------------------------------
// 1. Sintaxe (processos externos) e execução
// ---------------------------------------------------------------------------

function arquivosRastreados() {
  return execFileSync("git", ["ls-files", "-z"], { cwd: RAIZ, encoding: "utf8" }).split("\0").filter(Boolean);
}

function sintaxeMjs(caminhos) {
  const achados = [];
  for (const caminho of caminhos) {
    const r = spawnSync(process.execPath, ["--check", caminho], { cwd: RAIZ, encoding: "utf8" });
    if (r.status !== 0) {
      const linha = Number(r.stderr.match(/:(\d+)\n/)?.[1] ?? 0);
      achados.push(achado(caminho, linha, "sintaxe", r.stderr.split("\n").find((l) => /Error/.test(l)) ?? "erro de sintaxe"));
    }
  }
  return achados;
}

function sintaxeJson(caminhos) {
  const achados = [];
  for (const caminho of caminhos) {
    try {
      JSON.parse(readFileSync(join(RAIZ, caminho), "utf8"));
    } catch (e) {
      achados.push(achado(caminho, 0, "sintaxe", `JSON inválido: ${e.message}`));
    }
  }
  return achados;
}

function sintaxePython(caminhos) {
  if (!caminhos.length) return { achados: [], nota: null };
  const programa = "import ast, sys\nfor f in sys.argv[1:]:\n    ast.parse(open(f, encoding='utf-8').read(), f)\n";
  const r = spawnSync("python3", ["-c", programa, ...caminhos], { cwd: RAIZ, encoding: "utf8" });
  if (r.error) return { achados: [], nota: "python3 indisponível — sintaxe dos .py não conferida" };
  if (r.status !== 0) {
    const arquivo = r.stderr.match(/File "([^"]+)", line (\d+)/);
    return { achados: [achado(arquivo?.[1] ?? "spikes", Number(arquivo?.[2] ?? 0), "sintaxe", r.stderr.trim().split("\n").pop())], nota: null };
  }
  return { achados: [], nota: null };
}

export function lintar() {
  const arquivos = arquivosRastreados();
  const texto = (c) => readFileSync(join(RAIZ, c), "utf8");
  const mjs = arquivos.filter((c) => c.endsWith(".mjs"));
  const json = arquivos.filter((c) => c.endsWith(".json"));
  const py = arquivos.filter((c) => c.endsWith(".py"));
  const sql = arquivos.filter((c) => /^src\/core\/migrations\/.*\.sql$/.test(c));
  const textuais = arquivos.filter((c) => !/\.(png|jpg|jpeg|gif|pdf|ico|woff2?)$/i.test(c));

  const achados = [
    ...sintaxeMjs(mjs),
    ...sintaxeJson(json),
    ...textuais.flatMap((c) => verificarTexto(c, texto(c))),
    ...mjs.flatMap((c) => verificarCodigo(c, texto(c))),
    ...verificarMigracoes(sql.map((c) => ({ caminho: c, sql: texto(c) }))),
  ];
  const python = sintaxePython(py);
  achados.push(...python.achados);
  return { achados, contagem: { arquivos: arquivos.length, mjs: mjs.length, json: json.length, py: py.length, sql: sql.length }, nota: python.nota };
}

function principal() {
  const { achados, contagem, nota } = lintar();
  const l = ["## Lint (nativo, sem dependência)", ""];
  l.push(`Arquivos: ${contagem.arquivos} (${contagem.mjs} .mjs · ${contagem.json} .json · ${contagem.sql} .sql · ${contagem.py} .py)${nota ? ` — ${nota}` : ""}`);
  l.push("");
  if (!achados.length) l.push("### ✅ Nenhum achado");
  else {
    l.push(`### ❌ ${achados.length} achado(s)`);
    l.push("");
    for (const a of achados.sort((x, y) => x.caminho.localeCompare(y.caminho) || x.linha - y.linha)) {
      l.push(`- \`${a.caminho}${a.linha ? `:${a.linha}` : ""}\` **${a.regra}** — ${a.mensagem}`);
    }
  }
  const md = l.join("\n");
  console.log(md);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${md}\n`);
  process.exit(achados.length ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) principal();
