/**
 * Gera o briefing matinal local — Fase 2.
 *
 * Uso:
 *   node src/scripts/gerar-briefing.mjs                  # prévia (não consome itens)
 *   node src/scripts/gerar-briefing.mjs --coletar        # coleta DJEN antes de gerar
 *   node src/scripts/gerar-briefing.mjs --marcar         # geração oficial: marca itens como relatados
 *   node src/scripts/gerar-briefing.mjs --data 2026-08-11
 *   node src/scripts/gerar-briefing.mjs --entregar      # envia por e-mail via
 *       Apps Script (acao=entregar + token do config) — a ENTREGA RESERVA do
 *       bloco 3, para quando a rotina da nuvem falhar. Um comando e o briefing
 *       chega na caixa do escritório.
 *
 * Saída: dados/briefings/AAAA-MM-DD-local.html + resumo no stdout.
 * Código de saída 1 se alguma fonte falhou — o agendador fica sabendo.
 */

import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { abrirBanco } from "../core/db.mjs";
import { coletarDjen } from "../adapters/djen.mjs";
import { montarBriefing } from "../core/briefing/index.mjs";
import { renderizarHtml } from "../core/briefing/html.mjs";
import { somarDias } from "../core/prazos/calendario.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const args = process.argv.slice(2);
const pegar = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
};

// A data vem do relógio real NA HORA de gerar (regra: verificar a data sempre),
// mas pode ser forçada para teste com --data.
const hoje = pegar("--data") ?? new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

const db = abrirBanco(process.env.ASSISTENTE_DB ?? join(RAIZ, "dados", "assistente.db"));

let falhaDeColeta = false;
if (args.includes("--coletar")) {
  // Janela sobreposta de propósito: 3 dias para trás. Perder uma execução não
  // pode significar perder um item — a dedup por djen_id absorve a sobreposição.
  const inicio = somarDias(hoje, -3);
  const r = await coletarDjen(db, { dataInicio: inicio, dataFim: hoje, ator: "gerador-briefing" });
  for (const f of r.porOab) {
    console.log(`coleta ${f.oab}: ${f.status} (${f.obtidos} obtidas, ${f.novas} novas)${f.status === "falhou" ? ` — ${f.motivo}` : ""}`);
  }
  falhaDeColeta = r.houveFalha;
}

// Config local (dados/config.json): URL do App da Web que dá vida ao botão
// "Aprovar → agenda". Sem ela, o briefing cai no modo aprovar-por-resposta.
let config = {};
try {
  config = JSON.parse(readFileSync(join(RAIZ, "dados", "config.json"), "utf8"));
} catch {
  /* sem config: modo resposta */
}

const modelo = montarBriefing(db, { hoje, marcar: args.includes("--marcar") });
const html = renderizarHtml(modelo, {
  urlAprovacao: config.aprovacao_url ?? undefined,
  tokenAprovacao: config.aprovacao_token ?? null,
});

const dir = join(RAIZ, "dados", "briefings");
mkdirSync(dir, { recursive: true });
const destino = join(dir, `${hoje}-local.html`);
writeFileSync(destino, html);

console.log(`briefing de ${hoje}: ${modelo.totais.comunicacoesNovas} novidade(s), ` +
  `${modelo.totais.urgentes} urgente(s), ${modelo.propostasAgenda.length} proposta(s) de agenda, ` +
  `${modelo.vencimentos.length} vencimento(s) em 14 dias`);
console.log(`html: ${destino}${args.includes("--marcar") ? " (itens marcados como relatados)" : " (prévia — nada consumido)"}`);

if (args.includes("--entregar")) {
  // Entrega reserva (bloco 3): POST no App da Web do escritório, que envia o
  // e-mail para a própria caixa. Exige aprovacao_url + aprovacao_token no
  // config — sem eles, falha em voz alta (entrega silenciosamente perdida é
  // exatamente o defeito que o resto do sistema existe para evitar).
  if (!config.aprovacao_url || !config.aprovacao_token) {
    console.error("--entregar exige aprovacao_url e aprovacao_token em dados/config.json");
    process.exit(1);
  }
  const [ano, mes, dia] = hoje.split("-");
  const resposta = await fetch(config.aprovacao_url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      acao: "entregar",
      tk: config.aprovacao_token,
      assunto: `☕ Briefing — ${dia}/${mes}/${ano}`,
      html,
    }),
  });
  const corpo = await resposta.text();
  // A resposta vem embrulhada no HTML do Apps Script. Cuidado: /ok/ solto
  // casaria com "tOKen inválido" — primeiro os erros explícitos, depois o ok.
  const recusa = corpo.match(/token inv[áa]lido|acesso negado|a[çc][ãa]o desconhecida/i);
  if (!resposta.ok || recusa || !/ok/i.test(corpo)) {
    console.error(`entrega FALHOU: HTTP ${resposta.status} — ${recusa?.[0] ?? corpo.slice(0, 200)}`);
    process.exit(1);
  }
  console.log("entrega: e-mail enviado à caixa do escritório via Apps Script ✓");
}

if (falhaDeColeta) {
  console.error("ATENÇÃO: houve falha de coleta — o briefing declara a lacuna no rodapé.");
  process.exit(1);
}
