# Documento 08 — CRM de métricas do escritório

Matheus, este documento ensina a Naia a alimentar o CRM do sistema de métricas.
Envie este arquivo para ela pelo Telegram, junto com a frase: "Incorpore o Documento 08".

---

Naia, a partir deste documento você registra cada lead que chega ao escritório no **CRM do
sistema de métricas**, e atualiza o andamento dele até o contrato ou a perda. É assim que o
Matheus calcula quanto custa conquistar cada cliente vindo dos anúncios.

## Autorização

1. Matheus autoriza conexões de saída para o endereço em `METRICAS_URL`, usando a chave em
   `METRICAS_API_KEY`. As duas variáveis ficam no seu `.env`.
2. A chave é segredo: nunca aparece em mensagem, log, memória ou resposta (Documento 02).
3. O sistema é do próprio escritório. Enviar a ele os dados de lead descritos aqui não conta como
   compartilhar com terceiro (Documento 06).

## Como chamar

Toda chamada leva estes cabeçalhos:

```
Authorization: Bearer $METRICAS_API_KEY
Content-Type: application/json
```

Endereço base: `$METRICAS_URL/api/v1`. O guia completo está em `metricas/docs/API.md` no
repositório `sistemas`.

## Regras do CRM

1. **Nunca envie detalhes do caso**: o que aconteceu, número de processo, documentos, valores
   da dívida ou da causa. O CRM recusa campos fora da lista, e isso é de propósito (LGPD).
   Guarde lá só nome, telefone, origem e andamento.
2. **Lead novo:** quando alguém escrever pela primeira vez no WhatsApp do escritório, crie o
   lead com `POST /leads`, enviando `nome`, `telefone`, `entrada_em` (hora da primeira mensagem),
   `referencia_externa` (um identificador único da conversa) e **a primeira mensagem completa
   em `mensagem_inicial`**. É por ela que o CRM descobre a página e a plataforma de origem. A
   mensagem não é gravada.
3. **Não tenha medo de duplicar:** se o lead já existir (mesma `referencia_externa`, ou mesmo
   telefone nos últimos 90 dias), o CRM devolve o existente com `ja_existia: true`.
4. **Primeiro atendimento** é a primeira resposta de uma pessoa da equipe, não uma resposta
   automática. Registre com `PATCH /leads/{id}` e `{"primeiro_atendimento_em": "agora"}` ou com
   a hora real.
5. **Andamento:** qualificado (`qualificado: true`) ou desqualificado (`motivo_desqualificacao`),
   consulta (`consulta_agendada_para`, depois `compareceu`), contrato (`contrato_em`,
   `honorarios_iniciais` e, se houver êxito no contrato, `exito_estimado`) ou perda
   (`motivo_perda`).
6. **Valores aceitos mudam:** Matheus pode criar listas, opções e campos novos no painel.
   Consulte `GET /opcoes` antes de gravar, em vez de decorar os valores. Se o CRM responder
   `dados_invalidos`, leia a `mensagem`, corrija e tente de novo uma vez. Se falhar de novo,
   avise o Matheus.
7. **Não apague nem anonimize leads.** Isso é feito só pelo Matheus, no painel.
8. Siga o contrato de verificação (Documento 04): diga ✅ VERIFICADO só depois de ler o lead de
   volta com `GET /leads/{id}`.

## Primeiro teste (faça uma vez, ao incorporar este documento)

1. `GET /status`. Precisa responder `"ok": true`.
2. `GET /opcoes`. Confira que vieram `frases_de_origem` e `plataforma_por_pagina`.
3. Crie um lead de teste:
   ```json
   {
     "nome": "TESTE NAIA — apagar",
     "telefone": "21900000001",
     "mensagem_inicial": "Olá! Estou com um problema de busca e apreensão no meu veículo e gostaria de orientação.",
     "referencia_externa": "teste-naia-documento-08"
   }
   ```
   A resposta precisa trazer `origem_identificada: "busca-e-apreensao"` e `plataforma: "meta"`.
4. Registre o primeiro atendimento com `"agora"` e leia o lead de volta: a etapa precisa ser
   `em_atendimento`.
5. Mande ao Matheus um resumo curto com o resultado de cada passo e o número do lead de teste,
   e peça que ele o apague no painel: Leads → abrir o lead → **Apagar lead criado por engano**.
