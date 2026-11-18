import { rejectDisallowedOrigin, rejectLargeRequest, rejectRateLimited, requireActiveModuleUser, setApiSecurityHeaders } from '../_security.js';
import { assertCompanyAccess, rtcApiError, rtcClient, RtcStoreError, validUuid } from '../../server-assets/rtc-store.mjs';
import { validateDraft } from '../../server-assets/rtc-drafts.mjs';

const columns = 'id, company_id, title, engine, operation_date, scenario, version, created_at, updated_at, created_by';

export default async function handler(request, response) {
  setApiSecurityHeaders(response);
  if (rejectDisallowedOrigin(request, response)) return;
  if (!['GET', 'POST', 'PATCH'].includes(request.method)) return response.status(405).json({ code: 'method_not_allowed' });
  if (rejectLargeRequest(request, response, 32768)) return;
  if (await rejectRateLimited(request, response, { action: 'rtc_drafts', limit: 30, windowSeconds: 60 })) return;
  const user = await requireActiveModuleUser(request, response, 'reforma-tributaria');
  if (!user) return;
  try {
    const body = request.body || {};
    const organizationId = request.method === 'GET' ? request.query?.organization_id : body.organization_id;
    const companyId = request.method === 'GET' ? request.query?.company_id : body.company_id;
    const client = rtcClient();
    const member = await assertCompanyAccess(client, organizationId, companyId, user.id);
    if (request.method === 'GET') {
      const { data, error } = await client.from('rtc_simulation_drafts').select(columns)
        .eq('organization_id', organizationId).eq('company_id', companyId)
        .order('updated_at', { ascending: false }).limit(100);
      if (error) throw new RtcStoreError('store_unavailable', 503);
      return response.status(200).json({ drafts: data });
    }
    if (member.role === 'viewer') throw new RtcStoreError('draft_write_forbidden', 403);
    const draft = validateDraft(body);
    if (request.method === 'POST') {
      const { data, error } = await client.from('rtc_simulation_drafts').insert({
        ...draft, organization_id: organizationId, company_id: companyId, created_by: user.id,
      }).select(columns).single();
      if (error?.code === '23505') {
        const { data: existing, error: readError } = await client.from('rtc_simulation_drafts').select(columns)
          .eq('id', draft.id).eq('organization_id', organizationId).eq('company_id', companyId).maybeSingle();
        if (readError || !existing || existing.created_by !== user.id) throw new RtcStoreError('draft_conflict', 409);
        return response.status(200).json({ draft: existing });
      }
      if (error) throw new RtcStoreError('store_unavailable', 503);
      return response.status(201).json({ draft: data });
    }
    if (!validUuid(draft.id) || !Number.isSafeInteger(body.version) || body.version < 1) throw new RtcStoreError('invalid_draft');
    const { data, error } = await client.from('rtc_simulation_drafts')
      .update({ title: draft.title, engine: draft.engine, operation_date: draft.operation_date,
        scenario: draft.scenario, version: body.version + 1 })
      .eq('id', draft.id).eq('organization_id', organizationId).eq('company_id', companyId)
      .eq('created_by', user.id).eq('version', body.version).select(columns).maybeSingle();
    if (error) throw new RtcStoreError('store_unavailable', 503);
    if (!data) throw new RtcStoreError('draft_conflict', 409);
    return response.status(200).json({ draft: data });
  } catch (error) { return rtcApiError(response, error); }
}
