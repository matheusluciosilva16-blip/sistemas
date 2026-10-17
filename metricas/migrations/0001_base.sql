-- Etapa 1 — base: equipe, sessões de login, chaves de API e auditoria.
-- Datas em milissegundos desde 1970 (UTC). A tela converte para o horário de Brasília.

CREATE TABLE usuarios (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  nome        TEXT    NOT NULL,
  email       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  senha_hash  TEXT    NOT NULL,
  papel       TEXT    NOT NULL CHECK (papel IN ('admin', 'equipe')),
  ativo       INTEGER NOT NULL DEFAULT 1,
  criado_em   INTEGER NOT NULL
);

-- O cookie guarda um token aleatório; aqui fica só o hash dele.
-- Quem ler o banco não consegue se passar por ninguém.
CREATE TABLE sessoes (
  token_hash  TEXT    PRIMARY KEY,
  usuario_id  INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  criado_em   INTEGER NOT NULL,
  expira_em   INTEGER NOT NULL
);
CREATE INDEX idx_sessoes_usuario ON sessoes(usuario_id);

-- Chaves da agente (Naia) e de qualquer integração futura.
-- A chave completa aparece uma única vez, na criação. Aqui fica só o hash.
CREATE TABLE chaves_api (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  nome         TEXT    NOT NULL,
  prefixo      TEXT    NOT NULL,          -- primeiros caracteres, para reconhecer a chave na lista
  chave_hash   TEXT    NOT NULL UNIQUE,
  escopos      TEXT    NOT NULL,          -- lista separada por vírgula, ex.: "leads:escrever"
  criado_por   INTEGER REFERENCES usuarios(id),
  criado_em    INTEGER NOT NULL,
  ultimo_uso   INTEGER,
  revogada_em  INTEGER
);

-- Tentativas de login que falharam, para travar adivinhação de senha.
CREATE TABLE tentativas_login (
  chave   TEXT    NOT NULL,               -- "email:..." ou "ip:..."
  quando  INTEGER NOT NULL
);
CREATE INDEX idx_tentativas ON tentativas_login(chave, quando);

-- Quem fez o quê. Não guarda dados de lead, só a ação.
CREATE TABLE auditoria (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  quando     INTEGER NOT NULL,
  ator_tipo  TEXT    NOT NULL CHECK (ator_tipo IN ('usuario', 'chave', 'sistema')),
  ator_id    INTEGER,
  acao       TEXT    NOT NULL,
  detalhe    TEXT
);
CREATE INDEX idx_auditoria_quando ON auditoria(quando);
