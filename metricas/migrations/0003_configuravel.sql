-- CRM configurável: listas editáveis, campos personalizados e ajustes gerais.

-- Opções de cada lista de classificação. As listas do sistema (canal, plataforma, área...)
-- recebem os valores iniciais na primeira execução (src/lib/config.js).
-- Os campos personalizados do tipo "lista" guardam as opções aqui também, com campo = chave do campo.
CREATE TABLE opcoes (
  campo   TEXT    NOT NULL,
  valor   TEXT    NOT NULL,
  rotulo  TEXT    NOT NULL,
  ordem   INTEGER NOT NULL DEFAULT 0,
  ativo   INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (campo, valor)
);

-- "Colunas" novas do lead, criadas pelo administrador.
CREATE TABLE campos_personalizados (
  chave      TEXT    PRIMARY KEY,
  rotulo     TEXT    NOT NULL,
  tipo       TEXT    NOT NULL CHECK (tipo IN ('lista', 'sim_nao', 'numero', 'dinheiro', 'data', 'texto')),
  secao      TEXT    NOT NULL DEFAULT 'andamento',
  na_lista   INTEGER NOT NULL DEFAULT 0,   -- aparece na lista de leads e vira filtro (se for lista)
  ordem      INTEGER NOT NULL DEFAULT 0,
  ativo      INTEGER NOT NULL DEFAULT 1,
  criado_em  INTEGER NOT NULL
);

-- Valores dos campos personalizados de cada lead, em JSON: {"chave": valor}
ALTER TABLE leads ADD COLUMN extras TEXT;

CREATE TABLE ajustes (
  chave  TEXT PRIMARY KEY,
  valor  TEXT
);
-- O cliente anuncia só no Meta por enquanto (15/10/2026).
INSERT INTO ajustes (chave, valor) VALUES ('plataforma_padrao', 'meta');

-- A view precisa ser recriada para incluir a coluna nova.
DROP VIEW leads_com_etapa;
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
