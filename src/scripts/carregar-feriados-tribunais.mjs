/**
 * Calendário 2026 dos demais tribunais trabalhistas — coletado em 10/08/2026.
 *
 * Só entram aqui entradas com FONTE OFICIAL identificada (portaria, ato ou o
 * calendário publicado pelo próprio tribunal). Fonte secundária (agregadores,
 * notícia de terceiro) NÃO vira entrada: fica na lista de pendências de
 * `coleta/S8-calendarios.md` até alguém confirmar no ato.
 *
 * Todas nascem com confirmado_em = NULL: o motor continua devolvendo
 * `requerConfirmacao` até a advogada conferir.
 *
 * Uso: node src/scripts/carregar-feriados-tribunais.mjs
 */

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { abrirBanco, agora } from "../core/db.mjs";
import { registrar } from "../core/auditoria.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const db = abrirBanco(process.env.ASSISTENTE_DB ?? join(RAIZ, "dados", "assistente.db"));

const CAL_TRT3 = "Calendário oficial 2026 do TRT3 (portal.trt3.jus.br/internet/institucional/calendario/calendario-2026)";
const PORT_TRT6 = "Portaria TRT6-GP nº 495/2025 (feriados 2026), confirmada em notícia oficial do TRT6 de 10/08/2026";
const PORT_TRT9 = "Ato do TRT9 que transferiu o feriado de 11/08 para 14/08/2026, com suspensão de prazos (art. 219 CPC)";
const PORT_TRT15 = "Portaria GP-CR nº 016/2025 do TRT15, anexo 'Feriados 2026' (trt15.jus.br, lida em 11/08/2026)";
const ATO_TST = "Ato Conjunto TST.CSJT.GP nº 61/2025 + Ato GDGSET.GP nº 829/2025 — Calendário oficial 2026 do TST (tst.jus.br, lido em 11/08/2026)";

const ENTRADAS = [
  // ── TRT3 (Minas Gerais) ────────────────────────────────────────────────────
  { trib: "TRT3", inicio: "2026-08-14", fim: "2026-08-14", desc: "Dia da Criação dos Cursos Jurídicos (feriado transferido de 11/08 para 14/08)", origem: CAL_TRT3 },
  { trib: "TRT3", inicio: "2026-10-30", fim: "2026-10-30", desc: "Dia do Servidor Público (feriado transferido de 28/10 para 30/10)", origem: CAL_TRT3 },
  { trib: "TRT3", inicio: "2026-12-08", fim: "2026-12-08", desc: "Dia da Justiça", origem: CAL_TRT3 },
  { trib: "TRT3", inicio: "2026-11-01", fim: "2026-11-01", desc: "Dia de Todos os Santos", origem: CAL_TRT3 },
  { trib: "TRT3", inicio: "2026-02-16", fim: "2026-02-18", desc: "Carnaval e Quarta-feira de Cinzas", origem: CAL_TRT3 },
  { trib: "TRT3", inicio: "2026-04-01", fim: "2026-04-05", desc: "Semana Santa", origem: CAL_TRT3 },
  { trib: "TRT3", inicio: "2026-04-20", fim: "2026-04-20", desc: "Suspensão de expediente (véspera de Tiradentes)", origem: CAL_TRT3 },
  { trib: "TRT3", inicio: "2026-06-04", fim: "2026-06-05", desc: "Corpus Christi e suspensão do dia seguinte", origem: CAL_TRT3 },
  { trib: "TRT3", inicio: "2026-01-01", fim: "2026-01-06", desc: "Recesso do Judiciário", origem: CAL_TRT3 },
  { trib: "TRT3", inicio: "2026-12-20", fim: "2026-12-31", desc: "Recesso do Judiciário", origem: CAL_TRT3 },

  // ── TRT9 (Paraná) ──────────────────────────────────────────────────────────
  { trib: "TRT9", inicio: "2026-08-14", fim: "2026-08-14", desc: "Dia do Advogado / Criação dos Cursos Jurídicos (transferido de 11/08) — prazos suspensos", origem: PORT_TRT9 },

  // ── TRT6 (Pernambuco) ──────────────────────────────────────────────────────
  { trib: "TRT6", inicio: "2026-08-11", fim: "2026-08-11", desc: "Comemoração da Criação dos Cursos Jurídicos (feriado regimental)", origem: PORT_TRT6 },

  // ── TRT15 (Campinas/interior de SP) ────────────────────────────────────────
  // Atenção às diferenças regionais: Data Magna de SP (09-10/07) não existe
  // nos TRTs de SC/MG/PR, e 12/08 é feriado municipal só de Campinas (sede).
  { trib: "TRT15", inicio: "2026-01-01", fim: "2026-01-06", desc: "Confraternização Universal e Recesso do Judiciário", origem: PORT_TRT15 },
  { trib: "TRT15", inicio: "2026-02-16", fim: "2026-02-18", desc: "Carnaval e Quarta-feira de Cinzas (18/02: suspensão de expediente)", origem: PORT_TRT15 },
  { trib: "TRT15", inicio: "2026-04-01", fim: "2026-04-03", desc: "Semana Santa", origem: PORT_TRT15 },
  { trib: "TRT15", inicio: "2026-04-20", fim: "2026-04-21", desc: "Tiradentes (20/04: suspensão de expediente)", origem: PORT_TRT15 },
  { trib: "TRT15", inicio: "2026-06-04", fim: "2026-06-05", desc: "Corpus Christi (05/06: suspensão de expediente)", origem: PORT_TRT15 },
  { trib: "TRT15", inicio: "2026-07-09", fim: "2026-07-10", desc: "Data Magna do Estado de São Paulo (10/07: suspensão de expediente)", origem: PORT_TRT15 },
  { trib: "TRT15", inicio: "2026-08-10", fim: "2026-08-10", desc: "Criação dos Cursos Jurídicos (feriado de 11/08 transferido para 10/08; suspensão de expediente)", origem: PORT_TRT15 },
  { trib: "TRT15", inicio: "2026-08-12", fim: "2026-08-12", desc: "Dia do Evangélico — feriado municipal SÓ de Campinas (Lei 16.785/2025)", origem: PORT_TRT15 },
  { trib: "TRT15", inicio: "2026-10-30", fim: "2026-10-30", desc: "Dia do Servidor Público (feriado de 28/10 transferido para 30/10; suspensão de expediente)", origem: PORT_TRT15 },
  { trib: "TRT15", inicio: "2026-12-07", fim: "2026-12-08", desc: "Dia da Padroeira (Campinas) e Dia da Justiça (07/12: suspensão de expediente)", origem: PORT_TRT15 },
  { trib: "TRT15", inicio: "2026-12-21", fim: "2026-12-31", desc: "Recesso do Judiciário e Natal", origem: PORT_TRT15 },

  // ── TST (Brasília) ─────────────────────────────────────────────────────────
  // No TST o 11/08 CONTINUA feriado (10/08 é ponto facultativo) — ao contrário
  // do TRT12/TRT15, que transferiram para 10/08. Ponto facultativo também
  // fecha o protocolo físico; entra como dia sem expediente.
  { trib: "TST", inicio: "2026-01-01", fim: "2026-01-06", desc: "Confraternização Universal e Recesso Forense", origem: ATO_TST },
  { trib: "TST", inicio: "2026-02-16", fim: "2026-02-17", desc: "Carnaval", origem: ATO_TST },
  { trib: "TST", inicio: "2026-04-01", fim: "2026-04-05", desc: "Semana Santa", origem: ATO_TST },
  { trib: "TST", inicio: "2026-04-20", fim: "2026-04-21", desc: "Tiradentes (20/04: ponto facultativo)", origem: ATO_TST },
  { trib: "TST", inicio: "2026-06-04", fim: "2026-06-05", desc: "Corpus Christi e dia seguinte (pontos facultativos)", origem: ATO_TST },
  { trib: "TST", inicio: "2026-08-10", fim: "2026-08-11", desc: "Criação dos Cursos Jurídicos (11/08 feriado; 10/08 ponto facultativo)", origem: ATO_TST },
  { trib: "TST", inicio: "2026-10-30", fim: "2026-10-30", desc: "Dia do Servidor Público (ponto facultativo transferido de 28/10)", origem: ATO_TST },
  { trib: "TST", inicio: "2026-11-01", fim: "2026-11-02", desc: "Todos os Santos e Finados", origem: ATO_TST },
  { trib: "TST", inicio: "2026-12-07", fim: "2026-12-08", desc: "Dia da Justiça (07/12: ponto facultativo)", origem: ATO_TST },
  { trib: "TST", inicio: "2026-12-20", fim: "2026-12-31", desc: "Recesso Forense e Natal", origem: ATO_TST },
];

const existe = db.prepare(
  "SELECT 1 FROM feriados WHERE data_inicio = ? AND data_fim = ? AND tribunal = ? AND descricao = ?",
);
const inserir = db.prepare(
  `INSERT INTO feriados (data_inicio, data_fim, descricao, abrangencia, tribunal, origem, confirmado_em, criado_em)
   VALUES (?, ?, ?, 'tribunal', ?, ?, NULL, ?)`,
);

let novas = 0;
for (const e of ENTRADAS) {
  if (existe.get(e.inicio, e.fim, e.trib, e.desc)) continue;
  inserir.run(e.inicio, e.fim, e.desc, e.trib, e.origem, agora());
  novas++;
}

if (novas > 0) {
  registrar(db, {
    ator: "luigi",
    evento: "carga_feriados_tribunais",
    entidade: "feriados",
    detalhes: { novas, tribunais: ["TRT3", "TRT9", "TRT6", "TRT15", "TST"] },
  });
}

console.log(`feriados de tribunal: ${novas} novas entradas`);
for (const t of ["TRT12", "TRT3", "TRT9", "TRT6", "TRT15", "TST"]) {
  const n = db.prepare("SELECT count(*) c FROM feriados WHERE tribunal = ?").get(t).c;
  console.log(`  ${t.padEnd(6)} ${n} entrada(s)${n === 0 ? "  ⚠️ sem calendário — o motor recusa calcular prazo deste tribunal" : ""}`);
}
