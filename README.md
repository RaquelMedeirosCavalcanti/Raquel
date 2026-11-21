# Meu ritmo · Kel

Aplicativo pessoal para planejar e acompanhar corridas, musculação, caminhadas e Pilates. Primeiro projeto de portfólio de ADS de Kel.

**Aplicativo:** https://meu-ritmo.kel-meu-ritmo.workers.dev

O aplicativo exige autenticação. O repositório contém o código e um exemplo de configuração. As imagens pessoais, o PDF, o planejamento individual, as realizações, observações e credenciais ficam fora do GitHub, no ambiente privado da Cloudflare.

## O que é um repositório?

Um repositório é a pasta principal de um projeto com um histórico de versões. O Git registra mudanças em pontos chamados **commits**. O GitHub guarda uma cópia online desse repositório, permitindo consultar o código, comparar versões e continuar o desenvolvimento em outro computador.

Guardar código no GitHub e hospedar um aplicativo são tarefas diferentes: o GitHub guarda o projeto; a Cloudflare executa o aplicativo e guarda o banco de dados.

## Tecnologias

- **TypeScript e React:** lógica e interface do aplicativo.
- **Vinext/Vite:** organização das páginas e preparação da versão de produção.
- **CSS/Tailwind:** aparência, cores e adaptação às telas.
- **Cloudflare Workers:** execução do servidor e das APIs.
- **Cloudflare D1 / SQLite e Drizzle:** armazenamento e consultas dos treinos.
- **Cloudflare Access:** login por código de uso único enviado ao e-mail autorizado.
- **Garmin Personal API e FIT SDK:** importação de atividades e detalhes por etapas.

## Pastas e arquivos

| Caminho | Função |
| --- | --- |
| `app/` | Páginas e telas: visão geral, treinos, Garmin e compartilhamento. |
| `app/api/` | Rotas do servidor para consultar, salvar e sincronizar dados. |
| `components/` | Elementos reutilizáveis da interface, como botões e campos. |
| `lib/` | Regras: totais, modalidades, calorias, distâncias e conciliação Garmin. |
| `db/` | Estrutura das tabelas e conexão com o banco D1. |
| `drizzle/` | Migrações SQL: instruções versionadas para criar e evoluir tabelas. |
| `public/` | Arquivos estáticos e manifesto. Imagens pessoais e PDF são mantidos apenas na hospedagem. |
| `worker/` | Entrada do servidor, validação do login e tarefa horária Garmin. |
| `tests/` | Verificações automatizadas das regras e da autenticação. |
| `scripts/` | Comandos auxiliares para instalação, build e publicação. |
| `docs/` | Explicações técnicas e operacionais do projeto. |
| `package.json` | Dependências e comandos do projeto. |
| `pnpm-lock.yaml` | Versões exatas das dependências. |
| `cloudflare-deploy.json` | Identificadores públicos da hospedagem, sem senhas. |

## Desenvolvimento

Requer Node.js 24 ou mais recente e pnpm na versão indicada em `package.json`.

```bash
corepack enable
pnpm install --frozen-lockfile
node scripts/prepare-project.mjs
pnpm test
pnpm typecheck
pnpm build
```

O login real precisa de Cloudflare Access e de um banco D1. A identidade é validada no servidor por assinatura, emissor, audiência e validade do token. Enviar um e-mail em um cabeçalho não permite entrar.

## Publicação

Com a versão compilada e um token Cloudflare de escopo restrito configurado **apenas no ambiente local**, execute `pnpm deploy`. O script usa a API oficial, publica os arquivos e o servidor, preserva os segredos existentes e configura o agendamento horário.

Também é possível solicitar atualizações pelo ChatGPT com as integrações GitHub e Cloudflare conectadas. Publicar um commit no GitHub, isoladamente, não publica a hospedagem; a etapa de deployment precisa ser executada.

Não coloque tokens ou backups privados no repositório. As variáveis usadas no servidor são `GARMIN_PERSONAL_API_KEY`, `GARMIN_OWNER_EMAIL`, `SITE_OWNER_EMAIL`, `OWNER_USER_ID`, `ACCESS_TEAM_DOMAIN` e `ACCESS_AUD`. A chave Garmin é um segredo da Cloudflare.

## Dados e sincronização

`run_sessions` guarda registros e alterações do planejamento; `garmin_sync` guarda estado e bloqueios da integração; `training_shares` guarda links revogáveis de consulta. A chave primária da atividade e o identificador Garmin impedem importações duplicadas. A musculação sincronizada preserva exercícios, séries, cargas e repetições.

O servidor tem um Cron Trigger horário. Com o aplicativo aberto também há verificações periódicas, respeitando o intervalo mínimo de 15 minutos. Os treinos precisam estar sincronizados com Garmin Connect antes da importação.

O endereço anterior em ChatGPT Sites continua separado. Edições feitas lá após a migração não são copiadas automaticamente para esta versão.

## Arquivos pessoais e instalação nova

`pnpm build` e `pnpm dev` criam `lib/training-plan.json` a partir de `lib/training-plan.example.json` quando esse arquivo ainda não existe. A instalação atual mantém o planejamento original. Uma instalação nova usa o exemplo sem registros pessoais.

Os arquivos pessoais de imagem, ícones e PDF não são distribuídos no repositório público. Eles continuam disponíveis no aplicativo hospedado e protegido por login. Em uma instalação nova, adicione suas próprias imagens em `public/` se desejar reproduzir a identidade visual.

## Compartilhar somente leitura

O botão Compartilhar gera um link com chave aleatória e revogável. Quem tiver o link pode consultar sem login e encaminhá-lo. A edição, criação de links e integração Garmin continuam protegidas pelo login pessoal. Cancelar o link bloqueia novas consultas. O servidor valida a chave em cada consulta e protege também os arquivos carregados pela página; os endereços de edição não aceitam essa chave como autenticação.

## Envio de planejamentos ao Garmin pelo Intervals.icu

Na aba Garmin, a proprietária conecta sua chave pessoal do Intervals.icu. O app valida a conta e guarda a chave criptografada em `intervals_connections`, com AES-GCM e uma chave de 32 bytes em Base64 no segredo `INTERVALS_ENCRYPTION_KEY` do Worker. Aplique `drizzle/0003_intervals_connections.sql` antes de publicar essa versão. A chave pessoal não é devolvida pelas APIs nem incluída no repositório.

A prévia permite selecionar corridas futuras ainda planejadas. Etapas ambíguas ficam indisponíveis para envio até serem revisadas. O app usa a API oficial de eventos do Intervals.icu (`events/bulk?upsert=true`), com identificadores externos estáveis para atualizar os mesmos treinos ao reenviar. Os registros de realização e a prescrição original no Meu Ritmo são preservados.

O automático começa pausado: teste um treino no Garmin Connect e no relógio antes de ativá-lo. Quando ativado, envia ou atualiza os treinos futuros ao abrir o app, com intervalo mínimo de 15 minutos, e pelo Cron Trigger horário. A sincronização do Intervals.icu para o Garmin requer a autorização própria dessa plataforma e respeita sua janela de datas. A confirmação do app comprova recebimento no Intervals.icu, não entrega no relógio. Remover a conexão não apaga treinos que já foram enviados; cancelar ou apagar uma corrida no Meu Ritmo também não exclui automaticamente sua cópia externa.

A chave permite configurar a conta atual sem pedir o ID do atleta: o endpoint usa o atleta `0`, correspondente à chave. Referências: [API pessoal](https://forum.intervals.icu/t/api-access-to-intervals-icu/609), [envio de treinos planejados](https://forum.intervals.icu/t/uploading-planned-workouts-to-intervals-icu/63624).

O envio valida previamente o ritmo de limiar e as zonas de ritmo de corrida no Intervals.icu. Cada etapa inclui seu tipo explícito (aquecimento, corrida, intervalo, recuperação ou desaquecimento). A confirmação exige que a resposta preserve todas as etapas, durações, distâncias, repetições e limites de pace; uma resposta sem estrutura não é salva como sucesso. Treinos confirmados pela versão anterior são reenviados e validados na próxima seleção manual. Não é feita alteração automática no ritmo de limiar do atleta.
