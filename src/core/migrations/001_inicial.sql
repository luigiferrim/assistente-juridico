-- =============================================================================
-- 001 — Schema inicial
--
-- Convenções inegociáveis deste schema:
--   * Tabelas STRICT: o SQLite recusa tipo errado em vez de coagir em silêncio.
--   * Dinheiro SEMPRE em centavos (INTEGER). Nunca REAL — float não representa
--     R$ 0,10 exatamente, e aqui erro de centavo vira erro em petição.
--   * Datas em TEXT ISO-8601 ('AAAA-MM-DD' ou completo com fuso).
--   * Booleanos em INTEGER com CHECK (0,1).
--   * `audit_log` é append-only, garantido por trigger — não por disciplina.
-- =============================================================================

-- ---------- Cadastro ---------------------------------------------------------

CREATE TABLE processos (
  numero_cnj        TEXT PRIMARY KEY,        -- só dígitos, 20 posições
  numero_formatado  TEXT NOT NULL,
  tribunal          TEXT NOT NULL,
  orgao             TEXT,
  classe            TEXT,
  cliente_id        INTEGER REFERENCES partes(id),
  nivel_sigilo      INTEGER NOT NULL DEFAULT 0,
  ativo             INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0,1)),
  criado_em         TEXT NOT NULL,
  atualizado_em     TEXT NOT NULL
) STRICT;

-- Destinatário de e-mail NUNCA sai de documento — sai daqui, e só se validado.
CREATE TABLE partes (
  id                 INTEGER PRIMARY KEY,
  nome               TEXT NOT NULL,
  tipo               TEXT NOT NULL CHECK (tipo IN ('cliente','empresa','contato','perito','outro')),
  email              TEXT,
  email_validado_em  TEXT,                   -- NULL = nunca usar para envio
  telefone           TEXT,
  documento          TEXT,                   -- CPF/CNPJ
  observacoes        TEXT,
  criado_em          TEXT NOT NULL
) STRICT;

CREATE INDEX idx_partes_email ON partes(email) WHERE email IS NOT NULL;

-- ---------- Ingestão ---------------------------------------------------------

-- Uma linha por fonte por execução. `completo` é a lição do S2: coleta que
-- falhou no meio JAMAIS pode ser lida como "não havia nada".
CREATE TABLE fontes_execucao (
  id             INTEGER PRIMARY KEY,
  fonte          TEXT NOT NULL,              -- 'djen' | 'gmail' | 'pasta' | 'datajud'
  iniciado_em    TEXT NOT NULL,
  encerrado_em   TEXT,
  status         TEXT NOT NULL CHECK (status IN ('rodando','ok','vazio','falhou')),
  completo       INTEGER CHECK (completo IN (0,1)),
  motivo         TEXT,
  itens_obtidos  INTEGER NOT NULL DEFAULT 0,
  parametros     TEXT                        -- JSON da consulta, para auditoria
) STRICT;

CREATE INDEX idx_fontes_exec ON fontes_execucao(fonte, iniciado_em DESC);

-- Comunicações do DJEN (fonte primária de detecção — ver decisão D1/D2).
CREATE TABLE comunicacoes (
  id                    INTEGER PRIMARY KEY,
  djen_id               INTEGER NOT NULL UNIQUE,   -- id da API
  hash_djen             TEXT NOT NULL,
  numero_cnj            TEXT NOT NULL,
  tribunal              TEXT NOT NULL,
  orgao                 TEXT,
  tipo_comunicacao      TEXT,
  tipo_documento        TEXT,
  data_disponibilizacao TEXT NOT NULL,
  texto                 TEXT NOT NULL,
  texto_sha256          TEXT NOT NULL,
  link                  TEXT,
  bruto                 TEXT NOT NULL,             -- JSON original, íntegro
  execucao_id           INTEGER NOT NULL REFERENCES fontes_execucao(id),
  criado_em             TEXT NOT NULL
) STRICT;

CREATE INDEX idx_com_processo ON comunicacoes(numero_cnj);
CREATE INDEX idx_com_data ON comunicacoes(data_disponibilizacao DESC);

-- Documentos binários (atas em PDF, anexos). Dedupe por hash do conteúdo.
CREATE TABLE documentos (
  id                INTEGER PRIMARY KEY,
  sha256            TEXT NOT NULL UNIQUE,
  origem            TEXT NOT NULL CHECK (origem IN ('gmail','pasta','djen','manual')),
  nome_arquivo      TEXT,
  caminho           TEXT,
  numero_cnj        TEXT,
  paginas           INTEGER,
  tem_camada_texto  INTEGER CHECK (tem_camada_texto IN (0,1)),
  texto_extraido    TEXT,
  criado_em         TEXT NOT NULL
) STRICT;

-- ---------- Extração e validação ---------------------------------------------

CREATE TABLE extracoes (
  id              INTEGER PRIMARY KEY,
  documento_id    INTEGER REFERENCES documentos(id),
  comunicacao_id  INTEGER REFERENCES comunicacoes(id),
  modelo          TEXT NOT NULL,
  versao_prompt   TEXT NOT NULL,
  passagem        INTEGER NOT NULL DEFAULT 1,   -- dupla extração: 1 e 2
  json_bruto      TEXT NOT NULL,
  tokens_entrada  INTEGER,
  tokens_saida    INTEGER,
  custo_centavos  INTEGER,
  criado_em       TEXT NOT NULL,
  CHECK (documento_id IS NOT NULL OR comunicacao_id IS NOT NULL)
) STRICT;

-- Fato extraído. `trecho` e `pagina` são a espinha dorsal da auditabilidade:
-- sem trecho verificável, o fato não vira proposta.
CREATE TABLE fatos (
  id                  INTEGER PRIMARY KEY,
  extracao_id         INTEGER NOT NULL REFERENCES extracoes(id),
  numero_cnj          TEXT NOT NULL,
  tipo                TEXT NOT NULL,          -- 'prazo','valor','audiencia','obrigacao','conta'
  chave_natural       TEXT NOT NULL UNIQUE,   -- idempotência de fato
  valor_centavos      INTEGER,
  data_referencia     TEXT,
  descricao           TEXT NOT NULL,
  trecho              TEXT,
  pagina              INTEGER,
  status_validacao    TEXT NOT NULL CHECK (status_validacao IN (
                        'verificado',            -- trecho confere literalmente
                        'nao_verificavel',       -- PDF sem camada de texto (v2 §1.2-b)
                        'divergente',            -- dupla extração discordou
                        'alucinacao_detectada'   -- trecho não existe no documento
                      )),
  criado_em           TEXT NOT NULL
) STRICT;

CREATE INDEX idx_fatos_processo ON fatos(numero_cnj);

-- ---------- Proposta → aprovação → execução ----------------------------------

CREATE TABLE acoes_propostas (
  id              INTEGER PRIMARY KEY,
  fato_id         INTEGER REFERENCES fatos(id),
  tipo            TEXT NOT NULL CHECK (tipo IN ('evento','tarefa','email_rascunho','pergunta')),
  chave_idempotencia TEXT NOT NULL UNIQUE,
  payload         TEXT NOT NULL,              -- JSON da ação proposta
  status          TEXT NOT NULL CHECK (status IN ('pendente','aprovada','rejeitada','executada','expirada')),
  criado_em       TEXT NOT NULL
) STRICT;

-- Token de uso único. É o que impede execução sem aprovação humana.
CREATE TABLE aprovacoes (
  id              INTEGER PRIMARY KEY,
  acao_id         INTEGER NOT NULL REFERENCES acoes_propostas(id),
  token           TEXT NOT NULL UNIQUE,
  aprovado_por    TEXT NOT NULL,
  decisao         TEXT NOT NULL CHECK (decisao IN ('aprovado','aprovado_com_edicao','rejeitado')),
  payload_editado TEXT,
  justificativa   TEXT,
  criado_em       TEXT NOT NULL,
  consumido_em    TEXT                        -- NULL = ainda não usado
) STRICT;

-- Guarda de idempotência: a linha é criada ANTES de chamar a API externa.
-- Ver v2 §1.2-a — o Google não garante detectar colisão de ID.
CREATE TABLE execucoes (
  id                  INTEGER PRIMARY KEY,
  chave_idempotencia  TEXT NOT NULL UNIQUE,
  acao_id             INTEGER REFERENCES acoes_propostas(id),
  aprovacao_id        INTEGER REFERENCES aprovacoes(id),
  servico             TEXT NOT NULL,          -- 'google_calendar' | 'gmail'
  operacao            TEXT NOT NULL,
  status              TEXT NOT NULL CHECK (status IN ('reservada','sucesso','falhou','revertida')),
  id_externo          TEXT,
  erro                TEXT,
  reversivel_ate      TEXT,
  criado_em           TEXT NOT NULL,
  concluido_em        TEXT
) STRICT;

-- ---------- Auditoria (APPEND-ONLY) ------------------------------------------

CREATE TABLE audit_log (
  id            INTEGER PRIMARY KEY,
  ocorrido_em   TEXT NOT NULL,
  ator          TEXT NOT NULL,               -- 'sistema' | e-mail da usuária
  evento        TEXT NOT NULL,
  entidade      TEXT,
  entidade_id   TEXT,
  detalhes      TEXT                          -- JSON
) STRICT;

CREATE INDEX idx_audit_tempo ON audit_log(ocorrido_em DESC);

-- A garantia não é convenção: o banco recusa.
CREATE TRIGGER audit_log_sem_update
BEFORE UPDATE ON audit_log
BEGIN
  SELECT RAISE(ABORT, 'audit_log e append-only: UPDATE proibido');
END;

CREATE TRIGGER audit_log_sem_delete
BEFORE DELETE ON audit_log
BEGIN
  SELECT RAISE(ABORT, 'audit_log e append-only: DELETE proibido');
END;

-- ---------- Apoio ------------------------------------------------------------

-- Feriados e suspensões. `origem` é obrigatória: toda data precisa de fonte
-- citável (lei, ato do TRT). Ver v2 §1.2-e.
CREATE TABLE feriados (
  id            INTEGER PRIMARY KEY,
  data_inicio   TEXT NOT NULL,
  data_fim      TEXT NOT NULL,
  descricao     TEXT NOT NULL,
  abrangencia   TEXT NOT NULL CHECK (abrangencia IN ('nacional','estadual','tribunal')),
  tribunal      TEXT,
  origem        TEXT NOT NULL,               -- 'CLT art. 775-A', 'Ato TRT12 nº X/2026'
  confirmado_em TEXT,                        -- NULL = não conferido por humano
  criado_em     TEXT NOT NULL,
  CHECK (data_fim >= data_inicio)
) STRICT;

CREATE INDEX idx_feriados_periodo ON feriados(data_inicio, data_fim);

CREATE TABLE regras (
  id         INTEGER PRIMARY KEY,
  tipo       TEXT NOT NULL,                  -- 'triagem_email' | 'relevancia'
  expressao  TEXT NOT NULL,
  acao       TEXT NOT NULL,
  prioridade INTEGER NOT NULL DEFAULT 100,
  ativa      INTEGER NOT NULL DEFAULT 1 CHECK (ativa IN (0,1)),
  criado_em  TEXT NOT NULL
) STRICT;

CREATE TABLE jobs (
  id            INTEGER PRIMARY KEY,
  tipo          TEXT NOT NULL,
  payload       TEXT,
  status        TEXT NOT NULL CHECK (status IN ('pendente','rodando','concluido','falhou')),
  tentativas    INTEGER NOT NULL DEFAULT 0,
  agendado_para TEXT NOT NULL,
  iniciado_em   TEXT,
  concluido_em  TEXT,
  erro          TEXT,
  criado_em     TEXT NOT NULL
) STRICT;

CREATE INDEX idx_jobs_pendentes ON jobs(status, agendado_para);
