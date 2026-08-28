/**
 * Calendário forense.
 *
 * ⚠️ ESTADO: PROVISÓRIO. Nenhuma entrada aqui foi conferida pela advogada.
 *
 * O mecanismo que garante isso não é um comentário: toda entrada tem
 * `confirmado_em`, e um prazo calculado que dependa de qualquer entrada não
 * confirmada volta com `requer_confirmacao: true`. Enquanto ela não confirmar,
 * o sistema é estruturalmente incapaz de apresentar uma data como certa.
 *
 * Aprendizado do S2/v2 §1.2-e: o calendário NÃO é estático. Além de feriados
 * nacionais, cada TRT edita atos de suspensão ao longo do ano (o TRT-2, por
 * exemplo, prorrogou a suspensão de fim de ano até 24/01 por ato próprio).
 * Por isso toda entrada carrega `origem` citável e vigência.
 */

import { agora } from "../db.mjs";

/** Domingo=0 … Sábado=6, em UTC para não sofrer com horário de verão. */
export function diaDaSemana(iso) {
  return new Date(`${iso}T12:00:00Z`).getUTCDay();
}

export function ehFimDeSemana(iso) {
  const d = diaDaSemana(iso);
  return d === 0 || d === 6;
}

export function somarDias(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher). Base dos móveis. */
export function domingoDePascoa(ano) {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/**
 * Feriados nacionais de um ano.
 *
 * ⚠️ PROVISÓRIO — precisa de conferência. Em especial:
 *   • 20/01 (São Sebastião) e outros feriados ESTADUAIS/MUNICIPAIS não estão aqui.
 *   • Carnaval e Corpus Christi são ponto facultativo na União, mas os
 *     tribunais costumam suspender prazo — depende de ato de cada TRT.
 *   • A regra que vale é a que ELA usa. Isto é ponto de partida, não verdade.
 */
export function feriadosNacionais(ano) {
  const pascoa = domingoDePascoa(ano);
  return [
    { data: `${ano}-01-01`, descricao: "Confraternização Universal", origem: "Lei 662/1949" },
    { data: somarDias(pascoa, -48), descricao: "Carnaval (segunda)", origem: "PROVISÓRIO — praxe forense, conferir ato do TRT" },
    { data: somarDias(pascoa, -47), descricao: "Carnaval (terça)", origem: "PROVISÓRIO — praxe forense, conferir ato do TRT" },
    { data: somarDias(pascoa, -2), descricao: "Sexta-feira Santa", origem: "Lei 9.093/1995" },
    { data: `${ano}-04-21`, descricao: "Tiradentes", origem: "Lei 662/1949" },
    { data: `${ano}-05-01`, descricao: "Dia do Trabalho", origem: "Lei 662/1949" },
    { data: somarDias(pascoa, 60), descricao: "Corpus Christi", origem: "PROVISÓRIO — praxe forense, conferir ato do TRT" },
    { data: `${ano}-09-07`, descricao: "Independência", origem: "Lei 662/1949" },
    { data: `${ano}-10-12`, descricao: "Nossa Senhora Aparecida", origem: "Lei 6.802/1980" },
    { data: `${ano}-11-02`, descricao: "Finados", origem: "Lei 662/1949" },
    { data: `${ano}-11-15`, descricao: "Proclamação da República", origem: "Lei 662/1949" },
    { data: `${ano}-11-20`, descricao: "Consciência Negra", origem: "Lei 14.759/2023" },
    { data: `${ano}-12-25`, descricao: "Natal", origem: "Lei 662/1949" },
  ];
}

/**
 * Suspensão de prazos do art. 775-A da CLT: de 20/12 a 20/01, inclusive.
 *
 * Fonte: art. 775-A da CLT, incluído pela Lei 13.545/2017.
 * ⚠️ Cada TRT pode PRORROGAR por ato próprio — verificado no TRT-2 (até 24/01).
 *    Prorrogação precisa entrar como registro `tribunal` com origem citável.
 */
export function suspensaoRecesso(ano) {
  return {
    dataInicio: `${ano}-12-20`,
    dataFim: `${ano + 1}-01-20`,
    descricao: "Suspensão de prazos — recesso forense",
    origem: "CLT art. 775-A (Lei 13.545/2017)",
  };
}

/** Popula o banco com o calendário PROVISÓRIO (tudo com confirmado_em = NULL). */
export function semear(db, anos, { tribunal = null } = {}) {
  const inserir = db.prepare(
    `INSERT INTO feriados (data_inicio, data_fim, descricao, abrangencia, tribunal, origem, confirmado_em, criado_em)
     VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`,
  );
  let n = 0;
  for (const ano of anos) {
    for (const f of feriadosNacionais(ano)) {
      inserir.run(f.data, f.data, f.descricao, "nacional", null, f.origem, agora());
      n++;
    }
    const s = suspensaoRecesso(ano);
    inserir.run(s.dataInicio, s.dataFim, s.descricao, "nacional", tribunal, s.origem, agora());
    n++;
  }
  return n;
}

/**
 * Carrega o calendário para consulta rápida.
 * Devolve também quais entradas NÃO estão confirmadas — é o que faz o motor
 * de prazos marcar `requer_confirmacao`.
 */
export function carregar(db, { tribunal = null } = {}) {
  const linhas = db
    .prepare(
      `SELECT * FROM feriados
        WHERE abrangencia = 'nacional'
           OR (abrangencia = 'tribunal' AND tribunal = ?)
           OR (abrangencia = 'estadual' AND tribunal = ?)
        ORDER BY data_inicio`,
    )
    .all(tribunal, tribunal);

  return {
    linhas,
    /** Retorna a entrada que bloqueia a data, ou null. */
    bloqueio(iso) {
      return linhas.find((l) => iso >= l.data_inicio && iso <= l.data_fim) ?? null;
    },
    get totalNaoConfirmadas() {
      return linhas.filter((l) => l.confirmado_em === null).length;
    },
  };
}
