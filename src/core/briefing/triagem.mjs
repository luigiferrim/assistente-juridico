/**
 * Triagem determinística de comunicações — Fase 2, SEM IA.
 *
 * O briefing local não resume nem interpreta: ele DETECTA sinais por regra
 * explícita e mostra o trecho literal. Cada classificação é explicável — o
 * cartão diz quais sinais o puseram onde está. Resumo interpretativo é papel
 * da Fase 3 (IA com citação verificada), não daqui.
 *
 * Regras de urgência (registradas em PRODUTO.md):
 *   🔴 hoje    — citação · prazo curto (≤5 dias) · audiência/perícia em ≤7 dias
 *   🟡 semana  — qualquer prazo mencionado · audiência futura · decisão com
 *                possível interesse recursal (sentença/acórdão/monocrática) ·
 *                teor não publicado (possível segredo — precisa de olho humano)
 *   ⚪ resto   — distribuição, ato ordinatório, arquivamento, ciência sem prazo
 */

import { ehFimDeSemana, somarDias } from "../prazos/calendario.mjs";

// ---------- Normalização de texto -------------------------------------------

const ENTIDADES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  aacute: "á", agrave: "à", atilde: "ã", acirc: "â", eacute: "é", ecirc: "ê",
  iacute: "í", oacute: "ó", otilde: "õ", ocirc: "ô", uacute: "ú", uuml: "ü",
  ccedil: "ç", Aacute: "Á", Agrave: "À", Atilde: "Ã", Acirc: "Â", Eacute: "É",
  Ecirc: "Ê", Iacute: "Í", Oacute: "Ó", Otilde: "Õ", Ocirc: "Ô", Uacute: "Ú",
  Ccedil: "Ç", ordm: "º", ordf: "ª", sect: "§", middot: "·", ndash: "–", mdash: "—",
};

/**
 * Remove HTML e decodifica entidades. Necessário porque o TJSC entrega o teor
 * em HTML (descoberto na 1ª coleta real, 10/08/2026), enquanto a Justiça do
 * Trabalho entrega texto puro.
 */
export function limparHtml(texto) {
  if (!texto) return "";
  return texto
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<\/(p|div|br|li|tr|h[1-6]|section|article|header)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&([a-zA-Z]+);/g, (m, nome) => ENTIDADES[nome] ?? m)
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

// ---------- Partes ------------------------------------------------------------

const PAPEIS = [
  "RECLAMANTE", "RECLAMADO", "RECLAMADA",
  "AUTOR", "AUTORA", "RÉU", "RÉ", "REU",
  "EXEQUENTE", "EXECUTADO", "EXECUTADA",
  "RECORRENTE", "RECORRIDO", "RECORRIDA",
  "AGRAVANTE", "AGRAVADO", "AGRAVADA",
  "APELANTE", "APELADO", "APELADA",
  "EMBARGANTE", "EMBARGADO", "REQUERENTE", "REQUERIDO", "REQUERIDA",
];
const POLO_ATIVO = new Set(["RECLAMANTE", "AUTOR", "AUTORA", "EXEQUENTE", "RECORRENTE", "AGRAVANTE", "APELANTE", "EMBARGANTE", "REQUERENTE"]);

// O nome vem em CAIXA ALTA; ele termina quando começa outro papel, uma seção
// conhecida do expediente, uma palavra minúscula (o teor corrido) ou a linha.
const FIM_DO_NOME =
  `\\s+(?:${PAPEIS.join("|")})\\b` +
  `|\\s+(?:ADVOGAD|INTIMA[ÇC]|CITA[ÇC]|TESTEMUNHA|PERITO|DESPACHO|SENTEN|DECIS|EDITAL|ATA\\b|PROCESSO\\b)` +
  `|\\s+[a-zà-ú]` +
  // Palavra Capitalizada = começo de frase do teor ("...LTDA Designo perícia").
  // Nome de parte vem TODO em caixa alta; sem esta alternativa o réu era
  // perdido quando a frase seguinte não começava com palavra-chave (defeito
  // visto num item real do briefing de 11/08: o autor saiu sem a empresa ré).
  `|\\s+[A-ZÀ-Ü][a-zà-ú]` +
  `|\\s*\\(` + // "E OUTROS (3)" — o parêntese encerra o nome
  `|\\s*\\n|$`;
const RE_PAPEL = new RegExp(
  `\\b(${PAPEIS.join("|")})\\s*(?:\\(S\\))?\\s*:\\s*([A-ZÀ-Ü][A-ZÀ-Ü0-9 .&'-]{3,70}?)(?=${FIM_DO_NOME})`,
  "g",
);

/** Nome composto só de iniciais ("A.B.C.D.E.") = partes ocultas por sigilo. */
export function pareceIniciais(nome) {
  return /^(?:[A-Z]\.\s*){2,}$/.test((nome ?? "").trim());
}

/**
 * Extrai "Fulano × Empresa" do teor. Fallback: destinatários do JSON bruto.
 * Devolve também `sigilo` quando as partes vêm abreviadas em iniciais.
 */
export function extrairPartes(textoLimpo, bruto = null) {
  const ativos = [];
  const passivos = [];
  for (const m of textoLimpo.matchAll(RE_PAPEL)) {
    // "ALFA ... LTDA E OUTROS" → o sufixo vira minúsculo, sinalizando
    // litisconsórcio sem poluir o nome.
    const nome = m[2].trim().replace(/\s+/g, " ").replace(/\s+E\s+OUTR[OA]S?$/i, " e outros");
    (POLO_ATIVO.has(m[1]) ? ativos : passivos).push(nome);
  }

  let nomes = [];
  if (ativos.length || passivos.length) {
    // Espólio pode figurar nos DOIS polos (recursos cruzados): se o primeiro
    // nome de cada lado coincidir, procura-se o próximo distinto — "X × X"
    // não informa nada.
    const ativo = ativos[0];
    const passivo = passivos.find((n) => n !== ativo) ?? passivos[0];
    nomes = [ativo, passivo].filter(Boolean);
    if (nomes.length === 2 && nomes[0] === nomes[1]) nomes = [nomes[0]];
  } else if (bruto) {
    // Fallback: destinatários do JSON. Parear por POLO (A×P) — pegar só os dois
    // primeiros nomes juntaria dois do mesmo lado (visto no caso sob sigilo:
    // dois polo A + um polo P → "ativo × ativo", errado).
    const destinatarios = Array.isArray(bruto.destinatarios) ? bruto.destinatarios : [];
    const ativo = destinatarios.find((d) => d?.polo === "A")?.nome;
    const passivo = destinatarios.find((d) => d?.polo === "P")?.nome;
    nomes = ativo || passivo
      ? [ativo, passivo].filter(Boolean)
      : destinatarios.map((d) => d?.nome).filter(Boolean).slice(0, 2);
  }

  if (nomes.length === 0) return { partes: null, sigilo: false };
  const sigilo = nomes.some(pareceIniciais);
  return { partes: nomes.join(" × "), sigilo };
}

// ---------- Sinais ------------------------------------------------------------

const NUMEROS_POR_EXTENSO = {
  um: 1, dois: 2, "três": 3, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7,
  oito: 8, nove: 9, dez: 10, quinze: 15, vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50,
};

// De QUEM é o prazo — decidido pelo verbo da ação no contexto (D13: prazo de
// perito e de terceiro NÃO é compromisso do escritório).
//   'nosso'    → ação do escritório/cliente: manifestar, impugnar, defesa,
//                quesitos, recolher/pagar, comprovar, juntar, recorrer.
//   'terceiro' → obrigação do perito/outro: indicar data/local, apresentar o
//                laudo, realizar a perícia.
//   'rotina'   → boilerplate sem prazo de mérito: LIBRAS/intérprete, cadastro
//                de e-mail/telefone.
const ACAO_NOSSA = /manifest|impugn|defesa|contesta|quesito|recolh|paga(r|mento)|comprov|junt|contrarraz|embarg|recurs|apresentar\s+(defesa|documento|quesito|manifesta|contrarraz)/i;
const ACAO_TERCEIRO = /indicar[^.]{0,45}(data|local)|apresenta(r|do)[^.]{0,20}laudo|laudo[^.]{0,20}(apresentad|entreg|dever[áa])|realiza(r|ç[ãa]o)[^.]{0,20}per[ií]cia|entrega do laudo/i;
const ROTINA = /int[ée]rprete|libras|pessoa surda|e-?mail e telefone|telefone[^.]{0,15}whatsapp|cadastr[oa]/i;
// Prazo de manifestar interesse em conciliação no CEJUSC: silêncio = desinteresse,
// SEM prejuízo (autos voltam à vara). Real, mas não é 🔴 — some no ruído senão.
const CONCILIACAO_SEM_SANCAO = /interesse[^.]{0,40}(concilia|inclus[ãa]o[^.]{0,20}pauta)|desinteresse[^.]{0,30}concilia/i;

/** Menções a prazo no teor, com a CLASSE (de quem é). */
export function detectarPrazos(textoLimpo) {
  const prazos = [];
  const re = /prazo[^.;\n]{0,50}?\b(\d{1,3}|[a-zç]+)\s*(?:\([a-zç]+\)\s*)?dias?(\s+úteis|\s+corridos)?/gi;
  let m;
  while ((m = re.exec(textoLimpo)) !== null) {
    const bruto = m[1].toLowerCase();
    const dias = /^\d+$/.test(bruto) ? Number(bruto) : NUMEROS_POR_EXTENSO[bruto];
    if (!dias) continue;
    // Contexto: ~75 caracteres antes + o próprio trecho (o verbo costuma vir
    // ANTES de "prazo": "para indicar ... no prazo de 5 dias").
    // Janela ampla (75 antes, 120 depois): o complemento que identifica o
    // obrigado costuma vir depois de "dias" ("...no prazo de 5 dias,
    // manifestar interesse ... conciliatória"). Seguro porque os padrões de
    // classe usam `[^.]` e não cruzam o ponto final da frase.
    const ctx = textoLimpo.slice(Math.max(0, m.index - 75), m.index + m[0].length + 120);
    let classe = "nosso";
    if (ROTINA.test(ctx)) classe = "rotina";
    else if (CONCILIACAO_SEM_SANCAO.test(ctx)) classe = "conciliacao";
    else if (ACAO_TERCEIRO.test(ctx) && !ACAO_NOSSA.test(ctx)) classe = "terceiro";
    prazos.push({ dias, unidade: m[2]?.trim() ?? null, trecho: m[0].replace(/\s+/g, " "), classe });
  }
  return prazos;
}

/** Audiências e perícias com data (e hora, quando houver) no teor. */
export function detectarCompromissos(textoLimpo) {
  const compromissos = [];
  const re = /\b(audi[eê]ncia|per[ií]cia)\b[\s\S]{0,160}?(\d{2}\/\d{2}\/\d{4})(?:[\s\S]{0,25}?(\d{1,2}[:h]\d{2}))?/gi;
  for (const m of textoLimpo.matchAll(re)) {
    const [, tipoBruto, data, hora] = m;
    const [d, mes, ano] = data.split("/");
    // Subtipo pedido pelas advogadas (11/08): saber na agenda se é instrução
    // ou conciliação. Só o que o teor DIZ, na mesma frase do compromisso —
    // sem inferir; ausente = null (o título fica só "Audiência").
    const sub = m[0].match(/\b(conciliat[óo]ria|concilia[çc][ãa]o|instru[çc][ãa]o|una|inicial|julgamento)\b/i)?.[1] ?? null;
    const SUBTIPOS = { conciliacao: "Conciliação", conciliatoria: "Conciliação", instrucao: "Instrução", una: "Una", inicial: "Inicial", julgamento: "Julgamento" };
    const chave = sub && sub.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    compromissos.push({
      tipo: /per/i.test(tipoBruto) ? "pericia" : "audiencia",
      subtipo: (chave && SUBTIPOS[chave]) || null,
      dataIso: `${ano}-${mes}-${d}`,
      data,
      hora: hora ? hora.replace("h", ":") : null,
      trecho: m[0].replace(/\s+/g, " ").slice(0, 160),
    });
  }
  const linkSala = textoLimpo.match(/https:\/\/[\w./-]*zoom\.us\/[^\s"<)]+/i)?.[0] ?? null;
  return { compromissos, linkSala };
}

/** Teor não publicado ("Tomar ciência do(a) ... ID xyz") = olhar no sistema. */
export function teorNaoPublicado(textoLimpo) {
  return textoLimpo.length < 220 && /tomar ci[eê]ncia/i.test(textoLimpo);
}

// ---------- Publicação estimada (regra D16, confirmada com dado real) --------

/**
 * publicação = disponibilização + 1 dia útil. `ehBloqueado(iso)` injeta o
 * calendário do tribunal (feriados/suspensões carregados no banco) — sem ele,
 * só fim de semana conta. Enquanto as entradas não forem confirmadas pela
 * advogada, isto é estimativa: todo uso leva "(CONFIRMAR)" no briefing.
 * Exemplo real do porquê: 10/08/2026 era segunda-feira E feriado regimental
 * do TRT12 (Portaria SEAP 191/2024) — sem calendário, a estimativa erraria.
 */
export function publicacaoEstimada(dataDisponibilizacao, ehBloqueado = () => false) {
  let d = somarDias(dataDisponibilizacao, 1);
  let guarda = 0;
  while (ehFimDeSemana(d) || ehBloqueado(d)) {
    if (++guarda > 15) break;
    d = somarDias(d, 1);
  }
  return d;
}

// ---------- Classificação -----------------------------------------------------

const TIPOS_DECISORIOS = /senten[çc]a|ac[oó]rd[aã]o|monocr[aá]tica|decis[aã]o/i;
const TIPOS_RUIDO = /distribui[çc][aã]o|ato ordinat[oó]rio|conclus[aã]o/i;

function diasEntre(deIso, ateIso) {
  return Math.round((new Date(`${ateIso}T12:00Z`) - new Date(`${deIso}T12:00Z`)) / 86_400_000);
}

/**
 * Classifica UMA comunicação. Devolve urgência + a lista de sinais que a
 * justificam — o cartão do briefing mostra os sinais, não um veredito seco.
 */
export function triar(comunicacao, { hoje, ehBloqueado = () => false }) {
  const textoLimpo = limparHtml(comunicacao.texto);
  const bruto = comunicacao.bruto ? JSON.parse(comunicacao.bruto) : null;
  const { partes, sigilo } = extrairPartes(textoLimpo, bruto);
  const prazos = detectarPrazos(textoLimpo);
  const { compromissos, linkSala } = detectarCompromissos(textoLimpo);
  const semTeor = teorNaoPublicado(textoLimpo);

  const sinais = [];
  let urgencia = "informativo";
  const eleva = (nivel, sinal) => {
    sinais.push(sinal);
    if (nivel === "hoje") urgencia = "hoje";
    else if (nivel === "semana" && urgencia !== "hoje") urgencia = "semana";
  };

  if (/cita[çc][aã]o/i.test(comunicacao.tipo_comunicacao ?? "")) {
    eleva("hoje", "CITAÇÃO — risco de revelia; conferir imediatamente");
  }
  for (const p of prazos) {
    const qtd = `${p.dias} dias${p.unidade ? ` ${p.unidade}` : ""}`;
    if (p.classe === "rotina") continue; // boilerplate (LIBRAS, cadastro): não é prazo
    if (p.classe === "terceiro") {
      // Prazo de perito/terceiro: acompanhar, mas NÃO é AGIR HOJE (D13).
      eleva("semana", `prazo de terceiro (perito/laudo): ${qtd} — acompanhar, não é seu prazo`);
    } else if (p.classe === "conciliacao") {
      eleva("semana", `${qtd} para manifestar interesse em conciliação (silêncio = desinteresse, sem prejuízo)`);
    } else {
      eleva(p.dias <= 5 ? "hoje" : "semana", `menciona prazo de ${qtd}`);
    }
  }
  const futuros = compromissos.filter((c) => diasEntre(hoje, c.dataIso) >= 0);
  for (const c of futuros) {
    const dias = diasEntre(hoje, c.dataIso);
    const rotulo = `${c.tipo === "pericia" ? "perícia" : "audiência"} detectada: ${c.data}${c.hora ? ` ${c.hora}` : ""}`;
    eleva(dias <= 7 ? "hoje" : "semana", rotulo);
  }
  if (semTeor || sigilo) {
    eleva("semana", "teor não publicado / partes em iniciais — possível segredo, conferir no sistema");
  }
  if (sinais.length === 0 && TIPOS_DECISORIOS.test(comunicacao.tipo_documento ?? "")) {
    eleva("semana", `${comunicacao.tipo_documento} — verificar resultado e interesse recursal`);
  }
  if (sinais.length === 0 && TIPOS_RUIDO.test(comunicacao.tipo_documento ?? "")) {
    sinais.push("sem prazo detectado — informativo");
  }

  return {
    urgencia,
    sinais: [...new Set(sinais)],
    partes,
    sigilo: sigilo || semTeor,
    prazos,
    compromissos: futuros,
    linkSala,
    textoLimpo,
    publicacaoEstimada: comunicacao.data_disponibilizacao
      ? publicacaoEstimada(comunicacao.data_disponibilizacao, ehBloqueado)
      : null,
  };
}
