// Preenche os dois campos de data do calendário Gestta com cuidado com a
// regra de intervalo: ao avançar para outro mês, preencher o FIM primeiro
// evita deixar transitoriamente a data inicial posterior ao fim antigo.
// Ao voltar para outro mês, preencher o INÍCIO primeiro evita o inverso.
// Nunca clica em Aplicar, Filtrar ou download.
function parseDateBR(value) {
  const match=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(value??'').trim());
  if(!match)return null;
  const [,d,m,y]=match;
  const date=new Date(Date.UTC(Number(y),Number(m)-1,Number(d)));
  if(!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10)!==
     [y,m,d].join('-'))return null;
  return date.getTime();
}

export function chooseDateFieldOrder(current,desired) {
  const currentStart=parseDateBR(current?.start);
  const currentEnd=parseDateBR(current?.end);
  const nextStart=parseDateBR(desired?.start);
  const nextEnd=parseDateBR(desired?.end);
  if(nextStart===null||nextEnd===null || nextStart>nextEnd){
    throw new Error('Datas de destino inválidas para calendário.');
  }
  if(currentEnd!==null && nextStart>currentEnd)return ['end','start'];
  if(currentStart!==null && nextEnd<currentStart)return ['start','end'];
  return ['start','end'];
}

export async function fillDateFields(page,{initial,final,start,end}) {
  if(await initial.count()!==1 || await final.count()!==1 ||
     !(await initial.isVisible()) || !(await final.isVisible())){
    throw new Error('Campos de calendario nao sao unicos e visiveis.');
  }
  const desired={start,end};
  const read=async()=>({
    start:(await initial.inputValue()).trim(),
    end:(await final.inputValue()).trim(),
  });
  const order=chooseDateFieldOrder(await read(),desired);
  console.log('CALENDARIO: ordem de preenchimento='+order.join('->'));

  const locators={start:initial,end:final};
  // No maximo DUAS passagens; segunda tenta corrigir apenas campos que
  // o proprio Gestta pode ter modificado após fill(). Sem reload e sem
  // fechar/abrir menus automaticamente.
  for(let pass=1;pass<=2;pass++){
    for(const key of order){
      const current=await read();
      if(current[key]===desired[key])continue;
      await locators[key].fill(desired[key],{timeout:10000});
      // Evitar ler estado enquanto o daterangepicker ainda reage ao input.
      await page.waitForTimeout(350);
    }
    await page.waitForTimeout(350);
    const observed=await read();
    if(observed.start===start && observed.end===end){
      console.log('CALENDARIO: inicio_ok=true; fim_ok=true; passagens='+pass);
      return {confirmed:true,passages:pass,order};
    }
    console.log('CALENDARIO: apos passagem '+pass+
      '; inicio_ok='+(observed.start===start)+
      '; fim_ok='+(observed.end===end));
  }
  throw new Error('As datas nao permaneceram nos campos apos duas verificacoes. '+
    'Nenhum botao Aplicar foi acionado.');
}
