# Luce Reforma Tributária: status

Data: 17/11/2026

- Fase atual: 1, fundação isolada.
- Base preservada: deploy de produção `dpl_FJnshNCz4LRSFkKmUYHBLQ1Y2Hrt`, 307 arquivos verificados por hash; branch de arquivo `archive/vercel-2026-11-17-1048`, commit `df2700d`.
- Concluído nesta branch: endpoint de prontidão autenticado e autorizado, interface inicial, consulta CST/cClassTrib por data via gateway do motor oficial com versão verificada, catálogo de permissões, testes de autorização, configuração e versão. A branch inclui a restauração anterior do Luce Sign.
- Pendente: reconciliar outros arquivos excluídos pela `.vercelignore`, ambiente de homologação com gateway autenticado, migrations RTC, implantação dos motores oficiais, testes reais do catálogo, cálculos e demais ferramentas fiscais. Docker, Java e Go não estão disponíveis no ambiente local inspecionado.
- Decisão: URL de motor configurada não significa motor operacional ou homologado. Nenhum cálculo é apresentado nesta fase.
- Sem alterações em Supabase ou produção pelo trabalho do RTC; sem merge na `main`. O Luce Sign foi republicado separadamente antes desta etapa.
- Risco principal: a branch de arquivo contém apenas os arquivos enviados à Vercel, não todo o repositório original.
