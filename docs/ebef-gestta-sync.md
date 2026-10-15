# Integração Gestta → Luce | E-BEF

## Escopo do MVP

Sincronização de leitura por exportação XLSX com os campos: tarefa, status, cliente, CNPJ/CPF, departamento, responsável e competência. Os registros entram em duas tabelas novas e isoladas, sem alterar tarefas no Gestta ou dados preexistentes na Luce.

### Arquitetura

- Robô Playwright com autenticação e MFA conduzidos pelo usuário no ambiente local, sem armazenar senha em código.
- Validação de relatório Excel, normalização de CNPJ, competência e título da tarefa.
- POST HTTPS autenticado via Bearer token para \`/api/ebef/gestta-sync\`.
- Serviço da Vercel valida novamente todos os dados antes de upsert no Supabase.
- \`ebef_gestta_tasks\` contém o último status observado por chave lógica; \`ebef_gestta_sync_runs\` registra os lotes processados.
- Nenhum registro é apagado automaticamente e nenhum status de transmissão é inferido.

### Limites conhecidos

- Não há integração direta com a tabela de declarações nem dashboard E-BEF nesta entrega.
- O XLSX não possui ID interno da tarefa, prazo legal, anexo ou histórico; portanto não se promete capturar esses campos nesta etapa.
- A automação completa depende de confirmar o botão de exportação e os filtros no ambiente autenticado real; seleção incorreta aborta caso existam tarefas que não são E-BEF.
- Requer implantação manual em ambiente de testes, configuração de três variáveis na Vercel, migração SQL e worker em computador Windows autorizado.
- Só ativar agendamento e produção após conferir integridade dos dados, autorização contratual, logs e backup.

Instruções detalhadas: \`gestta-worker/README.md\`.
