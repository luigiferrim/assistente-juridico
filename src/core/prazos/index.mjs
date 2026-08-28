/**
 * Motor de cálculo de prazos.
 *
 * ⚠️⚠️ MÓDULO PROVISÓRIO — NÃO APROVADO ⚠️⚠️
 *
 * A ARQUITETURA está pronta e testada. As REGRAS não foram validadas pela
 * advogada. Nenhum resultado daqui pode ser apresentado como data certa, e o
 * Portão 1 do plano NÃO é atendido por estes testes — ele exige os 10 casos
 * reais que ela calculou à mão.
 *
 * Três invariantes, todas estruturais (não dependem de disciplina de quem usa):
 *
 *  1. A IA NUNCA calcula data. Ela extrai {evento_base, data_base, quantidade,
 *     unidade}; quem conta dias é este módulo.
 *
 *  2. Nunca devolve uma data pelada. Devolve `memoria` — o passo a passo — e
 *     `requerConfirmacao`. Se qualquer feriado usado no caminho não estiver
 *     confirmado por ela, `requerConfirmacao` é true. Como hoje NADA está
 *     confirmado, todo resultado sai marcado. É de propósito.
 *
 *  3. Ambiguidade não vira palpite. `unidade` desconhecida ou data-base ausente
 *     lança erro — não escolhe o "mais provável".
 */

import { carregar, ehFimDeSemana, somarDias } from "./calendario.mjs";

/** Marca explícita: enquanto for false, nenhum resultado é definitivo. */
export const APROVADO_PELA_ADVOGADA = false;

const UNIDADES = new Set(["dias_uteis", "dias_corridos"]);

export class PrazoAmbiguoError extends Error {
  constructor(mensagem, detalhes = {}) {
    super(mensagem);
    this.name = "PrazoAmbiguoError";
    this.detalhes = detalhes;
  }
}

/**
 * Calcula a data final de um prazo.
 *
 * @returns {{
 *   dataFinal: string, memoria: object[], requerConfirmacao: boolean,
 *   motivosConfirmacao: string[], provisorio: boolean
 * }}
 */
export function calcularPrazo(db, { dataBase, quantidade, unidade, tribunal = null, eventoBase = null }) {
  if (!dataBase || !/^\d{4}-\d{2}-\d{2}$/.test(dataBase)) {
    throw new PrazoAmbiguoError("data-base ausente ou fora do formato AAAA-MM-DD", { dataBase });
  }
  if (!Number.isInteger(quantidade) || quantidade <= 0) {
    throw new PrazoAmbiguoError("quantidade de dias inválida", { quantidade });
  }
  if (!UNIDADES.has(unidade)) {
    // "10 dias" sem dizer se úteis ou corridos NÃO pode virar palpite.
    throw new PrazoAmbiguoError(
      `unidade de prazo indeterminada: "${unidade}". Na Justiça do Trabalho a regra ` +
        `geral é dias úteis (CLT art. 775), mas isso precisa ser confirmado caso a caso.`,
      { unidade, unidadesValidas: [...UNIDADES] },
    );
  }

  const cal = carregar(db, { tribunal });
  const memoria = [];
  const motivos = [];
  const naoConfirmadasUsadas = new Set();

  // O termo inicial é o dia seguinte à data-base (não se conta o dia do começo).
  let cursor = somarDias(dataBase, 1);
  memoria.push({
    passo: "termo_inicial",
    data: cursor,
    nota: `dia seguinte a ${dataBase}${eventoBase ? ` (${eventoBase})` : ""}`,
  });

  // Para dias ÚTEIS, o início "escorrega" para o primeiro dia útil — para o
  // resultado é indiferente (a contagem pularia esses dias de qualquer forma),
  // mas a memória de cálculo fica explícita.
  //
  // Para dias CORRIDOS, o início NÃO escorrega. Confirmado por ela em
  // 09/08/2026: "1 dia após pode ser um dia não útil". A versão anterior
  // escorregava aqui e atrasava o vencimento — 10 corridos publicados numa
  // sexta venciam 2 dias tarde demais. Errar para mais é a direção perigosa.
  let guarda = 0;
  if (unidade === "dias_uteis") {
    for (;;) {
      if (++guarda > 400) throw new Error("laço de cálculo sem convergir — calendário inconsistente?");
      const bloqueio = cal.bloqueio(cursor);
      const fds = ehFimDeSemana(cursor);
      if (!bloqueio && !fds) break;
      if (bloqueio && bloqueio.confirmado_em === null) naoConfirmadasUsadas.add(bloqueio.descricao);
      memoria.push({
        passo: "adia_inicio",
        data: cursor,
        motivo: bloqueio ? `${bloqueio.descricao} (${bloqueio.origem})` : "fim de semana",
      });
      cursor = somarDias(cursor, 1);
    }
  }

  let contados = 0;
  let dataFinal = cursor;

  if (unidade === "dias_corridos") {
    // Corridos: conta tudo, mas o VENCIMENTO não pode cair em dia não útil.
    dataFinal = somarDias(cursor, quantidade - 1);
    memoria.push({ passo: "contagem_corrida", data: dataFinal, nota: `${quantidade} dias corridos` });
    guarda = 0;
    for (;;) {
      if (++guarda > 400) throw new Error("laço de prorrogação sem convergir");
      const bloqueio = cal.bloqueio(dataFinal);
      const fds = ehFimDeSemana(dataFinal);
      if (!bloqueio && !fds) break;
      if (bloqueio && bloqueio.confirmado_em === null) naoConfirmadasUsadas.add(bloqueio.descricao);
      memoria.push({
        passo: "prorroga_vencimento",
        data: dataFinal,
        motivo: bloqueio ? `${bloqueio.descricao} (${bloqueio.origem})` : "fim de semana",
      });
      dataFinal = somarDias(dataFinal, 1);
    }
  } else {
    // Úteis (CLT art. 775): só dias úteis entram na conta.
    guarda = 0;
    while (contados < quantidade) {
      if (++guarda > 2000) throw new Error("laço de contagem sem convergir");
      const bloqueio = cal.bloqueio(cursor);
      const fds = ehFimDeSemana(cursor);
      if (bloqueio || fds) {
        if (bloqueio && bloqueio.confirmado_em === null) naoConfirmadasUsadas.add(bloqueio.descricao);
        memoria.push({
          passo: "pula",
          data: cursor,
          motivo: bloqueio ? `${bloqueio.descricao} (${bloqueio.origem})` : "fim de semana",
        });
      } else {
        contados++;
        dataFinal = cursor;
      }
      if (contados < quantidade) cursor = somarDias(cursor, 1);
    }
    memoria.push({ passo: "contagem_util", data: dataFinal, nota: `${quantidade}º dia útil` });
  }

  if (naoConfirmadasUsadas.size > 0) {
    motivos.push(
      `o cálculo atravessou ${naoConfirmadasUsadas.size} data(s) de calendário ainda não conferida(s): ` +
        [...naoConfirmadasUsadas].join("; "),
    );
  }
  if (!APROVADO_PELA_ADVOGADA) {
    motivos.push("o motor de prazos ainda não foi validado contra os casos de referência da advogada");
  }

  return {
    dataFinal,
    memoria,
    requerConfirmacao: motivos.length > 0,
    motivosConfirmacao: motivos,
    provisorio: !APROVADO_PELA_ADVOGADA,
  };
}

/** Texto de uma linha só, para exibir junto da data. Nunca mostre a data sozinha. */
export function explicar(resultado, { dataBase, quantidade, unidade }) {
  const rotulo = unidade === "dias_uteis" ? "dias úteis" : "dias corridos";
    return (
    `${resultado.dataFinal} — contado de ${dataBase}, ${quantidade} ${rotulo}` +
    (resultado.requerConfirmacao ? " · CONFIRMAR" : "")
  );
}
