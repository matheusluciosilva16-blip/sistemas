# Naia — configuração e runbook

Configuração versionada da **Naia**, agente pessoal rodando em VPS e conversando pelo Telegram.

> **Nenhum segredo entra neste repositório.** Token do bot e credenciais OAuth ficam apenas na VPS, em `/root/.hermes/.env` (permissão 600) e `/root/.hermes/auth.json`. Veja `.gitignore`.

## O que tem aqui

| Caminho | O que é |
|---|---|
| `hermes/config.yaml` | Configuração do agente — modelo, memória, compressão, subagentes |
| `hermes/SOUL.md` | Identidade e personalidade dela |
| `hermes/AGENTS.md` | Regras operacionais |
| `hermes/.env.example` | Modelo do `.env` real, com placeholders |
| `systemd/hermes-gateway.service` | Unidade systemd do gateway |
| `scripts/instalar-naia.sh` | Instalação completa, etapas 1/2/3/5 |
| `docs/runbook.md` | Diagnóstico dos problemas que já aconteceram |

## Ambiente

```
VPS       Hostinger, Ubuntu 22.04, 8 GB RAM, 2 vCPU
Runtime   Hermes Agent v0.15.1, tag v2026.5.29 (pin intencional)
Modelo    gpt-6-astra via provider openai-codex (OAuth ChatGPT Plus)
Canal     Telegram, polling
Serviço   systemd user + loginctl enable-linger root
```

## Aplicar uma mudança de configuração

```bash
scp hermes/config.yaml root@VPS:/root/.hermes/config.yaml
ssh root@VPS "XDG_RUNTIME_DIR=/run/user/0 systemctl --user restart hermes-gateway.service"
```

Confirme com `systemctl --user is-active hermes-gateway.service` — tem que responder `active`.

## Trazer de volta o que está na VPS

```bash
scp root@VPS:/root/.hermes/{config.yaml,SOUL.md,AGENTS.md} hermes/
```

Faça isso antes de commitar: ela edita o próprio `SOUL.md` e `AGENTS.md` conforme incorpora documentos de treinamento, então a VPS costuma estar à frente do repositório.

## Regras que não devem ser quebradas

1. **Nunca commitar `.env` ou `auth.json`.**
2. **Não rodar `hermes update`.** O pin em `v2026.5.29` é proposital; a versão nova já removeu comandos que usamos.
3. **Instalar sempre desacoplado do SSH** (`setsid nohup ... &`). Preso à sessão, o processo morre de SIGHUP e deixa o ambiente Python incompleto.
4. **Snapshot da VPS antes de qualquer atualização.** A configuração já foi perdida uma vez com o cancelamento de uma VPS.

## Sincronização automática

A VPS busca este repositório **a cada 5 minutos** e aplica as mudanças sozinha. Edite pelo celular, faça commit, e em poucos minutos a Naia está atualizada — sem computador.

```
scripts/naia-sync.sh  →  /usr/local/bin/naia-sync   (cron: */5 * * * *)
```

**O que é sincronizado:** `config.yaml`, `SOUL.md`, `AGENTS.md` e a unidade systemd. O serviço só reinicia se algo realmente mudou.

### A proteção que importa

A Naia **edita o próprio `SOUL.md` e `AGENTS.md`** conforme incorpora treinamento. Se o sincronizador simplesmente sobrescrevesse, apagaria o aprendizado dela.

Por isso ele compara três estados: o do repositório, o da VPS e o da última sincronização. Se o arquivo na VPS mudou desde a última vez, quem editou foi ela — e aí **não sobrescreve**, registra conflito e segue:

```
CONFLITO em SOUL.md — a Naia alterou este arquivo na VPS. Nao sobrescrevi.
```

Para fazer a versão do repositório vencer um conflito, na VPS:

```bash
rm /root/.naia-sync-state/SOUL.md.md5 && naia-sync
```

### Outras salvaguardas

- **Backup antes de cada aplicação**, em `/root/.naia-backups/` (30 versões de cada arquivo)
- **Reversão automática:** se o serviço não subir após a mudança, o script restaura o backup e reinicia
- **Snapshot do aprendizado dela** em `/root/.naia-backups/aprendizado/`, sempre que ela edita algo sozinha

### Acompanhar

```bash
ssh -i ~/.ssh/naia_vps root@179.199.141.105 "tail -20 /root/.hermes/logs/naia-sync.log"
```

### Sentido inverso

A deploy key da VPS é **somente leitura** — ela não escreve no repositório. Isso é proposital: a Naia roda como root sem trava de aprovação, e uma chave de escrita ali seria risco desnecessário.

Para trazer o aprendizado dela de volta ao repositório, a partir de um computador:

```bash
scp -i ~/.ssh/naia_vps root@179.199.141.105:/root/.hermes/{SOUL.md,AGENTS.md} naia/hermes/
```
