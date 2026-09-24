# sistemas

Sistemas e automações do escritório. Cada pasta é um projeto independente.

| Pasta | O que é |
|---|---|
| [`naia/`](naia/) | Agente pessoal em VPS, conversa pelo Telegram — configuração, instalador e runbook |

## Regra que vale para todo o repositório

**Nenhum segredo entra aqui.** Token, chave de API, credencial OAuth e chave SSH ficam fora, bloqueados pelo `.gitignore` da raiz. Onde um arquivo de segredo for necessário, versione um `.example` com placeholders.

Antes de commitar algo novo, confira:

```bash
git diff --cached | grep -iE "token|api_key|secret|password|BEGIN .*PRIVATE KEY"
```
