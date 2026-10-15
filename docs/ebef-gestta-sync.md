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

## Validação com duas exportações de outubro (15/10/2026)

Os arquivos gestta.busca.xlsx e gestta.busca(1).xlsx têm os mesmos 10 registros, com 10 IDs iguais, todos com vencimento 15/10 ou 20/10/2026. Não há divergência nas 15 colunas. Os arquivos binários têm hashes diferentes, mas o conteúdo tabular é igual.

Esta comparação mostra que o mesmo ID pode aparecer em duas exportações e deve ser deduplicado. Entretanto, não permite comprovar que o segundo arquivo usou exatamente 02/10 a 31/10: o XLSX não contém os critérios do intervalo selecionado e as tarefas vencem em datas comuns aos dois recortes.

Antes de agendar, obter uma captura do formulário/modal de exportação de datas (ou inspeção local dos controles) e validar também os filtros **específicos da exportação**, caso sejam independentes dos filtros do dashboard. A verificação dos vencimentos no Excel é necessária mas insuficiente para provar abrangência completa, sobretudo nos intervalos sobrepostos e nas exportações vazias.

Para exportação mensal, o worker agora exige a coluna Id preenchida para cada tarefa e falha sem gravação se a identidade não for confiável.
