# Documento 09 — Como entregar imagens e arquivos pelo Telegram

Matheus, este documento corrige as imagens que a Naia diz ter enviado e que não chegam.
Envie este arquivo para ela pelo Telegram, junto com a frase: "Incorpore o Documento 09".

---

Naia, quando você diz que mandou uma imagem e o Matheus não recebe nada, a causa é esta: o
gateway do Telegram **bloqueia qualquer arquivo dentro de `/root`**, e você trabalha em
`/root/.hermes/`. O texto da sua resposta sai normalmente, mas o arquivo é descartado em
silêncio. Fica só um aviso no log. Por isso parece que deu certo.

## Regra de entrega

1. O gateway libera apenas as pastas de cache. Antes de entregar uma imagem, **copie** o arquivo
   para `/root/.hermes/cache/images/`. Se essa pasta não existir, use `/root/.hermes/image_cache/`.
   Confira com `ls -d` qual das duas existe; não presuma.
2. Na resposta, coloque em linha própria `MEDIA:` seguido do caminho absoluto da cópia, sem
   aspas, sem crase e sem espaço no nome do arquivo. Exemplo:
   `MEDIA:/root/.hermes/cache/images/grafico-leads.png`
3. Para PDF, planilha ou documento, a regra é a mesma, mas na pasta
   `/root/.hermes/cache/documents/` (ou `/root/.hermes/document_cache/`).
4. Quando o Matheus precisar da imagem na qualidade original, acrescente `[[as_document]]` na
   resposta. Sem isso, o Telegram reduz a foto para cerca de 1280 px.
5. A pasta de cache é limpa depois de 24 horas. Ela serve só para a entrega. O original fica onde
   você o criou.
6. O gateway também tenta enviar **qualquer caminho de arquivo escrito solto no texto**, como
   `/root/.hermes/training/09-entrega-de-imagens.md`. Se o caminho estiver em `/root`, ele é
   bloqueado e gera o mesmo aviso no log, sem efeito para o Matheus. Para citar um caminho sem
   enviar o arquivo, escreva-o sempre entre crases, como neste item. O que está entre crases é
   ignorado pelo gateway.

## Verificação (Documento 04)

1. Depois de responder, leia o fim de `/root/.hermes/logs/gateway.log`.
2. Se aparecer `Skipping unsafe MEDIA directive path` ou `Skipping unsafe local file path`, algum
   caminho da resposta estava fora da pasta liberada. Se era o arquivo a entregar, corrija e mande
   de novo. Se era só um caminho citado no texto (item 6), não houve perda: passe a citá-lo entre
   crases.
3. Se aparecer `delivery failed`, o Telegram recusou a foto, geralmente por passar de 10 MB ou
   ter dimensões fora do limite. Mande de novo como documento, com `[[as_document]]`.
4. Só diga ✅ VERIFICADO quando o log não mostrar nenhum desses avisos. Antes disso, use
   🔸 FEITO, NÃO TESTADO.

## Primeiro teste (faça uma vez, ao incorporar este documento)

1. Crie uma imagem simples, por exemplo um PNG com o texto "teste Naia 09".
2. Entregue ao Matheus seguindo a regra acima.
3. Confira o log e pergunte ao Matheus se a imagem chegou. Só considere este documento
   incorporado depois que ele confirmar.
