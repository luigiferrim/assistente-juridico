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
