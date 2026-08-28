/**
 * Acesso ao banco (SQLite via `node:sqlite`, embutido no Node 22+).
 *
 * Sem ORM e sem dependência npm: o schema é SQL versionado em
 * `migrations/`, aplicado em ordem e registrado em `_migracoes`.
 *
 * Por que sem ORM/driver externo: este banco guarda dado sob sigilo
 * profissional. Cada dependência é superfície de cadeia de suprimentos que
 * alguém precisa auditar e manter. Com ~12 tabelas e SQL estável, um ORM
 * custa mais do que entrega.
 */

import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const DIR_MIGRACOES = join(AQUI, "migrations");

export function agora() {
  return new Date().toISOString();
}

/** Abre o banco com os PRAGMAs corretos e aplica migrações pendentes. */
export function abrirBanco(caminho, { migrar = true } = {}) {
  if (caminho !== ":memory:") mkdirSync(dirname(caminho), { recursive: true });

  const db = new DatabaseSync(caminho);

  // WAL: leitor (painel) não bloqueia escritor (worker).
  if (caminho !== ":memory:") db.exec("PRAGMA journal_mode = WAL");
  // FK ligada — sem isso o SQLite ignora as referências declaradas.
  db.exec("PRAGMA foreign_keys = ON");
  // FULL: perder a última transação por queda de energia é inaceitável aqui.
  db.exec("PRAGMA synchronous = FULL");

  if (migrar) aplicarMigracoes(db);
  return db;
}

export function aplicarMigracoes(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS _migracoes (
    nome TEXT PRIMARY KEY,
    aplicada_em TEXT NOT NULL
  ) STRICT`);

  const aplicadas = new Set(
    db.prepare("SELECT nome FROM _migracoes").all().map((r) => r.nome),
  );

  const arquivos = readdirSync(DIR_MIGRACOES)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const novas = [];
  for (const arquivo of arquivos) {
    if (aplicadas.has(arquivo)) continue;
    const sql = readFileSync(join(DIR_MIGRACOES, arquivo), "utf8");

    // Migração é tudo-ou-nada: metade de um schema é pior que nenhum.
    db.exec("BEGIN");
    try {
      db.exec(sql);
      db.prepare("INSERT INTO _migracoes (nome, aplicada_em) VALUES (?, ?)").run(
        arquivo,
        agora(),
      );
      db.exec("COMMIT");
      novas.push(arquivo);
    } catch (erro) {
      db.exec("ROLLBACK");
      throw new Error(`falha na migração ${arquivo}: ${erro.message}`, { cause: erro });
    }
  }
  return novas;
}

/** Executa `fn` numa transação. Reverte tudo em caso de erro. */
export function emTransacao(db, fn) {
  db.exec("BEGIN");
  try {
    const r = fn();
    db.exec("COMMIT");
    return r;
  } catch (erro) {
    db.exec("ROLLBACK");
    throw erro;
  }
}
