import { test } from "node:test";
import assert from "node:assert/strict";
import { abrirBanco, agora } from "../src/core/db.mjs";
import {
  enfileirar, reivindicar, concluirJob, falharJob, processarFila, saudeDoSistema,
} from "../src/worker/jobs.mjs";

const banco = () => abrirBanco(":memory:");
const silencioso = { error: () => {} };

test("job enfileirado é reivindicado uma única vez", () => {
  const db = banco();
  enfileirar(db, "coletar_djen", { oab: "10001" });
  const primeiro = reivindicar(db);
  assert.equal(primeiro.tipo, "coletar_djen");
  assert.equal(primeiro.payload.oab, "10001");
  assert.equal(reivindicar(db), null, "não pode ser reivindicado duas vezes");
});

test("job agendado para o futuro não é reivindicado agora", () => {
  const db = banco();
  const amanha = new Date(Date.now() + 86400_000).toISOString();
  enfileirar(db, "futuro", null, { agendadoPara: amanha });
  assert.equal(reivindicar(db), null);
});

test("falha reagenda enquanto houver tentativa e depois marca falhou — nunca some", () => {
  const db = banco();
  enfileirar(db, "instavel");

  let job = reivindicar(db);
  assert.equal(falharJob(db, job, new Error("500")).reagendado, true);

  db.prepare("UPDATE jobs SET agendado_para = ?").run(agora());
  job = reivindicar(db);
  assert.equal(falharJob(db, job, new Error("500")).reagendado, true);

  db.prepare("UPDATE jobs SET agendado_para = ?").run(agora());
  job = reivindicar(db);
  assert.equal(falharJob(db, job, new Error("500")).reagendado, false);

  const linha = db.prepare("SELECT * FROM jobs WHERE id = 1").get();
  assert.equal(linha.status, "falhou");
  assert.match(linha.erro, /500/, "o erro fica registrado para o painel mostrar");
});

test("processarFila executa, audita e devolve resumo", async () => {
  const db = banco();
  const vistos = [];
  enfileirar(db, "ok", { n: 1 });
  enfileirar(db, "ok", { n: 2 });
  enfileirar(db, "explode");

  const resumo = await processarFila(db, {
    ok: async (p) => { vistos.push(p.n); },
    explode: async () => { throw new Error("falha proposital"); },
  }, { log: silencioso });

  assert.deepEqual(vistos, [1, 2]);
  assert.equal(resumo.concluidos, 2);
  assert.equal(resumo.reagendados, 1, "primeira falha reagenda, não some");
  const audit = db.prepare("SELECT evento FROM audit_log ORDER BY id").all().map((l) => l.evento);
  assert.deepEqual(audit, ["job_concluido", "job_concluido", "job_reagendado"]);
});

test("tipo sem manipulador falha explicitamente", async () => {
  const db = banco();
  enfileirar(db, "tipo_inexistente");
  const resumo = await processarFila(db, {}, { log: silencioso });
  assert.equal(resumo.falhos, 1);
  assert.match(db.prepare("SELECT erro FROM jobs WHERE id = 1").get().erro, /sem manipulador/);
});

// ---------- Heartbeat: o sistema tem que saber quando NÃO está cobrindo ------

test("CRÍTICO: sem execução bem-sucedida, o sistema se declara doente", () => {
  const db = banco();
  const s = saudeDoSistema(db, ["djen"]);
  assert.equal(s.saudavel, false);
  assert.equal(s.problemas[0].detalhe, "nunca executou com sucesso");
});

test("CRÍTICO: coleta INCOMPLETA não conta como execução bem-sucedida", () => {
  const db = banco();
  // Cenário do S2: a coleta rodou, mas parou no meio por erro da API.
  db.prepare(
    `INSERT INTO fontes_execucao (fonte, iniciado_em, encerrado_em, status, completo, itens_obtidos)
     VALUES ('djen', ?, ?, 'falhou', 0, 200)`,
  ).run(agora(), agora());

  const s = saudeDoSistema(db, ["djen"]);
  assert.equal(s.saudavel, false,
    "200 itens coletados com falha no meio NÃO é cobertura — é justamente o falso negativo silencioso");
});

test("coleta completa e recente deixa o sistema saudável", () => {
  const db = banco();
  db.prepare(
    `INSERT INTO fontes_execucao (fonte, iniciado_em, encerrado_em, status, completo, itens_obtidos)
     VALUES ('djen', ?, ?, 'ok', 1, 12)`,
  ).run(agora(), agora());
  assert.equal(saudeDoSistema(db, ["djen"]).saudavel, true);
});

test("CRÍTICO: coleta completa porém velha volta a ser problema", () => {
  const db = banco();
  const antiga = new Date(Date.now() - 72 * 3600_000).toISOString();
  db.prepare(
    `INSERT INTO fontes_execucao (fonte, iniciado_em, encerrado_em, status, completo, itens_obtidos)
     VALUES ('djen', ?, ?, 'ok', 1, 12)`,
  ).run(antiga, antiga);

  const s = saudeDoSistema(db, ["djen"], { limiteHoras: 48 });
  assert.equal(s.saudavel, false, "silêncio de 3 dias não pode ser lido como 'nada chegou'");
});
