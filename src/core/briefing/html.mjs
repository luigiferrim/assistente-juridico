/**
 * Renderização do briefing em HTML de e-mail — as regras de design do piloto:
 *
 *  • Celular primeiro: coluna única ≤600px, cartões empilhados, sem tabelas.
 *  • Modo escuro do Gmail: NUNCA texto claro sobre fundo colorido — só texto
 *    escuro sobre fundo claro (branco ou quase branco); a cor entra pelo texto
 *    dos rótulos e por bordas, nunca por fundo saturado.
 *  • Todo link é âncora <a>, nunca URL crua (o Gmail embrulha URL crua num
 *    redirecionador feio).
 *  • Todo dado vindo de fora passa por escape — teor de comunicação contém
 *    HTML/entidades e não pode virar markup do e-mail.
 *
 * Linguagem visual (revisão de 15/10): editorial e discreta. Fundo papel,
 * cartões brancos com fio fino, uma serifa só nos títulos e números, sans do
 * sistema no resto (o Gmail ignora @font-face), rótulos pequenos em caixa alta
 * com espaçamento, e cor reservada para o que pede atenção. Tudo inline: o
 * Gmail descarta <style> em parte dos clientes.
 */

import { NOME_ESCRITORIO, URL_APROVACAO } from "../escritorio.mjs";

// ---------- Tokens -------------------------------------------------------------

const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";
const SERIF = "'New York','Iowan Old Style',Charter,Georgia,'Times New Roman',serif";

const COR = {
  tinta: "#1a1a1a", // texto principal
  suave: "#555555", // texto secundário
  apagado: "#767676", // rótulos e notas (contraste AA sobre branco)
  fio: "#e7e4de", // bordas e divisórias
  papel: "#f6f5f1", // fundo da página
  cartao: "#ffffff",
  link: "#2b4c7e",
  alerta: "#a15c00", // âmbar legível
  agenda: "#2f6b3a",
};

const CORES_URGENCIA = { hoje: "#b3261e", semana: COR.alerta, informativo: COR.apagado };
const ROTULOS_URGENCIA = { hoje: "AGIR HOJE", semana: "ESTA SEMANA", informativo: "INFORMATIVO" };

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

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

const DIAS_SEMANA = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

// ---------- Peças ---------------------------------------------------------------

function ancora(url, texto) {
  return `<a href="${escapar(url)}" style="color:${COR.link};text-decoration:none;font-weight:500">${escapar(texto)}</a>`;
}

/** Rótulo pequeno em caixa alta, com ponto colorido opcional. */
function rotulo(texto, cor = COR.apagado, { ponto = false } = {}) {
  const marca = ponto ? `<span style="color:${cor};font-size:10px;vertical-align:1px">●</span>&nbsp;&nbsp;` : "";
  return `<div style="font-size:11px;line-height:16px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:${cor};margin:0 0 10px 0">${marca}${texto}</div>`;
}

function selo(texto) {
  return ` <span style="display:inline-block;font-size:10px;line-height:14px;font-weight:600;letter-spacing:0.1em;color:${COR.suave};border:1px solid ${COR.fio};border-radius:999px;padding:1px 8px;vertical-align:2px">${texto}</span>`;
}

function cartao(conteudo) {
  return `<div style="background:${COR.cartao};border:1px solid ${COR.fio};border-radius:14px;padding:20px 22px;margin:0 0 12px 0">${conteudo}</div>`;
}

/** Rodapé do cartão: divisória fina e as fontes. */
function rodapeCartao(itens) {
  if (!itens.length) return "";
  return `<div style="border-top:1px solid ${COR.fio};margin-top:16px;padding-top:12px;font-size:12px;line-height:18px;color:${COR.apagado}">${itens.join(`<span style="color:${COR.fio}">&nbsp;&nbsp;|&nbsp;&nbsp;</span>`)}</div>`;
}

const titulo = (html) =>
  `<div style="font-size:17px;line-height:24px;font-weight:600;color:${COR.tinta}">${html}</div>`;

const meta = (texto) =>
  `<div style="font-size:13px;line-height:20px;color:${COR.suave};margin-top:4px;font-variant-numeric:tabular-nums">${texto}</div>`;

// ---------- Cartões -------------------------------------------------------------

function cartaoItem(item) {
  const cor = CORES_URGENCIA[item.urgencia];
  const linhas = [rotulo(ROTULOS_URGENCIA[item.urgencia], cor, { ponto: true })];

  const nome = [item.tipoDocumento ?? item.tipoComunicacao, item.partes].filter(Boolean).join(" — ");
  linhas.push(titulo(`${escapar(nome || "Comunicação")}${item.sigilo ? selo("SIGILO") : ""}`));

  const dados = [item.numeroCnj, item.tribunal, item.orgao].filter(Boolean).join(" · ");
  if (dados) linhas.push(meta(escapar(dados)));

  for (const sinal of item.sinais) {
    linhas.push(`<div style="font-size:14px;line-height:21px;color:${COR.tinta};margin-top:10px">${escapar(sinal)}</div>`);
  }

  if (item.publicacaoEstimada) {
    linhas.push(
      `<div style="font-size:12px;line-height:18px;color:${COR.apagado};margin-top:8px">Disponibilizada em ${escapar(dataBr(item.dataDisponibilizacao))} · publicação estimada em ${escapar(dataBr(item.publicacaoEstimada))} <span style="color:${COR.alerta};font-weight:600">(CONFIRMAR)</span></div>`,
    );
  }

  if (item.trecho) {
    linhas.push(
      `<div style="font-family:${SERIF};font-style:italic;font-size:14px;line-height:22px;color:${COR.suave};margin-top:12px;border-left:2px solid ${COR.fio};padding-left:12px">“${escapar(item.trecho)}…”</div>`,
    );
  }

  const fontes = [];
  if (item.link) fontes.push(ancora(item.link, "Onde encontrei: comunicação no Diário →"));
  if (item.fonteObrigacao) fontes.push(`Fonte: ${escapar(item.fonteObrigacao)}`);
  if (item.compartilhadaCom?.length) fontes.push(`Também: ${escapar(item.compartilhadaCom.join(", "))}`);
  linhas.push(rodapeCartao(fontes));

  return cartao(linhas.join(""));
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
  const quando = p.hora
    ? `${escapar(p.data)}<span style="color:${COR.apagado}">&nbsp;·&nbsp;</span>${escapar(p.hora)}`
    : `${escapar(p.data)}<div style="font-family:${SANS};font-size:13px;line-height:19px;font-weight:600;color:${COR.alerta}">Hora não detectada — conferir</div>`;

  const linhas = [
    rotulo("PROPOSTA PARA A AGENDA", COR.agenda, { ponto: true }),
    titulo(`${escapar(rotuloProposta(p))}${p.sigilo ? selo("SIGILO") : ""}`),
    `<div style="font-family:${SERIF};font-size:24px;line-height:32px;color:${COR.tinta};margin-top:2px;font-variant-numeric:tabular-nums">${quando}</div>`,
    meta(escapar(p.partesTitulo ?? p.partes ?? "partes: conferir no teor")),
    meta(escapar([p.numeroCnj, p.orgao ?? p.tribunal].filter(Boolean).join(" · "))),
  ];
  if (p.linkSala) {
    linhas.push(`<div style="font-size:13px;line-height:20px;margin-top:8px">${ancora(p.linkSala, "Sala virtual →")}</div>`);
  }
  if (p.convidadosSugeridos.length) {
    linhas.push(
      `<div style="border-top:1px solid ${COR.fio};margin-top:16px;padding-top:14px">${rotulo("CONVIDADOS")}<div style="font-size:12px;line-height:18px;color:${COR.apagado};margin:-4px 0 8px 0">Ao aprovar, recebem o convite (ajustes depois, direto na agenda).</div>${p.convidadosSugeridos
        .map((e) => `<div style="font-size:13px;line-height:21px;color:${COR.tinta}">${escapar(e)}</div>`)
        .join("")}</div>`,
    );
  }
  if (p.verificarAgenda) {
    linhas.push(
      `<div style="font-size:13px;line-height:19px;color:${COR.alerta};margin-top:14px"><b>Atenção:</b> conferir se já está na agenda antes de aprovar.</div>`,
    );
  }
  if (urlAprovacao) {
    // Botão de verdade: o clique cria o evento na agenda (v4, um clique). Fundo
    // branco e borda escura — fundo colorido com texto claro some no modo
    // escuro do Gmail.
    linhas.push(
      `<div style="margin-top:18px"><a href="${escapar(urlDoBotao(urlAprovacao, p, tokenAprovacao))}" style="display:inline-block;background:${COR.cartao};color:${COR.tinta};border:1.5px solid ${COR.tinta};border-radius:999px;padding:11px 24px;font-size:14px;line-height:20px;font-weight:600;letter-spacing:0.01em;text-decoration:none">Aprovar → agenda</a></div>`,
      `<div style="font-size:11px;line-height:17px;color:${COR.apagado};margin-top:10px">Cria o evento na hora. Clique repetido não duplica e dá para desfazer. Se o Gmail mostrar “Aviso de redirecionamento”, é normal: siga o link.</div>`,
    );
  } else {
    linhas.push(
      `<div style="font-size:13px;line-height:19px;color:${COR.suave};margin-top:14px">Para aprovar: responda este e-mail com “aprovo a ${p.tipo === "pericia" ? "perícia" : "audiência"} de ${escapar(p.data)} — proc. ${escapar(p.numeroCnj)}”.</div>`,
    );
  }
  if (p.fonte?.link) {
    linhas.push(rodapeCartao([ancora(p.fonte.link, `Onde encontrei: Diário de ${dataBr(p.fonte.disponibilizadaEm)} →`)]));
  }
  return cartao(linhas.join(""));
}

// ---------- Seções --------------------------------------------------------------

function cabecalhoSecao(nome, detalhe, cor) {
  const ponto = cor ? `<span style="color:${cor};font-size:12px;vertical-align:2px">●</span>&nbsp;&nbsp;` : "";
  return `<div style="margin:40px 0 14px 0"><div style="font-family:${SERIF};font-size:22px;line-height:28px;color:${COR.tinta}">${ponto}${nome}</div>${detalhe ? `<div style="font-size:12px;line-height:18px;color:${COR.apagado};margin-top:4px;letter-spacing:0.02em">${detalhe}</div>` : ""}</div>`;
}

function secaoAdvogado({ advogado, itens }, propostas, urlAprovacao, tokenAprovacao) {
  const cab = cabecalhoSecao(
    escapar(advogado.nome),
    `OAB ${escapar(advogado.oab)} · ${escapar(advogado.jurisdicao)}`,
    advogado.cor,
  );
  if (itens.length === 0 && propostas.length === 0) {
    return (
      cab +
      `<div style="border:1px dashed ${COR.fio};border-radius:14px;padding:18px 22px;font-size:14px;line-height:21px;color:${COR.suave}">Nenhuma novidade no que este briefing vê. A cobertura tem limites, declarados no rodapé.</div>`
    );
  }
  const informativos = itens.filter((i) => i.urgencia === "informativo");
  const principais = itens.filter((i) => i.urgencia !== "informativo");
  // Ordem definida pelo Luigi (11/08): PRIMEIRO a agenda do advogado
  // (propostas), depois agir hoje, semana e informativo.
  const blocos = [
    ...propostas.map((p) => cartaoProposta(p, urlAprovacao, tokenAprovacao)),
    ...principais.map(cartaoItem),
  ];
  if (informativos.length) {
    blocos.push(
      cartao(
        rotulo(`INFORMATIVO · ${informativos.length}`, COR.apagado, { ponto: true }) +
          informativos
            .map(
              (i, n) =>
                `<div style="font-size:13px;line-height:20px;color:${COR.suave};padding:8px 0;${n ? `border-top:1px solid ${COR.fio}` : ""}">${escapar(
                  [i.tipoDocumento, i.partes, i.numeroCnj].filter(Boolean).join(" — "),
                )}</div>`,
            )
            .join(""),
      ),
    );
  }
  return cab + blocos.join("");
}

function secaoVencimentos(vencimentos, condicionais) {
  if (vencimentos.length === 0 && condicionais.length === 0) return "";
  const linhas = vencimentos.map((v, n) => {
    const situacao = v.vencida
      ? `<span style="color:${CORES_URGENCIA.hoje};font-weight:600">Vencida há ${plural(-v.diasRestantes, "dia", "dias")} — confirmar pagamento</span>`
      : v.diasRestantes === 0
        ? `<span style="color:${CORES_URGENCIA.hoje};font-weight:600">Vence hoje</span>`
        : `Vence em ${plural(v.diasRestantes, "dia", "dias")} · ${dataBr(v.vencimento)}`;
    return `<div style="padding:12px 0;${n ? `border-top:1px solid ${COR.fio}` : "padding-top:0"}"><div style="font-family:${SERIF};font-size:20px;line-height:26px;color:${COR.tinta};font-variant-numeric:tabular-nums">${brl(v.valor_centavos)}</div><div style="font-size:14px;line-height:20px;color:${COR.tinta};margin-top:2px">${escapar(v.descricao)} — ${escapar(v.partes)}</div><div style="font-size:12px;line-height:18px;color:${COR.apagado};margin-top:2px">${escapar(v.numero_cnj)} · ${situacao}</div></div>`;
  });
  if (condicionais.length) {
    linhas.push(
      `<div style="border-top:1px solid ${COR.fio};padding-top:12px;font-size:12px;line-height:18px;color:${COR.apagado}"><b style="color:${COR.suave}">Aguardando gatilho</b> (sem data — não é esquecimento): ${condicionais
        .map((c) => escapar(`${c.descricao} [${c.gatilho}]`))
        .join(" · ")}</div>`,
    );
  }
  return cabecalhoSecao("Próximos vencimentos", "Janela de 14 dias") + cartao(linhas.join(""));
}

function rodape(modelo) {
  const statusFontes = modelo.cobertura.fontes.length
    ? modelo.cobertura.fontes
        .map((f) => {
          const ok = f.status === "ok" || f.status === "vazio";
          return `OAB ${escapar(f.oab)}: ${ok ? escapar(f.status) : `<b style="color:${CORES_URGENCIA.hoje}">${escapar(f.status)}</b>`}${f.completo ? "" : " (incompleta)"}`;
        })
        .join(" · ")
    : `<b style="color:${CORES_URGENCIA.hoje}">nenhuma coleta registrada</b>`;
  const etiqueta = (t) => `<b style="color:${COR.suave};font-weight:600;letter-spacing:0.08em">${t}</b>`;
  return `<div style="border-top:1px solid ${COR.fio};margin-top:48px;padding-top:20px;font-size:11px;line-height:18px;color:${COR.apagado}"><div style="margin-bottom:10px">${etiqueta("O QUE ESTE BRIEFING NÃO VÊ")}<br>${escapar(modelo.cobertura.naoVe)}${modelo.cobertura.emailCoberto ? "" : " · <b>e-mail do escritório não coberto por esta geração local</b>"}</div><div style="margin-bottom:10px">${etiqueta("COLETA DO DIÁRIO")}<br>${statusFontes}</div><div>Gerado localmente em ${escapar(modelo.geradoEm)} — Fase 2, triagem por regras (sem IA); sinais explícitos em cada item.</div></div>`;
}

/** Texto de prévia da caixa de entrada — o resumo antes de abrir. */
function preCabecalho(modelo) {
  const { urgentes, comunicacoesNovas } = modelo.totais;
  const propostas = modelo.propostasAgenda.length;
  const resumo = [
    urgentes ? plural(urgentes, "urgente", "urgentes") : null,
    propostas ? `${plural(propostas, "proposta", "propostas")} para a agenda` : null,
    plural(comunicacoesNovas, "novidade", "novidades"),
  ]
    .filter(Boolean)
    .join(" · ");
  // O preenchimento invisível impede o Gmail de completar a prévia com o
  // começo do corpo.
  return `<div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:${COR.papel}">${escapar(resumo)}${"&#847;&zwnj;&nbsp;".repeat(60)}</div>`;
}

function numero(valor, legenda, cor = COR.tinta) {
  return `<div style="display:inline-block;vertical-align:top;margin:0 28px 0 0"><div style="font-family:${SERIF};font-size:30px;line-height:36px;color:${cor};font-variant-numeric:tabular-nums">${valor}</div><div style="font-size:11px;line-height:16px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:${COR.apagado}">${legenda}</div></div>`;
}

export function renderizarHtml(modelo, { urlAprovacao = URL_APROVACAO, tokenAprovacao = null, nomeEscritorio = NOME_ESCRITORIO } = {}) {
  const [ano, mes, dia] = modelo.data.split("-").map(Number);
  const diaSemana = DIAS_SEMANA[new Date(Date.UTC(ano, mes - 1, dia, 12)).getUTCDay()];
  const { urgentes, comunicacoesNovas } = modelo.totais;
  const propostas = modelo.propostasAgenda.length;

  const partes = [
    `<div style="background:${COR.papel};padding:36px 16px 40px 16px;font-family:${SANS};color:${COR.tinta};-webkit-text-size-adjust:100%">`,
    preCabecalho(modelo),
    `<div style="max-width:600px;margin:0 auto">`,
    `<div style="font-size:11px;line-height:16px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;color:${COR.apagado}">${escapar(nomeEscritorio)}&nbsp;&nbsp;·&nbsp;&nbsp;Briefing ${dataBr(modelo.data)}</div>`,
    `<h1 style="font-family:${SERIF};font-size:34px;line-height:40px;font-weight:400;color:${COR.tinta};margin:10px 0 24px 0">${diaSemana[0].toUpperCase()}${diaSemana.slice(1)}</h1>`,
    `<div style="border-top:1px solid ${COR.fio};border-bottom:1px solid ${COR.fio};padding:16px 0 14px 0">${numero(comunicacoesNovas, comunicacoesNovas === 1 ? "novidade" : "novidades")}${numero(urgentes, urgentes === 1 ? "urgente" : "urgentes", urgentes ? CORES_URGENCIA.hoje : COR.tinta)}${numero(propostas, "na agenda")}</div>`,
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
  partes.push(`</div></div>`);
  return partes.join("\n");
}
