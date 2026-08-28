-- 003 — Memória do briefing: o que já foi relatado.
--
-- O briefing do dia mostra NOVIDADES. Sem este registro, a mesma intimação
-- reapareceria como nova a cada manhã (a janela de coleta é sobreposta de
-- propósito — perder um dia de coleta não pode significar perder um item).
CREATE TABLE briefing_itens (
  comunicacao_id INTEGER NOT NULL REFERENCES comunicacoes(id),
  briefing_data  TEXT NOT NULL,               -- AAAA-MM-DD do briefing que o relatou
  PRIMARY KEY (comunicacao_id)
) STRICT;
