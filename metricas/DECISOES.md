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

## Pontos já levantados para as próximas etapas

- **Origem do lead no WhatsApp (etapa 3).** O identificador de clique do Google (gclid) não
  atravessa o `wa.me`. Opções: (a) a página acrescentar um código curto à mensagem, por exemplo
  `(ref. A7K2)`, o que **altera a frase exata escrita pelo cliente** (decisão de 01/09/2026 no
  repositório do site) e exige autorização dele; (b) atribuir só por página/campanha, sem
  granularidade de anúncio. **Ainda não decidido.**
- **LGPD no CRM (etapa 2).** Guardar nome e telefone, **nunca detalhes do caso**. Motivo de
  desqualificação como lista fechada, sem texto livre. Exclusão a pedido apaga a pessoa e mantém
  só números agregados, para o CAC histórico não mudar.
- **Mínimos do diagnóstico com R$ 1.500/mês (etapa 5).** A verba rende algo como 30 a 70 leads
  por mês no total, divididos entre 2 campanhas e 2 plataformas. A regra "20 leads" da
  especificação levaria semanas por campanha. Proposta: janela padrão de **60 dias** para as
  métricas da etapa 5, mínimo de 20 leads **por conta** (não por anúncio) para diagnóstico de
  conversão, e diagnóstico de fechamento só a partir de 5 consultas realizadas. Tudo ajustável.
- **Developer token do Google Ads (etapa 6)** depende de aprovação e pode levar semanas.
  Pedir cedo.
