import { RtcStoreError, validUuid } from './rtc-store.mjs';

export function validateDraft(input) {
  const id = input?.id;
  const title = String(input?.title || '').trim();
  const engine = input?.engine;
  const operationDate = input?.operation_date;
  const scenario = input?.scenario;
  const parsedDate = typeof operationDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(operationDate)
    ? new Date(`${operationDate}T12:00:00Z`) : null;
  if (!validUuid(id) || title.length < 2 || title.length > 120 || !['regular', 'simples'].includes(engine)
    || !parsedDate || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== operationDate) {
    throw new RtcStoreError('invalid_draft');
  }
  if (!scenario || typeof scenario !== 'object' || Array.isArray(scenario)
    || !Array.isArray(scenario.items) || scenario.items.length < 1 || scenario.items.length > 50
    || Buffer.byteLength(JSON.stringify(scenario), 'utf8') > 32000) throw new RtcStoreError('invalid_draft');
  for (const item of scenario.items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)
      || typeof item.description !== 'string' || !item.description.trim() || item.description.length > 180
      || !Number.isSafeInteger(item.amount_cents) || item.amount_cents < 0 || item.amount_cents > 1_000_000_000_00
      || (item.ncm && !/^\d{8}$/.test(item.ncm)) || (item.nbs && !/^\d{9}$/.test(item.nbs))) {
      throw new RtcStoreError('invalid_draft');
    }
  }
  return { id, title, engine, operation_date: operationDate, scenario };
}
