/**
 * Testes da ingestão DJEN de produção (Fase 2).
 *
 * O que esta suíte protege, além da regra de paginação (já coberta em
 * spikes/lib/djen.test.mjs): as garantias de PERSISTÊNCIA —
 *
 *   • rodar duas vezes não duplica nada (critério da Fase 2 no plano);
 *   • a mesma comunicação vinda por duas OABs vira UMA linha e DOIS vínculos;
 *   • coleta incompleta NUNCA aparece como 'ok', mesmo com itens salvos —
 *     e o heartbeat não considera saudável uma coleta parcial.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { abrirBanco } from "../src/core/db.mjs";
import { coletarDjen, DjenError } from "../src/adapters/djen.mjs";
import { ultimaExecucaoBemSucedida } from "../src/worker/jobs.mjs";

const semPausa = async () => {};

function item(id, extras = {}) {
  return {
    id,
    hash: `h${id}`,
    numeroprocessocommascara: "0000001-11.2026.5.12.0001",
    siglaTribunal: "TRT12",
    nomeOrgao: "3ª Vara do Trabalho de Exemplo",
    tipoComunicacao: "Intimação",
    tipoDocumento: "Notificação",
    data_disponibilizacao: "2026-08-07",
    texto: `teor da comunicação ${id}`,
    link: `https://pje.trt12.jus.br/validacao/${id}`,
    ...extras,
  };
}

const JANELA = { dataInicio: "2026-08-06", dataFim: "2026-08-09", dormir: semPausa, backoffMs: 0 };
const OAB_A = [{ numero: "10001", uf: "SC" }];

function contar(db, sql) {
  return db.prepare(sql).get().c;
}

test("coleta completa grava, marca 'ok' e alimenta o heartbeat", async () => {
  const db = abrirBanco(":memory:");
  const buscar = async () => [item(1), item(2), item(3)];
  const r = await coletarDjen(db, { ...JANELA, oabs: OAB_A, buscar });

  assert.equal(r.houveFalha, false);
  assert.equal(r.porOab[0].status, "ok");
  assert.equal(contar(db, "SELECT count(*) c FROM comunicacoes"), 3);
  assert.ok(ultimaExecucaoBemSucedida(db, "djen") !== null, "coleta ok destrava o heartbeat");
});

test("CRÍTICO: rodar duas vezes não duplica nada", async () => {
  const db = abrirBanco(":memory:");
  const buscar = async () => [item(1), item(2)];
  await coletarDjen(db, { ...JANELA, oabs: OAB_A, buscar });
  const r2 = await coletarDjen(db, { ...JANELA, oabs: OAB_A, buscar });

  assert.equal(contar(db, "SELECT count(*) c FROM comunicacoes"), 2);
  assert.equal(contar(db, "SELECT count(*) c FROM comunicacoes_oab"), 2);
  assert.equal(r2.porOab[0].novas, 0, "segunda rodada reconhece que já tinha tudo");
  assert.equal(r2.porOab[0].status, "ok", "re-coleta sem novidade continua sendo coleta ok");
});

test("mesma comunicação por duas OABs = uma linha, dois vínculos", async () => {
  const db = abrirBanco(":memory:");
  const buscar = async () => [item(77)];
  await coletarDjen(db, {
    ...JANELA,
    oabs: [
      { numero: "10001", uf: "SC" },
      { numero: "10002", uf: "SC" },
    ],
    buscar,
  });

  assert.equal(contar(db, "SELECT count(*) c FROM comunicacoes"), 1);
  assert.equal(contar(db, "SELECT count(*) c FROM comunicacoes_oab"), 2);
  const oabs = db.prepare("SELECT oab FROM comunicacoes_oab ORDER BY oab").all().map((x) => x.oab);
  assert.deepEqual(oabs, ["10001/SC", "10002/SC"]);
});

test("CRÍTICO: falha no meio da paginação salva o parcial mas marca 'falhou'", async () => {
  const db = abrirBanco(":memory:");
  // Página 1 cheia (100 itens), página 2 explode — cenário real do S2.2.
  const buscar = async (_f, pagina, itensPorPagina) => {
    if (pagina === 1) return Array.from({ length: itensPorPagina }, (_, i) => item(i + 1));
    throw new DjenError("HTTP 500 na página 2", { pagina });
  };
  const r = await coletarDjen(db, { ...JANELA, oabs: OAB_A, buscar, tentativasPorPagina: 2 });

  assert.equal(r.houveFalha, true);
  assert.equal(r.porOab[0].status, "falhou");
  assert.equal(contar(db, "SELECT count(*) c FROM comunicacoes"), 100, "o que veio é preservado");

  const exec = db.prepare("SELECT status, completo, motivo FROM fontes_execucao ORDER BY id DESC LIMIT 1").get();
  assert.equal(exec.status, "falhou");
  assert.equal(exec.completo, 0);
  assert.match(exec.motivo, /falha na página 2/);
  assert.equal(ultimaExecucaoBemSucedida(db, "djen"), null, "coleta parcial NÃO silencia o heartbeat");
});

test("coleta completa e vazia é 'vazio' — e conta como execução bem-sucedida", async () => {
  const db = abrirBanco(":memory:");
  const buscar = async () => [];
  const r = await coletarDjen(db, { ...JANELA, oabs: OAB_A, buscar });

  assert.equal(r.porOab[0].status, "vazio");
  assert.ok(ultimaExecucaoBemSucedida(db, "djen") !== null, "'nada chegou' com coleta completa é resultado válido");
});

test("cada execução registra parâmetros e auditoria", async () => {
  const db = abrirBanco(":memory:");
  const buscar = async () => [item(9)];
  await coletarDjen(db, { ...JANELA, oabs: OAB_A, buscar, ator: "teste" });

  const exec = db.prepare("SELECT parametros FROM fontes_execucao LIMIT 1").get();
  const params = JSON.parse(exec.parametros);
  assert.equal(params.numeroOab, "10001");
  assert.equal(params.dataDisponibilizacaoInicio, "2026-08-06");

  const audit = db.prepare("SELECT count(*) c FROM audit_log WHERE evento = 'coleta_djen'").get().c;
  assert.equal(audit, 1);
});

test("janela ausente lança em vez de coletar o período errado", async () => {
  const db = abrirBanco(":memory:");
  await assert.rejects(() => coletarDjen(db, { oabs: OAB_A }), /dataInicio e dataFim/);
});
