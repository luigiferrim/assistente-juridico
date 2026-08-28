/**
 * Renderização do briefing em HTML de e-mail — as regras de design do piloto:
 *
 *  • Celular primeiro: coluna única ≤600px, cartões empilhados, sem tabelas.
 *  • Modo escuro do Gmail: NUNCA texto claro sobre fundo colorido — só texto
 *    escuro (#222) sobre fundo claro; cor entra por borda lateral.
 *  • Todo link é âncora <a>, nunca URL crua (o Gmail embrulha URL crua num
 *    redirecionador feio).
 *  • Todo dado vindo de fora passa por escape — teor de comunicação contém
 *    HTML/entidades e não pode virar markup do e-mail.
 */

import { NOME_ESCRITORIO, URL_APROVACAO } from "../escritorio.mjs";

const CORES_URGENCIA = { hoje: "#c62828", semana: "#e0a000", informativo: "#9e9e9e" };
const ROTULOS_URGENCIA = { hoje: "🔴 AGIR HOJE", semana: "🟡 ESTA SEMANA", informativo: "⚪ INFORMATIVO" };

export function escapar(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const brl = (centavos) =>
  (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function dataBr(iso) {
  if (!iso) return "";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

const DIAS_SEMANA = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

function ancora(url, texto) {
  return `<a href="${escapar(url)}" style="color:#1a4d8f">${escapar(texto)}</a>`;
}

function cartaoItem(item) {
  const cor = CORES_URGENCIA[item.urgencia];
  const linhas = [];

  const titulo = [item.tipoDocumento ?? item.tipoComunicacao, item.partes]
    .filter(Boolean)
    .join(" — ");
  linhas.push(
    `<div style="font-size:12px;font-weight:bold;color:${cor};margin-bottom:3px">${ROTULOS_URGENCIA[item.urgencia]}</div>`,
    `<div style="font-size:15px;color:#222222"><b>${escapar(titulo || "Comunicação")}</b>${item.sigilo ? " 🔒" : ""}</div>`,
  );

  const meta = [item.numeroCnj, item.tribunal, item.orgao].filter(Boolean).join(" · ");
  if (meta) linhas.push(`<div style="font-size:13px;color:#555;margin-top:2px">${escapar(meta)}</div>`);

  for (const sinal of item.sinais) {
    linhas.push(`<div style="font-size:13px;color:#333;margin-top:4px">▸ ${escapar(sinal)}</div>`);
  }

  if (item.publicacaoEstimada) {
    linhas.push(
      `<div style="font-size:12px;color:#666;margin-top:4px">disponibilizada ${escapar(dataBr(item.dataDisponibilizacao))} · publicação estimada ${escapar(dataBr(item.publicacaoEstimada))} (CONFIRMAR)</div>`,
    );
  }

  if (item.trecho) {
    linhas.push(
      `<div style="font-size:12px;color:#666;margin-top:6px;border-left:2px solid #ddd;padding-left:8px">“${escapar(item.trecho)}…”</div>`,
    );
  }

  const fontes = [];
  if (item.link) fontes.push(ancora(item.link, "📍 onde encontrei: comunicação no Diário"));
  if (item.fonteObrigacao) fontes.push(`📍 fonte: ${escapar(item.fonteObrigacao)}`);
  if (item.compartilhadaCom?.length) {
    fontes.push(`também: ${escapar(item.compartilhadaCom.join(", "))}`);
  }
  if (fontes.length) linhas.push(`<div style="font-size:12px;margin-top:6px">${fontes.join(" · ")}</div>`);

  return `<div style="border:1px solid #ddd;border-left:5px solid ${cor};border-radius:6px;padding:10px 12px;margin:8px 0">${linhas.join("")}</div>`;
}

/** Monta a URL do botão Aprovar (página de confirmação no Apps Script). */
function urlDoBotao(base, p, token) {
  const [d, m, a] = p.data.split("/");
  const q = new URLSearchParams({
    acao: "aprovar",
    // Token secreto: a página só abre com ele. Protege o link contra uso por
    // quem não recebeu o briefing.
    ...(token ? { tk: token } : {}),
    // SEM authuser de propósito: com a implantação "Qualquer pessoa" + "Executar
    // como: a conta do escritório", o evento é criado sempre no calendário do
    // escritório, não importa em qual conta o celular esteja logado. Forçar
    // authuser quebraria em quem não tem a conta do escritório logada
    // (o erro "Não foi possível abrir o arquivo" do teste de 10/08).
    // Título no padrão das advogadas (11/08): cliente × empregado · tipo · vara.
    t: p.tituloEvento ?? `${p.tipo === "pericia" ? "Perícia" : "Audiência"} ${p.partes ?? p.numeroCnj}`,
    d: `${a}-${m}-${d}`,
    h: p.hora ?? "",
    dur: "60",
    loc: p.linkSala ?? "",
    cor: p.advogado?.corAgenda ?? "",
    proc: p.numeroCnj,
    // Nome do empregado: assunto "PROCESSO [PARTE]" do rascunho de aviso ao
    // cliente que o Apps Script cria na aprovação (v3.1).
    pn: p.empregado ?? "",
    conv: p.convidadosSugeridos.join(","),
    desc: `Processo: ${p.numeroCnj}\nPartes: ${p.partesTitulo ?? p.partes ?? "conferir"}\n${p.orgao ?? p.tribunal ?? ""}${p.linkSala ? `\nSala: ${p.linkSala}` : ""}\nFonte: Diário de ${dataBr(p.fonte?.disponibilizadaEm)}`,
  });
  return `${base}?${q}`;
}

function rotuloProposta(p) {
  if (p.tipo === "pericia") return "Perícia";
  if (!p.subtipo) return "Audiência";
  return p.subtipo === "Una" || p.subtipo === "Inicial"
    ? `Audiência ${p.subtipo.toLowerCase()}`
    : `Audiência de ${p.subtipo.toLowerCase()}`;
}

function cartaoProposta(p, urlAprovacao, tokenAprovacao) {
  const linhas = [
    `<div style="font-size:12px;font-weight:bold;color:#1a5c1a;margin-bottom:3px">📅 PROPOSTA PARA A AGENDA ${p.advogado?.emoji ?? ""}</div>`,
    `<div style="font-size:15px;color:#222222"><b>${escapar(rotuloProposta(p))} · ${escapar(p.data)}${p.hora ? ` às ${escapar(p.hora)}` : " (hora não detectada — conferir)"}</b>${p.sigilo ? " 🔒" : ""}</div>`,
    `<div style="font-size:13px;color:#555;margin-top:2px">${escapar([p.partesTitulo ?? p.partes ?? "partes: conferir no teor", p.numeroCnj, p.orgao ?? p.tribunal].filter(Boolean).join(" · "))}</div>`,
  ];
  if (p.linkSala) linhas.push(`<div style="font-size:13px;margin-top:4px">${ancora(p.linkSala, "link da sala virtual")}</div>`);
  if (p.convidadosSugeridos.length) {
    linhas.push(
      `<div style="background:#f7f7f7;border-radius:4px;padding:8px 10px;margin-top:6px;font-size:12px;color:#222222"><b>Convidados</b> — ao aprovar, recebem o convite (ajustes depois, direto na agenda):<br>${p.convidadosSugeridos.map((e) => `· ${escapar(e)}`).join("<br>")}</div>`,
    );
  }
  if (p.verificarAgenda) {
    linhas.push(`<div style="font-size:12px;color:#8a6100;margin-top:6px">⚠️ conferir se já está na agenda antes de aprovar</div>`);
  }
  if (p.fonte?.link) {
    linhas.push(`<div style="font-size:12px;margin-top:4px">${ancora(p.fonte.link, `📍 onde encontrei: Diário de ${dataBr(p.fonte.disponibilizadaEm)}`)}</div>`);
  }
  if (urlAprovacao) {
    // Botão de verdade: abre a página de confirmação (convidados editáveis,
    // aviso de duplicata) e cria o evento na agenda. Nada é criado sem o
    // clique final na página.
    linhas.push(
      `<div style="margin-top:10px"><a href="${escapar(urlDoBotao(urlAprovacao, p, tokenAprovacao))}" style="display:inline-block;background:#d9efd9;color:#1b5e20;border:2px solid #1b5e20;padding:9px 18px;text-decoration:none;border-radius:5px;font-weight:bold">✅ Aprovar → agenda</a> <span style="font-size:11px;color:#666">cria o evento na hora (clique repetido não duplica; dá para desfazer) · se o Gmail mostrar "Aviso de redirecionamento", é normal: siga o link</span></div>`,
    );
  } else {
    linhas.push(
      `<div style="font-size:12px;color:#444;margin-top:6px">Para aprovar: responda este e-mail com “aprovo a ${p.tipo === "pericia" ? "perícia" : "audiência"} de ${escapar(p.data)} — proc. ${escapar(p.numeroCnj)}”.</div>`,
    );
  }
  return `<div style="border:2px solid #1a5c1a;border-radius:6px;padding:10px 12px;margin:8px 0;background:#fbfff9">${linhas.join("")}</div>`;
}

function secaoAdvogado({ advogado, itens }, propostas, urlAprovacao, tokenAprovacao) {
  const cab = `<div style="background:#f4f4f4;border-left:6px solid ${advogado.cor};padding:8px 12px;margin:20px 0 6px 0;border-radius:4px"><b style="font-size:15px;color:#222222">${advogado.emoji} ${escapar(advogado.nome)}</b> <span style="font-size:12px;color:#555">— OAB ${escapar(advogado.oab)} · ${escapar(advogado.jurisdicao)}</span></div>`;
  if (itens.length === 0 && propostas.length === 0) {
    return `${cab}<div style="border:1px solid #ddd;border-radius:6px;padding:10px 12px;margin:8px 0;font-size:13px;color:#555">Nenhuma novidade <b>no que este briefing vê</b> — a cobertura tem limites, declarados no rodapé.</div>`;
  }
  const informativos = itens.filter((i) => i.urgencia === "informativo");
  const principais = itens.filter((i) => i.urgencia !== "informativo");
  // Ordem definida pelo Luigi (11/08): PRIMEIRO a agenda do advogado (📅
  // propostas), depois 🔴 agir hoje, 🟡 semana e ⚪ informativo.
  const blocos = [
    ...propostas.map((p) => cartaoProposta(p, urlAprovacao, tokenAprovacao)),
    ...principais.map(cartaoItem),
  ];
  if (informativos.length) {
    blocos.push(
      `<div style="border:1px solid #ddd;border-left:5px solid #9e9e9e;border-radius:6px;padding:8px 12px;margin:8px 0;font-size:13px;color:#555">⚪ <b>Informativo</b> (${informativos.length}): ${informativos
        .map((i) => escapar([i.tipoDocumento, i.partes, i.numeroCnj].filter(Boolean).join(" — ")))
        .join(" · ")}</div>`,
    );
  }
  return cab + blocos.join("");
}

function secaoVencimentos(vencimentos, condicionais) {
  if (vencimentos.length === 0 && condicionais.length === 0) return "";
  const linhas = vencimentos.map((v) => {
    const alerta = v.vencida
      ? `<b style="color:#c62828">VENCIDA há ${-v.diasRestantes} dia(s) — confirmar pagamento</b>`
      : v.diasRestantes === 0
        ? `<b style="color:#c62828">vence HOJE</b>`
        : `vence em ${v.diasRestantes} dia(s) (${dataBr(v.vencimento)})`;
    return `<div style="font-size:13px;color:#222222;margin:4px 0">· <b>${brl(v.valor_centavos)}</b> — ${escapar(v.descricao)} — ${escapar(v.partes)} · ${escapar(v.numero_cnj)} · ${alerta}</div>`;
  });
  if (condicionais.length) {
    linhas.push(
      `<div style="font-size:12px;color:#666;margin-top:6px">⏸ Aguardando gatilho (sem data — não é esquecimento): ${condicionais
        .map((c) => escapar(`${c.descricao} [${c.gatilho}]`))
        .join(" · ")}</div>`,
    );
  }
  return `<div style="background:#f4f4f4;border-left:6px solid #607d8b;padding:8px 12px;margin:20px 0 6px 0;border-radius:4px"><b style="font-size:15px;color:#222222">⏳ Próximos vencimentos (14 dias)</b></div><div style="border:1px solid #ddd;border-radius:6px;padding:10px 12px">${linhas.join("")}</div>`;
}

function rodape(modelo) {
  const statusFontes = modelo.cobertura.fontes.length
    ? modelo.cobertura.fontes
        .map((f) => {
          const ok = f.status === "ok" || f.status === "vazio";
          return `OAB ${escapar(f.oab)}: ${ok ? escapar(f.status) : `<b style="color:#c62828">${escapar(f.status)}</b>`}${f.completo ? "" : " (incompleta)"}`;
        })
        .join(" · ")
    : '<b style="color:#c62828">nenhuma coleta registrada</b>';
  return `<div style="background:#f2f2f2;border-top:2px solid #999;padding:10px 12px;margin-top:24px;font-size:11px;color:#555;line-height:1.6"><b>O QUE ESTE BRIEFING NÃO VÊ:</b> ${escapar(modelo.cobertura.naoVe)}${modelo.cobertura.emailCoberto ? "" : " · <b>e-mail do escritório não coberto por esta geração local</b>"}<br><b>Coleta (Diário):</b> ${statusFontes}<br>Gerado localmente em ${escapar(modelo.geradoEm)} — Fase 2, triagem por regras (sem IA); sinais explícitos em cada item.</div>`;
}

export function renderizarHtml(modelo, { urlAprovacao = URL_APROVACAO, tokenAprovacao = null, nomeEscritorio = NOME_ESCRITORIO } = {}) {
  const [ano, mes, dia] = modelo.data.split("-").map(Number);
  const diaSemana = DIAS_SEMANA[new Date(Date.UTC(ano, mes - 1, dia, 12)).getUTCDay()];

  const partes = [
    `<div style="max-width:600px;margin:0 auto;padding:12px;font-family:Georgia,serif;color:#222222">`,
    `<h1 style="font-size:20px;color:#222222;border-bottom:3px solid #444;padding-bottom:6px;margin:0 0 4px 0">☕ Briefing — ${diaSemana}, ${dataBr(modelo.data)}</h1>`,
    `<p style="font-size:12px;color:#666;margin:0 0 14px 0">${escapar(nomeEscritorio)} — ${modelo.totais.comunicacoesNovas} novidade(s) · ${modelo.totais.urgentes} urgente(s)</p>`,
  ];

  // Propostas de agenda vivem DENTRO da seção do advogado responsável, no
  // topo (regra do Luigi, 11/08). Proposta sem advogado identificado cai na
  // primeira seção para não sumir.
  const propostasDe = (oab, i) =>
    modelo.propostasAgenda.filter(
      (p) => p.advogado?.oab === oab || (!p.advogado && i === 0),
    );
  partes.push(
    ...modelo.secoes.map((s, i) => secaoAdvogado(s, propostasDe(s.advogado.oab, i), urlAprovacao, tokenAprovacao)),
  );
  partes.push(secaoVencimentos(modelo.vencimentos, modelo.condicionais));
  partes.push(rodape(modelo));
  partes.push(`</div>`);
  return partes.join("\n");
}
