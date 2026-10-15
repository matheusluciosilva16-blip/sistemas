# DECISOES.md — histórico do sistema de métricas

Só o que ajuda na continuidade. A especificação original está na conversa de 15/10/2026 e
resumida abaixo.

## Contexto fixado pelo cliente (15/10/2026)

| Pergunta | Resposta |
|---|---|
| Plataformas | **Google Ads e Meta Ads** |
| Canal dos leads | **Só WhatsApp.** O site não tem formulário nem botão de ligação (decisão de 08/08/2026 no repositório do site) |
| Áreas anunciadas | Busca e apreensão de veículo · conta bancária bloqueada (a página criminal está fora do ar) |
| Registro de leads | **CRM próprio neste sistema**, independente do Meu Estagiário, alimentado pela Naia via chave de API |
| Acesso | Nuvem, Matheus + equipe, pelo celular |
| Honorários de êxito | **Às vezes.** Campo opcional por contrato; o ROAS projetado só soma onde houver |
| Orçamento | **R$ 1.500/mês** de tráfego, somando as plataformas |

## Decisões

| Decisão | Motivo |
|---|---|
| **Cloudflare Workers + D1 + Hono**, em `sistemas/metricas/`. | Mesma conta e mesmo fluxo do site (push publica). Plano gratuito cobre o volume. Um fornecedor a menos para o cliente administrar. Supabase foi considerado e preterido por somar outro painel. |
| **Fora do repositório do site.** | O site tem stack fechada (HTML estático) e o `specs/site.md` põe CRM e gestão de campanhas fora do escopo. Decisão do cliente: "pode colocar no repositório sistemas". |
| **Telas montadas no servidor, sem JS no navegador.** | Fácil de manter por quem não programa, leve no 4G, e permite CSP rígida. Gráficos (etapa 4) vão exigir um pouco de JS; reavaliar lá. |
| **Primeiro administrador exige `CHAVE_INSTALACAO`.** | Sem isso, quem achasse o endereço `.workers.dev` antes do cliente poderia virar administrador. |
| **Papéis: `admin` e `equipe`.** Só admin gerencia pessoas e chaves. | Mínimo necessário. |
| **Chaves de API com escopos** (`leads:escrever`, `leads:ler`) e revogação individual. | A Naia precisa escrever; uma integração futura de leitura não precisa. Vazou uma, revoga só ela. |
| **Senha: PBKDF2-SHA256 100k.** | Máximo que o Workers aceita na Web Crypto. Sem dependência externa. |

## Etapa 2 — CRM (15/10/2026)

| Decisão | Motivo |
|---|---|
| **Etapa do lead é calculada** (view `leads_com_etapa`), não gravada. | Não há como a etapa ficar dessincronizada dos campos. |
| **Regras automáticas:** informar o motivo desqualifica, fechar contrato qualifica, informar o motivo de perda registra a data. | Menos cliques para a equipe e para a Naia, e menos lead em estado incoerente. Combinações impossíveis (contrato e perda juntos, comparecimento sem consulta, honorário sem contrato) são recusadas com mensagem em português. |
| **Sem campo de observação; motivos em lista fechada; API recusa campo desconhecido.** | LGPD: o sistema de métricas não pode virar repositório de detalhes do caso. Cumpre a especificação §8. |
| **Deduplicação:** mesma `referencia_externa`, ou mesmo telefone em 90 dias, devolve o lead existente. | A Naia pode chamar a criação a cada mensagem sem inflar o número de leads (o que derrubaria o CPL artificialmente). |
| **`mensagem_inicial` identifica a página pela frase do site e é descartada.** | Aproveita a frase de cada página (decisão do site, 01/09/2026) sem mudar nada no site e sem gravar o texto da pessoa. |
| **Anonimização em vez de apagar a linha.** Só admin, pelo painel, com confirmação digitada. | Apagar a linha mudaria o CAC e o histórico das campanhas. Fora da API, porque é irreversível. |
| **Valores em centavos, datas em ms UTC, entrada e saída em horário de Brasília.** | Sem erro de arredondamento; sem confusão de fuso. |

## CRM configurável, visual e métricas (15/10/2026)

| Decisão | Motivo |
|---|---|
| **Listas de classificação no banco, editáveis em Configurações.** Opções nunca são apagadas, só desativadas. | Pedido do cliente: acrescentar classificações sem programador. Apagar mudaria leads antigos e o histórico das métricas. Lead que já tem a opção desativada continua podendo ser salvo. |
| **Campos personalizados** (lista, sim/não, número, valor, data, texto curto) guardados em `leads.extras` (JSON). | Pedido do cliente: "adicionar colunas". JSON evita alterar a tabela a cada campo novo, e o D1 filtra por ele (`json_extract`). Campo de lista vira filtro e recorte nas métricas. |
| **Texto curto existe, com aviso de LGPD, e é apagado na anonimização.** | Flexibilidade pedida pelo cliente sem abrir mão da exclusão a pedido. |
| ~~Plataforma padrão única = Meta~~ → **plataforma padrão por página** (rev. de 15/10/2026). | Correção do cliente: o Google Ads continua, com campanha de outro foco (não busca e apreensão). Como cada plataforma anuncia uma página diferente, a página resolve a plataforma. Busca e apreensão = Meta; a página do Google é marcada em Configurações. |
| **Visual das landing pages:** mesmas fontes (arquivos copiados de `teste-/src/assets/fonts`), tokens de cor, raios e símbolo da logo. Ação principal em dourado sólido. | Pedido do cliente. O verde `#25D366` é exclusivo do WhatsApp no `design.md`, por isso não é usado como cor de botão aqui. |
| **Fundo preto** (`#030303`, o preto da logo; cards `#121212`), em vez do marinho das LPs. Revisão de 15/10/2026. | Pedido do cliente, escolhido entre duas prévias. Só no sistema: as landing pages continuam em marinho (decisão de 07/08/2026 do site). Contraste medido, menor caso 6,8:1. |
| **Importação por CSV do Meta e do Google Ads**, com a plataforma reconhecida pelo cabeçalho; reimportar substitui os dias do arquivo daquela plataforma. | As duas plataformas terão dados. Substituir por dia torna a reimportação segura; o arquivo deve conter todas as campanhas (avisado na tela). O Google aceita UTF-16/tabulação ("CSV para Excel") e ignora linhas de título e de total. |
| **Conversões do Google e conversas do Meta na mesma coluna** ("conversões da plataforma"). | É o que cada plataforma conta como resultado. O CRM continua sendo a fonte dos leads; esse número serve para comparar com o que a plataforma enxerga. |
| **Ligação investimento → leads pela página do site** (tabela `campanhas_paginas`). | A frase do WhatsApp identifica a página, não a campanha. Com duas campanhas na mesma página, o CPL/CAC só é separável por página, não por campanha. A tabela de campanhas mostra métricas de anúncio (CTR, CPM, hook), não CPL. |
| **Leads por coorte de entrada.** | CAC compara a verba do período com o que os leads daquele período renderam. Explicado na tela. |
| **CAC só com leads de plataformas pagas;** orgânico, indicação e "não se sabe" ficam fora, com aviso. | Não inflar nem subestimar o custo da mídia. |
| **Frequência = impressões ÷ soma do alcance diário** ("frequência diária média"). | O alcance não se soma entre dias, e o CSV diário não traz o alcance do período. O nome na tela deixa isso claro. |
| **Hook rate e retenção só sobre impressões de anúncios com dados de vídeo.** | Anúncio de imagem derrubaria o hook rate artificialmente. |
| **Gráficos em SVG gerado no servidor,** uma série por gráfico, com dica nativa e tabela equivalente. | Mantém a página sem JavaScript e com CSP rígida. Investimento e leads em gráficos separados: nunca dois eixos. |

## Páginas fora das landing pages (15/10/2026)

| Decisão | Motivo |
|---|---|
| **Google Ads anuncia o site Jurisoft** (`matheuslucio.jurisoft.site/home`) **e uma LP de imobiliário**; o **Meta anuncia só busca e apreensão**. Páginas `jurisoft` e `imobiliario` e área `imobiliario` criadas, as duas páginas ligadas ao Google. | Informado pelo cliente. Com cada plataforma em páginas diferentes, a página resolve a plataforma do lead. |
| **Frases de origem do WhatsApp editáveis** em Configurações (tabela `frases_origem`), comparadas sem acento e sem diferença de maiúsculas; a mais longa que aparecer vence. | As páginas novas ficam fora do repositório do site, então o sistema não conhece a frase delas. O cliente cadastra sozinho a frase de cada página, inclusive das futuras. |
| **Opções e frases iniciais versionadas** (`versao_dados_iniciais`). | Permite acrescentar opções novas a um banco que já está em uso sem desfazer o que foi renomeado ou desativado. |

## Pontos já levantados para as próximas etapas

- **Frase da LP de imobiliário: cadastrada** ("Tenho uma questão sobre imóvel", informada pelo
  cliente). **Frase do site Jurisoft: pendente.** Não foi possível abrir o site a partir do
  ambiente de desenvolvimento. Até ser cadastrada em Configurações, os leads do Jurisoft entram
  sem página e sem plataforma, e ficam fora do CAC.

- **Se Google e Meta passarem a anunciar a mesma página**, a frase do WhatsApp não distingue
  as duas. Opções: (a) um código curto na mensagem, que **altera a frase exata escrita pelo
  cliente** (decisão de 01/09/2026 no repositório do site) e exige autorização dele; (b) deixar
  aquela página em "Não se sabe" e perguntar a origem no atendimento.
- **Mínimos do diagnóstico com R$ 1.500/mês (etapa 5).** A verba rende algo como 30 a 70 leads
  por mês no total, divididos entre 2 campanhas e 2 plataformas. A regra "20 leads" da
  especificação levaria semanas por campanha. Proposta: janela padrão de **60 dias** para as
  métricas da etapa 5, mínimo de 20 leads **por conta** (não por anúncio) para diagnóstico de
  conversão, e diagnóstico de fechamento só a partir de 5 consultas realizadas. Tudo ajustável.
- **Developer token do Google Ads (etapa 6)** depende de aprovação e pode levar semanas.
  Pedir cedo.
