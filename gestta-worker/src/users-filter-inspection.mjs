// Inspeção do campo Usuários, identificado somente por relações geométricas
// conhecidas: Tarefas à esquerda, Todos clientes no meio, calendário à direita.
// Não registra nome de usuário, e-mail, texto arbitrário, HTML ou token.
export function validateUserDropdownTopology(raw) {
  if(!raw || raw.clients!==1 || raw.candidates!==1 ||
     raw.dateVisible!==true ||
     !/^gestta-multiselect-dropdown-\d+-p$/.test(raw.userId??'')){
    throw new Error('Topologia do campo Usuarios nao confirmada de forma unica. Nenhum controle acionado.');
  }
  return raw.userId;
}

export async function inspectUserDropdownTopology(page) {
  const raw=await page.evaluate(()=>{
    const norm=text=>String(text??'').normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toUpperCase();
    const safeClasses=node=>[...node?.classList||[]].filter(x=>/^[\w-]{1,64}$/.test(x)).slice(0,7);
    const visible=node=>{
      const r=node.getBoundingClientRect();
      const style=window.getComputedStyle(node);
      return r.width>65 && r.height>10 && style.display!=='none' &&
        style.visibility!=='hidden' && r.top>=0 && r.top<160;
    };
    const date=document.querySelector('#date-range');
    const dateVisible=Boolean(date && visible(date));
    const left=dateVisible?date.getBoundingClientRect().left:null;
    const dropdowns=[...document.querySelectorAll(
      '[id^="gestta-multiselect-dropdown-"][id$="-p"]'
    )].filter(visible).map(el=>({
      id:el.id,el,rect:el.getBoundingClientRect(),
      allClients:/^TODOS\s+(OS\s+)?CLIENTES$/.test(norm(el.textContent)),
    })).filter(entry=>entry.rect.width>=100 &&
      entry.rect.height<100 && (left===null||entry.rect.left<left));
    const clients=dropdowns.filter(d=>d.allClients);
    const rightOfClient=clients.length===1?dropdowns.filter(d=>
      d.id!==clients[0].id &&
      d.rect.left>=clients[0].rect.right-12 &&
      d.rect.left<left && d.rect.top>=0 && d.rect.top<160):[];
    const user=rightOfClient.length===1?rightOfClient[0]:null;
    let labelKind='desconhecido';
    if(user){
      const label=norm(user.el.textContent);
      if(/^TODOS\s+(OS\s+)?USUARIOS$/.test(label))labelKind='todos_usuarios';
      else if(/\bUSUARIOS\b/.test(label))labelKind='rotulo_usuarios';
      else if(/\+\s*\d+\s*$/.test(label))labelKind='resumo_com_quantidade';
      else if(label==='')labelKind='vazio';
      else labelKind='selecao_ou_rotulo_diferente';
    }
    return {
      clients:clients.length,candidates:rightOfClient.length,
      dateVisible,topDropdowns:dropdowns.length,
      userId:user?.id??'',labelKind,
      userClasses:user?safeClasses(user.el):[],
    };
  });
  return {...raw,topologyConfirmed:raw.clients===1 &&
    raw.candidates===1 && raw.dateVisible};
}

export async function openUsersFilterForInspection(page,topology) {
  const id=validateUserDropdownTopology(topology);
  const control=page.locator('#'+id);
  const count=await control.count();
  if(count!==1 || !(await control.isVisible())) {
    throw new Error('Controle Usuarios ausente ou ambiguo. Nada foi clicado.');
  }
  const hit=await control.evaluate(el=>{
    const r=el.getBoundingClientRect();
    if(r.width<100||r.height<12||r.height>90) {
      return {safe:false,reason:'dimensoes_incomuns'};
    }
    const x=Math.min(12,Math.floor(r.width/4)),y=Math.floor(r.height/2);
    const node=document.elementFromPoint(r.left+x,r.top+y);
    if(!node||!(el===node||el.contains(node))) {
      return {safe:false,reason:'elemento_encoberto'};
    }
    for(let n=node;n&&n!==el;n=n.parentElement) {
      if(n.matches('button,input,a,[role="button"]')) {
        return {safe:false,reason:'clique_em_controle_secundario'};
      }
    }
    return {safe:true,x,y};
  });
  if(!hit.safe)throw new Error('Nao foi confirmado ponto seguro para abrir Usuarios: '+hit.reason);
  await control.click({position:{x:hit.x,y:hit.y},timeout:10000});
  return id;
}

export async function inspectUsersPopup(page,id) {
  if(!/^gestta-multiselect-dropdown-\d+-p$/.test(id))throw new Error('ID invalido');
  return page.evaluate(id=>{
    const trigger=document.getElementById(id);
    if(!trigger)return {found:false,reason:'gatilho_ausente'};
    const visible=node=>{
      const r=node.getBoundingClientRect(),css=getComputedStyle(node);
      return r.width>0&&r.height>0&&css.visibility!=='hidden'&&css.display!=='none';
    };
    let node=trigger.parentElement;
    const menus=[];
    for(let depth=1;node&&depth<=5;depth++,node=node.parentElement){
      const matches=[...node.querySelectorAll('.gestta-multiselect-dropdown__menu')]
        .filter(visible);
      if(matches.length){
        menus.push(...matches.map(menu=>({menu,depth})));
        break;
      }
    }
    if(menus.length!==1) return {found:false,reason:'menu_inexistente_ou_ambiguo',
      count:menus.length};
    const {menu,depth}=menus[0];
    const norm=v=>String(v??'').normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ').toUpperCase();
    const items=[...menu.querySelectorAll('.gestta-multiselect-dropdown__item-toggle')];
    const controlTitles=new Set(['SELECIONAR TODOS','DESSELECIONAR TODOS']);
    const extras=items.filter(item=>controlTitles.has(norm(item.closest('li')?.textContent)));
    const options=items.filter(item=>!controlTitles.has(norm(item.closest('li')?.textContent)));
    const states=options.map(item=>{
      const cb=item.querySelector('input[type="checkbox"]') ||
        item.querySelector('.checkbox-item');
      if(!cb)return null;
      if(cb.matches('input[type="checkbox"]'))return cb.checked;
      const input=cb.querySelector('input[type="checkbox"]');
      if(input)return input.checked;
      const aria=cb.getAttribute('aria-checked')??item.getAttribute('aria-checked');
      if(aria==='true'||aria==='false')return aria==='true';
      const className=cb.className||'';
      if(typeof className==='string' && /\bchecked\b/.test(className))return true;
      return null;
    });
    const selectedCount=states.filter(v=>v===true).length;
    const uncheckedCount=states.filter(v=>v===false).length;
    const unknownCount=states.filter(v=>v===null).length;
    const x=menu.getBoundingClientRect();
    return {
      found:true,depth,optionsInDom:options.length,
      selectionControls:extras.length,
      selectedCount,uncheckedCount,unknownCount,
      allVisibleOptionsChecked:options.length>0&&unknownCount===0&&
        uncheckedCount===0,
      // Menu pode virtualizar usuários. Isso ainda NÃO comprova Todos
      // usuários selecionado; precisaremos validar escopo e total real.
      menuHeightApprox:Math.round(x.height/10)*10,
    };
  },id);
}
