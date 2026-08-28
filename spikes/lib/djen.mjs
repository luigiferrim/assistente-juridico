/**
 * Cliente DJEN (API Comunica / CNJ) — SPIKE.
 *
 * Endpoint público, somente leitura, sem autenticação:
 *   GET https://comunicaapi.pje.jus.br/api/v1/comunicacao
 *
 * REGRA DE SEGURANÇA CENTRAL (achados S2.1 e S2.2, aprovados em 08/08/2026):
 *
 *   A paginação termina SOMENTE quando uma página retorna MENOS itens do que
 *   o solicitado. Qualquer erro (HTTP 500, timeout, JSON inválido, status
 *   "error") é FALHA — nunca fim de lista.
 *
 * Porquê: a API devolve HTTP 500 com "O sistema está muito ocupado" tanto ao
 * passar do fim da lista quanto sob carga real. Tratar erro como fim faria o
 * sistema concluir "não há mais nada" quando faltaram páginas — ou seja,
 * perder uma intimação em silêncio. É o pior modo de falha do projeto.
 *
 * O campo `count` da resposta NÃO é um total confiável (S2.1: variou entre
 * 100, 200, 10000 e 45062 para a mesma consulta, conforme o tamanho de
 * página pedido). Ele é informativo e nunca deve entrar em lógica de
 * controle.
 */

const BASE = "https://comunicaapi.pje.jus.br/api/v1/comunicacao";
const USER_AGENT = "assistente-juridico-spike/0.1 (leitura; contato: escritorio)";

/** Tamanho mínimo real de página: pedir 1 ou 2 devolve 5 (S2.4). */
export const PAGINA_MINIMA = 5;

export class DjenError extends Error {
  constructor(message, { pagina, causa } = {}) {
    super(message);
    this.name = "DjenError";
    this.pagina = pagina;
    this.causa = causa;
  }
}

/** Busca UMA página. Lança DjenError em qualquer falha — jamais devolve vazio por erro. */
export async function buscarPagina(filtros, pagina, itensPorPagina) {
  const qs = new URLSearchParams({ ...filtros, pagina: String(pagina), itensPorPagina: String(itensPorPagina) });
  let resposta;
  try {
    resposta = await fetch(`${BASE}?${qs}`, { headers: { "User-Agent": USER_AGENT } });
  } catch (causa) {
    throw new DjenError(`falha de rede na página ${pagina}`, { pagina, causa });
  }
  if (!resposta.ok) {
    throw new DjenError(`HTTP ${resposta.status} na página ${pagina}`, { pagina });
  }
  let corpo;
  try {
    corpo = await resposta.json();
  } catch (causa) {
    throw new DjenError(`JSON inválido na página ${pagina}`, { pagina, causa });
  }
  if (corpo?.status !== "success") {
    throw new DjenError(`status "${corpo?.status}" na página ${pagina}: ${corpo?.message ?? "sem mensagem"}`, { pagina });
  }
  return Array.isArray(corpo.items) ? corpo.items : [];
}

/**
 * Busca TODAS as páginas de uma consulta.
 *
 * Retorna sempre um objeto com `completo` explícito. O chamador é obrigado a
 * olhar esse campo: `completo: false` significa que a coleta NÃO cobriu o
 * período e o painel deve marcar a fonte como "falhou".
 *
 * Nunca lança. Nunca devolve resultado parcial disfarçado de completo.
 */
export async function buscarTudo(filtros, opcoes = {}) {
  // Rate limit medido em 09/08/2026: ~20 req/min, recuperação em ~51s.
  // `backoffMs` é MAIOR que essa janela de propósito — um backoff curto faria
  // as 3 tentativas se esgotarem dentro do próprio bloqueio, transformando um
  // 429 transitório em coleta incompleta sem necessidade.
  const {
    itensPorPagina = 100,
    maxPaginas = 100,
    pausaMs = 2000,
    tentativasPorPagina = 3,
    backoffMs = 60_000,
    dormir = (ms) => new Promise((r) => setTimeout(r, ms)),
    buscar = buscarPagina,
  } = opcoes;

  const itens = [];
  for (let pagina = 1; pagina <= maxPaginas; pagina++) {
    let lote = null;
    let ultimoErro = null;

    for (let tentativa = 1; tentativa <= tentativasPorPagina; tentativa++) {
      try {
        lote = await buscar(filtros, pagina, itensPorPagina);
        break;
      } catch (erro) {
        ultimoErro = erro;
        if (tentativa < tentativasPorPagina) await dormir(backoffMs * tentativa);
      }
    }

    // ERRO ≠ FIM DE LISTA. Coleta incompleta, declarada como tal.
    if (lote === null) {
      return {
        itens,
        completo: false,
        motivo: `falha na página ${pagina} após ${tentativasPorPagina} tentativas: ${ultimoErro?.message}`,
        paginasLidas: pagina - 1,
      };
    }

    itens.push(...lote);

    // ÚNICA condição válida de término: página incompleta.
    if (lote.length < itensPorPagina) {
      return { itens, completo: true, motivo: "página incompleta = fim da lista", paginasLidas: pagina };
    }

    if (pagina < maxPaginas) await dormir(pausaMs);
  }

  // Estourou o teto sem página incompleta: pode haver mais. NÃO é completo.
  return {
    itens,
    completo: false,
    motivo: `atingido o teto de ${maxPaginas} páginas sem página incompleta — pode haver mais resultados`,
    paginasLidas: maxPaginas,
  };
}

/** Filtro por OAB. Omitir `siglaTribunal` cobre TODOS os tribunais (confirmado no S1). */
export function filtroPorOab(numeroOab, ufOab, dataInicio, dataFim) {
  return {
    numeroOab: String(numeroOab),
    ufOab: String(ufOab).toUpperCase(),
    dataDisponibilizacaoInicio: dataInicio,
    dataDisponibilizacaoFim: dataFim,
  };
}
