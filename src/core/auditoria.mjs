/**
 * Auditoria e log.
 *
 * Duas coisas diferentes, deliberadamente separadas:
 *
 *   • LOG TÉCNICO (`log`) — arquivo JSONL, para depurar. NÃO recebe conteúdo
 *     de documento nem dado pessoal: é o artefato mais fácil de vazar por
 *     descuido (colado num chat, anexado num e-mail de suporte).
 *
 *   • AUDITORIA (`registrar`) — tabela append-only no banco, dentro do mesmo
 *     perímetro dos dados. É o registro que responde "por que este evento foi
 *     criado?" meses depois, e pode conter o trecho citado do documento.
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { agora } from "./db.mjs";

// Campos que nunca devem entrar no log técnico.
const PROIBIDOS_NO_LOG = new Set([
  "texto", "trecho", "conteudo", "corpo", "payload",
  "email", "cpf", "cnpj", "senha", "token", "access_token", "refresh_token",
]);

function sanitizar(dados) {
  const limpo = {};
  for (const [k, v] of Object.entries(dados ?? {})) {
    if (PROIBIDOS_NO_LOG.has(k.toLowerCase())) {
      limpo[k] = `[omitido:${typeof v === "string" ? v.length + "ch" : typeof v}]`;
    } else if (v && typeof v === "object" && !Array.isArray(v)) {
      limpo[k] = sanitizar(v);
    } else {
      limpo[k] = v;
    }
  }
  return limpo;
}

export function criarLog(caminhoArquivo = null) {
  if (caminhoArquivo) mkdirSync(dirname(caminhoArquivo), { recursive: true });

  const escrever = (nivel, mensagem, dados) => {
    const linha = JSON.stringify({
      t: agora(),
      nivel,
      msg: mensagem,
      ...sanitizar(dados),
    });
    if (caminhoArquivo) appendFileSync(caminhoArquivo, linha + "\n");
    else if (nivel === "erro") console.error(linha);
    else console.log(linha);
  };

  return {
    info: (msg, dados) => escrever("info", msg, dados),
    aviso: (msg, dados) => escrever("aviso", msg, dados),
    erro: (msg, dados) => escrever("erro", msg, dados),
    sanitizar,
  };
}

/**
 * Registra um evento na trilha de auditoria.
 *
 * `ator` é obrigatório e explícito: 'sistema' ou o e-mail de quem decidiu.
 * Sem ator, um log de aprovação não prova nada.
 */
export function registrar(db, { ator, evento, entidade = null, entidadeId = null, detalhes = null }) {
  if (!ator) throw new Error("auditoria exige ator ('sistema' ou identificação da pessoa)");
  if (!evento) throw new Error("auditoria exige evento");

  db.prepare(
    `INSERT INTO audit_log (ocorrido_em, ator, evento, entidade, entidade_id, detalhes)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    agora(),
    ator,
    evento,
    entidade,
    entidadeId === null ? null : String(entidadeId),
    detalhes === null ? null : JSON.stringify(detalhes),
  );
}

/** Trilha completa de uma entidade, em ordem cronológica. */
export function trilha(db, entidade, entidadeId) {
  return db
    .prepare(
      `SELECT * FROM audit_log
        WHERE entidade = ? AND entidade_id = ?
        ORDER BY ocorrido_em ASC, id ASC`,
    )
    .all(entidade, String(entidadeId))
    .map((l) => ({ ...l, detalhes: l.detalhes ? JSON.parse(l.detalhes) : null }));
}
