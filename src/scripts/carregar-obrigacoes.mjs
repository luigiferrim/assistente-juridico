/**
 * Carga idempotente de obrigações conhecidas (parcelas, custas, honorários).
 *
 * Uso:  node src/scripts/carregar-obrigacoes.mjs [caminho.json]
 *
 * A chave natural é derivada de (processo, tipo, vencimento|gatilho, valor):
 * rodar duas vezes não duplica; editar o JSON e rodar de novo só insere o que
 * for novo. Obrigação já existente NUNCA é alterada por aqui — mudança de
 * status (pago/cancelado) é ato humano, registrado por outro caminho.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { abrirBanco, agora } from "../core/db.mjs";
import { registrar } from "../core/auditoria.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const caminhoJson = process.argv[2] ?? join(RAIZ, "dados", "obrigacoes-iniciais.json");
const caminhoBanco = process.env.ASSISTENTE_DB ?? join(RAIZ, "dados", "assistente.db");

const { obrigacoes } = JSON.parse(readFileSync(caminhoJson, "utf8"));
const db = abrirBanco(caminhoBanco);

const inserir = db.prepare(
  `INSERT OR IGNORE INTO obrigacoes
     (chave_natural, numero_cnj, partes, tipo, descricao, valor_centavos,
      vencimento, gatilho, advogado_oab, status, fonte, criado_em)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendente', ?, ?)`,
);

let novas = 0;
let repetidas = 0;
for (const o of obrigacoes) {
  const chave = `obr:${o.numero_cnj}:${o.tipo}:${o.vencimento ?? o.gatilho}:${o.valor_centavos ?? ""}`;
  const r = inserir.run(
    chave,
    o.numero_cnj,
    o.partes,
    o.tipo,
    o.descricao,
    o.valor_centavos ?? null,
    o.vencimento ?? null,
    o.gatilho ?? null,
    o.advogado_oab,
    o.fonte,
    agora(),
  );
  if (r.changes) novas++;
  else repetidas++;
}

if (novas > 0) {
  registrar(db, {
    ator: "luigi",
    evento: "carga_obrigacoes",
    entidade: "obrigacoes",
    detalhes: { arquivo: caminhoJson, novas, repetidas },
  });
}

console.log(`obrigações: ${novas} novas · ${repetidas} já existiam · total no banco:`,
  db.prepare("SELECT count(*) c FROM obrigacoes").get().c);

const proximas = db
  .prepare(
    `SELECT vencimento, descricao, partes FROM obrigacoes
      WHERE status = 'pendente' AND vencimento IS NOT NULL
      ORDER BY vencimento LIMIT 5`,
  )
  .all();
console.log("próximos vencimentos:");
for (const p of proximas) console.log(` ${p.vencimento}  ${p.descricao} — ${p.partes}`);
