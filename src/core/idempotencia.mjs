/**
 * Motor de idempotência.
 *
 * CONTEXTO (v2 §1.2-a): a v1 do plano assumia que bastava mandar um `id`
 * customizado ao Google Calendar e tratar 409 como sucesso. A documentação da
 * Google diz o contrário — *"we cannot guarantee that ID collisions will be
 * detected at event creation time"*. Portanto a garantia é NOSSA.
 *
 * O contrato é: reservar ANTES de chamar a API externa.
 *
 *   1. `reservar()` grava a chave numa tabela com UNIQUE, dentro de transação.
 *      Se já existia, ninguém chama a API — a ação já foi (ou está sendo) feita.
 *   2. Só então o chamador executa a operação externa.
 *   3. `concluir()` grava o id externo devolvido; `falhar()` registra o erro.
 *
 * A reserva vem primeiro de propósito: se o processo morrer entre a reserva e a
 * chamada, o pior caso é uma ação que não aconteceu e fica visível como
 * `reservada` pendente — nunca uma ação executada duas vezes.
 */

import { createHash } from "node:crypto";
import { agora, emTransacao } from "./db.mjs";

/** Alfabeto aceito pelo Google Calendar em IDs customizados: base32hex (a–v, 0–9). */
const ALFABETO_CALENDAR = /^[a-v0-9]{5,1024}$/;

function sha256(texto) {
  return createHash("sha256").update(texto, "utf8").digest("hex");
}

/** Hash do conteúdo binário — dedupe de documento independe do nome do arquivo. */
export function chaveDocumento(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Chave natural de um fato. Reprocessar a mesma ata não pode gerar fato novo.
 * Normaliza para que "R$ 12.000,00" e 1200000 centavos gerem a mesma chave.
 */
export function chaveFato({ numeroCnj, tipo, data = null, valorCentavos = null }) {
  if (!numeroCnj || !tipo) throw new Error("chaveFato exige numeroCnj e tipo");
  const partes = [
    String(numeroCnj).replace(/\D/g, ""),
    String(tipo).trim().toLowerCase(),
    data ? String(data).slice(0, 10) : "",
    valorCentavos === null || valorCentavos === undefined ? "" : String(Math.trunc(valorCentavos)),
  ];
  return sha256(partes.join("|"));
}

/** Chave de uma ação externa: identifica a operação, não o fato. */
export function chaveAcao({ servico, operacao, chaveFato: cf }) {
  if (!servico || !operacao || !cf) throw new Error("chaveAcao exige servico, operacao e chaveFato");
  return sha256([servico, operacao, cf].join("|"));
}

/**
 * ID determinístico para evento do Google Calendar.
 *
 * O digest sha256 em hex já usa apenas 0-9 e a-f, subconjunto do alfabeto
 * exigido (a-v, 0-9) — nenhuma conversão é necessária. O prefixo precisa
 * respeitar o mesmo alfabeto: "z", "w", "x" e "y" são inválidos.
 */
export function idEventoCalendar(chave, prefixo = "aj") {
  const id = `${prefixo}${chave}`.toLowerCase();
  if (!ALFABETO_CALENDAR.test(id)) {
    throw new Error(`id de evento fora do alfabeto aceito pelo Google Calendar: ${id.slice(0, 24)}…`);
  }
  return id;
}

/**
 * Reserva a execução. Retorna `{ reservado, execucao }`.
 *
 * `reservado: false` significa que a chave já existe — NÃO chame a API externa.
 */
export function reservar(db, { chave, servico, operacao, acaoId = null, aprovacaoId = null }) {
  if (!chave) throw new Error("reservar exige chave de idempotência");

  return emTransacao(db, () => {
    const existente = db
      .prepare("SELECT * FROM execucoes WHERE chave_idempotencia = ?")
      .get(chave);
    if (existente) return { reservado: false, execucao: existente };

    db.prepare(
      `INSERT INTO execucoes
         (chave_idempotencia, acao_id, aprovacao_id, servico, operacao, status, criado_em)
       VALUES (?, ?, ?, ?, ?, 'reservada', ?)`,
    ).run(chave, acaoId, aprovacaoId, servico, operacao, agora());

    const execucao = db
      .prepare("SELECT * FROM execucoes WHERE chave_idempotencia = ?")
      .get(chave);
    return { reservado: true, execucao };
  });
}

export function concluir(db, execucaoId, idExterno, { reversivelAte = null } = {}) {
  const r = db
    .prepare(
      `UPDATE execucoes
          SET status = 'sucesso', id_externo = ?, concluido_em = ?, reversivel_ate = ?
        WHERE id = ? AND status = 'reservada'`,
    )
    .run(idExterno, agora(), reversivelAte, execucaoId);
  if (r.changes === 0) {
    throw new Error(`execucao ${execucaoId} não estava 'reservada' — concluir() fora de ordem`);
  }
}

export function falhar(db, execucaoId, erro) {
  db.prepare(
    `UPDATE execucoes SET status = 'falhou', erro = ?, concluido_em = ? WHERE id = ?`,
  ).run(String(erro).slice(0, 2000), agora(), execucaoId);
}

/**
 * Libera uma reserva que nunca virou chamada externa (ex.: processo morreu
 * antes de chamar a API). Só age sobre `reservada` — jamais sobre `sucesso`.
 */
export function liberarReserva(db, chave) {
  const r = db
    .prepare("DELETE FROM execucoes WHERE chave_idempotencia = ? AND status = 'reservada'")
    .run(chave);
  return r.changes > 0;
}
