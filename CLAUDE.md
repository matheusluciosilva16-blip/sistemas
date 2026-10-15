# sistemas — instruções para o Claude

Repositório de sistemas e automações do escritório Matheus Lucio Silva — Advogado.
Cada pasta é um projeto independente; leia o README da pasta antes de mexer nela.

- `metricas/` — métricas de tráfego pago e CRM (Cloudflare Workers + D1). Decisões em
  `metricas/DECISOES.md`. Push na `main` publica sozinho no Cloudflare.
- `naia/` — agente pessoal em VPS. A VPS sincroniza `config.yaml`, `SOUL.md`, `AGENTS.md` e a
  unidade systemd a cada 5 minutos; leia `naia/README.md` antes de alterar esses arquivos.

## Como o Matheus prefere trabalhar

- **Faça sozinho tudo o que puder** e reduza o trabalho dele ao mínimo (pedido de 15/10/2026).
  Isso inclui abrir e juntar PRs dos próprios ajustes quando os testes passarem. Peça ação a
  ele só para o que exige a conta dele (Cloudflare, Google, Meta, VPS) e, nesse caso, dê o
  passo a passo clique a clique.
- Ele não é programador: explique em linguagem simples.
- Nenhum segredo entra no repositório (ver README da raiz). Nunca peça token ou senha no chat.
