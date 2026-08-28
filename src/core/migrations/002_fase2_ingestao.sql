-- 002 — Fase 2: ingestão DJEN multi-OAB e obrigações conhecidas.

-- A consulta ao DJEN é feita por OAB (D2/D10/D18: três inscrições no
-- escritório), e a MESMA comunicação pode voltar em mais de uma consulta.
-- A comunicação é única (djen_id); o vínculo com cada OAB fica aqui.
CREATE TABLE comunicacoes_oab (
  comunicacao_id INTEGER NOT NULL REFERENCES comunicacoes(id),
  oab            TEXT NOT NULL,                -- '10001/SC'
  PRIMARY KEY (comunicacao_id, oab)
) STRICT;

-- Obrigações com data — parcelas de acordo, custas, honorários — extraídas de
-- atas homologadas. É o que faz um vencimento "ressurgir" no briefing na hora
-- certa: extrai uma vez, lembra até vencer.
-- Obrigação CONDICIONAL (Lacuna 4 do REGRA-DO-ESCRITORIO.md): vencimento NULL
-- + gatilho preenchido; só ganha data quando um humano confirmar o gatilho.
CREATE TABLE obrigacoes (
  id             INTEGER PRIMARY KEY,
  chave_natural  TEXT NOT NULL UNIQUE,
  numero_cnj     TEXT NOT NULL,
  partes         TEXT NOT NULL,                -- 'Fulano × Empresa' — partes sempre visíveis (regra de 10/08)
  tipo           TEXT NOT NULL CHECK (tipo IN ('parcela','custas','honorarios_periciais','outro')),
  descricao      TEXT NOT NULL,
  valor_centavos INTEGER,
  vencimento     TEXT,                         -- AAAA-MM-DD · NULL = aguardando gatilho
  gatilho        TEXT,
  advogado_oab   TEXT NOT NULL,                -- '10001/SC'
  status         TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','pago','cancelado')),
  fonte          TEXT NOT NULL,                -- proveniência citável (qual ata, qual e-mail)
  criado_em      TEXT NOT NULL
) STRICT;

CREATE INDEX idx_obrig_pendentes ON obrigacoes(vencimento) WHERE status = 'pendente';
