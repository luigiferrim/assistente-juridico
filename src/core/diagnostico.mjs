/**
 * Diagnóstico do sistema. Responde, em texto, as perguntas que alguém faz
 * quando desconfia: "o banco está certo?", "a auditoria está protegida?",
 * "rodou hoje?", "os segredos estão no lugar?".
 *
 * NUNCA imprime valor de segredo, teor de comunicação ou dado de cliente.
 *
 * Rodar: node src/core/diagnostico.mjs
 */

import { join } from "node:path";
import { abrirBanco } from "./db.mjs";
import { diagnostico as diagSegredos } from "./segredos.mjs";
import { saudeDoSistema } from "../worker/jobs.mjs";

const RAIZ = new URL("../..", import.meta.url).pathname;

export function executar(caminhoBanco = join(RAIZ, "dados", "assistente.db")) {
  const db = abrirBanco(caminhoBanco);
  const linhas = [];
  const P = (s) => linhas.push(s);

  P("=== DIAGNÓSTICO — Assistente Jurídico ===\n");

  // Schema
  const tabelas = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all().map((r) => r.name);
  const migracoes = db.prepare("SELECT nome, aplicada_em FROM _migracoes ORDER BY nome").all();
  P(`SCHEMA`);
  P(`  migrações aplicadas : ${migracoes.map((m) => m.nome).join(", ") || "nenhuma"}`);
  P(`  tabelas (${tabelas.length})        : ${tabelas.join(", ")}`);

  // Integridade da auditoria — testada de verdade, não presumida.
  let updateBloqueado = false;
  let deleteBloqueado = false;
  db.exec("BEGIN");
  try {
    db.prepare("INSERT INTO audit_log (ocorrido_em, ator, evento) VALUES ('x','diagnostico','sonda')").run();
    const id = db.prepare("SELECT max(id) m FROM audit_log").get().m;
    try { db.prepare("UPDATE audit_log SET evento='x' WHERE id=?").run(id); }
    catch { updateBloqueado = true; }
    try { db.prepare("DELETE FROM audit_log WHERE id=?").run(id); }
    catch { deleteBloqueado = true; }
  } finally {
    db.exec("ROLLBACK"); // a sonda não deixa rastro
  }
  P(`\nAUDITORIA (append-only)`);
  P(`  UPDATE bloqueado    : ${updateBloqueado ? "SIM" : "*** NÃO — TRILHA ADULTERÁVEL ***"}`);
  P(`  DELETE bloqueado    : ${deleteBloqueado ? "SIM" : "*** NÃO — TRILHA ADULTERÁVEL ***"}`);
  P(`  eventos registrados : ${db.prepare("SELECT count(*) c FROM audit_log").get().c}`);

  // PRAGMAs que importam
  const fk = db.prepare("PRAGMA foreign_keys").get();
  const jm = db.prepare("PRAGMA journal_mode").get();
  P(`\nBANCO`);
  P(`  foreign_keys        : ${Object.values(fk)[0] ? "ON" : "*** OFF ***"}`);
  P(`  journal_mode        : ${Object.values(jm)[0]}`);

  // Cobertura / heartbeat
  const saude = saudeDoSistema(db, ["djen"]);
  P(`\nCOBERTURA`);
  P(`  saudável            : ${saude.saudavel ? "SIM" : "NÃO"}`);
  for (const p of saude.problemas) P(`    - ${p.fonte}: ${p.detalhe}`);

  // Segredos (presença, nunca valor)
  P(`\nSEGREDOS (Keychain — presença apenas)`);
  for (const [k, v] of Object.entries(diagSegredos())) P(`  ${k.padEnd(20)}: ${v ? "presente" : "ausente"}`);

  // Estado de aprovação do motor de prazos
  P(`\nPORTÕES`);
  P(`  motor de prazos     : NÃO APROVADO (aguarda os 10 casos de referência — S8)`);
  P(`  feriados confirmados: ${db.prepare("SELECT count(*) c FROM feriados WHERE confirmado_em IS NOT NULL").get().c}` +
    ` de ${db.prepare("SELECT count(*) c FROM feriados").get().c}`);

  db.close();
  return linhas.join("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(executar());
}
