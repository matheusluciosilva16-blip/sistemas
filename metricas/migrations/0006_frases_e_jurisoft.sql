-- Frases de origem do WhatsApp passam a ser editáveis em Configurações (15/10/2026).
-- As frases iniciais (as das landing pages) são gravadas pelo sistema na primeira execução
-- (src/lib/config.js, FRASES_INICIAIS), junto com as opções iniciais das listas.
CREATE TABLE frases_origem (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  frase      TEXT    NOT NULL UNIQUE,   -- trecho da primeira mensagem que identifica a página
  pagina     TEXT,                      -- valor da lista "pagina"
  area       TEXT,                      -- valor da lista "area" (opcional)
  ativo      INTEGER NOT NULL DEFAULT 1,
  criado_em  INTEGER NOT NULL
);

-- A campanha do Google Ads leva ao site da Jurisoft (matheuslucio.jurisoft.site/home).
INSERT OR IGNORE INTO ajustes (chave, valor) VALUES ('plataforma_padrao:jurisoft', 'google');
