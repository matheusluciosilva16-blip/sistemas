# Métricas — tráfego pago e CRM do escritório

Sistema para acompanhar as campanhas do Google Ads e do Meta Ads, do anúncio até o contrato
fechado, e apontar onde está o gargalo. A métrica principal é o **CAC** (custo para conquistar
um cliente).

Roda no **Cloudflare**, na mesma conta do site, e abre no celular. A equipe entra com e-mail e
senha. A Naia (e qualquer outra integração) alimenta o CRM por **chave de API**.

## Onde está cada etapa

| # | Etapa | Situação |
|---|---|---|
| 1 | Base: login, equipe e chaves de API | ✅ pronta |
| 2 | CRM configurável: registro de leads, listas e campos editáveis, API para a Naia | ✅ pronta |
| 3 | Importação de CSV do Meta Ads e do Google Ads | ✅ pronta |
| 4 | Métricas: CAC, ROAS, funil, evolução diária, tabelas por campanha, página e classificação | ✅ pronta |
| 5 | Diagnóstico automático | a fazer |
| 6 | Coleta automática pelas APIs (Meta, depois Google) | a fazer |
| 7 | Alertas semanais | a fazer |

---

## Colocar no ar pela primeira vez

São cinco passos, todos no painel do Cloudflare (dash.cloudflare.com). Use **janela anônima**
se a extensão do navegador bloquear o painel, como já aconteceu com o site.

### 1. Criar o banco de dados

**Storage & Databases → D1 → Create database.** Nome: `metricas`. Região: deixe a automática.

Na página do banco, copie o **Database ID** (um código como `a1b2c3d4-...`).

### 2. Colar o ID no projeto

Abra `metricas/wrangler.jsonc` no GitHub (dá para editar pelo celular, no ícone do lápis),
troque `PREENCHER-ID-DO-D1` pelo código copiado e faça o commit.
Esse ID não é segredo: sem login na sua conta ele não dá acesso a nada.

> Se preferir, mande o ID para o Claude e ele faz essa alteração.

### 3. Criar o Worker ligado ao GitHub

**Workers & Pages → Create → Import a repository →** escolha `sistemas`.

| Campo | Valor |
|---|---|
| Project name | `metricas-escritorio` |
| Root directory | `metricas` |
| Build command | *(deixe vazio)* |
| Deploy command | `npm run publicar` |
| Build watch paths *(em Advanced settings, se aparecer)* | `metricas/*` |

O comando `publicar` primeiro atualiza as tabelas do banco e depois publica o sistema. Daqui
para frente, todo push na `main` republica sozinho, como no site. Com o *watch path*
preenchido, só as mudanças em `metricas/` disparam a publicação. Sem ele, uma mudança na Naia
também republica o sistema, o que não causa problema.

### 4. Cadastrar a chave de instalação

No Worker: **Settings → Variables and Secrets → Add →** tipo **Secret**.

- Nome: `CHAVE_INSTALACAO`
- Valor: uma frase longa que só você conhece (use um gerador de senhas)

Ela só serve para criar a **primeira** conta. Sem ela, alguém que descobrisse o endereço antes
de você poderia se cadastrar como administrador.

### 5. Criar a sua conta

Abra o endereço do Worker (algo como `metricas-escritorio.SEU-USUARIO.workers.dev`). Ele leva
à tela **Primeiro acesso**. Informe a chave de instalação, seu nome, e-mail e senha.

Pronto. A tela de primeiro acesso deixa de existir assim que a sua conta é criada.

---

## Como testar a etapa 1

1. **Entrar pelo celular** com o e-mail e a senha que você criou.
2. **Equipe → Adicionar pessoa:** cadastre alguém com papel *Equipe*. Entre com essa conta em
   outra janela anônima e confira que ela **não** vê "Equipe" nem "Chaves de API" no menu.
3. **Desativar:** desative essa pessoa. Na janela dela, recarregue: ela deve ser mandada para
   o login na hora.
4. **Chaves de API → Nova chave** com o nome `Naia`. Copie a chave mostrada (ela aparece uma
   única vez).
5. **Testar a chave.** Num terminal (ou pedindo à Naia):

   ```bash
   curl -H "Authorization: Bearer COLE_A_CHAVE" https://ENDERECO-DO-WORKER/api/v1/status
   ```

   A resposta esperada é `{"ok":true,"chave":"Naia",...}`.
6. **Revogar** a chave de teste e repetir o comando: agora deve responder `chave_invalida`.

## Como testar a etapa 2 (CRM)

1. **Leads → + Novo lead:** cadastre um lead de teste só com nome e telefone. Ele aparece como
   *Novo*, e o Painel mostra "1 lead aguardando o primeiro atendimento".
2. Abra o lead e toque em **Registrar 1º atendimento agora**. A lista passa a mostrar o tempo
   de resposta.
3. Escolha um **motivo de desqualificação** e salve: a etapa vira *Desqualificado* sozinha.
4. Tente cadastrar **o mesmo telefone de novo**: o sistema abre o lead existente em vez de
   duplicar.
5. **Pela Naia:** entregue a ela o arquivo [`docs/API.md`](docs/API.md) e a chave. Peça que
   crie um lead de teste com a frase de uma das páginas do site e confira, no painel, que a
   página e a área vieram preenchidas.
6. **Excluir a pedido (LGPD):** no fim da tela do lead (só o administrador vê), digite
   EXCLUIR. Nome e telefone somem e os números continuam.
7. Apague os leads de teste dessa forma antes de começar a usar de verdade, ou peça ao Claude
   para limpar o banco.

---

## Como testar a configuração do CRM

1. **Configurações → Listas de classificação:** abra "Área / tipo de caso", adicione
   "Previdenciário" e veja a opção nova no cadastro do lead.
2. **Desative** uma opção: ela some dos formulários, mas os leads que já a tinham continuam
   mostrando o valor (marcado como "desativada").
3. **Campos personalizados → Novo campo:** crie, por exemplo, "Tipo de veículo", do tipo
   *lista*, com as opções Carro, Moto e Caminhão, marcando "Mostrar na lista de leads". O campo
   aparece no cadastro, vira coluna e filtro na lista de leads, e um recorte em Métricas. A
   Naia passa a poder preenchê-lo pela API com o código mostrado na tela (`tipo_de_veiculo`).
4. **Qual plataforma anuncia cada página:** já vem preenchido. Busca e apreensão é **Meta Ads**;
   o site Jurisoft e a LP de imobiliário são **Google Ads**. O lead que chega pela frase de uma
   página já entra com a plataforma certa. Se um dia duas plataformas anunciarem a mesma página,
   deixe essa página em "Não se sabe".
5. **Frases de origem do WhatsApp:** cada página manda uma frase pronta no WhatsApp, e é por ela
   que o sistema sabe de onde o lead veio. As frases das suas landing pages já estão cadastradas.
   A da LP de imobiliário também. **Falta cadastrar a frase do botão de WhatsApp do site
   Jurisoft**, escolhendo a página e a área. Basta um trecho que só exista naquela frase.

## Como testar as métricas

1. **Métricas → Importar CSV.** Serve para o Meta e para o Google Ads: o sistema reconhece
   sozinho de qual plataforma é o arquivo. O passo a passo de cada uma está na própria tela.
   Importe o mês inteiro. Importar de novo **substitui** os dias do arquivo daquela plataforma,
   então não duplica.
2. **Métricas → Campanhas → páginas.** Diga qual página do site cada campanha anuncia. O
   sistema já sugere pelo nome da campanha; confira e salve. É isso que liga o investimento aos
   leads do CRM, porque a mensagem do WhatsApp identifica a página, e não a campanha.
3. Abra **Métricas** e escolha o período. Você vê:
   - indicadores principais com a variação contra o período anterior;
   - o funil, de impressões até contratos, com a taxa de passagem de cada etapa;
   - investimento e leads por dia;
   - todas as métricas da especificação, agrupadas nas cinco etapas;
   - a tabela por campanha, conjunto ou anúncio, ordenável e com destaque do que está muito
     abaixo da média;
   - CPL e CAC por página do site;
   - o funil de leads por área, motivo, canal ou qualquer campo personalizado do tipo lista.

> **Como os leads entram no período.** Contam os leads que *entraram* no período, com as
> consultas e os contratos que eles geraram, mesmo que o contrato saia semanas depois. Os
> períodos mais recentes tendem a mostrar menos contratos até o atendimento terminar.

---

## Segurança e LGPD

- **Senhas** guardadas com PBKDF2 (100 mil iterações). Ninguém, nem quem acessar o banco,
  consegue ler a senha.
- **Chaves de API e sessões** guardadas só como hash. A chave completa aparece uma vez, na
  criação.
- **Cinco tentativas de senha erradas** em 15 minutos bloqueiam o login por 15 minutos.
- **Desativar uma pessoa** encerra todas as sessões dela na hora.
- **Auditoria:** quem entrou, quem criou ou revogou chave, quem adicionou ou desativou pessoa,
  quem criou, alterou ou anonimizou cada lead. Registra só o número do lead e o nome dos
  campos alterados, nunca o conteúdo.
- **CRM sem campo de observação.** Não há onde escrever detalhes do caso, e os motivos são
  listas fechadas. A API recusa qualquer campo fora da lista.
- **Exclusão a pedido:** apaga nome e telefone de forma definitiva e mantém os números, sem
  identificar a pessoa.
- **Nenhum segredo vai para o GitHub.** O `.env` e o `.dev.vars` estão no `.gitignore`. A
  `CHAVE_INSTALACAO` vive só no Cloudflare.
- O repositório `sistemas` é **público**. O código pode ser visto, e por isso não tem segredo
  nenhum. Os dados ficam no banco D1, que só a sua conta do Cloudflare acessa.

---

## Para quem for programar

```bash
cd metricas
npm install
echo 'CHAVE_INSTALACAO=qualquer-coisa-local' > .dev.vars
npm run dev       # sobe em http://localhost:8787 com banco local
npm run testar    # segurança, escape de HTML, regras do CRM, CSV do Meta e fórmulas
```

| Pasta | O que tem |
|---|---|
| `src/index.js` | Rotas e proteções gerais (CSRF, cabeçalhos de segurança, login) |
| `src/rotas/` | Telas e API, uma por área |
| `src/lib/` | Segurança, sessões e chaves, HTML com escape, layout |
| `migrations/` | Estrutura do banco. **Nunca edite uma migração já publicada**: crie a próxima (`0002_...sql`) |
| `testes/` | Testes automatizados |
| `docs/API.md` | Guia da API para a Naia e outras integrações |
| `public/` | Fontes e logo, os mesmos arquivos das landing pages |
| `DECISOES.md` | Por que as coisas são como são |

Stack: Cloudflare Workers + D1 (SQLite) + [Hono](https://hono.dev). Telas montadas no
servidor, sem framework de front-end e sem JavaScript no navegador (os gráficos são SVG
gerado no servidor). Visual idêntico ao das landing pages: Noto Serif e Noto Sans
self-hosted, mesmas cores e mesmo símbolo da logo.
