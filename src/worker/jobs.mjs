/**
 * Runner de jobs — fila no próprio SQLite.
 *
 * Sem Redis, sem BullMQ: é uma usuária, uma máquina, ~10 jobs por dia. Uma
 * tabela com transação resolve, e não adiciona serviço para manter.
 *
 * Invariante de segurança: um job só sai de 'pendente' dentro de uma transação
 * que também o marca 'rodando'. Duas instâncias do worker (por engano, ou por
 * launchd disparando de novo antes de a anterior terminar) nunca pegam o mesmo
 * job.
 *
 * Falha NUNCA some: job que estoura tentativas fica 'falhou' com o erro, e o
 * painel mostra. Nada é silenciosamente descartado.
 */

import { agora, emTransacao } from "../core/db.mjs";
import { registrar } from "../core/auditoria.mjs";

const MAX_TENTATIVAS = 3;

export function enfileirar(db, tipo, payload = null, { agendadoPara = null } = {}) {
  const info = db
    .prepare(
      `INSERT INTO jobs (tipo, payload, status, agendado_para, criado_em)
       VALUES (?, ?, 'pendente', ?, ?)`,
    )
    .run(tipo, payload === null ? null : JSON.stringify(payload), agendadoPara ?? agora(), agora());
  return Number(info.lastInsertRowid);
}

/** Reivindica atomicamente o próximo job devido. Retorna null se não houver. */
export function reivindicar(db) {
  return emTransacao(db, () => {
    const job = db
      .prepare(
        `SELECT * FROM jobs
          WHERE status = 'pendente' AND agendado_para <= ?
          ORDER BY agendado_para ASC, id ASC
          LIMIT 1`,
      )
      .get(agora());
    if (!job) return null;

    const r = db
      .prepare(
        `UPDATE jobs SET status = 'rodando', iniciado_em = ?, tentativas = tentativas + 1
          WHERE id = ? AND status = 'pendente'`,
      )
      .run(agora(), job.id);
    if (r.changes === 0) return null; // outra instância pegou primeiro

    // O SELECT acima leu `tentativas` ANTES do incremento. Devolver o valor
    // cru daria uma tentativa extra ao job (off-by-one), e um job que falha
    // sempre rodaria 4 vezes em vez de 3. Aqui `tentativas` já inclui esta.
    return {
      ...job,
      tentativas: job.tentativas + 1,
      payload: job.payload ? JSON.parse(job.payload) : null,
    };
  });
}

export function concluirJob(db, id) {
  db.prepare("UPDATE jobs SET status = 'concluido', concluido_em = ? WHERE id = ?").run(agora(), id);
}

/** Reagenda se ainda houver tentativa; senão marca 'falhou' — visível, nunca oculto. */
export function falharJob(db, job, erro, { backoffMs = 60_000 } = {}) {
  const msg = String(erro?.stack ?? erro).slice(0, 4000);
  if (job.tentativas < MAX_TENTATIVAS) {
    const proxima = new Date(Date.now() + backoffMs * job.tentativas).toISOString();
    db.prepare("UPDATE jobs SET status = 'pendente', agendado_para = ?, erro = ? WHERE id = ?")
      .run(proxima, msg, job.id);
    return { reagendado: true, proxima };
  }
  db.prepare("UPDATE jobs SET status = 'falhou', concluido_em = ?, erro = ? WHERE id = ?")
    .run(agora(), msg, job.id);
  return { reagendado: false };
}

/**
 * Processa a fila até esvaziar.
 * `manipuladores` é um mapa tipo -> função async(payload, ctx).
 */
export async function processarFila(db, manipuladores, { log = console, ator = "sistema", maxJobs = 100 } = {}) {
  const resumo = { concluidos: 0, falhos: 0, reagendados: 0 };

  for (let i = 0; i < maxJobs; i++) {
    const job = reivindicar(db);
    if (!job) break;

    const fn = manipuladores[job.tipo];
    if (!fn) {
      falharJob(db, job, new Error(`sem manipulador para o tipo "${job.tipo}"`));
      resumo.falhos++;
      continue;
    }

    try {
      await fn(job.payload, { db, job });
      concluirJob(db, job.id);
      registrar(db, { ator, evento: "job_concluido", entidade: "job", entidadeId: job.id,
                      detalhes: { tipo: job.tipo } });
      resumo.concluidos++;
    } catch (erro) {
      const r = falharJob(db, job, erro);
      registrar(db, { ator, evento: r.reagendado ? "job_reagendado" : "job_falhou",
                      entidade: "job", entidadeId: job.id,
                      detalhes: { tipo: job.tipo, tentativa: job.tentativas, erro: String(erro).slice(0, 300) } });
      log.error?.(`job ${job.id} (${job.tipo}) falhou: ${erro}`);
      r.reagendado ? resumo.reagendados++ : resumo.falhos++;
    }
  }
  return resumo;
}

/**
 * Heartbeat (v2 §1.3-l): sem isto, o sistema pode apodrecer em silêncio e a
 * ausência de alertas ser lida como "está tudo bem".
 */
export function ultimaExecucaoBemSucedida(db, fonte) {
  return db
    .prepare(
      `SELECT encerrado_em FROM fontes_execucao
        WHERE fonte = ? AND status IN ('ok','vazio') AND completo = 1
        ORDER BY encerrado_em DESC LIMIT 1`,
    )
    .get(fonte)?.encerrado_em ?? null;
}

export function saudeDoSistema(db, fontes = ["djen"], { limiteHoras = 48 } = {}) {
  const limite = new Date(Date.now() - limiteHoras * 3600_000).toISOString();
  const problemas = [];
  for (const f of fontes) {
    const ultima = ultimaExecucaoBemSucedida(db, f);
    if (ultima === null) problemas.push({ fonte: f, gravidade: "critico", detalhe: "nunca executou com sucesso" });
    else if (ultima < limite) problemas.push({ fonte: f, gravidade: "critico", detalhe: `última coleta completa em ${ultima}` });
  }
  return { saudavel: problemas.length === 0, problemas, verificadoEm: agora() };
}
