-- Etapa 2 — CRM: leads e o caminho de cada um até o contrato.
-- Datas em milissegundos (UTC). Valores em centavos, para não haver erro de arredondamento.
--
-- LGPD: só o necessário para as métricas. NÃO existe campo para detalhes do caso.
-- Os motivos são listas fechadas, sem texto livre, justamente para ninguém escrever ali
-- o que aconteceu com a pessoa.

CREATE TABLE leads (
  id                       INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Quem é (apagado na anonimização)
  nome                     TEXT,
  telefone                 TEXT,            -- só dígitos, com DDI: 5522999998888

  -- Quando e por onde chegou
  entrada_em               INTEGER NOT NULL,
  canal                    TEXT    NOT NULL DEFAULT 'whatsapp',
  plataforma               TEXT,            -- google, meta, organico, indicacao, outra (NULL = não se sabe)
  pagina                   TEXT,            -- landing page de origem
  utm_source               TEXT,
  utm_medium               TEXT,
  utm_campaign             TEXT,
  utm_content              TEXT,
  utm_term                 TEXT,
  campanha                 TEXT,            -- nome ou ID na plataforma, quando conhecido
  conjunto                 TEXT,
  anuncio                  TEXT,
  ref                      TEXT,            -- código de rastreio, se um dia for adotado (ver DECISOES.md)
  area                     TEXT,            -- área do direito / tipo de caso

  -- Andamento
  responsavel_id           INTEGER REFERENCES usuarios(id),
  primeiro_atendimento_em  INTEGER,
  qualificado              INTEGER CHECK (qualificado IN (0, 1)),
  motivo_desqualificacao   TEXT,
  consulta_agendada_para   INTEGER,
  compareceu               INTEGER CHECK (compareceu IN (0, 1)),
  contrato_em              INTEGER,
  honorarios_iniciais      INTEGER,         -- centavos
  exito_estimado           INTEGER,         -- centavos; NULL quando não há êxito no contrato
  perdido_em               INTEGER,
  motivo_perda             TEXT,

  -- Controle
  referencia_externa       TEXT UNIQUE,     -- ID na origem (ex.: conversa da Naia). Evita lead duplicado
  criado_por_tipo          TEXT NOT NULL CHECK (criado_por_tipo IN ('usuario', 'chave')),
  criado_por_id            INTEGER,
  criado_em                INTEGER NOT NULL,
  atualizado_em            INTEGER NOT NULL,
  anonimizado_em           INTEGER
);

CREATE INDEX idx_leads_entrada  ON leads(entrada_em);
CREATE INDEX idx_leads_telefone ON leads(telefone);

-- Etapa atual de cada lead, calculada a partir dos campos — nunca fica dessincronizada.
CREATE VIEW leads_com_etapa AS
SELECT leads.*,
  CASE
    WHEN contrato_em IS NOT NULL            THEN 'contrato'
    WHEN perdido_em IS NOT NULL             THEN 'perdido'
    WHEN qualificado = 0                    THEN 'desqualificado'
    WHEN compareceu = 1                     THEN 'consulta_realizada'
    WHEN compareceu = 0                     THEN 'nao_compareceu'
    WHEN consulta_agendada_para IS NOT NULL THEN 'consulta_agendada'
    WHEN qualificado = 1                    THEN 'qualificado'
    WHEN primeiro_atendimento_em IS NOT NULL THEN 'em_atendimento'
    ELSE 'novo'
  END AS etapa
FROM leads;
