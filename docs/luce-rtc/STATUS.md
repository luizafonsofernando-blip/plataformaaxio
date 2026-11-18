# Luce Reforma Tributária: status

Data: 17/11/2026

- Fase atual: fundação e homologação local isolada, ainda sem cálculo fiscal liberado.
- Base preservada: deploy de produção `dpl_FJnshNCz4LRSFkKmUYHBLQ1Y2Hrt`, 307 arquivos verificados por hash; branch de arquivo `archive/vercel-2026-11-17-1048`, commit `df2700d`.
- Concluído nesta branch: endpoint de prontidão autenticado e autorizado, interface inicial, consulta CST/cClassTrib e atividades do Simples por data via gateway com versões verificadas, gateway privado somente para leituras permitidas, migration aditiva de organizações/empresas/acessos/análises, APIs e interface de cadastro, testes de isolamento e integridade locais. A branch inclui a restauração anterior do Luce Sign.
- Preparado em 18/11/2026: projeto Supabase CLI local isolado (portas 55321-55324), migrations RTC aditivas, RLS multi-organização, histórico imutável, auditoria, bucket privado de relatórios, APIs e interface de consulta e link temporário, login exclusivo de homologação, servidor local, contêineres separados para os três motores e smoke test de versões/catálogos. Os três commits oficiais foram obtidos e verificados em `%LOCALAPPDATA%\LuceRTC`. A configuração CLI foi validada localmente (`valid: true`, `remotes: []`).
- Pendente: instalar/iniciar Docker Desktop ou runtime compatível e WSL 2, executar Supabase e contêineres locais, conferir build e respostas reais, completar casos fiscais de referência e geração DANFSe, reconciliar arquivos excluídos pela `.vercelignore` e revisar backup/restauração. O Supabase hospedado não permite branch no plano vigente; nenhum projeto existente foi modificado. Ver `homologacao-local.md`.
- Decisão: URL de motor configurada não significa motor operacional ou homologado. Nenhum cálculo é apresentado nesta fase.
- A migration não foi executada no Supabase. Sem alterações em produção pelo trabalho do RTC; sem merge na `main`. O Luce Sign foi republicado separadamente antes desta etapa.
- O cadastro usa a service role somente no backend. A criação de organização exige simultaneamente perfil de administrador e UUID fixado em `RTC_BOOTSTRAP_ADMIN_USER_ID`; sem essa variável, falha fechada. Cadastro de empresa exige papel RTC `admin` na organização. Leituras conferem vínculo ativo e acesso explícito à empresa.
- Risco principal: a branch de arquivo contém apenas os arquivos enviados à Vercel, não todo o repositório original.
- O comando global `pnpm run check` não conclui nesta cópia porque `sentinela/sentinela.js` está ausente do arquivo recuperado. Isso não foi alterado pelo RTC e exige reconciliação da fonte antes de homologar o portal inteiro.
- Verificação desta etapa: 24 testes RTC, 14 testes Luce Sign, ortografia e build passaram. O `supabase start --workdir infra/rtc-local` não iniciou porque não há Docker nem Podman no PATH; portanto nenhum teste de contêiner, migração em Supabase real ou cálculo tributário real foi declarado como concluído.
