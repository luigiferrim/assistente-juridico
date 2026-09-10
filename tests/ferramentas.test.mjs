/**
 * Testes das ferramentas de engenharia — a auditoria de vazamento.
 *
 * Regra deste arquivo: nenhum exemplo "positivo" (um CNJ que fecha a conta, um
 * e-mail real, uma chave) pode existir como LITERAL aqui, senão a própria
 * auditoria acusa o teste. Todo positivo é montado em tempo de execução.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  analisarTexto,
  carregarLista,
  dvCnjValido,
  ehBinario,
  normalizar,
  redigir,
  verificarCaminho,
  verificarGitignore,
  GITIGNORE_OBRIGATORIO,
} from "../ferramentas/auditoria-vazamento.mjs";

/** Monta um CNJ cujo DV FECHA — conta independente da do script, para o teste valer. */
function cnjComDvValido(numero, ano, justica, tribunal, origem) {
  const resto = Number(BigInt(`${numero}${ano}${justica}${tribunal}${origem}00`) % 97n);
  const dv = String(98 - resto).padStart(2, "0");
  return `${numero}-${dv}.${ano}.${justica}.${tribunal}.${origem}`;
}

const regras = (achados) => achados.map((a) => a.regra);

test("auditoria: CNJ com DV válido é achado; os sintéticos do projeto (DV inválido) passam", () => {
  const valido = cnjComDvValido("0000001", "2026", "5", "12", "0001");
  assert.ok(dvCnjValido({ numero: "0000001", dv: valido.slice(8, 10), ano: "2026", justica: "5", tribunal: "12", origem: "0001" }));

  const achados = analisarTexto(`processo ${valido} em pauta`, { origem: "x" });
  assert.deepEqual(regras(achados), ["cnj-valido"]);
  assert.equal(achados[0].linha, 1);

  // Os números usados em todo o repositório têm DV inválido de propósito.
  assert.deepEqual(analisarTexto("0000001-11.2026.5.12.0001 e 0001234-56.2025.5.12.0011", { origem: "x" }), []);

  // Sem máscara também conta.
  assert.deepEqual(regras(analisarTexto(valido.replace(/[-.]/g, ""), { origem: "x" })), ["cnj-valido"]);
});

test("auditoria: OAB fora da família fictícia é achado, nas duas grafias; 100xx e o sentinela 99999 passam", () => {
  const real = ["OAB ", "12345", "/SC"].join("");
  assert.deepEqual(regras(analisarTexto(real, { origem: "x" })), ["oab", "oab"]); // rótulo + número/UF
  assert.deepEqual(regras(analisarTexto(["inscrição ", "54321", "/PR"].join(""), { origem: "x" })), ["oab"]);
  assert.deepEqual(analisarTexto("OAB 10001/SC · OAB nº 10002 · 10003/SC · 99999/SC fora do cadastro", { origem: "x" }), []);
  // "OABs" no plural e datas não são inscrição.
  assert.deepEqual(analisarTexto("as OABs do escritório; audiência em 12/08", { origem: "x" }), []);
});

test("auditoria: e-mail fora dos domínios de exemplo é achado; os de exemplo e a identidade do autor passam", () => {
  const real = ["fulano.de.tal", "@", "gmail.com"].join("");
  const achados = analisarTexto(`contato: ${real}`, { origem: "x" });
  assert.deepEqual(regras(achados), ["email"]);
  assert.ok(!achados[0].detalhe.includes(real), "o achado não reproduz o e-mail");

  assert.deepEqual(
    analisarTexto("rh@exemplo-cliente.com dra@escritorio.com.br a@b.com luigiferrimaines@gmail.com 1234+x@users.noreply.github.com", { origem: "x" }),
    [],
  );
});

test("auditoria: segredo em formato conhecido e atribuição com valor real são achados; placeholder não", () => {
  const chaveGoogle = "AIza" + "A".repeat(35);
  const tokenGithub = "ghp_" + "b".repeat(36);
  const implantacao = "https://script.google.com/macros/s/" + "K".repeat(60) + "/exec";
  const texto = [chaveGoogle, tokenGithub, implantacao, `const TOKEN = "${"z".repeat(24)}";`].join("\n");
  const achados = analisarTexto(texto, { origem: "x" });
  assert.deepEqual(regras(achados), ["segredo", "segredo", "segredo", "segredo"]);
  assert.deepEqual(achados.map((a) => a.linha), [1, 2, 3, 4]);
  for (const a of achados) assert.ok(!a.detalhe.includes("A".repeat(10)) && !a.detalhe.includes("z".repeat(10)), "redigido");

  const inocente = [
    'const TOKEN = "COLE-AQUI-O-aprovacao_token-DE-dados/config.json";',
    'tokenAprovacao: "segredo123"', // curto demais para ser chave; é fixture de teste
    'urlAprovacao: "https://script.google.com/macros/s/TESTE/exec"',
    "const re = /AIza[0-9A-Za-z_-]{35}/; // o próprio detector não se acusa",
  ].join("\n");
  assert.deepEqual(analisarTexto(inocente, { origem: "x" }), []);
});

test("auditoria: termo da lista sigilosa casa sem acento e sem caixa; a identidade pública do autor não dispara", () => {
  const lista = carregarLista("# comentário\n\nEmpresa Xyzzy\nJosé Quuxão\nabc\n");
  assert.deepEqual(lista, ["empresa xyzzy", "jose quuxao"], "normaliza, dedupe, ignora curtos e comentários");

  const achados = analisarTexto("Autos de EMPRESA XYZZY × Jose Quuxao; ver github.com/luigiferrim", { origem: "x", lista });
  assert.deepEqual(regras(achados), ["termo-sigiloso", "termo-sigiloso"]);
  assert.match(achados[0].detalhe, /termo nº 1 da lista \(13 caracteres\), 1 ocorrência/);
  assert.ok(!achados[0].detalhe.toLowerCase().includes("xyzzy"), "o termo em si nunca sai no relatório");

  // Um termo da lista que casa dentro do handle do autor é ignorado ali — e só ali.
  const listaComTrechoDoHandle = carregarLista("uigif\n"); // trecho sem sentido, contido no handle
  assert.deepEqual(analisarTexto("autor: github.com/luigiferrim", { origem: "x", lista: listaComTrechoDoHandle }), []);
  assert.deepEqual(regras(analisarTexto("contato: Uigif", { origem: "x", lista: listaComTrechoDoHandle })), ["termo-sigiloso"]);
  assert.equal(normalizar("ÀÉÎõü Ç"), "aeiou c");
});

test("auditoria: caminho sob sigilo é achado mesmo com conteúdo inocente, e o nome do arquivo sai redigido", () => {
  const casos = {
    "dados/config.json": "pasta dados/",
    "coleta/S3-registro.md": "pasta coleta/",
    "atas das audiencias/ata-cliente.pdf": "atas de audiência",
    "spikes/relatorios/S6.md": "relatórios dos spikes",
    ".env.local": "arquivo .env",
    "backup/assistente.db": "extensão de dado ou segredo",
    "src/chave.pem": "extensão de dado ou segredo",
    ".claude/settings.local.json": "configuração local de ferramenta",
  };
  for (const [caminho, motivo] of Object.entries(casos)) {
    const [a] = verificarCaminho(caminho, "commit abc1234");
    assert.ok(a, caminho);
    assert.equal(a.regra, "caminho-proibido");
    assert.match(a.detalhe, new RegExp(`^${motivo.replace(/[()/]/g, "\\$&")}`), caminho);
    assert.ok(!a.detalhe.includes("config.json") && !a.detalhe.includes("ata-cliente"), `nome redigido: ${a.detalhe}`);
  }
  for (const ok of ["src/core/db.mjs", "tests/fixtures/ficticios/ata.txt", "docs/briefing-exemplo.png", ".github/workflows/ci.yml", "deploy/bloco3-coleta-local.md"]) {
    assert.deepEqual(verificarCaminho(ok), [], ok);
  }
});

test("auditoria: .gitignore sem uma regra obrigatória é achado; com todas, nenhum", () => {
  const completo = GITIGNORE_OBRIGATORIO.join("\n");
  assert.deepEqual(verificarGitignore(completo), []);
  const semBanco = GITIGNORE_OBRIGATORIO.filter((r) => r !== "*.db").join("\n");
  const achados = verificarGitignore(semBanco);
  assert.equal(achados.length, 1);
  assert.match(achados[0].detalhe, /\*\.db/);
});

test("auditoria: redação e detecção de binário", () => {
  assert.equal(redigir("ab"), "…");
  assert.equal(redigir("0000001-11.2026.5.12.0001"), "000…(25 caracteres)");
  assert.equal(ehBinario(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x0a])), true, "PNG tem NUL");
  assert.equal(ehBinario(Buffer.from("texto comum\ncom acentos: ção", "utf8")), false);
});

// ---------------------------------------------------------------------------
// verificar-readme — os badges são estáticos; a honestidade vem deste portão
// ---------------------------------------------------------------------------

import { conferirReadme, fatosDoCodigo } from "../ferramentas/verificar-readme.mjs";

const README_COERENTE = [
  "![testes](https://img.shields.io/badge/testes-126-2ea44f)",
  "![Node](https://img.shields.io/badge/node-%E2%89%A5%2022-339933?logo=node.js)",
  "![deps](https://img.shields.io/badge/depend%C3%AAncias_npm-0-1f6feb)",
  "![licença](https://img.shields.io/badge/licen%C3%A7a-todos_os_direitos_reservados-lightgrey)",
  "| Qualidade | `node --test`: **126 testes** (97 de fundação/ingestão/briefing/ferramentas + 29 dos spikes) |",
  "npm test                      # 97 testes",
  "npm run test:tudo             # + 29 dos spikes = 126",
].join("\n");

const PKG = { engines: { node: ">=22" }, dependencies: {}, devDependencies: {}, license: "UNLICENSED" };

test("verificar-readme: README coerente passa; contagem divergente, Node e dependência são apontados", () => {
  const fatos = fatosDoCodigo({ base: 97, spikes: 29, pkg: PKG });
  assert.deepEqual(fatos, { testesTotal: 126, testesBase: 97, testesSpikes: 29, nodeMinimo: "22", dependencias: 0, licenca: "UNLICENSED" });
  assert.deepEqual(conferirReadme(README_COERENTE, fatos), []);

  // Alguém acrescentou um teste e não mexeu no README: cinco lugares ficam velhos
  // (badge, total e fundação na tabela Stack, os dois comentários do bloco "Rodar").
  const comTesteNovo = fatosDoCodigo({ base: 98, spikes: 29, pkg: PKG });
  const d = conferirReadme(README_COERENTE, comTesteNovo);
  assert.equal(d.length, 5, d.join("\n"));
  assert.ok(d.every((x) => /badge de testes|tabela Stack|npm test|test:tudo/.test(x)));

  // Dependência entrou, Node subiu: os badges correspondentes mentem.
  const mudouStack = fatosDoCodigo({ base: 97, spikes: 29, pkg: { ...PKG, engines: { node: ">=24" }, devDependencies: { eslint: "^9" } } });
  const d2 = conferirReadme(README_COERENTE, mudouStack);
  assert.deepEqual(
    d2,
    ['badge do Node: README diz "≥ 22", código tem "≥ 24"', 'badge de dependências: README diz "0", código tem "1"'],
  );
});

test("verificar-readme: badge ausente é divergência, não silêncio", () => {
  const fatos = fatosDoCodigo({ base: 97, spikes: 29, pkg: PKG });
  const semLicenca = README_COERENTE.split("\n").filter((l) => !l.includes("licen%C3%A7a")).join("\n");
  assert.deepEqual(conferirReadme(semLicenca, fatos), ["badge de licença: trecho não encontrado no README"]);
  assert.deepEqual(conferirReadme("# README vazio", fatos).length, 7);
});

// ---------------------------------------------------------------------------
// cobertura — o LCOV do Node vira resumo; o que a suíte não carrega é declarado
// ---------------------------------------------------------------------------

import { lerLcov, resumoMarkdown as resumoCobertura } from "../ferramentas/cobertura.mjs";

const LCOV_EXEMPLO = [
  "TN:",
  "SF:src/core/db.mjs",
  "FN:21,agora",
  "FNF:4",
  "FNH:3",
  "BRF:12",
  "BRH:7",
  "LF:90",
  "LH:84",
  "end_of_record",
  "TN:",
  "SF:src/core/auditoria.mjs",
  "FNF:9",
  "FNH:5",
  "BRF:6",
  "BRH:5",
  "LF:95",
  "LH:86",
  "end_of_record",
].join("\n");

test("cobertura: LCOV vira registros ordenados por arquivo, com linhas, ramos e funções", () => {
  const registros = lerLcov(LCOV_EXEMPLO);
  assert.deepEqual(
    registros.map((r) => r.arquivo),
    ["src/core/auditoria.mjs", "src/core/db.mjs"],
  );
  assert.deepEqual(registros[1], { arquivo: "src/core/db.mjs", linhas: { t: 90, c: 84 }, ramos: { t: 12, c: 7 }, funcoes: { t: 4, c: 3 } });
  assert.deepEqual(lerLcov(""), []);
});

test("cobertura: o resumo soma totais e DECLARA os módulos que a suíte não carregou", () => {
  const md = resumoCobertura(lerLcov(LCOV_EXEMPLO), ["src/worker/principal.mjs", "src/core/segredos.mjs"], { testes: 99, falhas: 0 });
  assert.match(md, /Suíte: \*\*99 testes\*\*, todos passando/);
  assert.match(md, /\| `src\/core\/db\.mjs` \| 93\.3% \| 58\.3% \| 75\.0% \|/);
  assert.match(md, /\*\*2 módulo\(s\) medido\(s\)\*\* \| \*\*91\.9%\*\* \(170\/185\)/, "total de linhas = soma, não média");
  assert.match(md, /2 módulo\(s\) de `src\/` fora da medição/);
  assert.match(md, /- `src\/worker\/principal\.mjs`/);
  assert.match(md, /2 de 4 módulos medidos/);

  const completo = resumoCobertura(lerLcov(LCOV_EXEMPLO), [], { testes: 3, falhas: 1 });
  assert.match(completo, /\*\*1 falhando\*\*/);
  assert.match(completo, /Todos os módulos de `src\/` foram carregados/);
});
