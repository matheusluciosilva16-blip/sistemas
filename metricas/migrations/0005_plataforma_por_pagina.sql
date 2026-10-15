-- A plataforma padrão passa a ser definida por página do site (15/10/2026):
-- o Meta anuncia busca e apreensão e o Google Ads anuncia outra página.
-- Cada página de campanha recebe a sua plataforma; a chave antiga, única, sai.
DELETE FROM ajustes WHERE chave = 'plataforma_padrao';
INSERT OR IGNORE INTO ajustes (chave, valor) VALUES ('plataforma_padrao:busca-e-apreensao', 'meta');
