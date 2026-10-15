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

## Filtros observados na interface Gestta (capturas de 15/10/2026)

- **Tarefas:** tres opcoes marcadas: "DECLARAÇÃO DE EBEF | TÉCNICO" e **duas entradas diferentes** iniciadas por "VERIFICAR NECESSIDADE DE EBEF | ..." (sufixos cortados nas capturas; nao inventar nomes).
- **Clientes:** Todos os clientes.
- **Usuarios:** Todos os usuarios.
- **Intervalo de datas:** 01/01/2026 a 31/12/2026.
- **Exibir por:** Data Meta.
- **Total exibido na tela:** 128 tarefas (nao necessariamente 128 CNPJs unicos).
- **Exportacao:** icone de download no canto superior direito. Nao e possivel determinar o seletor CSS ou se ele abre menu de exportacao somente pela imagem.

**Atencao:** data-meta filtrada na tela nao e necessariamente igual a competencia do XLSX. Nao imponha competencia 2026 ao importar ate confirmar a regra no Gestta.

O worker reconhece as categorias `declaracao` e `verificacao` pelos prefixos completos de cada tipo de titulo. Os sufixos especificos permanecem no campo original `tarefa` e participam da chave logica, permitindo tipos distintos para o mesmo CNPJ/competencia.

**Validacao pendente antes de --auto:** exportar novo XLSX com esses filtros, comparar quantidade e titulos, inspecionar os controles DOM localmente, registrar os seletores corretos e confirmar que os filtros persistem em sessao nova. O atalho --auto disponivel no MVP **nao aplica nem valida os filtros automaticamente**, apenas aciona o seletor configurado em uma URL. Nao agendar ate implementar e homologar a verificacao do estado dos filtros.

A calibracao automatica tambem exige GESTTA_DATE_MODE_SELECTOR para confirmar que o campo Exibir por esta em Data Meta. Somente inspecao do HTML autenticado pode estabelecer seletores confiaveis.
