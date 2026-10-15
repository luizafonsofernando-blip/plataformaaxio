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
- O relatório Gestta mais recente possui Id, Vencimento e Data Legal, mas não fornece anexos ou histórico completo. Os novos campos já são importados; não se promete capturar anexos nem histórico nesta etapa.
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

**Validacao pendente antes de --auto:** exportar novo XLSX com esses filtros, comparar quantidade e titulos, inspecionar os controles DOM localmente, registrar os seletores corretos e confirmar que os filtros persistem em sessao nova. O atalho --auto agora tenta aplicar/verificar os filtros de Data Meta, tarefas, clientes, usuarios e filtros avancados (4 status + 3 tipos) usando seletores configurados manualmente. Esses seletores ainda nao foram calibrados no Gestta autenticado; NAO agendar ate validar cada controle e o escopo completo de departamentos.

A calibracao automatica tambem exige GESTTA_DATE_MODE_SELECTOR para confirmar que o campo Exibir por esta em Data Meta. Somente inspecao do HTML autenticado pode estabelecer seletores confiaveis.

## Validação com duas exportações de outubro (15/10/2026)

Os arquivos gestta.busca.xlsx e gestta.busca(1).xlsx têm os mesmos 10 registros, com 10 IDs iguais, todos com vencimento 15/10 ou 20/10/2026. Não há divergência nas 15 colunas. Os arquivos binários têm hashes diferentes, mas o conteúdo tabular é igual.

Esta comparação mostra que o mesmo ID pode aparecer em duas exportações e deve ser deduplicado. Entretanto, não permite comprovar que o segundo arquivo usou exatamente 02/10 a 31/10: o XLSX não contém os critérios do intervalo selecionado e as tarefas vencem em datas comuns aos dois recortes.

Antes de agendar, obter uma captura do formulário/modal de exportação de datas (ou inspeção local dos controles) e validar também os filtros **específicos da exportação**, caso sejam independentes dos filtros do dashboard. A verificação dos vencimentos no Excel é necessária mas insuficiente para provar abrangência completa, sobretudo nos intervalos sobrepostos e nas exportações vazias.

Para exportação mensal, o worker agora exige a coluna Id preenchida para cada tarefa e falha sem gravação se a identidade não for confiável.


## Captura adicional da tela Gestta (15/10/2026)

O print mais recente mostra o painel com:
- Intervalo visível `02/10/2026 - 30/10/2026` (não chega ao dia 31).
- Exibir por `Data Meta`; clientes `Todos clientes`; usuários `Todos usuários`.
- Contador `10 | 10 Tarefas`, com vencimentos visíveis nos dias 15 e 20.
- Um indicador laranja sobre o ícone de filtros avançados e um botão de download no alto à direita.

Não há modal de exportação aberto nesta captura. Não é possível concluir se clicar em Download abre outro seletor de período ou inicia um arquivo direto.

**Guardrail de homologação:** enquanto não for confirmado que o Gestta aceita exportar um período abrangendo o dia 31 (p.ex. 02/10 a 31/10), não liberar o robô automático mensal. Testar o calendário com término em 31/10, conferir intervalo exibido e exportação realmente gerada. Se filtros avançados afetarem a carteira, documentar e verificar seu estado efetivo no RPA, sem pressupor que o campo de três tarefas é o único filtro ativo.

## Filtros avancados observados na captura (15/10/2026)

- **Tipo da tarefa:** Fluxo de tarefas, Solicitação de serviço, Recorrente — as 3 opções estavam selecionadas.
- **Status da tarefa:** Aberta e Impedimento selecionados; Concluída e Desconsiderada NÃO estavam selecionados.
- **Departamento:** resumo visível `Contábil +16`. Esse texto **não prova** que todos os departamentos estejam selecionados. É necessário abrir o dropdown e validar as escolhas efetivas.
- **Agrupador de cliente:** resumo `Todos agrupadores de ...`; confirmar ausência de restrição relevante.
- **Aplicar:** botão laranja `Filtrar` dentro da lateral direita.

Para o espelho Gestta -> Luce, recomendamos TODOS os quatro status para acompanhar mudanças de situação e evitar conclusões invisíveis. Uma tarefa concluída é um estado do Gestta, não comprova transmissão E-BEF. Uma tarefa desconsiderada não implica automaticamente dispensa legal.

Alteração feita no RPA: `GESTTA_ADVANCED_OPEN_SELECTOR`, `GESTTA_ADVANCED_APPLY_SELECTOR`, `GESTTA_ADVANCED_STATUS_SELECTORS` (4 chaves), `GESTTA_ADVANCED_TASK_TYPE_SELECTORS` (3 chaves), `GESTTA_ADVANCED_DEPARTMENT_SELECTOR`, `GESTTA_ADVANCED_DEPARTMENT_SELECT_ALL_SELECTOR`, `GESTTA_ADVANCED_DEPARTMENT_OPTION_CHECKBOXES_SELECTOR` e `GESTTA_ADVANCED_DEPARTMENT_TOTAL_COUNT`. Todos são obrigatórios no --auto; o robô falha quando não consegue validar os controles, sem substituir seletores por suposições.

A comparação textual `Contábil +16` não certifica o conjunto de departamentos. Na homologação, deve-se abrir o seletor e conferir todos os departamentos efetivos; se necessário evoluir para checagem individual de cada opção, antes de autorizar agendamento.

## Captura do seletor Departamento aberto (15/10/2026)

No dropdown aparecem as opções:
- **Selecionar todos** (ação explícita disponível).
- **Administrativo** marcado.
- **Arquivo** desmarcado.
- **Atendimento** marcado.
- **Auditoria** marcada.
- Outras opções são acessadas por rolagem; não é possível contar o total pela captura.

O resumo `Contábil +16` não significa que TODOS os departamentos foram selecionados. A nova rotina do RPA deverá **abrir Departamento → clicar Selecionar todos → validar os checkboxes e a quantidade TOTAL esperada** antes de acionar `Filtrar`. Um menu com renderização virtualizada ou seletores desconhecidos deve abortar para nova calibração, nunca considerar cobertura integral apenas pelo resumo textual.

**Pendente:** contar todos os departamentos após clicar Selecionar todos em sessão autorizada, calibrar a ação de seleção geral e o conjunto de checkboxes reais, e testar que os filtros se mantêm aplicados depois do botão Filtrar. O código foi atualizado em branch de rascunho e NÃO executado no Gestta.
