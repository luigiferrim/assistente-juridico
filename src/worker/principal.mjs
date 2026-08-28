/**
 * Ponto de entrada do worker diário.
 *
 * ESTADO DA FASE 1: só a fundação. Não há coleta nem ação externa ainda —
 * nenhum manipulador de job está registrado, de propósito. Este arquivo prova
 * que o encanamento (banco, migração, fila, auditoria, heartbeat) funciona
 * ponta a ponta antes de qualquer integração.
 *
 * Rodar:  node src/worker/principal.mjs
 */

import { join } from "node:path";
import { abrirBanco, agora } from "../core/db.mjs";
import { criarLog, registrar } from "../core/auditoria.mjs";
import { processarFila, saudeDoSistema } from "./jobs.mjs";
import { diagnostico } from "../core/segredos.mjs";

const RAIZ = new URL("../..", import.meta.url).pathname;
const CAMINHO_BANCO = process.env.AJ_BANCO ?? join(RAIZ, "dados", "assistente.db");
const CAMINHO_LOG = join(RAIZ, "dados", "logs", "worker.jsonl");

/**
 * Manipuladores de job.
 * VAZIO na Fase 1 — coleta do DJEN entra na Fase 2, e só depois do S3.
 */
const MANIPULADORES = {};

export async function principal() {
  const log = criarLog(CAMINHO_LOG);
  const db = abrirBanco(CAMINHO_BANCO);

  log.info("worker iniciado", { banco: CAMINHO_BANCO, fase: 1 });
  registrar(db, { ator: "sistema", evento: "worker_iniciado", detalhes: { fase: 1 } });

  const resumo = await processarFila(db, MANIPULADORES, { log });
  const saude = saudeDoSistema(db, ["djen"]);
  const segredos = diagnostico();

  log.info("worker encerrado", { ...resumo, saudavel: saude.saudavel });
  registrar(db, { ator: "sistema", evento: "worker_encerrado", detalhes: { ...resumo, saude } });

  // Relatório em texto: é o que uma pessoa lê ao investigar "rodou hoje?".
  console.log(`
=== Assistente Jurídico — worker (Fase 1: fundação) ===
horário         : ${agora()}
banco           : ${CAMINHO_BANCO}
jobs            : ${resumo.concluidos} concluídos · ${resumo.reagendados} reagendados · ${resumo.falhos} falhos
saúde das fontes: ${saude.saudavel ? "OK" : "PROBLEMA"}${saude.problemas.map((p) => `\n                  - ${p.fonte}: ${p.detalhe}`).join("")}
segredos        : ${Object.entries(segredos).map(([k, v]) => `${k}=${v ? "presente" : "AUSENTE"}`).join(" · ")}

Fase 1 entrega apenas a fundação. Nenhuma coleta, nenhuma ação externa.
A saúde "PROBLEMA" acima é o comportamento correto: nunca houve coleta.
`);

  db.close();
  return { resumo, saude };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  principal().catch((erro) => {
    console.error("worker falhou:", erro);
    process.exit(1);
  });
}
