/**
 * Testes do briefing local (triagem + montagem + HTML) — Fase 2.
 *
 * As regras aqui não são invenção de teste: cada uma foi decidida no piloto
 * de 09-10/08/2026 com feedback real das advogadas (PRODUTO.md). O teste
 * existe para a regra não regredir em silêncio.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { abrirBanco, agora } from "../src/core/db.mjs";
import {
  detectarCompromissos,
  detectarPrazos,
  extrairPartes,
  limparHtml,
  publicacaoEstimada,
  triar,
} from "../src/core/briefing/triagem.mjs";
import { montarBriefing } from "../src/core/briefing/index.mjs";
import { renderizarHtml } from "../src/core/briefing/html.mjs";

const HOJE = "2026-08-10";

// Advogados fictícios: a identidade real do escritório (nomes e OAB) vive em
// dados/config.json, fora do git — nenhum teste depende de pessoa real.
const ADVOGADOS_FICTICIOS = [
  { oab: "10001/SC", numero: "10001", uf: "SC", nome: "Dra. Advogada 1", emoji: "🟡", cor: "#e0b400", corAgenda: "5", jurisdicao: "TRTs e TST" },
  { oab: "10002/SC", numero: "10002", uf: "SC", nome: "Dra. Advogada 2", emoji: "🟣", cor: "#7b1fa2", corAgenda: "3", jurisdicao: "TRTs" },
  { oab: "10003/SC", numero: "10003", uf: "SC", nome: "Dr. Advogado 3", emoji: "🟢", cor: "#2e7d32", corAgenda: "10", jurisdicao: "eproc" },
];

// ---------- Triagem -----------------------------------------------------------

test("HTML do TJSC vira texto legível (tags e entidades)", () => {
  const bruto = `<html><head><style>body{x}</style></head><body><b>Procedimento Comum C&iacute;vel N&ordm; 500</b><br>AUTOR: FULANO</body></html>`;
  const limpo = limparHtml(bruto);
  assert.match(limpo, /Procedimento Comum Cível Nº 500/);
  assert.doesNotMatch(limpo, /[<>]/);
  assert.doesNotMatch(limpo, /body\{x\}/);
});

test("partes extraídas do teor trabalhista", () => {
  const t = "ATOrd 0000001 RECLAMANTE: JOAO DA SILVA SANTOS RECLAMADO: INDUSTRIA ALFA FICTICIA LTDA INTIMAÇÃO";
  const { partes, sigilo } = extrairPartes(t);
  assert.equal(partes, "JOAO DA SILVA SANTOS × INDUSTRIA ALFA FICTICIA LTDA");
  assert.equal(sigilo, false);
});

test("partes em iniciais = sigilo detectado, sem expor nada além delas", () => {
  const { partes, sigilo } = extrairPartes("Tomar ciência do(a) Intimação de ID abc123.", {
    destinatarios: [{ nome: "A. B. C. D. E." }, { nome: "F. G. H. I. J. K. L. M." }],
  });
  assert.equal(sigilo, true);
  assert.match(partes, /A\. B\. C\. D\. E\./);
});

test("prazos por extenso e numéricos são detectados", () => {
  const prazos = detectarPrazos(
    "manifestar no prazo de 15 dias úteis. Fica concedido o prazo de cinco dias para juntar documentos.",
  );
  assert.deepEqual(prazos.map((p) => p.dias), [15, 5]);
  assert.deepEqual(prazos.map((p) => p.classe), ["nosso", "nosso"]);
});

test("CRÍTICO: prazo do PERITO é classificado 'terceiro' e não vira AGIR HOJE (D13)", () => {
  // Texto de um caso real do TRT9 (nomes trocados), coleta de 10/08.
  const texto =
    "Intime-se o Perito Perito Judicial E, para indicar, no prazo de 5 (cinco) dias, a data e o local. O laudo deverá ser apresentado no prazo de 30 (trinta) dias, após a realização.";
  const prazos = detectarPrazos(texto);
  assert.deepEqual(prazos.map((p) => p.classe), ["terceiro", "terceiro"]);
  const r = triar(
    { texto, tipo_comunicacao: "Intimação", tipo_documento: "Notificação", data_disponibilizacao: "2026-08-07", bruto: null },
    { hoje: HOJE },
  );
  assert.equal(r.urgencia, "semana", "prazo de perito NÃO é AGIR HOJE do escritório");
  assert.match(r.sinais.join(" "), /não é seu prazo/);
});

test("CRÍTICO: 'manifestar sobre o laudo' É nosso, mesmo mencionando laudo/perito", () => {
  // Texto no padrão do TRT12 (nomes fictícios): a menção a 'peritos' e 'laudos' não pode
  // fazer o nosso prazo de manifestação virar 'terceiro'.
  const texto = "Intimem-se as partes para manifestarem-se sobre os laudos periciais apresentados pelos peritos, no prazo de 15 dias.";
  const prazos = detectarPrazos(texto);
  assert.equal(prazos[0].classe, "nosso");
});

test("boilerplate de LIBRAS/cadastro é 'rotina' e some da triagem", () => {
  const texto = "designada audiência. Solicita-se intérprete de LIBRAS, no prazo mínimo de cinco dias, se for participar pessoa surda.";
  const prazos = detectarPrazos(texto);
  assert.equal(prazos[0].classe, "rotina");
  const r = triar(
    { texto, tipo_comunicacao: "Intimação", tipo_documento: "Notificação", data_disponibilizacao: "2026-08-07", bruto: null },
    { hoje: HOJE },
  );
  assert.ok(!r.sinais.some((s) => /prazo de 5 dias/.test(s)), "LIBRAS não vira sinal de prazo");
});

test("prazo de interesse em conciliação (CEJUSC) é 🟡, não 🔴 — não tem sanção", () => {
  // Padrão comum de CEJUSC (números e órgão trocados por fictícios; 0900003-74), repetido em vários processos.
  const texto = "fica(m) V. Sa.(s) intimado(a)(s) para ciência e para, no prazo de 5 (cinco) dias, manifestar(em) eventual interesse na inclusão do processo em pauta de audiência conciliatória. A ausência de manifestação será interpretada como desinteresse.";
  const prazos = detectarPrazos(texto);
  assert.equal(prazos[0].classe, "conciliacao");
  const r = triar(
    { texto, tipo_comunicacao: "Intimação", tipo_documento: "Notificação", data_disponibilizacao: "2026-08-07", bruto: null },
    { hoje: HOJE },
  );
  assert.equal(r.urgencia, "semana", "prazo sem sanção não é AGIR HOJE");
  assert.match(r.sinais.join(" "), /sem prejuízo/);
});

test("partes sob sigilo pareiam por polo A×P, não os dois primeiros nomes", () => {
  // Caso com números trocados (0900004-56): dois destinatários polo A + um polo P.
  const { partes, sigilo } = extrairPartes("Tomar ciência do(a) Intimação.", {
    destinatarios: [
      { nome: "A.B.C.D.E.", polo: "A" },
      { nome: "N.O.P.", polo: "A" },
      { nome: "F.G.H.I.J.K.L.M.", polo: "P" },
    ],
  });
  assert.equal(partes, "A.B.C.D.E. × F.G.H.I.J.K.L.M.", "ativo × passivo, não ativo × ativo");
  assert.equal(sigilo, true);
});

test("audiência com data, hora e link de sala é detectada", () => {
  const texto =
    "designa-se audiência telepresencial para data de 20/10/2026 14:45, PELA PLATAFORMA ZOOM. https://trt12-jus-br.zoom.us/j/00000000000";
  const { compromissos, linkSala } = detectarCompromissos(texto);
  assert.equal(compromissos.length, 1);
  assert.equal(compromissos[0].dataIso, "2026-10-20");
  assert.equal(compromissos[0].hora, "14:45");
  assert.equal(linkSala, "https://trt12-jus-br.zoom.us/j/00000000000");
});

test("subtipo da audiência sai do teor — instrução/una/conciliação; ausente = null (pedido 11/08)", () => {
  const casos = [
    ["designada audiência de instrução para o dia 20/10/2026 14:45", "Instrução"],
    ["audiência UNA em 20/10/2026 09:00", "Una"],
    ["audiência conciliatória designada para 20/10/2026 13:30", "Conciliação"],
    ["designa-se audiência telepresencial para data de 20/10/2026 14:45", null],
  ];
  for (const [texto, esperado] of casos) {
    assert.equal(detectarCompromissos(texto).compromissos[0].subtipo, esperado, texto);
  }
});

test("publicação estimada = disponibilização + 1 dia útil (D16)", () => {
  assert.equal(publicacaoEstimada("2026-08-07"), "2026-08-10", "sexta → segunda");
  assert.equal(publicacaoEstimada("2026-08-10"), "2026-08-11", "segunda → terça");
});

test("publicação estimada pula feriado do tribunal quando o calendário existe", () => {
  // Caso real: 10/08/2026 (segunda) era feriado regimental do TRT12
  // (Portaria SEAP 191/2024) — a publicação de sexta 07/08 cai em 11/08.
  const feriadoTrt12 = (iso) => iso === "2026-08-10";
  assert.equal(publicacaoEstimada("2026-08-07", feriadoTrt12), "2026-08-11");
  assert.equal(publicacaoEstimada("2026-08-07"), "2026-08-10", "sem calendário, só fim de semana");
});

test("triagem: citação é 🔴 mesmo sem prazo no teor", () => {
  const t = triar(
    { texto: "Fica citada a parte ré.", tipo_comunicacao: "Citação", tipo_documento: "Citação", data_disponibilizacao: "2026-08-07", bruto: null },
    { hoje: HOJE },
  );
  assert.equal(t.urgencia, "hoje");
  assert.match(t.sinais[0], /CITAÇÃO/);
});

test("triagem: prazo de 15 dias é 🟡; de 5 dias é 🔴", () => {
  const base = { tipo_comunicacao: "Intimação", tipo_documento: "Notificação", data_disponibilizacao: "2026-08-07", bruto: null };
  assert.equal(triar({ ...base, texto: "no prazo de 15 dias" }, { hoje: HOJE }).urgencia, "semana");
  assert.equal(triar({ ...base, texto: "no prazo de 5 dias" }, { hoje: HOJE }).urgencia, "hoje");
});

test("triagem: distribuição sem prazo é ⚪ com sinal explícito", () => {
  const t = triar(
    { texto: "Processo distribuído para 4ª Turma", tipo_comunicacao: "Intimação", tipo_documento: "Distribuição", data_disponibilizacao: "2026-08-06", bruto: null },
    { hoje: HOJE },
  );
  assert.equal(t.urgencia, "informativo");
  assert.ok(t.sinais.length > 0, "mesmo o informativo diz POR QUE é informativo");
});

test("triagem: audiência que já passou não vira compromisso", () => {
  const t = triar(
    { texto: "audiência realizada em 04/08/2025 15:15", tipo_comunicacao: "Intimação", tipo_documento: "Notificação", data_disponibilizacao: "2026-08-07", bruto: null },
    { hoje: HOJE },
  );
  assert.equal(t.compromissos.length, 0);
});

// ---------- Montagem ----------------------------------------------------------

function bancoComCenario() {
  const db = abrirBanco(":memory:");
  const exec = db
    .prepare(
      `INSERT INTO fontes_execucao (fonte, iniciado_em, encerrado_em, status, completo, itens_obtidos, parametros)
       VALUES ('djen', ?, ?, 'ok', 1, 2, ?)`,
    )
    .run(agora(), agora(), JSON.stringify({ numeroOab: "10001", ufOab: "SC" })).lastInsertRowid;

  const inserirCom = db.prepare(
    `INSERT INTO comunicacoes (djen_id, hash_djen, numero_cnj, tribunal, orgao, tipo_comunicacao, tipo_documento,
       data_disponibilizacao, texto, texto_sha256, link, bruto, execucao_id, criado_em)
     VALUES (?, '', ?, 'TRT12', '3ª VT de Exemplo', 'Intimação', ?, '2026-08-07', ?, '', 'https://pje/validacao/1', 'null', ?, ?)`,
  );
  const vincular = db.prepare("INSERT INTO comunicacoes_oab (comunicacao_id, oab) VALUES (?, ?)");

  const c1 = inserirCom.run(
    1, "0000001-11.2026.5.12.0001", "Notificação",
    "RECLAMANTE: JOAO DA SILVA SANTOS RECLAMADO: INDUSTRIA ALFA LTDA INTIMAÇÃO Destinatário: JOAO DA SILVA SANTOS fica intimado a manifestarem-se sobre os laudos no prazo de 15 dias. designa-se audiência telepresencial para data de 20/10/2026 14:45 https://trt12-jus-br.zoom.us/j/00000000000",
    exec, agora(),
  ).lastInsertRowid;
  vincular.run(c1, "10001/SC");
  vincular.run(c1, "10002/SC"); // compartilhada com a sócia

  const inserirObr = db.prepare(
    `INSERT INTO obrigacoes (chave_natural, numero_cnj, partes, tipo, descricao, valor_centavos, vencimento, gatilho, advogado_oab, status, fonte, criado_em)
     VALUES (?, ?, ?, 'parcela', ?, ?, ?, NULL, '10001/SC', 'pendente', 'ata teste', ?)`,
  );
  inserirObr.run("obr:t1", "0000003-33.2026.5.12.0003", "Fulano de Teste × Alfa", "1ª parcela", 1743000, "2026-08-17", agora());
  inserirObr.run("obr:t2", "0000004-44.2026.5.12.0004", "Fulana de Teste × Alfa", "3ª parcela", 240000, "2026-08-10", agora());
  db.prepare(
    `INSERT INTO obrigacoes (chave_natural, numero_cnj, partes, tipo, descricao, valor_centavos, vencimento, gatilho, advogado_oab, status, fonte, criado_em)
     VALUES ('obr:t3', '0000003-33.2026.5.12.0003', 'Fulano de Teste × Alfa', 'custas', 'Custas de R$ 800', 80000, NULL, 'após última parcela +30d', '10001/SC', 'pendente', 'ata teste', ?)`,
  ).run(agora());

  return db;
}

test("comunicação compartilhada aparece UMA vez, na seção prioritária, com badge", () => {
  const db = bancoComCenario();
  const m = montarBriefing(db, { advogados: ADVOGADOS_FICTICIOS, hoje: HOJE, regrasConvidados: [] });
  const advogada1 = m.secoes.find((s) => s.advogado.oab === "10001/SC");
  const advogada2 = m.secoes.find((s) => s.advogado.oab === "10002/SC");
  const cartoes = advogada1.itens.filter((i) => i.origem === "comunicacao");
  assert.equal(cartoes.length, 1);
  assert.match(cartoes[0].compartilhadaCom[0], /Advogada 2/);
  assert.equal(advogada2.itens.filter((i) => i.origem === "comunicacao").length, 0);
});

// Regras de convidados fictícias: os e-mails reais dos clientes vivem em
// dados/config.json, fora do git — teste não depende de dado de cliente.
const CONVIDADOS_FICTICIOS = [{ cliente: /alfa/i, emails: ["contato@exemplo-cliente.com"] }];

test("audiência detectada vira proposta com convidados do cliente e trava de conferência", () => {
  const db = bancoComCenario();
  const m = montarBriefing(db, { advogados: ADVOGADOS_FICTICIOS, hoje: HOJE, regrasConvidados: CONVIDADOS_FICTICIOS });
  assert.equal(m.propostasAgenda.length, 1);
  const p = m.propostasAgenda[0];
  assert.equal(p.dataIso, "2026-10-20");
  assert.equal(p.hora, "14:45");
  assert.ok(p.convidadosSugeridos.includes("contato@exemplo-cliente.com"), "cliente reconhecido → convidados sugeridos");
  assert.equal(p.verificarAgenda, true, "gerador local não consulta agenda — quem entrega confere");
  assert.match(p.partes, /JOAO DA SILVA/);
});

test("título de agenda no padrão das advogadas: cliente primeiro (com apelido), tipo e vara (11/08)", () => {
  const db = bancoComCenario();
  const regras = [{ cliente: /alfa/i, emails: ["contato@exemplo-cliente.com"], apelido: "Alfa" }];
  const m = montarBriefing(db, { advogados: ADVOGADOS_FICTICIOS, hoje: HOJE, regrasConvidados: regras });
  const p = m.propostasAgenda[0];
  assert.match(p.partesTitulo, /^Alfa × JOAO DA SILVA/, "empresa cliente vem primeiro, com apelido");
  assert.match(p.empregado, /JOAO DA SILVA/, "empregado isolado para o assunto PROCESSO [PARTE]");
  assert.match(p.tituloEvento, /· Audiência · 3ª VT de Exemplo$/, "tipo e vara no título");
  // Sem cliente reconhecido, a ordem original fica — nunca chutar quem é quem.
  const m2 = montarBriefing(db, { advogados: ADVOGADOS_FICTICIOS, hoje: HOJE, regrasConvidados: [] });
  assert.match(m2.propostasAgenda[0].tituloEvento, /^JOAO DA SILVA/);
  assert.equal(m2.propostasAgenda[0].empregado, null);
});

test("vencimento HOJE vira 🔴 na seção do advogado; ≤14 dias entram na lista", () => {
  const db = bancoComCenario();
  const m = montarBriefing(db, { advogados: ADVOGADOS_FICTICIOS, hoje: HOJE, regrasConvidados: [] });
  const advogada1 = m.secoes.find((s) => s.advogado.oab === "10001/SC");
  const cartaoVenc = advogada1.itens.find((i) => i.origem === "obrigacao");
  assert.ok(cartaoVenc, "parcela vencendo hoje vira cartão");
  assert.match(cartaoVenc.sinais[0], /HOJE/);
  assert.equal(m.vencimentos.length, 2, "hoje (10/08) e 17/08 — ambos ≤14 dias");
  assert.equal(m.condicionais.length, 1, "custas sem data aparecem como aguardando gatilho");
});

test("CRÍTICO: 'já relatado' só consome com marcar=true, e depois some", () => {
  const db = bancoComCenario();
  const previa = montarBriefing(db, { advogados: ADVOGADOS_FICTICIOS, hoje: HOJE, regrasConvidados: [] });
  assert.equal(previa.totais.comunicacoesNovas, 1, "prévia não consome");

  const oficial = montarBriefing(db, { advogados: ADVOGADOS_FICTICIOS, hoje: HOJE, marcar: true, regrasConvidados: [] });
  assert.equal(oficial.totais.comunicacoesNovas, 1);

  const amanha = montarBriefing(db, { advogados: ADVOGADOS_FICTICIOS, hoje: "2026-08-11", regrasConvidados: [] });
  assert.equal(amanha.totais.comunicacoesNovas, 0, "relatado ontem não é novidade hoje");
  assert.equal(amanha.vencimentos.length, 2, "vencimentos continuam ressurgindo — não são 'novidade', são lembrete");
});

test("CRÍTICO: cópias por destinatário viram UM cartão e UMA proposta — e todas são marcadas", () => {
  const db = bancoComCenario();
  // Cópia do mesmo expediente para outro destinatário: djen_id novo, mesmo
  // teor com a linha "Destinatário:" diferente — cenário real da 1ª coleta.
  const exec = db.prepare("SELECT id FROM fontes_execucao LIMIT 1").get().id;
  const texto =
    "RECLAMANTE: JOAO DA SILVA SANTOS RECLAMADO: INDUSTRIA ALFA LTDA INTIMAÇÃO Destinatário: INDUSTRIA ALFA LTDA fica intimado a manifestarem-se sobre os laudos no prazo de 15 dias. designa-se audiência telepresencial para data de 20/10/2026 14:45 https://trt12-jus-br.zoom.us/j/00000000000";
  const id = db
    .prepare(
      `INSERT INTO comunicacoes (djen_id, hash_djen, numero_cnj, tribunal, orgao, tipo_comunicacao, tipo_documento,
        data_disponibilizacao, texto, texto_sha256, link, bruto, execucao_id, criado_em)
       VALUES (2, '', '0000001-11.2026.5.12.0001', 'TRT12', '3ª VT de Exemplo', 'Intimação', 'Notificação',
        '2026-08-07', ?, 'sha-diferente', 'https://pje/validacao/2', 'null', ?, ?)`,
    )
    .run(texto, exec, agora()).lastInsertRowid;
  db.prepare("INSERT INTO comunicacoes_oab (comunicacao_id, oab) VALUES (?, '10001/SC')").run(id);

  const m = montarBriefing(db, { advogados: ADVOGADOS_FICTICIOS, hoje: HOJE, marcar: true, regrasConvidados: [] });
  const cartoes = m.secoes.flatMap((s) => s.itens).filter((i) => i.origem === "comunicacao");
  assert.equal(cartoes.length, 1, "cópias agrupadas num cartão só");
  assert.equal(m.propostasAgenda.length, 1, "uma audiência = uma proposta");

  const amanha = montarBriefing(db, { advogados: ADVOGADOS_FICTICIOS, hoje: "2026-08-11", regrasConvidados: [] });
  assert.equal(amanha.totais.comunicacoesNovas, 0, "a cópia também foi marcada — não ressurge");
});

test("litisconsórcio real: 'E OUTROS (3)' não quebra a extração", () => {
  // Forma exata do teor real do CEJUSC 2º grau (coleta de 10/08).
  const { partes } = extrairPartes(
    "RECORRENTE: INDUSTRIA ALFA FICTICIA LTDA E OUTROS (3)  RECORRIDO: MARIA OLIVEIRA NUNES E OUTROS (4)  INTIMAÇÃO DE AUDIÊNCIA",
  );
  assert.equal(partes, "INDUSTRIA ALFA FICTICIA LTDA e outros × MARIA OLIVEIRA NUNES e outros");
});

test("partes de espólio nos dois polos não viram 'X × X'", () => {
  const { partes } = extrairPartes(
    "RECORRENTE: ESPOLIO DE PEDRO ALVES RECORRENTE: INDUSTRIA ALFA LTDA RECORRIDO: ESPOLIO DE PEDRO ALVES RECORRIDO: MARIA OLIVEIRA NUNES intimação",
  );
  assert.match(partes, /×/);
  const [lado1, lado2] = partes.split(" × ");
  assert.notEqual(lado1, lado2);
});

test("montagem exige data explícita — nunca 'agora' implícito", () => {
  const db = bancoComCenario();
  assert.throws(() => montarBriefing(db, {}), /AAAA-MM-DD/);
});


test("agenda do advogado vem PRIMEIRO na seção dele (ordem do Luigi, 11/08)", () => {
  const db = bancoComCenario();
  const html = renderizarHtml(
    montarBriefing(db, { advogados: ADVOGADOS_FICTICIOS, regrasConvidados: CONVIDADOS_FICTICIOS, hoje: HOJE }),
  );
  const secao1 = html.indexOf("Dra. Advogada 1");
  const proposta = html.indexOf("PROPOSTA PARA A AGENDA");
  const agirHoje = html.indexOf("AGIR HOJE");
  assert.ok(secao1 < proposta, "proposta fica dentro da seção, não antes dela");
  assert.ok(proposta < agirHoje, "agenda vem antes dos cartões de urgência");
});

// ---------- HTML --------------------------------------------------------------

test("HTML: dark-safe (sem texto claro), âncoras, partes visíveis, teor escapado", () => {
  const db = bancoComCenario();
  const html = renderizarHtml(
    montarBriefing(db, { advogados: ADVOGADOS_FICTICIOS, regrasConvidados: CONVIDADOS_FICTICIOS, hoje: HOJE }),
  );

  assert.doesNotMatch(html, /color:\s*#fff/i, "nenhum texto branco — modo escuro do Gmail");
  assert.match(html, /<a href="https:\/\/pje\/validacao\/1"/, "fonte como âncora");
  assert.match(html, /JOAO DA SILVA SANTOS × INDUSTRIA ALFA/, "partes por extenso no cartão");
  assert.match(html, /ao aprovar, recebem o convite/, "proposta avisa que o clique convida (v4: um clique)");
  assert.match(html, /conferir se já está na agenda/, "trava de dedup da agenda");
  assert.match(html, /O QUE ESTE BRIEFING NÃO VÊ/, "cobertura declarada sempre");
  assert.match(html, /e-mail do escritório não coberto/, "limite do gerador local dito em voz alta");
  assert.doesNotMatch(html, /<table/i, "mobile-first: sem tabelas");
});

test("HTML: seção vazia diz 'no que este briefing vê', nunca 'não há nada'", () => {
  const db = bancoComCenario();
  const html = renderizarHtml(montarBriefing(db, { advogados: ADVOGADOS_FICTICIOS, hoje: HOJE, regrasConvidados: [] }));
  assert.match(html, /no que este briefing vê/);
  assert.doesNotMatch(html, /não há nada/i);
});

test("botão Aprovar aparece com URL configurada; sem ela, aprovação por resposta", () => {
  const db = bancoComCenario();
  const modelo = montarBriefing(db, { advogados: ADVOGADOS_FICTICIOS, hoje: HOJE, regrasConvidados: [] });

  const semBotao = renderizarHtml(modelo, { urlAprovacao: null });
  assert.match(semBotao, /Para aprovar: responda este e-mail/);
  assert.doesNotMatch(semBotao, /Aprovar → agenda/);

  const modeloComConvidados = montarBriefing(db, { advogados: ADVOGADOS_FICTICIOS, hoje: HOJE, incluirJaRelatadas: true, regrasConvidados: CONVIDADOS_FICTICIOS });
  const comBotao = renderizarHtml(modeloComConvidados, { urlAprovacao: "https://script.google.com/macros/s/X/exec", tokenAprovacao: "segredo123" });
  assert.match(comBotao, /Aprovar → agenda/);
  assert.match(comBotao, /acao=aprovar/);
  assert.match(comBotao, /tk=segredo123/, "token protege a página");
  assert.match(comBotao, /d=2026-10-20/, "data ISO na URL");
  assert.match(comBotao, /cor=5/, "cor Banana da Advogada 1 vai junto");
  assert.match(comBotao, /contato%40exemplo-cliente.com/, "convidados sugeridos vão para a página de confirmação");
  assert.doesNotMatch(comBotao, /authuser/, "sem authuser — quebraria em conta pessoal no celular");
});

test("HTML: nenhuma data ISO nem hora UTC visível — tudo dd/mm/aaaa em São Paulo (pedido 12/08)", () => {
  const db = bancoComCenario();
  const html = renderizarHtml(
    montarBriefing(db, { advogados: ADVOGADOS_FICTICIOS, regrasConvidados: CONVIDADOS_FICTICIOS, hoje: HOJE }),
    { urlAprovacao: "https://script.google.com/macros/s/X/exec" },
  );
  // URLs carregam d=AAAA-MM-DD por protocolo — o que não pode é data ISO no
  // TEXTO que a advogada lê. Remove os atributos href e audita o resto.
  const visivel = html.replace(/href="[^"]*"/g, "");
  assert.doesNotMatch(visivel, /\d{4}-\d{2}-\d{2}/, "data ISO vazou para o texto visível");
  assert.doesNotMatch(visivel, /\d{2}:\d{2}:\d{2}\.\d+Z|T\d{2}:\d{2}/, "timestamp UTC vazou");
  assert.match(visivel, /Gerado localmente em \d{2}\/\d{2}\/\d{4} às \d{2}:\d{2}/, "rodapé em dd/mm/aaaa às hh:mm");
});

test("HTML: teor com markup malicioso não vira HTML do e-mail", () => {
  const db = abrirBanco(":memory:");
  const exec = db
    .prepare(`INSERT INTO fontes_execucao (fonte, iniciado_em, status, itens_obtidos) VALUES ('djen', ?, 'ok', 1)`)
    .run(agora()).lastInsertRowid;
  const id = db
    .prepare(
      `INSERT INTO comunicacoes (djen_id, hash_djen, numero_cnj, tribunal, orgao, tipo_comunicacao, tipo_documento,
        data_disponibilizacao, texto, texto_sha256, link, bruto, execucao_id, criado_em)
       VALUES (9, '', '0000001-11.2026.5.12.0001', 'TRT12', null, 'Intimação', 'Notificação', '2026-08-07',
        'RECLAMANTE: A RECLAMADO: B <img src=x onerror=alert(1)> prazo de 5 dias', '', null, 'null', ?, ?)`,
    )
    .run(exec, agora()).lastInsertRowid;
  db.prepare("INSERT INTO comunicacoes_oab (comunicacao_id, oab) VALUES (?, '10001/SC')").run(id);

  const html = renderizarHtml(montarBriefing(db, { advogados: ADVOGADOS_FICTICIOS, hoje: HOJE, regrasConvidados: [] }));
  assert.doesNotMatch(html, /<img src=x/, "markup vindo do teor é escapado");
});
