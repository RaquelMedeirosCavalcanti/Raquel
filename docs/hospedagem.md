# Hospedagem pessoal

O código fica no repositório GitHub `RaquelMedeirosCavalcanti/Raquel`.
O servidor se chama `meu-ritmo`, na conta pessoal da Cloudflare, e usa o banco D1 `meu-ritmo-kel`.

A hospedagem utiliza Workers Free e D1 Free. Existem limites de requisições, processamento, consultas e armazenamento. Este projeto não solicita upgrade para plano pago. O uso pode ser acompanhado no painel Cloudflare em Workers & Pages e D1.

O acesso é protegido por Cloudflare Access. A conta proprietária mantém o mesmo identificador interno da migração para preservar vínculos dos registros. As chaves permanecem em secrets do Worker. Não há banco, backup de atividades realizadas ou chave Garmin no GitHub.

Os links antigos em `chatgpt.site` pertencem à instalação anterior. Use o endereço da Cloudflare para novas alterações. O ícone salvo no celular também deve ser criado novamente a partir do novo endereço.

As exceções da Cloudflare Access cobrem somente a página `/visualizar`, a API `/api/shared-sessions` e seus arquivos. O Worker valida a chave no banco e o cookie de consulta antes de servir esses arquivos. `run_worker_first` deve permanecer ativado. A proteção da página principal e das APIs de edição permanece ativa.

O compartilhamento gera a versão compacta `/v/<codigo>`, sem serviços externos. O código preserva 128 bits aleatórios da chave original. A resolução consulta o mesmo registro revogável; cancelar o compartilhamento invalida tanto o endereço curto quanto o antigo.
