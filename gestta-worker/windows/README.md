# Luce E-BEF Sync: execucao no Windows

## Seguranca

- Somente com autorizacao da ORTECONTE e permissao de uso automatizado do Gestta.
- Use conta Windows dedicada e pasta local protegida/criptografada, fora de OneDrive ou pastas compartilhadas. Restrinja acesso a .env (token) e .gestta-profile (cookies de sessao).
- Nao compartilhe senha ou MFA do Gestta. A entrada e feita manualmente na janela do Playwright.
- A chave SUPABASE_SERVICE_ROLE_KEY fica apenas na Vercel; no Windows configure somente LUCE_SYNC_TOKEN.
- Nao configure agendamento antes de validar filtros e a exportacao de XLSX completos.

## 1. Instalar

Instale Node.js 20 ou superior. Em Windows PowerShell 5.1+, abra o terminal na pasta do worker:

    cd C:\Luce\plataformaaxio\gestta-worker
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\windows\setup.ps1

O script instala dependencias e Chromium do Playwright, executa testes e cria .env.example como .env quando necessario. Nao realiza login, envio ou agendamento.

## 2. Testar com seguranca

Edite .env localmente: LUCE_SYNC_URL e LUCE_SYNC_TOKEN. Configure GESTTA_REPORT_URL e GESTTA_EXPORT_SELECTOR apenas apos inspecionar a interface autenticada e confirmar que a URL abre relatorios ja filtrados para E-BEF.

    npm run login
    npm run sync -- --file "C:\Caminho\Clientes EBEF (1).xlsx" --dry-run
    npm run sync -- --backfill --recent=2 --auto --dry-run

Confira competencia, quantidade e status antes de executar um envio real:

    npm run sync -- --backfill --from=2026-01 --auto

O login manual/MFA e obrigatorio quando a sessao expirar. O robô nao contorna autenticacao nem captcha.

## 3. Agendar SOMENTE depois de homologar

PREVIA sem criar tarefa (horarios meramente ilustrativos):

    .\windows\register-task.ps1 -Times 09:00,15:00

HABILITAR duas execucoes em dias uteis apos aprovacao dos horarios:

    .\windows\register-task.ps1 -Times 09:00,15:00 -Apply

A tarefa usa o mesmo usuario Windows do login e executa somente quando esse usuario esta conectado. Nao e garantida a execucao se a maquina dormir, cair a internet ou o Gestta requerer nova autenticacao.

Teste como o Agendador executaria, mas sem enviar:

    powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\windows\run-sync.ps1 -DryRun

O agendamento usa --backfill --auto --recent=2. Para a primeira carga, execute --backfill --from=2026-01 --dry-run, confira cada mes e depois remova --dry-run em homologacao.

Os logs resumidos ficam em gestta-worker\logs\sync-AAAAMMDD.log e sao retidos por 30 dias. Um mutex evita execucoes simultaneas. Nao ha exclusao automatica de tarefas ausentes do arquivo.

Para desativar:

    Disable-ScheduledTask -TaskName 'Luce E-BEF - Gestta leitura'

## Limites do MVP

- Exportacao inteiramente automatica so funciona depois da calibracao da pagina/filtros e seletor do botao de exportacao.
- Um Windows ligado com a conta encerrada nao executa tarefa configurada como Interactive.
- Tarefa concluida no Gestta nao comprova protocolo de envio do E-BEF.
- O MVP sincroniza dados de XLSX, nao anexos, historicos ou prazos individuais.


## Exportacao por periodo

O periodo padrao inicial vai de janeiro de 2026 ao MES ATUAL COMPLETO, nao apenas ate o dia da execucao. Em meses de 31 dias, usa 01-30 e 02-31 para obedecer o limite de 30 dias; repeticoes sao conciliadas pelo ID. O Excel atual possui 15 colunas e a Data Meta deve estar presente para validar o intervalo. A automacao so funciona depois de calibrar os seletores reais do HTML e confirmar todos os filtros.

A calibracao automatica tambem exige GESTTA_DATE_MODE_SELECTOR para confirmar que o campo Exibir por esta em Data Meta. Somente inspecao do HTML autenticado pode estabelecer seletores confiaveis.
