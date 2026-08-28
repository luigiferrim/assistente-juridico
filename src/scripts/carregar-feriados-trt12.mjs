/**
 * Carga do calendário 2026 do TRT12 — fontes oficiais, coletadas em 10/08/2026.
 *
 * Fontes:
 *  • Portaria SEAP nº 191/2024 (transferência de feriados regimentais)
 *  • Calendário oficial 2026 do TRT12 (portal.trt12.jus.br, "Atualizado em 19-1-2026")
 *  • Página "Suspensão de Prazos de 2026" do portal
 *
 * TUDO entra com confirmado_em = NULL: o motor continua marcando
 * `requerConfirmacao` até a advogada conferir cada entrada. Carga idempotente.
 *
 * Pendências CONHECIDAS e não carregadas (não inventar):
 *  • Copa do Mundo (jun/jul) — Ato Conjunto SEAP/SECOR nº 1/2026 cita suspensões,
 *    mas as datas não estavam legíveis na fonte. Buscar o ato.
 *  • Feriados municipais (Lages, Itajaí etc.) — afetam vara a vara; carga própria.
 *  • Bloco "01 a 05 — feriado regimental" do calendário: a diagramação do PDF
 *    não deixa claro se é abril (Semana Santa) ou junho. Conferir antes de carregar.
 */

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { abrirBanco, agora } from "../core/db.mjs";
import { registrar } from "../core/auditoria.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const db = abrirBanco(process.env.ASSISTENTE_DB ?? join(RAIZ, "dados", "assistente.db"));

const PORTARIA = "Portaria SEAP nº 191/2024 (TRT12)";
const CALENDARIO = "Calendário oficial TRT12 2026 (portal.trt12.jus.br, atualizado 19/01/2026)";

const ENTRADAS = [
  { inicio: "2026-08-10", fim: "2026-08-10", desc: "Feriado regimental TRT12 (11/08 transferido para 10/08)", origem: PORTARIA },
  { inicio: "2026-10-30", fim: "2026-10-30", desc: "Feriado regimental TRT12 (28/10 transferido para 30/10)", origem: PORTARIA },
  { inicio: "2026-12-07", fim: "2026-12-07", desc: "Feriado regimental TRT12 (08/12 transferido para 07/12)", origem: PORTARIA },
  { inicio: "2026-02-16", fim: "2026-02-18", desc: "Feriado regimental TRT12 — Carnaval", origem: CALENDARIO },
  { inicio: "2026-06-04", fim: "2026-06-04", desc: "Corpus Christi — feriado em todos os municípios-sede de unidades do TRT12", origem: CALENDARIO },
  { inicio: "2026-01-01", fim: "2026-01-06", desc: "Recesso forense TRT12 (art. 153 do Regimento Interno)", origem: CALENDARIO },
];

const existe = db.prepare(
  "SELECT 1 FROM feriados WHERE data_inicio = ? AND data_fim = ? AND tribunal = 'TRT12' AND descricao = ?",
);
const inserir = db.prepare(
  `INSERT INTO feriados (data_inicio, data_fim, descricao, abrangencia, tribunal, origem, confirmado_em, criado_em)
   VALUES (?, ?, ?, 'tribunal', 'TRT12', ?, NULL, ?)`,
);

let novas = 0;
for (const e of ENTRADAS) {
  if (existe.get(e.inicio, e.fim, e.desc)) continue;
  inserir.run(e.inicio, e.fim, e.desc, e.origem, agora());
  novas++;
}

if (novas > 0) {
  registrar(db, {
    ator: "luigi",
    evento: "carga_feriados_trt12",
    entidade: "feriados",
    detalhes: { novas, fontes: [PORTARIA, CALENDARIO] },
  });
}

console.log(`feriados TRT12: ${novas} novas entradas · total do tribunal:`,
  db.prepare("SELECT count(*) c FROM feriados WHERE tribunal = 'TRT12'").get().c,
  "· todas com confirmado_em = NULL (aguardando conferência da advogada)");
