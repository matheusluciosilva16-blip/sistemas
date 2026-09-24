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
