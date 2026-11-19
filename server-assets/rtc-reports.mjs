import { createHash, randomUUID } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { RtcStoreError, validUuid } from "./rtc-store.mjs";

const MAX_REPORT_BYTES = 20 * 1024 * 1024;

export async function saveRtcReport(client, record, pdfBytes) {
  for (const key of ["organizationId", "companyId", "analysisId", "createdBy"]) {
    if (!validUuid(record?.[key])) throw new RtcStoreError("invalid_report_metadata");
  }
  const bytes = Buffer.from(pdfBytes || []);
  if (bytes.length < 8 || bytes.length > MAX_REPORT_BYTES || !bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
    throw new RtcStoreError("invalid_report_pdf");
  }
  try { await PDFDocument.load(bytes); }
  catch { throw new RtcStoreError("invalid_report_pdf"); }
  const id = randomUUID();
  const objectName = `${record.organizationId}/${record.companyId}/${id}.pdf`;
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const storage = client.storage.from("rtc-reports");
  const { error: uploadError } = await storage.upload(objectName, bytes, { contentType: "application/pdf", upsert: false });
  if (uploadError) throw new RtcStoreError("report_upload_failed", 503);
  const { error: registerError } = await client.rpc("rtc_register_report", {
    p_id: id,
    p_organization_id: record.organizationId,
    p_company_id: record.companyId,
    p_analysis_id: record.analysisId,
    p_object_name: objectName,
    p_sha256: sha256,
    p_byte_length: bytes.length,
    p_created_by: record.createdBy,
  });
  if (registerError) {
    const { error: cleanupError } = await storage.remove([objectName]);
    if (cleanupError) throw new RtcStoreError("report_cleanup_required", 503);
    throw new RtcStoreError("report_registration_failed", 503);
  }
  return { id, objectName, sha256, byteLength: bytes.length };
}
