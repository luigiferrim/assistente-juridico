/**
 * Idempotência — a defesa contra "5 eventos iguais na agenda".
 *
 * Estes testes existem porque a v1 do plano delegava essa garantia ao Google
 * Calendar, e a documentação da Google diz que ela NÃO é garantida
 * (v2 §1.2-a). A garantia passou a ser nossa; aqui é onde ela é provada.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { abrirBanco } from "../src/core/db.mjs";
import {
  chaveFato, chaveAcao, chaveDocumento, idEventoCalendar,
  reservar, concluir, falhar, liberarReserva,
} from "../src/core/idempotencia.mjs";

const banco = () => abrirBanco(":memory:");
const FATO = { numeroCnj: "00012345620255120011", tipo: "prazo_pagamento", data: "2026-08-20", valorCentavos: 1200000 };

test("mesma ata reprocessada gera a MESMA chave de fato", () => {
  assert.equal(chaveFato(FATO), chaveFato({ ...FATO }));
});

test("formatação do número e do valor não muda a chave", () => {
  const comMascara = { ...FATO, numeroCnj: "0001234-56.2025.5.12.0011" };
  assert.equal(chaveFato(comMascara), chaveFato(FATO), "máscara do CNJ é irrelevante");
  assert.equal(chaveFato({ ...FATO, valorCentavos: 1200000.4 }), chaveFato(FATO), "centavos são truncados");
});

test("qualquer campo relevante diferente gera chave diferente", () => {
  const base = chaveFato(FATO);
  assert.notEqual(chaveFato({ ...FATO, data: "2026-08-21" }), base);
  assert.notEqual(chaveFato({ ...FATO, valorCentavos: 1500001 }), base);
  assert.notEqual(chaveFato({ ...FATO, tipo: "prazo_custas" }), base);
  assert.notEqual(chaveFato({ ...FATO, numeroCnj: "00012345620255120012" }), base);
});

test("chaveDocumento depende só do conteúdo, não do nome", () => {
  const a = chaveDocumento(Buffer.from("conteudo da ata"));
  assert.equal(a, chaveDocumento(Buffer.from("conteudo da ata")));
  assert.notEqual(a, chaveDocumento(Buffer.from("conteudo da ata ")));
});

test("id de evento respeita o alfabeto do Google Calendar (a-v, 0-9)", () => {
  const id = idEventoCalendar(chaveFato(FATO));
  assert.match(id, /^[a-v0-9]{5,1024}$/, "fora do alfabeto o Google rejeita o insert");
  assert.equal(id, idEventoCalendar(chaveFato(FATO)), "precisa ser determinístico");
  // 'z' não pertence a base32hex — o prefixo tem que ser validado, não presumido.
  assert.throws(() => idEventoCalendar(chaveFato(FATO), "zz"), /alfabeto/);
});

test("CRÍTICO: a segunda reserva da mesma chave NÃO autoriza chamar a API", () => {
  const db = banco();
  const chave = chaveAcao({ servico: "google_calendar", operacao: "insert", chaveFato: chaveFato(FATO) });

  const primeira = reservar(db, { chave, servico: "google_calendar", operacao: "insert" });
  assert.equal(primeira.reservado, true, "a primeira reserva autoriza");

  const segunda = reservar(db, { chave, servico: "google_calendar", operacao: "insert" });
  assert.equal(segunda.reservado, false, "a segunda NUNCA pode autorizar — seria evento duplicado");
  assert.equal(segunda.execucao.id, primeira.execucao.id);
  assert.equal(db.prepare("SELECT count(*) c FROM execucoes").get().c, 1);
});

test("cinco tentativas seguidas produzem uma única execução", () => {
  const db = banco();
  const chave = chaveAcao({ servico: "google_calendar", operacao: "insert", chaveFato: chaveFato(FATO) });
  const autorizadas = [];
  for (let i = 0; i < 5; i++) {
    const r = reservar(db, { chave, servico: "google_calendar", operacao: "insert" });
    if (r.reservado) autorizadas.push(i);
  }
  assert.deepEqual(autorizadas, [0], "só a primeira pode chamar a API");
  assert.equal(db.prepare("SELECT count(*) c FROM execucoes").get().c, 1);
});

test("concluir grava o id externo e impede reconclusão", () => {
  const db = banco();
  const chave = "k1";
  const { execucao } = reservar(db, { chave, servico: "google_calendar", operacao: "insert" });

  concluir(db, execucao.id, "evt_google_123", { reversivelAte: "2026-08-16T00:00:00Z" });
  const linha = db.prepare("SELECT * FROM execucoes WHERE id = ?").get(execucao.id);
  assert.equal(linha.status, "sucesso");
  assert.equal(linha.id_externo, "evt_google_123");

  assert.throws(() => concluir(db, execucao.id, "outro"), /fora de ordem/,
    "concluir duas vezes indica bug no chamador e deve explodir");
});

test("falha registrada não libera a chave — exige decisão explícita", () => {
  const db = banco();
  const chave = "k2";
  const { execucao } = reservar(db, { chave, servico: "gmail", operacao: "send" });
  falhar(db, execucao.id, new Error("timeout"));

  const r = reservar(db, { chave, servico: "gmail", operacao: "send" });
  assert.equal(r.reservado, false,
    "após falha, reenviar não pode ser automático — e-mail pode ter saído mesmo com timeout");
});

test("liberarReserva só age sobre reserva pendente, nunca sobre sucesso", () => {
  const db = banco();
  const { execucao } = reservar(db, { chave: "k3", servico: "google_calendar", operacao: "insert" });
  assert.equal(liberarReserva(db, "k3"), true);
  assert.equal(reservar(db, { chave: "k3", servico: "google_calendar", operacao: "insert" }).reservado, true);

  const nova = db.prepare("SELECT id FROM execucoes WHERE chave_idempotencia = 'k3'").get();
  concluir(db, nova.id, "evt_x");
  assert.equal(liberarReserva(db, "k3"), false, "execução concluída JAMAIS pode ser liberada");
  void execucao;
});
