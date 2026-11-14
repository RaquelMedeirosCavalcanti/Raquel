# Sincronização Garmin

A integração usa a Garmin Personal API. O segredo `GARMIN_PERSONAL_API_KEY` fica no servidor Cloudflare; nunca deve ser gravado no GitHub.

O Cron Trigger `0 * * * *` chama o método `scheduled` do Worker uma vez por hora, mesmo com a página fechada. Quando aberta, a interface também verifica atividades, com intervalo mínimo de 15 minutos entre tentativas automáticas. O estado e o bloqueio de execução ficam em `garmin_sync`.

O identificador de origem Garmin evita duplicidades. Corridas e musculação dão baixa em planejamentos correspondentes quando há uma opção única; situações ambíguas ficam para revisão. Os exercícios, cargas, séries e repetições cadastrados manualmente são preservados.

A importação considera calorias totais, guarda calorias ativas quando fornecidas, arredonda distâncias para duas casas decimais e mantém valores desconhecidos como ausentes. As etapas da corrida são obtidas do resumo e de arquivos FIT quando disponíveis.
