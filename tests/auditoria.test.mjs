/**
 * Auditoria: append-only garantido pelo BANCO, não por convenção.
 * Se estes testes ficarem verdes com o trigger removido, a trilha não vale nada.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { abrirBanco } from "../src/core/db.mjs";
import { registrar, trilha, criarLog } from "../src/core/auditoria.mjs";

function banco() {
  return abrirBanco(":memory:");
}

test("registra e recupera a trilha em ordem cronológica", () => {
  const db = banco();
  registrar(db, { ator: "sistema", evento: "extracao", entidade: "fato", entidadeId: 7,
                  detalhes: { valor_centavos: 1200000 } });
  registrar(db, { ator: "dra@escritorio.com.br", evento: "aprovacao", entidade: "fato", entidadeId: 7,
                  detalhes: { decisao: "aprovado" } });

  const t = trilha(db, "fato", 7);
  assert.equal(t.length, 2);
  assert.equal(t[0].evento, "extracao");
  assert.equal(t[1].ator, "dra@escritorio.com.br");
  assert.equal(t[0].detalhes.valor_centavos, 1200000);
});

test("CRÍTICO: UPDATE em audit_log é recusado pelo banco", () => {
  const db = banco();
  registrar(db, { ator: "sistema", evento: "teste" });
  assert.throws(
    () => db.prepare("UPDATE audit_log SET evento = 'adulterado' WHERE id = 1").run(),
    /append-only/i,
    "o banco DEVE recusar UPDATE em audit_log",
  );
  assert.equal(db.prepare("SELECT evento FROM audit_log WHERE id = 1").get().evento, "teste");
});

test("CRÍTICO: DELETE em audit_log é recusado pelo banco", () => {
  const db = banco();
  registrar(db, { ator: "sistema", evento: "teste" });
  assert.throws(
    () => db.prepare("DELETE FROM audit_log WHERE id = 1").run(),
    /append-only/i,
    "o banco DEVE recusar DELETE em audit_log",
  );
  assert.equal(db.prepare("SELECT count(*) c FROM audit_log").get().c, 1);
});

test("auditoria sem ator é rejeitada", () => {
  const db = banco();
  assert.throws(() => registrar(db, { evento: "x" }), /ator/);
  assert.throws(() => registrar(db, { ator: "sistema" }), /evento/);
});

test("log técnico omite conteúdo sensível", () => {
  const { sanitizar } = criarLog();
  const limpo = sanitizar({
    processo: "0001234-56.2025.5.12.0011",
    texto: "teor integral da intimação com nome das partes",
    aninhado: { refresh_token: "1//0abc", pagina: 3 },
  });
  assert.equal(limpo.processo, "0001234-56.2025.5.12.0011", "metadado útil permanece");
  assert.match(limpo.texto, /^\[omitido:/, "teor NUNCA vai para o log técnico");
  assert.match(limpo.aninhado.refresh_token, /^\[omitido:/, "sanitização é recursiva");
  assert.equal(limpo.aninhado.pagina, 3);
});
