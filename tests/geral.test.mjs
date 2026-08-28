/**
 * TESTE GERAL — o contrato inteiro do briefing local, de ponta a ponta.
 *
 * Um único cenário rico (audiência com subtipo + cliente reconhecido + cópia
 * por destinatário + compartilhada entre OABs · audiência em CEJUSC sem
 * subtipo no teor · perícia sem hora e sem cliente · prazo de perito · sigilo
 * · obrigações vencida/futura/condicional) atravessa montagem → HTML → ciclo
 * de marcação. Se uma regra do produto regredir, é aqui que ela quebra
 * primeiro, com o cenário mais parecido com um dia real.
 *
 * HERMÉTICO de propósito: advogados, regras de convidados, URL e token são
 * fixtures — nada aqui pode depender de dados/config.json da máquina.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { abrirBanco, agora } from "../src/core/db.mjs";
import { montarBriefing } from "../src/core/briefing/index.mjs";
import { renderizarHtml } from "../src/core/briefing/html.mjs";
import { CAMINHO_CONFIG } from "../src/core/escritorio.mjs";

/**
 * Termos REAIS da máquina (dados/config.json, fora do git): nomes, OABs,
 * e-mails, token. Nenhum pode aparecer num HTML montado só com fixtures —
 * se aparecer, algum caminho do código leu o config real por baixo dos panos.
 * Em máquina sem config (CI), a lista é vazia e a guarda é neutra.
 */
function termosReais() {
  try {
    const c = JSON.parse(readFileSync(CAMINHO_CONFIG, "utf8"));
    const termos = [];
    if (c.nome_escritorio) termos.push(c.nome_escritorio);
    for (const a of c.advogados ?? []) {
      termos.push(...String(a.nome ?? "").split(/[\s.]+/).filter((w) => w.length > 3));
      if (a.numero) termos.push(String(a.numero));
    }
    for (const r of c.convidados_por_cliente ?? []) {
      if (r.apelido) termos.push(r.apelido);
      if (r.cliente) termos.push(r.cliente);
      termos.push(...(r.emails ?? []));
    }
    if (c.aprovacao_token) termos.push(c.aprovacao_token);
    return termos;
  } catch {
    return [];
  }
}

const HOJE = "2026-08-10";

const ADVOGADOS = [
  { oab: "10001/SC", numero: "10001", uf: "SC", nome: "Dra. Advogada 1", emoji: "🟡", cor: "#e0b400", corAgenda: "5", jurisdicao: "TRTs e TST" },
  { oab: "10002/SC", numero: "10002", uf: "SC", nome: "Dra. Advogada 2", emoji: "🟣", cor: "#7b1fa2", corAgenda: "3", jurisdicao: "TRTs" },
  { oab: "10003/SC", numero: "10003", uf: "SC", nome: "Dr. Advogado 3", emoji: "🟢", cor: "#2e7d32", corAgenda: "10", jurisdicao: "eproc" },
];
const REGRAS = [{ cliente: /alfa fict/i, emails: ["rh@exemplo-cliente.com", "dp@exemplo-cliente.com"], apelido: "Alfa Fictícia" }];
const URL_TESTE = "https://script.google.com/macros/s/TESTE/exec";

function cenarioCompleto() {
  const db = abrirBanco(":memory:");
  const exec = db
    .prepare(
      `INSERT INTO fontes_execucao (fonte, iniciado_em, encerrado_em, status, completo, itens_obtidos, parametros)
       VALUES ('djen', ?, ?, 'ok', 1, 6, ?)`,
    )
    .run(agora(), agora(), JSON.stringify({ numeroOab: "10001", ufOab: "SC" })).lastInsertRowid;

  const inserir = db.prepare(
    `INSERT INTO comunicacoes (djen_id, hash_djen, numero_cnj, tribunal, orgao, tipo_comunicacao, tipo_documento,
       data_disponibilizacao, texto, texto_sha256, link, bruto, execucao_id, criado_em)
     VALUES (?, '', ?, ?, ?, 'Intimação', ?, '2026-08-07', ?, ?, ?, ?, ?, ?)`,
  );
  const vincular = db.prepare("INSERT INTO comunicacoes_oab (comunicacao_id, oab) VALUES (?, ?)");
  const c = (djenId, cnj, tribunal, orgao, tipoDoc, texto, sha, link, bruto, oabs) => {
    const id = inserir.run(djenId, cnj, tribunal, orgao, tipoDoc, texto, sha, link, bruto, exec, agora()).lastInsertRowid;
    for (const oab of oabs) vincular.run(id, oab);
    return id;
  };

  // 1) Audiência DE INSTRUÇÃO com hora, zoom e cliente reconhecido — e prazo
  //    nosso de 15 dias. Compartilhada entre as duas advogadas.
  const teor1 =
    "RECLAMANTE: FULANO DE TESTE PEREIRA RECLAMADO: INDUSTRIA ALFA FICTICIA LTDA INTIMAÇÃO " +
    "Destinatário: FULANO DE TESTE PEREIRA manifestar-se sobre os laudos no prazo de 15 dias. " +
    "designada audiência de instrução para o dia 20/10/2026 14:45 https://trt12-jus-br.zoom.us/j/00000000000";
  c(101, "0000001-11.2026.5.12.0001", "TRT12", "3ª VT de Exemplo", "Notificação", teor1, "s1", "https://pje/validacao/101", "null", ["10001/SC", "10002/SC"]);
  // 1b) Cópia do MESMO expediente para o outro destinatário (dedup).
  const teor1b = teor1.replace("Destinatário: FULANO DE TESTE PEREIRA", "Destinatário: INDUSTRIA ALFA FICTICIA LTDA");
  c(102, "0000001-11.2026.5.12.0001", "TRT12", "3ª VT de Exemplo", "Notificação", teor1b, "s1b", "https://pje/validacao/102", "null", ["10001/SC"]);

  // 2) Audiência em CEJUSC SEM subtipo no teor — o órgão decide: Conciliação.
  c(103, "0000002-22.2026.5.12.0002", "TRT12", "CEJUSC-JT/Exemplo", "Notificação",
    "RECLAMANTE: MARIA DE TESTE NUNES RECLAMADO: EMPRESA GAMA EXEMPLO LTDA INTIMAÇÃO pauta de audiência no dia 31/10/2026 13:30",
    "s2", "https://pje/validacao/103", "null", ["10001/SC"]);

  // 3) Perícia sem hora, sem cliente reconhecido (ordem original das partes).
  c(104, "0000003-33.2026.5.09.0003", "TRT9", "04ª VT de Exemplo", "Notificação",
    "AUTOR: BELTRANO DE TESTE SILVA RÉU: TRANSPORTES DELTA EXEMPLO LTDA Designo perícia para o dia 10/11/2026. Intimem-se.",
    "s3", "https://pje/validacao/104", "null", ["10001/SC"]);

  // 4) Prazo do PERITO (terceiro) — nunca pode virar AGIR HOJE.
  c(105, "0000004-44.2026.5.12.0004", "TRT12", "2ª VT de Exemplo", "Notificação",
    "RECLAMANTE: SICRANO DE TESTE RECLAMADO: INDUSTRIA ALFA FICTICIA LTDA Intime-se o perito para indicar, no prazo de 5 (cinco) dias, a data e o local da avaliação.",
    "s4", "https://pje/validacao/105", "null", ["10003/SC"]);

  // 5) Sigilo: teor não publicado, partes em iniciais via polos do bruto.
  c(106, "0000005-55.2026.8.24.0005", "TJSC", null, "Intimação",
    "Tomar ciência do(a) Intimação de ID abc123.",
    "s5", "https://pje/validacao/106",
    JSON.stringify({ destinatarios: [{ nome: "A. B. C.", polo: "A" }, { nome: "D. E. F.", polo: "P" }] }),
    ["10003/SC"]);

  const obr = db.prepare(
    `INSERT INTO obrigacoes (chave_natural, numero_cnj, partes, tipo, descricao, valor_centavos, vencimento, gatilho, advogado_oab, status, fonte, criado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, '10001/SC', 'pendente', 'ata teste', ?)`,
  );
  obr.run("g:venceu", "0000006-66.2026.5.12.0006", "Fulana × Alfa Fictícia", "parcela", "2ª parcela", 240000, "2026-08-09", null, agora());
  obr.run("g:futuro", "0000006-66.2026.5.12.0006", "Fulana × Alfa Fictícia", "parcela", "3ª parcela", 240000, "2026-08-20", null, agora());
  obr.run("g:cond", "0000006-66.2026.5.12.0006", "Fulana × Alfa Fictícia", "custas", "Custas de R$ 100", 10000, null, "após última parcela +30d", agora());

  return db;
}

const montar = (db, extra = {}) =>
  montarBriefing(db, { advogados: ADVOGADOS, hoje: HOJE, regrasConvidados: REGRAS, ...extra });

test("GERAL: montagem — dedup, subtipos, títulos, classes de prazo e obrigações num cenário de dia real", () => {
  const db = cenarioCompleto();
  const m = montar(db);

  // 6 linhas no banco, 5 cartões (a cópia por destinatário agrupa).
  assert.equal(m.totais.comunicacoesNovas, 5, "cópia por destinatário conta uma vez");

  // Propostas: instrução + conciliação + perícia = 3 (cópia não duplica).
  assert.equal(m.propostasAgenda.length, 3);
  const [instrucao, conciliacao, pericia] = [
    m.propostasAgenda.find((p) => p.subtipo === "Instrução"),
    m.propostasAgenda.find((p) => p.subtipo === "Conciliação"),
    m.propostasAgenda.find((p) => p.tipo === "pericia"),
  ];

  // Título no padrão das advogadas: cliente (apelido) × empregado · tipo · vara.
  assert.equal(instrucao.tituloEvento, "Alfa Fictícia × FULANO DE TESTE PEREIRA · Instrução · 3ª VT de Exemplo");
  assert.equal(instrucao.empregado, "FULANO DE TESTE PEREIRA");
  assert.equal(instrucao.hora, "14:45");
  assert.deepEqual(instrucao.convidadosSugeridos, ["rh@exemplo-cliente.com", "dp@exemplo-cliente.com"]);
  assert.match(instrucao.linkSala ?? "", /zoom\.us/);

  // CEJUSC sem subtipo no teor: o órgão vale como conciliação — em TUDO.
  assert.equal(conciliacao.subtipo, "Conciliação", "órgão CEJUSC resolve o subtipo");
  assert.match(conciliacao.tituloEvento, /· Conciliação · CEJUSC-JT\/Exemplo$/);

  // Sem cliente reconhecido: ordem original, sem chute, sem empregado isolado.
  assert.equal(pericia.tituloEvento, "BELTRANO DE TESTE SILVA × TRANSPORTES DELTA EXEMPLO LTDA · Perícia · 04ª VT de Exemplo");
  assert.equal(pericia.empregado, null);
  assert.equal(pericia.hora, null, "hora ausente fica ausente — nunca inventada");
  assert.deepEqual(pericia.convidadosSugeridos, []);

  // Prazo de perito é 🟡 na seção do Advogado 3 — nunca 🔴.
  const secao3 = m.secoes.find((s) => s.advogado.oab === "10003/SC");
  const cartaoPerito = secao3.itens.find((i) => i.numeroCnj === "0000004-44.2026.5.12.0004");
  assert.equal(cartaoPerito.urgencia, "semana");
  assert.match(cartaoPerito.sinais.join(" "), /não é seu prazo/);

  // Sigilo: partes em iniciais pareadas por polo, marcado como sigiloso.
  const cartaoSigilo = secao3.itens.find((i) => i.numeroCnj === "0000005-55.2026.8.24.0005");
  assert.equal(cartaoSigilo.sigilo, true);
  assert.equal(cartaoSigilo.partes, "A. B. C. × D. E. F.");
  assert.equal(cartaoSigilo.trecho, null, "teor sob sigilo nunca vai para o cartão");

  // Obrigações: vencida vira 🔴 na seção da responsável; condicional declarada.
  const secao1 = m.secoes.find((s) => s.advogado.oab === "10001/SC");
  const vencida = secao1.itens.find((i) => i.origem === "obrigacao");
  assert.equal(vencida.urgencia, "hoje");
  assert.equal(m.vencimentos.length, 2, "vencida + 20/08 (≤14 dias)");
  assert.equal(m.condicionais.length, 1, "sem data ≠ esquecida: aguardando gatilho");
});

test("GERAL: HTML — ordem das seções, agenda primeiro, botão completo, dark-safe e sem dado real", () => {
  const db = cenarioCompleto();
  const html = renderizarHtml(montar(db), { urlAprovacao: URL_TESTE, tokenAprovacao: "tk-teste", nomeEscritorio: "Escritório de Teste" });
  assert.match(html, /Escritório de Teste — 5 novidade\(s\)/, "nome do escritório injetável — teste não lê config real");

  // Um briefing por advogado, na ordem do escritório.
  const iA1 = html.indexOf("Dra. Advogada 1");
  const iA2 = html.indexOf("Dra. Advogada 2");
  const iA3 = html.indexOf("Dr. Advogado 3");
  assert.ok(iA1 > -1 && iA1 < iA2 && iA2 < iA3, "seções na ordem definida");

  // Dentro da seção: agenda PRIMEIRO, depois urgências (regra de 11/08).
  const trechoA1 = html.slice(iA1, iA2);
  const iProposta = trechoA1.indexOf("PROPOSTA PARA A AGENDA");
  const iAgir = trechoA1.indexOf("AGIR HOJE");
  assert.ok(iProposta > -1 && iAgir > -1 && iProposta < iAgir, "agenda no topo da seção");

  // Cabeçalho do cartão e título do botão CONCORDAM no subtipo.
  assert.match(html, /Audiência de instrução · 20\/10\/2026/);
  assert.match(html, /Audiência de conciliação · 31\/10\/2026/);

  // Botão: título, pn (empregado), convidados, cor, token — e nada de authuser.
  assert.match(html, /t=Alfa\+Fict%C3%ADcia\+%C3%97\+FULANO\+DE\+TESTE\+PEREIRA\+%C2%B7\+Instru%C3%A7%C3%A3o/);
  assert.match(html, /pn=FULANO\+DE\+TESTE\+PEREIRA/, "empregado vai para o rascunho PROCESSO [PARTE]");
  assert.match(html, /conv=rh%40exemplo-cliente.com%2Cdp%40exemplo-cliente.com/);
  assert.match(html, /cor=5/);
  assert.match(html, /tk=tk-teste/);
  assert.doesNotMatch(html, /authuser/);

  // Perícia sem hora pede conferência em voz alta.
  assert.match(html, /hora não detectada — conferir/);

  // Regras de e-mail: dark-safe, mobile-first, âncoras, cobertura declarada.
  assert.doesNotMatch(html, /color:\s*#fff/i);
  assert.doesNotMatch(html, /<table/i);
  assert.match(html, /O QUE ESTE BRIEFING NÃO VÊ/);
  assert.match(html, /conferir se já está na agenda/);

  // Guarda de hermetismo: NENHUM dado real do escritório pode vazar para um
  // HTML montado só com fixtures (se vazar, algum caminho leu o config real).
  const minusculo = html.toLowerCase();
  for (const termo of termosReais()) {
    assert.ok(
      !minusculo.includes(termo.toLowerCase()),
      `dado real da máquina vazou para HTML de fixture: "${termo.slice(0, 3)}…"`,
    );
  }
});

test("GERAL: ciclo de marcação — oficial consome, amanhã só ressurgem os vencimentos", () => {
  const db = cenarioCompleto();
  montar(db, { marcar: true });

  const amanha = montar(db, { hoje: "2026-08-11" });
  assert.equal(amanha.totais.comunicacoesNovas, 0, "tudo relatado ontem (inclusive as cópias)");
  assert.equal(amanha.propostasAgenda.length, 0, "proposta não ressurge sozinha");
  assert.equal(amanha.vencimentos.length, 2, "vencimento é lembrete: ressurge até resolver");
  assert.equal(amanha.condicionais.length, 1);
});
