/**
 * Testes do extrator de texto e da verificação de citação — SPIKE S5.
 *
 * O que esta suíte protege: o mecanismo anti-alucinação da v2 §1.2-b tem que
 * errar para o lado seguro nas DUAS direções.
 *
 *   • Reprovar extração correta → o sistema chama de alucinação um fato certo,
 *     e a advogada perde a confiança na ferramenta.
 *   • Aprovar trecho inventado → o sistema carimba como "verificado" um fato
 *     que não existe no documento. É o modo de falha grave.
 *
 * Os casos usam texto real das 10 atas em `atas das audiencias/`.
 *
 * Rodar:  node --test spikes/lib/pdf_texto.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CNJ_REGEX,
  PdfTextoError,
  extrairNumerosCnj,
  extrairValores,
  repararNumerosCnj,
  unirQuebrasDeHifen,
  valorParaCentavos,
  verificarCitacao,
} from "./pdf_texto.mjs";

// ─── Hifenização e quebra de linha ───────────────────────────────────────────

test("quebra após hífen é unida PRESERVANDO o hífen", () => {
  // Padrão das atas. "realizou-se" tem hífen de verdade: apagá-lo produziria
  // "realizouse", que não existe no documento nem no que o modelo citaria.
  const doc = "por meio da ferramenta Zoom, realizou-\nse, sob a direção da Exma. Juíza";
  assert.match(unirQuebrasDeHifen(doc), /realizou-se, sob a direção/);
});

test("CRÍTICO: trecho de uma linha só confere contra documento quebrado em duas", () => {
  const doc = "por meio da ferramenta Zoom, realizou-\nse, sob a direção da Exma. Juíza";
  const citado = "realizou-se, sob a direção da Exma. Juíza";
  const r = verificarCitacao(citado, doc);
  assert.equal(r.verificado, true, "reprovar aqui marcaria extração correta como alucinação");
  assert.equal(r.nivel, "hifen");
});

test("quebra de linha simples no meio da frase não reprova a citação", () => {
  const doc = "concedo à parte ré presente o prazo de 20 dias\npara apresentação de defesa";
  const r = verificarCitacao("prazo de 20 dias para apresentação de defesa", doc);
  assert.equal(r.verificado, true);
  assert.equal(r.nivel, "espacos");
});

test("texto sem nenhuma deformação confere no nível literal", () => {
  const doc = "CONCILIAÇÃO: rejeitada.";
  assert.deepEqual(verificarCitacao("CONCILIAÇÃO: rejeitada.", doc), { verificado: true, nivel: "literal" });
});

// ─── Número do processo partido ──────────────────────────────────────────────

test("CRÍTICO: número CNJ partido por quebra de linha é reparado", () => {
  // Caso real (nomes/números trocados por fictícios). A chave que identifica o processo é justamente a que quebra.
  const doc = "Ação Trabalhista - Rito Ordinário número 0000002-\n22.2026.5.12.0002, supramencionada.";
  assert.equal(CNJ_REGEX.test(doc), false, "sem reparo o número simplesmente não é encontrado");
  assert.deepEqual(extrairNumerosCnj(doc), ["0000002-22.2026.5.12.0002"]);
});

test("reparo do CNJ não inventa número onde não há", () => {
  const doc = "valor de 1234567-\nalguma coisa";
  assert.deepEqual(extrairNumerosCnj(doc), []);
});

test("números CNJ repetidos são deduplicados", () => {
  const doc = "0000003-33.2026.5.12.0003 ... novamente 0000003-33.2026.5.12.0003";
  assert.deepEqual(extrairNumerosCnj(doc), ["0000003-33.2026.5.12.0003"]);
});

test("CNJ citado pelo modelo confere contra o documento que o parte", () => {
  const doc = "número 0000012-\n13.2026.5.12.0012, supramencionada";
  assert.equal(verificarCitacao("0000012-13.2026.5.12.0012", doc).verificado, true);
});

// ─── Valores monetários ──────────────────────────────────────────────────────

test("mesmo valor com e sem espaço após R$ dá os mesmos centavos", () => {
  // Ambos os formatos aparecem no MESMO conjunto de atas.
  assert.equal(valorParaCentavos("R$12.000,00"), 1_200_000);
  assert.equal(valorParaCentavos("R$ 12.000,00"), 1_200_000);
});

test("valores reais das atas viram centavos inteiros", () => {
  assert.equal(valorParaCentavos("R$ 60.000,00"), 6_000_000);
  assert.equal(valorParaCentavos("R$ 17.430,00"), 1_743_000);
  assert.equal(valorParaCentavos("R$ 1.100,00"), 110_000);
  assert.equal(valorParaCentavos("R$ 800,00"), 80_000);
  assert.equal(valorParaCentavos("R$ 130,00"), 13_000);
});

test("nunca devolve ponto flutuante", () => {
  for (const v of ["R$ 4.730,00", "R$ 2.400,00", "R$ 0,01"]) {
    assert.equal(Number.isInteger(valorParaCentavos(v)), true);
  }
  assert.equal(valorParaCentavos("R$ 0,01"), 1);
});

test("valor ilegível lança em vez de virar zero", () => {
  // Um valor que vira 0 em silêncio é uma obrigação de pagamento que some.
  for (const ruim of ["R$ mil reais", "R$", "quinze mil", "R$ 12.000,000"]) {
    assert.throws(() => valorParaCentavos(ruim), PdfTextoError);
  }
});

test("extração de valores acha todos os do parcelamento real", () => {
  const doc = "R$60.000,00, sendo R$17.430,00 de entrada e 9 parcelas de R$4.730,00";
  const vs = extrairValores(doc);
  assert.deepEqual(vs.map((v) => v.centavos), [6_000_000, 1_743_000, 473_000]);
});

// ─── Anti-alucinação: o trecho inventado tem que REPROVAR ────────────────────

test("CRÍTICO: trecho que não existe no documento é reprovado em todos os níveis", () => {
  const doc = "HOMOLOGO o acordo no valor de R$ 12.000,00 em 5 parcelas.";
  const r = verificarCitacao("HOMOLOGO o acordo no valor de R$ 25.000,00 em 5 parcelas.", doc);
  assert.equal(r.verificado, false);
  assert.equal(r.nivel, null);
});

test("CRÍTICO: alteração de um único dígito no valor é detectada", () => {
  const doc = "custas processuais no valor de R$ 800,00";
  assert.equal(verificarCitacao("custas processuais no valor de R$ 800,00", doc).verificado, true);
  assert.equal(verificarCitacao("custas processuais no valor de R$ 900,00", doc).verificado, false);
});

test("CRÍTICO: alteração de data é detectada mesmo no nível mais tolerante", () => {
  const doc = "deverá comprovar o pagamento até o dia 22/04/2026.";
  assert.equal(verificarCitacao("até o dia 22/04/2026", doc).verificado, true);
  assert.equal(verificarCitacao("até o dia 22/05/2026", doc, { nivelMaximo: "alfanumerico" }).verificado, false);
});

test("CRÍTICO: alteração da quantidade do prazo é detectada", () => {
  const doc = "no prazo de 10 dias, sob pena de se ter por cumprida a avença";
  assert.equal(verificarCitacao("no prazo de 10 dias", doc).verificado, true);
  assert.equal(verificarCitacao("no prazo de 30 dias", doc).verificado, false);
});

test("o nível alfanumérico não é frouxo a ponto de aprovar frase remontada", () => {
  // Palavras do documento em outra ordem NÃO podem passar por citação.
  const doc = "concedo à parte ré o prazo de 20 dias para apresentação de defesa";
  assert.equal(verificarCitacao("prazo de 20 dias concedo à parte ré", doc).verificado, false);
});

test("nivelMaximo permite exigir verificação mais estrita", () => {
  const doc = "realizou-\nse a audiência";
  assert.equal(verificarCitacao("realizou-se a audiência", doc, { nivelMaximo: "espacos" }).verificado, false);
  assert.equal(verificarCitacao("realizou-se a audiência", doc, { nivelMaximo: "hifen" }).verificado, true);
});

test("trecho vazio lança em vez de aprovar por vacuidade", () => {
  // "".includes("") é true — aprovar trecho vazio carimbaria qualquer fato.
  assert.throws(() => verificarCitacao("", "qualquer coisa"), PdfTextoError);
  assert.throws(() => verificarCitacao("   ", "qualquer coisa"), PdfTextoError);
});

// ─── Ordem de leitura (armadilha 2) ──────────────────────────────────────────

test("CRÍTICO: texto fora de ordem de leitura reprova citação correta", () => {
  // Reprodução exata do que a extração ingênua produz numa das atas do conjunto: o run em
  // negrito ("prazo de 20 dias") é emitido DEPOIS do texto que o cerca.
  const ingenuo = "concedo à parte ré presente o \n para\nprazo de 20 dias\napresentação de defesa e documentos";
  const ordenado = "concedo à parte ré presente o prazo de 20 dias para apresentação de defesa e documentos";
  const citado = "concedo à parte ré presente o prazo de 20 dias para apresentação de defesa";

  assert.equal(verificarCitacao(citado, ingenuo).verificado, false, "nenhuma normalização conserta ordem errada");
  assert.equal(verificarCitacao(citado, ordenado).verificado, true);
});

test("repararNumerosCnj é idempotente", () => {
  const doc = "0900001-\n07.2026.5.12.0901";
  assert.equal(repararNumerosCnj(repararNumerosCnj(doc)), repararNumerosCnj(doc));
});
