/**
 * Montagem do briefing matinal — Fase 2.
 *
 * Lê o banco (comunicacoes + obrigacoes + fontes_execucao) e devolve o MODELO
 * do briefing: seções por advogado, propostas de agenda, vencimentos e a
 * declaração de cobertura. Renderização fica em html.mjs; decisão de entrega
 * fica fora (script/worker).
 *
 * Regras estruturais:
 *  • Comunicação aparece UMA vez, na seção do advogado prioritário
 *    (ordem da lista de advogados), com badge "também: ..." quando compartilhada.
 *  • "Novidade" = comunicação ainda não relatada em briefing anterior
 *    (briefing_itens). Marcar como relatada é opt-in (`marcar: true`) para
 *    testes e prévias não consumirem itens.
 *  • Obrigação com vencimento ≤2 dias (ou vencida e pendente) vira cartão 🔴
 *    na seção do advogado responsável; ≤14 dias entra na seção "Próximos
 *    vencimentos"; condicionais aparecem como "aguardando gatilho".
 *  • Cobertura: status da última coleta POR OAB, e a lista fixa do que o
 *    briefing não vê. "Nada chegou" nunca aparece sem o carimbo da coleta.
 */

import { ADVOGADOS, convidadosSugeridos, partesClientePrimeiro, separarCliente, COBERTURA_NAO_VE } from "../escritorio.mjs";
import { agora, emTransacao } from "../db.mjs";
import { carregar } from "../prazos/calendario.mjs";
import { triar } from "./triagem.mjs";

function diasEntre(deIso, ateIso) {
  return Math.round((new Date(`${ateIso}T12:00Z`) - new Date(`${deIso}T12:00Z`)) / 86_400_000);
}

function novasComunicacoes(db, { incluirJaRelatadas }) {
  const filtro = incluirJaRelatadas ? "" : "WHERE b.comunicacao_id IS NULL";
  return db
    .prepare(
      `SELECT c.*, group_concat(co.oab) AS oabs
         FROM comunicacoes c
         JOIN comunicacoes_oab co ON co.comunicacao_id = c.id
         LEFT JOIN briefing_itens b ON b.comunicacao_id = c.id
         ${filtro}
        GROUP BY c.id
        ORDER BY c.data_disponibilizacao DESC, c.id`,
    )
    .all();
}

/**
 * A API emite UMA cópia do mesmo expediente por destinatário (djen_id
 * distinto, teor idêntico exceto pela linha "Destinatário: ..."). Visto na
 * primeira coleta real: 5 cópias da mesma intimação de audiência. Para o
 * briefing, cópias são UM item — agrupa-se por (processo, disponibilização,
 * teor sem a linha do destinatário) e os vínculos de OAB são somados.
 */
function agruparCopias(comunicacoes) {
  const grupos = new Map();
  for (const c of comunicacoes) {
    // Remove só o NOME do destinatário (palavras em caixa alta) — recorte de
    // largura fixa cortaria o teor em pontos diferentes conforme o tamanho do
    // nome, e as cópias deixariam de se reconhecer.
    const nucleo = (c.texto ?? "")
      .replace(/Destinat[áa]rio:\s*(?:[A-ZÀ-Ü][A-ZÀ-Ü'.&-]*\s*)+/g, "Destinatário: — ")
      // "Intimado(s) / Citado(s) - FULANO" no fim do expediente também varia
      // por cópia (visto no item sob sigilo da 1ª coleta real).
      .replace(/Intimad[oa]\(s\)\s*\/\s*Citad[oa]\(s\)[\s\S]{0,150}$/i, "Intimados: — ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 300);
    const chave = `${c.numero_cnj}|${c.data_disponibilizacao}|${c.tipo_documento}|${nucleo}`;
    const grupo = grupos.get(chave);
    if (!grupo) {
      grupos.set(chave, { ...c, ids: [c.id], oabsSet: new Set((c.oabs ?? "").split(",").filter(Boolean)) });
    } else {
      grupo.ids.push(c.id);
      for (const o of (c.oabs ?? "").split(",").filter(Boolean)) grupo.oabsSet.add(o);
    }
  }
  return [...grupos.values()].map((g) => ({ ...g, oabs: [...g.oabsSet].join(",") }));
}

function coberturaPorOab(db) {
  // Última execução de coleta por OAB (parametros é JSON com numeroOab/ufOab).
  return db
    .prepare(
      `SELECT json_extract(parametros, '$.numeroOab') || '/' || json_extract(parametros, '$.ufOab') AS oab,
              status, completo, motivo, encerrado_em
         FROM fontes_execucao
        WHERE fonte = 'djen' AND id IN (
          SELECT max(id) FROM fontes_execucao
           WHERE fonte = 'djen'
           GROUP BY json_extract(parametros, '$.numeroOab')
        )`,
    )
    .all();
}

export function montarBriefing(
  db,
  { hoje, marcar = false, incluirJaRelatadas = false, regrasConvidados = undefined, advogados = ADVOGADOS },
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(hoje ?? "")) {
    throw new Error("montarBriefing exige `hoje` em AAAA-MM-DD — a data vem de fora, nunca implícita");
  }

  const secoes = new Map(advogados.map((a) => [a.oab, { advogado: a, itens: [] }]));
  const ordem = advogados.map((a) => a.oab);
  const porOab = (oab) => advogados.find((a) => a.oab === oab) ?? null;
  const propostasAgenda = [];

  // ---- Comunicações novas → cartões + propostas -----------------------------
  const brutas = novasComunicacoes(db, { incluirJaRelatadas });
  const comunicacoes = agruparCopias(brutas);
  // Calendário POR TRIBUNAL (cada TRT tem o seu — Lacuna 3): a estimativa de
  // publicação pula feriado carregado, mesmo que ainda não confirmado.
  const calendarios = new Map();
  const bloqueioDe = (tribunal) => {
    if (!calendarios.has(tribunal)) {
      const cal = carregar(db, { tribunal });
      calendarios.set(tribunal, (iso) => cal.bloqueio(iso) !== null);
    }
    return calendarios.get(tribunal);
  };
  for (const c of comunicacoes) {
    const t = triar(c, { hoje, ehBloqueado: bloqueioDe(c.tribunal) });
    const oabs = (c.oabs ?? "").split(",").filter(Boolean);
    const principal = ordem.find((o) => oabs.includes(o)) ?? oabs[0];
    const compartilhadaCom = oabs
      .filter((o) => o !== principal)
      .map((o) => porOab(o)?.nome ?? o);

    const item = {
      origem: "comunicacao",
      comunicacaoId: c.id,
      urgencia: t.urgencia,
      tipoDocumento: c.tipo_documento,
      tipoComunicacao: c.tipo_comunicacao,
      partes: t.partes,
      sigilo: t.sigilo,
      numeroCnj: c.numero_cnj,
      tribunal: c.tribunal,
      orgao: c.orgao,
      dataDisponibilizacao: c.data_disponibilizacao,
      publicacaoEstimada: t.publicacaoEstimada,
      sinais: t.sinais,
      // Trecho LITERAL do teor — nunca resumo gerado (Fase 2 é sem IA).
      trecho: t.sigilo ? null : t.textoLimpo.replace(/\s+/g, " ").slice(0, 240),
      link: c.link,
      compartilhadaCom,
    };
    secoes.get(principal)?.itens.push(item);

    for (const comp of t.compromissos) {
      // O mesmo compromisso pode aparecer em mais de um expediente (e mais de
      // uma vez no mesmo teor). Uma audiência = UMA proposta.
      const chaveProposta = `${comp.tipo}|${comp.dataIso}|${comp.hora}|${c.numero_cnj}`;
      if (propostasAgenda.some((p) => p.chave === chaveProposta)) continue;
      // Título de agenda no padrão das advogadas (11/08): cliente × empregado
      // · Conciliação/Instrução · vara. Subtipo só do teor; CEJUSC no órgão
      // vale como conciliação (é o que o centro faz).
      const partesTitulo = t.sigilo
        ? t.partes
        : partesClientePrimeiro(t.partes, ...(regrasConvidados ? [regrasConvidados] : []));
      // Subtipo resolvido UMA vez (teor > órgão CEJUSC > nada) e usado em
      // TUDO — cartão e título do evento nunca podem divergir.
      const subtipo =
        comp.tipo === "audiencia"
          ? (comp.subtipo ?? (/CEJUSC/i.test(c.orgao ?? "") ? "Conciliação" : null))
          : null;
      const rotulo = comp.tipo === "pericia" ? "Perícia" : (subtipo ?? "Audiência");
      propostasAgenda.push({
        chave: chaveProposta,
        tipo: comp.tipo,
        subtipo,
        partesTitulo,
        // Nome do empregado isolado — vira o assunto "PROCESSO [PARTE]" do
        // rascunho de aviso ao cliente na aprovação. Só quando o cliente foi
        // reconhecido; sem isso, o Apps Script cai no nº do processo.
        empregado: t.sigilo
          ? null
          : (separarCliente(t.partes, ...(regrasConvidados ? [regrasConvidados] : []))?.outros.join(" e ") ?? null),
        tituloEvento: [partesTitulo ?? c.numero_cnj, rotulo, c.orgao ?? c.tribunal]
          .filter(Boolean)
          .join(" · "),
        data: comp.data,
        dataIso: comp.dataIso,
        hora: comp.hora,
        partes: t.partes,
        sigilo: t.sigilo,
        numeroCnj: c.numero_cnj,
        orgao: c.orgao,
        tribunal: c.tribunal,
        linkSala: t.linkSala,
        advogado: porOab(principal),
        // Sigilo: nunca sugerir convidados — o convite exporia a existência do
        // processo a terceiros.
        convidadosSugeridos: t.sigilo
          ? []
          : convidadosSugeridos(t.partes, ...(regrasConvidados ? [regrasConvidados] : [])),
        fonte: { comunicacaoId: c.id, link: c.link, disponibilizadaEm: c.data_disponibilizacao },
        // O gerador local não consulta a agenda (sem credencial por desenho);
        // quem entrega o briefing confere e anota "já está na agenda".
        verificarAgenda: true,
      });
    }
  }

  // ---- Obrigações -----------------------------------------------------------
  const pendentes = db
    .prepare("SELECT * FROM obrigacoes WHERE status = 'pendente' ORDER BY vencimento")
    .all();

  const vencimentos = [];
  const condicionais = [];
  for (const o of pendentes) {
    if (o.vencimento === null) {
      condicionais.push({ ...o });
      continue;
    }
    const dias = diasEntre(hoje, o.vencimento);
    if (dias > 14) continue;
    const entrada = { ...o, diasRestantes: dias, vencida: dias < 0 };
    vencimentos.push(entrada);
    if (dias <= 2) {
      secoes.get(o.advogado_oab)?.itens.push({
        origem: "obrigacao",
        urgencia: "hoje",
        tipoDocumento: "Vencimento",
        partes: o.partes,
        sigilo: false,
        numeroCnj: o.numero_cnj,
        sinais: [
          dias < 0
            ? `VENCIDA há ${-dias} dia(s) — confirmar se foi paga`
            : dias === 0
              ? "vence HOJE"
              : `vence em ${dias} dia(s)`,
        ],
        trecho: `${o.descricao} — R$ ${(o.valor_centavos / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}. Inadimplemento: multa de 30% + vencimento antecipado.`,
        fonteObrigacao: o.fonte,
        vencimento: o.vencimento,
      });
    }
  }

  // ---- Ordenação dentro de cada seção: 🔴, 🟡, ⚪ ---------------------------
  const peso = { hoje: 0, semana: 1, informativo: 2 };
  for (const s of secoes.values()) s.itens.sort((a, b) => peso[a.urgencia] - peso[b.urgencia]);

  // ---- Marca como relatadas (opt-in) ---------------------------------------
  if (marcar && brutas.length > 0) {
    const ins = db.prepare(
      "INSERT OR IGNORE INTO briefing_itens (comunicacao_id, briefing_data) VALUES (?, ?)",
    );
    // Marca TODAS as cópias, não só a representante do grupo — senão as
    // cópias ressurgiriam amanhã como novidade.
    emTransacao(db, () => {
      for (const c of brutas) ins.run(c.id, hoje);
    });
  }

  return {
    data: hoje,
    // Hora LOCAL de São Paulo, formato brasileiro — o rodapé é lido por
    // advogada, não por máquina (ISO/UTC no e-mail confunde: 3h adiantado).
    geradoEm: new Date()
      .toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      })
      .replace(", ", " às "),
    secoes: [...secoes.values()],
    propostasAgenda,
    vencimentos,
    condicionais,
    cobertura: {
      fontes: coberturaPorOab(db),
      emailCoberto: false, // o gerador local não lê e-mail; dizer, nunca omitir
      naoVe: COBERTURA_NAO_VE,
    },
    totais: {
      comunicacoesNovas: comunicacoes.length,
      urgentes: [...secoes.values()].flatMap((s) => s.itens).filter((i) => i.urgencia === "hoje").length,
    },
  };
}
