// Diagnostico de entrada da interface, somente leitura.
// Nunca registra URL completa, HTML, nomes de clientes, credenciais ou cookies.
export function classifyEntryUrl(raw) {
  try {
    const u=new URL(raw);
    if (u.hostname!=='app.gestta.com.br' || u.protocol!=='https:') return 'fora_do_gestta';
    const route=(u.pathname+u.hash).toLowerCase();
    if (/login|signin|auth|entrar|acesso/.test(route)) return 'possivel_login';
    if (/sidebar\/task|task\/overview|task\/list/.test(route)) return 'tarefas';
    if (/dashboard/.test(route)) return 'dashboard';
    return 'outra_tela_gestta';
  } catch { return 'endereco_indisponivel'; }
}

export function categorizeEntry(state) {
  if (state.calendarioVisivel) return 'tarefas_carregadas';
  if (state.senhaVisivel || state.rota==='possivel_login') return 'autenticacao_possivelmente_necessaria';
  if (state.menuTarefasVisivel && state.menuTarefasQuantidade===1) return 'menu_tarefas_disponivel';
  if (state.menuTarefasQuantidade>1) return 'menu_tarefas_ambiguo';
  if (state.rota==='dashboard' && state.readyState==='complete') return 'dashboard_sem_menu_tarefas';
  return 'tela_nao_identificada';
}

export async function inspectEntry(page) {
  const summary=await page.evaluate(() => {
    const visible=el=>{
      const r=el.getBoundingClientRect();
      const css=window.getComputedStyle(el);
      return r.width>0 && r.height>0 && css.display!=='none' &&
        css.visibility!=='hidden';
    };
    const tasks=[...document.querySelectorAll('a,span,div,li,button')]
      .filter(el=>el.textContent?.trim()==='Tarefas' && visible(el));
    // Nao retorna texto da pagina nem identificadores de usuarios.
    return {
      readyState:document.readyState,
      calendarioVisivel:[...document.querySelectorAll('#date-range')].some(visible),
      menuTarefasQuantidade:tasks.length,
      menuTarefasVisivel:tasks.length>0,
      senhaVisivel:[...document.querySelectorAll('input[type="password"]')].some(visible),
      formSenhaCount:document.querySelectorAll('input[type="password"]').length,
    };
  });
  const state={
    rota:classifyEntryUrl(page.url()),
    ...summary,
    frames:page.frames().length,
  };
  return {...state,diagnostico:categorizeEntry(state)};
}
