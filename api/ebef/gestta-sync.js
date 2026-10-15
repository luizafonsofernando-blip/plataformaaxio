import { createHash, timingSafeEqual } from 'node:crypto';
import { setApiSecurityHeaders } from '../_security.js';

const MAX_BODY_BYTES = 600_000;
const MAX_TASKS = 2_000;

function isAuthorized(actual, expected) {
  if (!actual || !expected) return false;
  const a = createHash('sha256').update(actual).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

function ascii(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toUpperCase();
}

function validateTask(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return false;
  const keys = ['source_key', 'cnpj', 'competencia', 'tarefa', 'tipo_tarefa', 'tipo_registro', 'cliente', 'departamento', 'responsavel', 'status_gestta'];
  if (!keys.every((key) => typeof row[key] === 'string')) return false;
  if (!/^[0-9]{14}$/.test(row.cnpj) || !/^20\d{2}-(0[1-9]|1[0-2])$/.test(row.competencia)) return false;
  if (!/^[a-f0-9]{64}$/.test(row.source_key)) return false;
  if (row.gestta_id !== null &&
      (typeof row.gestta_id !== 'string' || !/^[a-f0-9]{24}$/.test(row.gestta_id))) return false;
  for (const field of ['vencimento', 'data_legal', 'concluido_em']) {
    if (row[field] !== null && (typeof row[field] !== 'string' ||
        !/^d{4}-d{2}-d{2}$/.test(row[field]) ||
        Number.isNaN(Date.parse(row[field] + 'T00:00:00Z')) ||
        new Date(row[field] + 'T00:00:00Z').toISOString().slice(0, 10) !== row[field])) return false;
  }
  for (const field of ['feito_atrasado', 'feito_com_multa', 'baixado']) {
    if (row[field] !== null && typeof row[field] !== 'boolean') return false;
  }
  if (!row.tarefa || !row.cliente || !row.status_gestta || !row.responsavel) return false;
  if (keys.some((key) => row[key].length > 500 && key !== 'source_key')) return false;
  const title = ascii(row.tarefa);
  const kind = /^DECLARACAO DE EBEF(?:\s*\||$)/.test(title) ? 'declaracao'
    : /^VERIFICAR NECESSIDADE DE EBEF(?:\s*\||$)/.test(title) ? 'verificacao'
    : null;
  if (!kind || row.tipo_tarefa !== kind) return false;
  const expected = createHash('sha256').update(
    row.gestta_id ? 'gestta-id:' + row.gestta_id
      : row.cnpj + '|' + row.competencia + '|' + ascii(row.tarefa)
  ).digest('hex');
  return row.source_key === expected;
}

async function postSupabase(table, records, url, key, upsert = false) {
  const query = upsert ? '?on_conflict=source_key' : '';
  const response = await fetch(url + '/rest/v1/' + table + query, {
    method: 'POST',
    headers: {
      apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json',
      Prefer: upsert ? 'resolution=merge-duplicates,return=minimal' : 'return=minimal',
    },
    body: JSON.stringify(records),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    console.error('Falha ao gravar tabela ' + table + ': HTTP ' + response.status);
    throw new Error('Falha no banco da Luce.');
  }
}

export default async function handler(req, res) {
  setApiSecurityHeaders(res);
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método não permitido.' });
  }
  const secret = process.env.GESTTA_SYNC_TOKEN;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const dbUrl = process.env.SUPABASE_URL;
  if (!secret || secret.length < 32 || !key || !dbUrl || !/^https:\/\//.test(dbUrl)) {
    return res.status(503).json({ error: 'Integração ainda não configurada.' });
  }
  const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!isAuthorized(bearer, secret)) return res.status(401).json({ error: 'Acesso não autorizado.' });
  const contentLength = Number(req.headers['content-length'] || 0);
  if (contentLength > MAX_BODY_BYTES) return res.status(413).json({ error: 'Relatório excede o tamanho permitido.' });
  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (Buffer.byteLength(JSON.stringify(body ?? {}), 'utf8') > MAX_BODY_BYTES) {
      return res.status(413).json({ error: 'Relatório excede o tamanho permitido.' });
    }
  } catch (_) {
    return res.status(400).json({ error: 'JSON inválido.' });
  }
  if (!body || body.source !== 'gestta' || !Array.isArray(body.tasks) ||
      body.tasks.length < 1 || body.tasks.length > MAX_TASKS ||
      !/^[a-f0-9]{64}$/.test(String(body.export_sha256 || '')) ||
      !body.tasks.every(validateTask)) {
    return res.status(422).json({ error: 'Relatório não atende ao formato esperado.' });
  }
  if (new Set(body.tasks.map((row) => row.source_key)).size !== body.tasks.length) {
    return res.status(422).json({ error: 'Foram encontradas tarefas duplicadas.' });
  }

  const now = new Date().toISOString();
  const url = dbUrl.replace(/\/$/, '');
  const records = body.tasks.map((row) => ({
    source_key: row.source_key, gestta_id: row.gestta_id, cnpj: row.cnpj, competencia: row.competencia,
    tarefa: row.tarefa, tipo_tarefa: row.tipo_tarefa, tipo_registro: row.tipo_registro,
    vencimento: row.vencimento, data_legal: row.data_legal, concluido_em: row.concluido_em,
    feito_atrasado: row.feito_atrasado, feito_com_multa: row.feito_com_multa, baixado: row.baixado,
    cliente: row.cliente, departamento: row.departamento,
    responsavel: row.responsavel, status_gestta: row.status_gestta,
    export_sha256: body.export_sha256, last_seen_at: now,
  }));
  try {
    // Apenas tarefas do Gestta: não modifica protocolo, declaração ou status E-BEF.
    for (let i = 0; i < records.length; i += 100) {
      await postSupabase('ebef_gestta_tasks', records.slice(i, i + 100), url, key, true);
    }
    await postSupabase('ebef_gestta_sync_runs', [
      { source: 'gestta', export_sha256: body.export_sha256, synced_count: records.length }
    ], url, key);
    return res.status(200).json({ ok: true, synced: records.length, synced_at: now });
  } catch (error) {
    console.error('Falha na sincronização Gestta -> Luce:', error?.message || 'Erro não identificado');
    return res.status(502).json({ error: 'Falha ao sincronizar. Verifique os logs da API.' });
  }
}
