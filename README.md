# Meu ritmo · Kel

Aplicativo pessoal para planejar e acompanhar corridas, musculação, caminhadas e Pilates. Primeiro projeto de portfólio de ADS de Kel.

**Aplicativo:** https://meu-ritmo.kel-meu-ritmo.workers.dev

O aplicativo exige autenticação. O repositório contém o código e o planejamento original; as realizações, observações e credenciais ficam fora do GitHub, no ambiente privado da Cloudflare.

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
| `public/` | Imagens, ícones, manifesto e PDF do planejamento original. |
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
