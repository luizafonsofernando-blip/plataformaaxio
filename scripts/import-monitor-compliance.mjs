import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';

const filename = process.argv[2];
const apply = process.argv.includes('--apply');
const buffer = fs.readFileSync(filename);
const hash = createHash('sha256').update(buffer).digest('hex');
const workbook = XLSX.read(buffer, { type: 'buffer' });
const text = value => value instanceof Date ? Number.isFinite(value.getTime()) ? value.toISOString().slice(0, 10) : '' : value == null || (typeof value === 'number' && !Number.isFinite(value)) ? '' : String(value).trim();
const cases = [];
const rawSheets = [];
const orphanRows = [];
for (const name of workbook.SheetNames) {
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: '' });
  rawSheets.push({ name, rows });
  const headers = rows[0].map(text);
  let group = null;
  for (let index = 1; index < rows.length; index++) {
    const row = rows[index];
    if (!row.slice(1).some(value => text(value))) continue;
    if (text(row[1])) {
      group = { companyName: text(row[1]), sheet: name, rows: [], row: index + 1 };
      cases.push(group);
    }
    if (!group) { orphanRows.push({ sheet: name, row: index + 1 }); continue; }
    group.rows.push({ row: index + 1, values: row, detail: row.map((value, col) => col > 0 && text(value) && headers[col] ? `${headers[col]}: ${text(value)}` : '').filter(Boolean).join('\n') });
  }
}
const prepared = cases.map(group => {
  const first = group.rows[0].values;
  const maed = group.sheet === 'Controle MAED';
  const internal = group.sheet === 'Controle Interno';
  const obligation = [...new Set(group.rows.map(row => text(row.values[2])).filter(Boolean))].join('; ');
  const competences = [...new Set(group.rows.map(row => text(row.values[internal || maed ? 3 : 5])).filter(Boolean))].join('; ');
  const description = group.rows.map(row => `Linha ${row.row}\n${row.detail}`).join('\n\n');
  const amountCents = maed ? group.rows.reduce((sum, row) => sum + (typeof row.values[5] === 'number' ? Math.round(row.values[5] * 100) : 0), 0) : null;
  const assignedName = internal ? text(first[5]) || null : null;
  const internalDueAt = internal && first[6] instanceof Date && Number.isFinite(first[6].getTime()) ? first[6].toISOString() : null;
  return {
    companyName: group.companyName, companyId: null,
    categoryCode: maed ? 'maed' : /DCTF/i.test(obligation) ? 'dctfweb' : /INSS|GPS/i.test(obligation) ? 'inss_gps' : /FGTS/i.test(obligation) ? 'fgts' : /SIMPLES|PGDAS|DAS/i.test(obligation) ? 'simples_das' : 'other',
    origin: maed ? 'maed' : internal ? 'internal' : 'external',
    obligation: obligation || null, competence: competences || null,
    title: maed ? 'MAED identificada' : internal ? 'Pendência interna' : 'Acompanhamento externo',
    description, status: assignedName ? 'assigned' : 'analysis', priority: 'normal',
    assignedName, internalDueAt, amountCents,
    gesttaTask: !internal && !maed ? text(first[3]) || null : null,
    notes: `Fonte: ${path.basename(filename)} | ${group.sheet} | linhas ${group.rows.map(row => row.row).join(', ')}. Status operacional sujeito à conferência; não presumido a partir de observações.`,
    fingerprint: createHash('sha256').update(`${hash}|${group.sheet}|${group.row}`).digest('hex'),
  };
});
if (orphanRows.length) throw new Error(`Linhas sem empresa: ${JSON.stringify(orphanRows)}`);
const summary = {
  label: path.basename(filename),
  counts: Object.fromEntries(workbook.SheetNames.map(name => [name, cases.filter(item => item.sheet === name).length])),
  total: prepared.length,
  maedAmountCents: prepared.filter(item => item.origin === 'maed').reduce((sum, item) => sum + item.amountCents, 0),
  sourceRows: cases.reduce((sum, item) => sum + item.rows.length, 0),
};
if (process.argv.includes('--payload')) {
  console.log(JSON.stringify({ summary, hash, cases: prepared, rawSheets }));
  process.exit(0);
}
console.log(JSON.stringify(summary));
if (!apply) process.exit(0);
process.loadEnvFile('.env.production.local');
const client = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const checked = result => { if (result.error) throw new Error(result.error.message); return result.data; };
const organizations = checked(await client.from('sentinel_organizations').select('id,name'));
if (organizations.length !== 1 || organizations[0].name !== 'Luce Sistemas') throw new Error('Organização ambígua.');
const org = organizations[0].id;
const users = checked(await client.auth.admin.listUsers()).users;
const actor = users.find(user => user.email === 'luizafonsofernando@gmail.com' && user.app_metadata.role === 'admin');
if (!actor) throw new Error('Administrador responsável não identificado.');
const prior = checked(await client.from('sentinel_compliance_import_batches').select('id,status').eq('organization_id',org).eq('file_hash',hash));
if (prior.length) throw new Error(`Arquivo já registrado: ${prior[0].status}`);
const buckets = checked(await client.storage.listBuckets());
if (!buckets.some(bucket => bucket.id === 'sentinel-documents')) checked(await client.storage.createBucket('sentinel-documents', { public: false }));
const storagePath = `${org}/compliance/imports/${hash}.ods`;
checked(await client.storage.from('sentinel-documents').upload(storagePath, buffer, { contentType:'application/vnd.oasis.opendocument.spreadsheet', upsert:false }));
const doc = checked(await client.from('sentinel_documents').insert({ organization_id:org, category:'compliance_source',name:path.basename(filename),source:'compliance_import_preview',storage_path:storagePath,mime_type:'application/vnd.oasis.opendocument.spreadsheet',size_bytes:buffer.length,created_by:actor.id }).select('id').single());
const batch = checked(await client.from('sentinel_compliance_import_batches').insert({ organization_id:org,filename:path.basename(filename),mime_type:'application/vnd.oasis.opendocument.spreadsheet',source_kind:'spreadsheet',file_hash:hash,status:'preview',extracted_summary:summary,preview_payload:{cases:prepared,rawSheets},document_id:doc.id,created_by:actor.id }).select('id').single());
const result = checked(await client.rpc('sentinel_confirm_compliance_import',{p_batch_id:batch.id,p_organization_id:org,p_actor_id:actor.id}));
const verified = await client.from('sentinel_compliance_cases').select('id',{count:'exact',head:true}).eq('organization_id',org).eq('source_reference',path.basename(filename));
checked(verified);
if (verified.count !== prepared.length) throw new Error(`Contagem divergente: ${verified.count}/${prepared.length}`);
console.log(JSON.stringify({result,verified:verified.count,documentId:doc.id}));
