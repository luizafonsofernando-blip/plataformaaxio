// Planeja as janelas de consulta sem abrir navegador ou acessar sistemas.
// Seguro executar sem estar autenticado no Gestta.
import { buildMonthPlan } from './month-plan-options.mjs';
import { brazilRange } from './month-windows.mjs';

try {
  const plan=buildMonthPlan(process.argv.slice(2));
  console.log('PLANO E-BEF: SOMENTE SIMULACAO. NENHUMA CONSULTA, EXPORTACAO OU SINCRONIZACAO.');
  console.log('PLANO: competencia_inicial='+plan.options.from+
    '; mes_final='+plan.options.through.slice(0,7));
  console.log('PLANO: competencias='+plan.months.length+
    '; janelas='+plan.windows.length+
    '; limite=30 dias inclusivos por janela');
  for(const {month,periods} of plan.months){
    for(const [i,period] of periods.entries()){
      console.log('JANELA: '+month+' ('+(i+1)+'/'+periods.length+') '+brazilRange(period));
    }
  }
  console.log('PLANO: meses com 31 dias possuem duas janelas sobrepostas.');
  console.log('PLANO: sobreposicoes serao conciliadas por ID estavel das tarefas apos validar XLSX.');
  console.log('PLANO: nenhuma tarefa foi alterada; nenhum arquivo foi baixado ou enviado.');
} catch(error) {
  console.error('FALHA NO PLANEJAMENTO: '+error.message);
  process.exitCode=1;
}
