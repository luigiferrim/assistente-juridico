/**
 * ⚠️ TESTES PROVISÓRIOS — NÃO ATENDEM O PORTÃO 1 ⚠️
 *
 * Os casos abaixo foram construídos por mim para exercitar a ARQUITETURA:
 * contagem, pulos, prorrogação, recesso, ambiguidade. Eles NÃO são o gabarito.
 *
 * O gabarito é o conjunto de 10 prazos que a advogada calculou à mão (S8).
 * Até que ele exista e passe, o módulo permanece reprovado e
 * `APROVADO_PELA_ADVOGADA` continua false.
 *
 * Um teste que eu mesmo inventei não pode aprovar a regra que eu mesmo escrevi.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { abrirBanco } from "../src/core/db.mjs";
import { semear, domingoDePascoa, somarDias } from "../src/core/prazos/calendario.mjs";
import {
  calcularPrazo, explicar, PrazoAmbiguoError, APROVADO_PELA_ADVOGADA,
} from "../src/core/prazos/index.mjs";

function bancoComCalendario(anos = [2025, 2026, 2027]) {
  const db = abrirBanco(":memory:");
  semear(db, anos);
  return db;
}

// ---------- Invariantes de segurança (estes SIM são definitivos) -------------

test("CRÍTICO: o módulo se declara não aprovado", () => {
  assert.equal(APROVADO_PELA_ADVOGADA, false,
    "só a validação contra os casos reais dela pode virar esta chave");
});

test("CRÍTICO: todo resultado sai marcado para confirmação enquanto não houver validação", () => {
  const db = bancoComCalendario();
  const r = calcularPrazo(db, { dataBase: "2026-03-02", quantidade: 5, unidade: "dias_uteis" });
  assert.equal(r.requerConfirmacao, true);
  assert.equal(r.provisorio, true);
  assert.ok(r.motivosConfirmacao.some((m) => /não foi validado/.test(m)));
});

test("CRÍTICO: unidade indeterminada lança em vez de adivinhar", () => {
  const db = bancoComCalendario();
  // "pagamento em 10 dias" sem dizer se úteis ou corridos.
  assert.throws(
    () => calcularPrazo(db, { dataBase: "2026-03-02", quantidade: 10, unidade: "dias" }),
    PrazoAmbiguoError,
    "escolher a interpretação 'mais provável' é exatamente o que não pode acontecer",
  );
});

test("CRÍTICO: data-base ausente ou malformada lança", () => {
  const db = bancoComCalendario();
  assert.throws(() => calcularPrazo(db, { quantidade: 5, unidade: "dias_uteis" }), PrazoAmbiguoError);
  assert.throws(() => calcularPrazo(db, { dataBase: "02/03/2026", quantidade: 5, unidade: "dias_uteis" }), PrazoAmbiguoError);
});

test("CRÍTICO: nunca devolve data sem memória de cálculo", () => {
  const db = bancoComCalendario();
  const r = calcularPrazo(db, { dataBase: "2026-03-02", quantidade: 5, unidade: "dias_uteis" });
  assert.ok(Array.isArray(r.memoria) && r.memoria.length > 0);
  assert.equal(r.memoria[0].passo, "termo_inicial");
  assert.match(explicar(r, { dataBase: "2026-03-02", quantidade: 5, unidade: "dias_uteis" }), /contado de/);
});

test("quantidade inválida é rejeitada", () => {
  const db = bancoComCalendario();
  for (const q of [0, -1, 1.5, "5", null]) {
    assert.throws(() => calcularPrazo(db, { dataBase: "2026-03-02", quantidade: q, unidade: "dias_uteis" }), PrazoAmbiguoError);
  }
});

// ---------- Comportamento da contagem (PROVISÓRIO) ---------------------------

test("[provisório] não conta o dia do começo", () => {
  const db = bancoComCalendario();
  // Segunda 02/03/2026 + 1 dia útil => terça 03/03.
  const r = calcularPrazo(db, { dataBase: "2026-03-02", quantidade: 1, unidade: "dias_uteis" });
  assert.equal(r.dataFinal, "2026-03-03");
});

test("[provisório] dias úteis pulam o fim de semana", () => {
  const db = bancoComCalendario();
  // Base sexta 06/03/2026; 1º dia útil = segunda 09/03.
  const r = calcularPrazo(db, { dataBase: "2026-03-06", quantidade: 1, unidade: "dias_uteis" });
  assert.equal(r.dataFinal, "2026-03-09");
  assert.ok(r.memoria.some((m) => m.motivo === "fim de semana"));
});

test("[provisório] 5 dias úteis a partir de uma segunda caem na segunda seguinte", () => {
  const db = bancoComCalendario();
  const r = calcularPrazo(db, { dataBase: "2026-03-02", quantidade: 5, unidade: "dias_uteis" });
  assert.equal(r.dataFinal, "2026-03-09");
});

test("[provisório] dias corridos contam fim de semana, mas o vencimento é prorrogado", () => {
  const db = bancoComCalendario();
  // Base quinta 05/03/2026, 2 corridos => sábado 07/03 => prorroga p/ segunda 09/03.
  const r = calcularPrazo(db, { dataBase: "2026-03-05", quantidade: 2, unidade: "dias_corridos" });
  assert.equal(r.dataFinal, "2026-03-09");
  assert.ok(r.memoria.some((m) => m.passo === "prorroga_vencimento"));
});

test("dias corridos começam no dia seguinte MESMO que não seja útil", () => {
  // Regra confirmada por ela em 09/08/2026: "1 dia após pode ser um dia não
  // útil". Este teste NÃO é [provisório]: registra uma resposta literal dela.
  const db = bancoComCalendario();
  // Base sexta 06/03/2026: termo inicial = sábado 07/03, sem escorregar.
  // 10 corridos: 07/03 + 9 = segunda 16/03 (útil, sem prorrogação).
  // Com o defeito antigo (início escorregava p/ segunda 09/03), venceria 18/03.
  const r = calcularPrazo(db, { dataBase: "2026-03-06", quantidade: 10, unidade: "dias_corridos" });
  assert.equal(r.dataFinal, "2026-03-16");
  assert.ok(!r.memoria.some((m) => m.passo === "adia_inicio"), "corridos não adiam o início");
});

test("[provisório] recesso do art. 775-A suspende a contagem", () => {
  const db = bancoComCalendario();
  // Base 18/12/2026 (sexta): a contagem entra no recesso 20/12–20/01.
  const r = calcularPrazo(db, { dataBase: "2026-12-18", quantidade: 3, unidade: "dias_uteis" });
  assert.ok(r.dataFinal > "2027-01-20", `esperava vencimento após o recesso, veio ${r.dataFinal}`);
  assert.ok(r.memoria.some((m) => /recesso/i.test(m.motivo ?? "")));
  assert.ok(r.motivosConfirmacao.some((m) => /não conferida/.test(m)));
});

test("[provisório] feriado nacional é pulado e aparece na memória com a fonte", () => {
  const db = bancoComCalendario();
  // 01/05/2026 é sexta (Dia do Trabalho).
  const r = calcularPrazo(db, { dataBase: "2026-04-30", quantidade: 1, unidade: "dias_uteis" });
  assert.equal(r.dataFinal, "2026-05-04", "pula 1/5 (feriado) e o fim de semana");
  assert.ok(r.memoria.some((m) => /Dia do Trabalho/.test(m.motivo ?? "")));
  assert.ok(r.memoria.some((m) => /Lei 662\/1949/.test(m.motivo ?? "")));
});

// ---------- Calendário -------------------------------------------------------

test("Páscoa confere com datas conhecidas", () => {
  // Referência pública e verificável, independente da minha implementação.
  assert.equal(domingoDePascoa(2024), "2024-03-31");
  assert.equal(domingoDePascoa(2025), "2025-04-20");
  assert.equal(domingoDePascoa(2026), "2026-04-05");
  assert.equal(domingoDePascoa(2027), "2027-03-28");
});

test("móveis derivam da Páscoa na distância correta", () => {
  const pascoa2026 = domingoDePascoa(2026);
  assert.equal(somarDias(pascoa2026, -2), "2026-04-03", "Sexta-feira Santa");
  assert.equal(somarDias(pascoa2026, -47), "2026-02-17", "terça de Carnaval");
  assert.equal(somarDias(pascoa2026, 60), "2026-06-04", "Corpus Christi");
});

test("todo feriado semeado nasce NÃO confirmado", () => {
  const db = bancoComCalendario([2026]);
  const naoConf = db.prepare("SELECT count(*) c FROM feriados WHERE confirmado_em IS NULL").get().c;
  const total = db.prepare("SELECT count(*) c FROM feriados").get().c;
  assert.equal(naoConf, total, "nada pode nascer confirmado — confirmação é ato humano");
  assert.ok(total > 0);
});

test("toda entrada do calendário tem origem citável", () => {
  const db = bancoComCalendario([2026]);
  const semOrigem = db.prepare("SELECT count(*) c FROM feriados WHERE origem IS NULL OR origem = ''").get().c;
  assert.equal(semOrigem, 0, "data sem fonte não pode fundamentar prazo");
});
