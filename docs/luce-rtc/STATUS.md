# Luce Reforma Tributária: status

Data: 17/11/2026

- Fase atual: 1, fundação isolada e cadastro multi-organização em desenvolvimento.
- Base preservada: deploy de produção `dpl_FJnshNCz4LRSFkKmUYHBLQ1Y2Hrt`, 307 arquivos verificados por hash; branch de arquivo `archive/vercel-2026-11-17-1048`, commit `df2700d`.
- Concluído nesta branch: endpoint de prontidão autenticado e autorizado, interface inicial, consulta CST/cClassTrib e atividades do Simples por data via gateway com versões verificadas, gateway privado somente para leituras permitidas, migration aditiva de organizações/empresas/acessos/análises, APIs e interface de cadastro, testes de isolamento e integridade locais. A branch inclui a restauração anterior do Luce Sign.
- Pendente: reconciliar outros arquivos excluídos pela `.vercelignore`, executar a migration em homologação após revisão, configurar `RTC_BOOTSTRAP_ADMIN_USER_ID` com o UUID do Admin01, escolher hospedagem persistente de contêineres e banco de homologação, implantar e testar os motores oficiais, executar testes reais de catálogo, cálculos e demais ferramentas fiscais. O Supabase atual não permite branch no plano vigente; Docker, Java e Go não estão disponíveis no ambiente local inspecionado.
- Decisão: URL de motor configurada não significa motor operacional ou homologado. Nenhum cálculo é apresentado nesta fase.
- A migration não foi executada no Supabase. Sem alterações em produção pelo trabalho do RTC; sem merge na `main`. O Luce Sign foi republicado separadamente antes desta etapa.
- O cadastro usa a service role somente no backend. A criação de organização exige simultaneamente perfil de administrador e UUID fixado em `RTC_BOOTSTRAP_ADMIN_USER_ID`; sem essa variável, falha fechada. Cadastro de empresa exige papel RTC `admin` na organização. Leituras conferem vínculo ativo e acesso explícito à empresa.
- Risco principal: a branch de arquivo contém apenas os arquivos enviados à Vercel, não todo o repositório original.
- Verificação desta etapa: 17 testes RTC e 14 testes Sign passaram; build e ortografia passaram. O comando global `pnpm run check` não conclui nesta cópia porque `sentinela/sentinela.js` está ausente do arquivo recuperado. Isso não foi alterado pelo RTC e exige reconciliação da fonte antes de homologar o portal inteiro.
