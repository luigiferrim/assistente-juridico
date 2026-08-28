/**
 * Adaptador DJEN — produção (Fase 2).
 *
 * O cliente HTTP é o mesmo da lib do spike (`spikes/lib/djen.mjs`), portado
 * para cá com a MESMA regra de segurança central, aprovada nos achados S2.1 e
 * S2.2 e protegida por teste de mutação:
 *
 *   A paginação termina SOMENTE quando uma página retorna MENOS itens do que
 *   o solicitado. Qualquer erro (HTTP 500, timeout, JSON inválido, status
 *   "error") é FALHA — nunca fim de lista. Tratar erro como fim faria o
 *   sistema concluir "não há mais nada" quando faltaram páginas: perder uma
 *   intimação em silêncio, o pior modo de falha do projeto.
 *
 * O campo `count` da API não é confiável (S2.1) e nunca entra em lógica de
 * controle.
 *
 * O que este módulo acrescenta ao cliente: `coletarDjen()` — a ingestão de
 * produção. Consulta as OABs do escritório, grava em `comunicacoes` com
 * deduplicação por `djen_id`, vincula cada comunicação às OABs que a
 * receberam (`comunicacoes_oab`) e registra o resultado por fonte em
 * `fontes_execucao` — coleta incompleta NUNCA vira status 'ok'.
 */

import { createHash } from "node:crypto";
import { agora, emTransacao } from "../core/db.mjs";
import { registrar } from "../core/auditoria.mjs";
import { ADVOGADOS } from "../core/escritorio.mjs";

const BASE = "https://comunicaapi.pje.jus.br/api/v1/comunicacao";
const USER_AGENT = "assistente-juridico/0.1 (leitura; leitura somente)";

/** Tamanho mínimo real de página: pedir 1 ou 2 devolve 5 (S2.4). */
export const PAGINA_MINIMA = 5;


/**
 * Derivado de `ADVOGADOS` (que vem de `dados/config.json`, fora do git) — as
 * inscrições reais nunca ficam no código versionado.
 */
export const OABS_DO_ESCRITORIO = ADVOGADOS.map((a) => ({
  numero: a.numero,
  uf: a.uf,
  advogado: a.nome,
}));

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
 * Busca TODAS as páginas de uma consulta. Nunca lança; retorna sempre
 * `completo` explícito — `false` obriga o chamador a marcar a fonte como
 * falha. Nunca devolve resultado parcial disfarçado de completo.
 */
export async function buscarTudo(filtros, opcoes = {}) {
  // Rate limit medido (S2-bis): ~20 req/min, recuperação ~51s. O backoff é
  // MAIOR que a janela de propósito — backoff curto esgotaria as tentativas
  // dentro do próprio bloqueio.
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

  return {
    itens,
    completo: false,
    motivo: `atingido o teto de ${maxPaginas} páginas sem página incompleta — pode haver mais resultados`,
    paginasLidas: maxPaginas,
  };
}

/** Filtro por OAB. Omitir `siglaTribunal` cobre TODOS os tribunais (S1/D2). */
export function filtroPorOab(numeroOab, ufOab, dataInicio, dataFim) {
  return {
    numeroOab: String(numeroOab),
    ufOab: String(ufOab).toUpperCase(),
    dataDisponibilizacaoInicio: dataInicio,
    dataDisponibilizacaoFim: dataFim,
  };
}

const sha256 = (s) => createHash("sha256").update(s ?? "", "utf8").digest("hex");

/** Grava um lote de itens da API para uma OAB. Retorna {novas, vinculos}. */
function gravarLote(db, itens, oab, execucaoId) {
  const inserirCom = db.prepare(
    `INSERT OR IGNORE INTO comunicacoes
       (djen_id, hash_djen, numero_cnj, tribunal, orgao, tipo_comunicacao,
        tipo_documento, data_disponibilizacao, texto, texto_sha256, link,
        bruto, execucao_id, criado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const buscarId = db.prepare("SELECT id FROM comunicacoes WHERE djen_id = ?");
  const vincular = db.prepare(
    "INSERT OR IGNORE INTO comunicacoes_oab (comunicacao_id, oab) VALUES (?, ?)",
  );

  let novas = 0;
  let vinculos = 0;
  emTransacao(db, () => {
    for (const item of itens) {
      const texto = item.texto ?? "";
      const r = inserirCom.run(
        item.id,
        item.hash ?? "",
        item.numeroprocessocommascara ?? item.numero_processo ?? "",
        item.siglaTribunal ?? "",
        item.nomeOrgao ?? null,
        item.tipoComunicacao ?? null,
        item.tipoDocumento ?? null,
        item.data_disponibilizacao ?? item.datadisponibilizacao ?? "",
        texto,
        sha256(texto),
        item.link ?? null,
        JSON.stringify(item),
        execucaoId,
        agora(),
      );
      novas += r.changes;
      const { id } = buscarId.get(item.id);
      vinculos += vincular.run(id, oab).changes;
    }
  });
  return { novas, vinculos };
}

/**
 * Coleta de produção: consulta cada OAB e persiste o resultado.
 *
 * Regras de status por execução (fontes_execucao):
 *   coleta incompleta  → 'falhou' (mesmo que itens parciais tenham sido salvos)
 *   completa e vazia   → 'vazio'
 *   completa com itens → 'ok'
 * `saudeDoSistema()` só considera saudável 'ok'/'vazio' com completo=1 — uma
 * coleta parcial jamais silencia o heartbeat.
 */
export async function coletarDjen(db, { oabs = OABS_DO_ESCRITORIO, dataInicio, dataFim, ator = "sistema", ...opcoesBusca } = {}) {
  if (!dataInicio || !dataFim) throw new Error("coletarDjen exige dataInicio e dataFim (AAAA-MM-DD)");

  const porOab = [];
  for (const { numero, uf } of oabs) {
    const oab = `${numero}/${uf}`;
    const filtros = filtroPorOab(numero, uf, dataInicio, dataFim);

    const execucaoId = db
      .prepare(
        `INSERT INTO fontes_execucao (fonte, iniciado_em, status, itens_obtidos, parametros)
         VALUES ('djen', ?, 'rodando', 0, ?)`,
      )
      .run(agora(), JSON.stringify(filtros)).lastInsertRowid;

    const r = await buscarTudo(filtros, opcoesBusca);
    const { novas, vinculos } = gravarLote(db, r.itens, oab, execucaoId);

    const status = !r.completo ? "falhou" : r.itens.length === 0 ? "vazio" : "ok";
    db.prepare(
      `UPDATE fontes_execucao
          SET encerrado_em = ?, status = ?, completo = ?, motivo = ?, itens_obtidos = ?
        WHERE id = ?`,
    ).run(agora(), status, r.completo ? 1 : 0, r.motivo, r.itens.length, execucaoId);

    registrar(db, {
      ator,
      evento: "coleta_djen",
      entidade: "fontes_execucao",
      entidadeId: String(execucaoId),
      detalhes: { oab, status, obtidos: r.itens.length, novas, vinculos, paginasLidas: r.paginasLidas },
    });

    porOab.push({ oab, status, completo: r.completo, obtidos: r.itens.length, novas, vinculos, motivo: r.motivo });
  }

  return { porOab, houveFalha: porOab.some((x) => x.status === "falhou") };
}
