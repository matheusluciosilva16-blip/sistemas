# API do CRM — guia para a Naia (e outras integrações)

Endereço base: `https://ENDERECO-DO-WORKER/api/v1`

Toda chamada leva a chave no cabeçalho:

```
Authorization: Bearer mls_...
Content-Type: application/json
```

A chave é criada no painel, em **Chaves de API**, e fica só no `.env` de quem a usa.
Nunca no GitHub, nunca em mensagem.

---

## Regras que a agente precisa seguir

1. **Nunca enviar detalhes do caso.** O CRM recusa qualquer campo fora da lista abaixo
   (`422 Campo desconhecido`). Não existe campo de observação, e isso é de propósito (LGPD).
2. **Um lead por pessoa.** Se a mesma `referencia_externa`, ou o mesmo telefone nos últimos
   90 dias, já existir, o CRM **devolve o lead existente** (`ja_existia: true`) em vez de
   duplicar. Pode chamar a criação sem medo de contar duas vezes.
3. **Primeiro atendimento = primeira resposta de uma pessoa da equipe.** Resposta automática
   não conta, senão o tempo de resposta vira sempre zero e o indicador perde o sentido.
4. **Datas sem fuso valem como horário de Brasília.** Também aceita `"agora"`.
5. **Valores em reais:** `3500`, `3500.50` ou `"3.500,50"`.

---

## Fluxo recomendado

### 1. Chegou mensagem nova no WhatsApp → criar o lead

```http
POST /leads
{
  "nome": "Maria Souza",
  "telefone": "(22) 99999-8888",
  "entrada_em": "2026-10-15T09:12",
  "mensagem_inicial": "Olá! Tive valores bloqueados judicialmente na minha conta e gostaria de orientação.",
  "referencia_externa": "whatsapp-5522999998888-2026-10-15"
}
```

`mensagem_inicial` serve **só** para reconhecer de qual página do site a pessoa veio. O CRM
compara a mensagem com as frases do site, preenche `pagina` e `area`, e **descarta a mensagem**:
ela não é gravada. A resposta diz o que foi reconhecido:

```json
{ "ja_existia": false, "origem_identificada": "conta-bloqueada", "lead": { "id": 12, "etapa": "novo", ... } }
```

| Frase do site (início) | `pagina` | `area` |
|---|---|---|
| Estou com um problema de busca e apreensão no meu veículo | `busca-e-apreensao` | `busca_apreensao` |
| Tive valores bloqueados judicialmente na minha conta | `conta-bloqueada` | `conta_bloqueada` |
| Preciso de orientação sobre uma situação criminal urgente | `criminal` | `criminal` |
| Gostaria de orientação jurídica | `entrada` | *(não define)* |

⚠️ **A frase não diz se a pessoa veio do Google ou do Meta**: as duas plataformas levam à mesma
página. Se a plataforma for conhecida (a pessoa contou, ou veio de anúncio de clique para
WhatsApp do Meta), informe `plataforma`. Se não, deixe vazio: é melhor "não se sabe" do que um
chute, que distorceria o CAC de cada plataforma.

### 2. A equipe respondeu pela primeira vez

```http
PATCH /leads/12
{ "primeiro_atendimento_em": "agora" }
```

### 3. Triagem

```http
PATCH /leads/12
{ "qualificado": true }
```

ou, se não for caso do escritório:

```http
PATCH /leads/12
{ "motivo_desqualificacao": "fora_da_regiao" }
```

(Informar o motivo já marca `qualificado: false`.)

### 4. Consulta

```http
PATCH /leads/12
{ "consulta_agendada_para": "2026-10-20T14:00" }
```

Depois: `{ "compareceu": true }` ou `{ "compareceu": false }`.

### 5. Desfecho

Fechou:

```http
PATCH /leads/12
{ "contrato_em": "agora", "honorarios_iniciais": 3500, "exito_estimado": 2000 }
```

`exito_estimado` só quando o contrato tiver honorários de êxito; senão, não envie.

Não fechou:

```http
PATCH /leads/12
{ "motivo_perda": "sem_resposta" }
```

Para reabrir um lead perdido: `{ "perdido_em": null }`.

---

## Rotas

| Método e rota | Permissão | O que faz |
|---|---|---|
| `GET /status` | qualquer chave | Testa a chave |
| `GET /opcoes` | qualquer chave | Valores aceitos em cada lista, etapas e frases do site |
| `POST /leads` | `leads:escrever` | Cria (ou devolve o existente) |
| `PATCH /leads/{id}` | `leads:escrever` | Altera só os campos enviados |
| `GET /leads/{id}` | `leads:ler` | Um lead |
| `GET /leads?...` | `leads:ler` | Lista. Filtros: `telefone`, `etapa`, `area`, `plataforma`, `desde`, `ate`, `busca`, `pagina`, `por_pagina` (máx. 100) |

Exemplo, para achar o lead de quem voltou a escrever:
`GET /leads?telefone=22999998888`

A **exclusão a pedido (LGPD)** não está na API. É feita pelo administrador no painel, porque
apaga os dados de forma definitiva.

---

## Campos

| Campo | Tipo | Observação |
|---|---|---|
| `nome` | texto | |
| `telefone` | texto | Qualquer formato. Guardado só com dígitos e DDI 55 |
| `entrada_em` | data | Padrão: agora. Não pode estar no futuro |
| `canal` | lista | `whatsapp` (padrão), `ligacao`, `formulario`, `presencial`, `outro` |
| `plataforma` | lista | `google`, `meta`, `organico`, `indicacao`, `outra`. Deduzida da `utm_source` quando houver |
| `pagina` | lista | `busca-e-apreensao`, `conta-bloqueada`, `criminal`, `entrada` |
| `area` | lista | `busca_apreensao`, `conta_bloqueada`, `criminal`, `outra` |
| `utm_source` … `utm_term` | texto | Quando conhecidos |
| `campanha`, `conjunto`, `anuncio` | texto | Nome ou ID na plataforma |
| `ref` | texto | Código de rastreio (reservado, ver DECISOES.md) |
| `referencia_externa` | texto | ID na origem. Só na criação. Impede duplicidade |
| `primeiro_atendimento_em` | data | Primeira resposta humana |
| `qualificado` | sim/não | |
| `motivo_desqualificacao` | lista | `area_nao_atendida`, `fora_da_regiao`, `so_informacao`, `sem_condicao_financeira`, `contato_invalido`, `duplicado`, `outro` |
| `consulta_agendada_para` | data | |
| `compareceu` | sim/não | Exige consulta agendada |
| `contrato_em` | data | Marca como qualificado automaticamente |
| `honorarios_iniciais` | reais | Exige `contrato_em` |
| `exito_estimado` | reais | Opcional. Exige `contrato_em` |
| `motivo_perda` | lista | `sem_resposta`, `honorarios`, `outro_advogado`, `desistiu`, `resolveu_sozinho`, `outro`. Registra `perdido_em` |
| `perdido_em` | data | `null` reabre o lead |

**Etapa** (calculada, só leitura): `novo` → `em_atendimento` → `qualificado` →
`consulta_agendada` → `consulta_realizada` → `contrato`. Saídas: `desqualificado`,
`nao_compareceu`, `perdido`.

## Erros

| Código | `erro` | Quando |
|---|---|---|
| 401 | `chave_invalida` | Chave ausente, errada ou revogada |
| 403 | `sem_permissao` | A chave não tem a permissão da rota |
| 404 | `nao_encontrado` | Lead ou rota inexistente |
| 422 | `dados_invalidos` | Campo desconhecido, valor fora da lista ou combinação incoerente. A `mensagem` explica em português |
