/**
 * Configuração do escritório — a única fonte destes fatos no código.
 *
 * Tudo aqui veio de decisão explícita do Luigi/advogadas (D10, D18 e regras
 * do piloto de 09-10/08/2026, registradas em PRODUTO.md). Mudou a realidade
 * (nova OAB, novo cliente, nova cor), muda-se AQUI, num lugar só.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Config local (fora do git): identidade real do escritório (advogados/OAB),
 * URL e token da aprovação, contatos de cliente. Declarada antes de tudo
 * porque as constantes abaixo a leem na carga do módulo.
 */
export const CAMINHO_CONFIG =
  process.env.ASSISTENTE_CONFIG ??
  join(dirname(fileURLToPath(import.meta.url)), "..", "..", "dados", "config.json");

/**
 * ⚠️ Os advogados abaixo são um EXEMPLO genérico. A identidade real do
 * escritório (nomes e OAB) vive em `dados/config.json`, campo "advogados",
 * fora do git — dado de pessoa real não entra no versionamento. Se o config
 * existir, ele substitui esta lista por inteiro.
 */
const ADVOGADOS_EXEMPLO = [
  {
    oab: "10001/SC",
    numero: "10001",
    uf: "SC",
    nome: "Dra. Advogada 1",
    emoji: "🟡",
    cor: "#e0b400", // Banana (colorId 5 na agenda)
    corAgenda: "5",
    jurisdicao: "TRTs e TST (PJe) — prazos CLT",
  },
  {
    oab: "10002/SC",
    numero: "10002",
    uf: "SC",
    nome: "Dra. Advogada 2",
    emoji: "🟣",
    cor: "#7b1fa2", // Uva (colorId 3)
    corAgenda: "3",
    jurisdicao: "TRTs (PJe), em conjunto com a Advogada 1",
  },
  {
    oab: "10003/SC",
    numero: "10003",
    uf: "SC",
    nome: "Dr. Advogado 3",
    emoji: "🟢",
    cor: "#2e7d32", // Manjericão (colorId 10)
    corAgenda: "10",
    jurisdicao: "TJSC, JFSC, TRF4 via eproc — prazos CPC; o Diário cobre só parte",
  },
];

function lerConfig() {
  try {
    return JSON.parse(readFileSync(CAMINHO_CONFIG, "utf8"));
  } catch {
    return {};
  }
}

/** Advogados do escritório: do config quando houver, senão o exemplo. */
export const ADVOGADOS = lerConfig().advogados ?? ADVOGADOS_EXEMPLO;

/** Nome do escritório para cabeçalhos — real só no config, fora do git. */
export const NOME_ESCRITORIO = lerConfig().nome_escritorio ?? "Escritório Exemplo";

/** Ordem de prioridade quando uma comunicação pertence a mais de um advogado. */
export const ORDEM_ADVOGADOS = ADVOGADOS.map((a) => a.oab);

export function advogadoPorOab(oab) {
  return ADVOGADOS.find((a) => a.oab === oab) ?? null;
}

/**
 * Convidados habituais por cliente, aprendidos dos eventos reais da agenda.
 * Usados apenas como SUGESTÃO editável na proposta — quem decide quem é
 * convidado é a advogada, apagando linhas na página de confirmação.
 *
 * Os e-mails vivem em `dados/config.json` (fora do git), não aqui: são
 * contatos de cliente, e o invariante do projeto é que dado de cliente nunca
 * entra no versionamento. Formato no config:
 *
 *   "convidados_por_cliente": [{ "cliente": "alfa", "emails": ["a@b.com"] }]
 *
 * O campo `cliente` é um trecho do nome da parte (casamento sem acento/caixa).
 */
let cacheRegras = null;

export function regrasDeConvidados() {
  if (cacheRegras) return cacheRegras;
  try {
    const bruto = JSON.parse(readFileSync(CAMINHO_CONFIG, "utf8"));
    cacheRegras = (bruto.convidados_por_cliente ?? []).map((r) => ({
      cliente: new RegExp(r.cliente, "i"),
      emails: r.emails ?? [],
      apelido: r.apelido ?? null,
    }));
  } catch {
    cacheRegras = []; // sem config: nenhuma sugestão — a proposta segue sem convidados
  }
  return cacheRegras;
}

export function convidadosSugeridos(partes, regras = regrasDeConvidados()) {
  const regra = regras.find((c) => c.cliente.test(partes ?? ""));
  return regra ? [...regra.emails] : [];
}

/**
 * Partes na ordem de agenda pedida pelas advogadas (11/08): a EMPRESA cliente
 * primeiro ("Cliente × empregado"). Reconhece o cliente pelas mesmas regras
 * dos convidados; usa o `apelido` do config quando houver (razão social é
 * longa demais para título de evento). Sem cliente reconhecido, devolve como
 * veio — nunca chutar quem é quem.
 */
export function separarCliente(partes, regras = regrasDeConvidados()) {
  if (!partes) return null;
  const lados = partes.split(" × ");
  if (lados.length < 2) return null;
  const i = lados.findIndex((lado) => regras.some((r) => r.cliente.test(lado)));
  if (i < 0) return null;
  const regra = regras.find((r) => r.cliente.test(lados[i]));
  return { cliente: regra?.apelido ?? lados[i], outros: lados.filter((_, j) => j !== i) };
}

export function partesClientePrimeiro(partes, regras = regrasDeConvidados()) {
  const s = separarCliente(partes, regras);
  return s ? [s.cliente, ...s.outros].join(" × ") : partes;
}

/**
 * URL do App da Web (Apps Script) que abre a página de confirmação do Aprovar.
 * Enquanto não configurada, o briefing cai no modo "aprovar por resposta".
 */
export const URL_APROVACAO = process.env.ASSISTENTE_APROVACAO_URL ?? null;

/** Texto fixo de cobertura — nunca dizer "não há nada", sempre o que não se vê. */
export const COBERTURA_NAO_VE =
  "Domicílio Eletrônico das empresas (só via repasse por e-mail) · painel " +
  "interno do PJe/eproc · teor de processos em segredo de justiça. Prazos são " +
  "sugestões — a conferência nos sistemas é de vocês.";
