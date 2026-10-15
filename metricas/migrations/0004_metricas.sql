-- Etapas 3 e 4 — dados dos anúncios (importados por CSV) e ligação campanha → página.

-- Um registro por dia × campanha × conjunto × anúncio. Valores em centavos.
CREATE TABLE anuncios_diario (
  plataforma     TEXT    NOT NULL,          -- meta, google
  data           TEXT    NOT NULL,          -- AAAA-MM-DD (fuso da conta de anúncios)
  campanha       TEXT    NOT NULL DEFAULT '',
  conjunto       TEXT    NOT NULL DEFAULT '',
  anuncio        TEXT    NOT NULL DEFAULT '',
  investimento   INTEGER NOT NULL DEFAULT 0,
  impressoes     INTEGER NOT NULL DEFAULT 0,
  alcance        INTEGER,
  cliques_link   INTEGER,
  lp_views       INTEGER,                   -- visualizações da página de destino
  video_3s       INTEGER,
  video_25       INTEGER,
  video_50       INTEGER,
  video_75       INTEGER,
  video_100      INTEGER,
  thruplays      INTEGER,
  conversas      INTEGER,                   -- conversas por mensagem iniciadas (anúncio de WhatsApp)
  importacao_id  INTEGER NOT NULL,
  PRIMARY KEY (plataforma, data, campanha, conjunto, anuncio)
);
CREATE INDEX idx_anuncios_data ON anuncios_diario(data);

CREATE TABLE importacoes (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  plataforma     TEXT    NOT NULL,
  arquivo        TEXT,
  linhas         INTEGER NOT NULL,
  data_inicio    TEXT,
  data_fim       TEXT,
  avisos         TEXT,
  criado_por     INTEGER REFERENCES usuarios(id),
  criado_em      INTEGER NOT NULL
);

-- Qual página do site cada campanha anuncia. É o que liga o investimento aos leads do CRM,
-- já que a mensagem do WhatsApp identifica a página, e não a campanha.
CREATE TABLE campanhas_paginas (
  plataforma  TEXT NOT NULL,
  campanha    TEXT NOT NULL,
  pagina      TEXT,                          -- NULL = não anuncia uma página do site
  PRIMARY KEY (plataforma, campanha)
);
