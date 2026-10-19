// Montagem de fotografia E-BEF EXCLUSIVAMENTE OFFLINE.
// Recebe paginas previamente fornecidas por um operador; NAO acessa Supabase.
// O manifesto e autodeclarado: nao prova consistencia transacional do banco.
// NUNCA imprimir snapshot.rows: contem informacoes de clientes.
import {createHash} from 'node:crypto';
import {validateGesttaApiTask} from '../../api/ebef/gestta-sync-contract.mjs';

export const MAX_EBEF_SNAPSHOT_ROWS=10000;
const VERSION='ebef_gestta_tasks/v1';
const error=()=>new Error('Snapshot E-BEF incompleto ou inconsistente; nenhuma operacao autorizada.');

function capturedAtValid(value){
  return typeof value==='string' &&
    /^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString()===value;
}

export function assembleEbefOfflineSnapshot(manifest,pages){
  if(!manifest || typeof manifest!=='object'||Array.isArray(manifest) ||
     manifest.schema!==VERSION ||
     manifest.mode!=='operator_supplied_offline' ||
     manifest.scope!=='gestta_ebef_tasks_only' ||
     !/^[a-f0-9]{64}$/.test(manifest.revision??'')||
     !capturedAtValid(manifest.capturedAt) ||
     !Number.isSafeInteger(manifest.totalRows) ||
     manifest.totalRows<0 || manifest.totalRows>MAX_EBEF_SNAPSHOT_ROWS ||
     !Number.isSafeInteger(manifest.pageSize) ||
     manifest.pageSize<1 || manifest.pageSize>500 ||
     !Array.isArray(pages)){
    throw error();
  }
  const pageCount=Math.ceil(manifest.totalRows/manifest.pageSize);
  if(pages.length!==pageCount)throw error();
  const rows=[];
  const seen=new Set();
  let previousKey='';
  for(let i=0;i<pageCount;i++){
    const page=pages[i];
    const expectedRows=Math.min(manifest.pageSize,
      manifest.totalRows-i*manifest.pageSize);
    if(!page || typeof page!=='object'||Array.isArray(page)||
       page.pageIndex!==i || page.revision!==manifest.revision ||
       !Array.isArray(page.rows)||page.rows.length!==expectedRows){
      throw error();
    }
    for(const row of page.rows){
      if(!validateGesttaApiTask(row))throw error();
      // Paginacao deve ter ordem global estavel (ORDER BY source_key).
      if(seen.has(row.source_key)||row.source_key<=previousKey){
        throw error();
      }
      seen.add(row.source_key);
      previousKey=row.source_key;
      rows.push(row);
    }
  }
  if(rows.length!==manifest.totalRows)throw error();
  const digest=createHash('sha256')
    .update(JSON.stringify({revision:manifest.revision,
      capturedAt:manifest.capturedAt,keys:rows.map(x=>x.source_key)}))
    .digest('hex');
  return {
    // Atributo "complete" significa paginas correspondentes ao manifesto,
    // NAO que o operador leu o banco inteiro ou com isolamento real.
    snapshot:{
      kind:'explicit_readonly_snapshot',
      origin:'operator_supplied_offline',
      complete:true,
      capturedAt:manifest.capturedAt,
      rows,
    },
    summary:{
      mode:'offline_snapshot_pages',
      pagesVerified:pageCount,
      rowsVerified:rows.length,
      checksum:digest,
      manifestPagesComplete:true,
      databaseSnapshotVerified:false,
      sourceScopeIndependentlyVerified:false,
      isolationIndependentlyVerified:false,
      allUsersProven:false,
      writesPerformed:false,
    },
  };
}
