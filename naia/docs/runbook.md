# Runbook — diagnóstico da Naia

Problemas reais que já aconteceram, com a causa e a correção.

## "the model provider failed after retries"

O modelo configurado foi aposentado pela OpenAI.

```bash
ssh root@VPS "grep -iE 'model_not_found|404' /root/.hermes/logs/errors.log | tail -5"
```

Aconteceu em 08/09/2026 com o `gpt-5.5`. Corrigido trocando para `gpt-6-astra`.

**Listar os modelos que a conta entrega** (o `client_version` importa — valores antigos devolvem lista quase vazia):

```bash
TOK=$(jq -r '.credential_pool."openai-codex"[0].access_token' /root/.hermes/auth.json)
curl -s -H "Authorization: Bearer $TOK" \
  "https://chatgpt.com/backend-api/codex/models?client_version=1.0.0" | jq -r '.models[].slug'
```

Estar na lista **não** garante acesso — o `gpt-5.5` continuava listado e dava 404. Teste de verdade:

```bash
hermes --provider openai-codex -m MODELO -z "Responda apenas: OK"
```

O `-m` sozinho falha com "No LLM provider configured"; o `--provider` é obrigatório junto.

Alternativas confirmadas em 09/2026: `gpt-6-astra` (multiagente v2, esforço xhigh), `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`.

## "Provider authentication failed"

**Quase sempre não é credencial — é cota estourada.** Ao tomar HTTP 429, o Hermes marca a credencial como esgotada e passa a relatar "No Codex credentials stored".

```bash
ssh root@VPS "grep usage_limit_reached /root/.hermes/logs/errors.log | tail -3"
```

Se o corpo trouxer `{"type":"usage_limit_reached","plan_type":"plus","resets_in_seconds":N}`, é cota e volta sozinha. Confirme que a credencial está sadia:

```bash
jq -r '.credential_pool."openai-codex"[0].last_status' /root/.hermes/auth.json   # ok = credencial boa
hermes auth reset openai-codex                                                    # destrava apos o reset
```

**Causa raiz (23/09/2026):** o contexto inchava até 110–129 mil tokens por chamada porque `compression.threshold` estava em 0.5. Ajustado para 0.25, junto com `reasoning_effort: medium`, `max_turns: 40`, `delegation.max_iterations: 25` e `max_concurrent_children: 3`.

**Cota do Plus zerada com poucas mensagens (28/09/2026).** O painel do ChatGPT (Uso e limites) mostrou o limite de 5 horas em 0% e o semanal em 20% depois de só três mensagens no Telegram. O `gpt-6-astra` é multiagente: uma mensagem que usa ferramentas (Drive via Maton, por exemplo) vira dezenas de chamadas. Modelo trocado para `gpt-5.6-terra` para gastar menos cota, mas depois disso a Naia passou a responder "The model provider failed after retries", a mesma mensagem de modelo inacessível descrita acima. Voltou para `gpt-6-astra` em 03/10/2026. Antes de trocar de modelo de novo, teste na VPS com `hermes --provider openai-codex -m MODELO -z "Responda apenas: OK"`.

Confira a cota em chatgpt.com, em Configurações → Uso e limites, antes de suspeitar de credencial.

## Ela parou de guardar o que aprende

Limite de memória cheio. Aparece só como WARNING:

```
Memory at 2,095/2,200 chars. Adding this entry would exceed the limit.
```

Os padrões do pacote são apertados. Ajustados para `memory_char_limit: 10000` e `user_char_limit: 5000`.

## Armadilhas da instalação

- **`hermes login` não existe.** O comando é `hermes auth add <provider> --type oauth --no-browser --manual-paste`.
- **`setup-hermes.sh` retorna erro mesmo dando certo.** Valide pela existência de `venv/bin/hermes`, nunca pelo código de saída.
- **`auth.lock` órfão** em `/root/.hermes/` bloqueia nova autenticação. Apague antes de retentar.
- **A saída do `hermes auth` só aparece com pty real.** Rode dentro de `screen`; com pipe ou redirect o Python bufferiza e nada aparece até o processo morrer. Para ler: `screen -S hauth -X hardcopy -h /tmp/scr.txt`. Para guardar o erro mesmo se a sessão morrer: `screen -dmS nome -L -Logfile /tmp/x.log`.
- **SIGHUP mata a instalação.** Lance com `setsid nohup ... < /dev/null > log 2>&1 &` e faça o polling numa chamada SSH separada.
- **journald do usuário não persiste.** Os logs úteis são `/root/.hermes/logs/gateway.log` e `errors.log`.

## Claude como provedor: não funciona

Tentado em 23/09/2026. O fluxo gera o link e aceita o código, mas falha na troca do token:

```
Token exchange failed: HTTP Error 404: Not Found
```

O endpoint `https://console.anthropic.com/v1/oauth/token` não existe mais. O Hermes v0.15.1 autentica reusando a credencial do Claude Code (mesmo `client_id`, mesmo prefixo de sistema), e esse caminho quebrou.

Alternativa sancionada: chave de API da Anthropic, com teto de gasto.

## Onde olhar primeiro

```bash
ssh root@VPS "
  export XDG_RUNTIME_DIR=/run/user/0
  systemctl --user is-active hermes-gateway.service
  tail -20 /root/.hermes/logs/errors.log
  tail -10 /root/.hermes/logs/gateway.log
"
```

## O instalador sobrescreveu a Naia (27/09/2026)

Rodar um instalador de novo na mesma VPS, com a ideia de criar uma segunda Naia, **não cria outra**: ele grava por cima de `/root/.hermes/` (`config.yaml`, `.env`, `SOUL.md`, `AGENTS.md`), e o serviço usa `--replace`, que derruba qualquer gateway em execução.

Sintomas: o bot antigo parou de responder, a Naia passou a atender pelo bot novo e perdeu o acesso ao Google Drive.

Causa: o `.env` foi recriado a partir do modelo. Perdeu o token do bot antigo e as chaves da Maton.

Correção, feita editando `/root/.hermes/.env` na VPS (`nano /root/.hermes/.env`) e reiniciando o serviço:

- `TELEGRAM_BOT_TOKEN` de volta ao token do bot antigo (@BotFather → `/mybots` → bot → API Token)
- `MATON_API_KEY` e `MATON_AI_API_KEY`, as duas com a mesma chave do painel da Maton. As skills usam um nome ou o outro.

O `.env` não tem backup automático. Depois de mexer nele, tire um snapshot da VPS no painel da Hostinger.

Para ter duas Naias de verdade, cada uma precisa de `HERMES_HOME` e unidade systemd próprios.
