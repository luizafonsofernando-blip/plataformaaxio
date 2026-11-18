import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { saveRtcReport } from "../server-assets/rtc-reports.mjs";

const record = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  companyId: "22222222-2222-4222-8222-222222222222",
  analysisId: "33333333-3333-4333-8333-333333333333",
  createdBy: "44444444-4444-4444-8444-444444444444",
};

async function samplePdf() {
  const pdf = await PDFDocument.create();
  pdf.addPage([300, 300]);
  return pdf.save();
}

test("RTC report is hashed, stored privately and registered without overwrite", async () => {
  let uploaded;
  let registered;
  const client = {
    storage: { from(bucket) {
      assert.equal(bucket, "rtc-reports");
      return { async upload(name, bytes, options) { uploaded = { name, bytes, options }; return { error: null }; } };
    } },
    async rpc(name, params) { assert.equal(name, "rtc_register_report"); registered = params; return { error: null }; },
  };
  const result = await saveRtcReport(client, record, await samplePdf());
  assert.equal(result.objectName, `${record.organizationId}/${record.companyId}/${result.id}.pdf`);
  assert.equal(registered.p_sha256, result.sha256);
  assert.equal(registered.p_byte_length, uploaded.bytes.length);
  assert.deepEqual(uploaded.options, { contentType: "application/pdf", upsert: false });
});

test("RTC report upload is removed if database registration fails", async () => {
  let removed;
  const client = {
    storage: { from() { return {
      async upload() { return { error: null }; },
      async remove(names) { removed = names; return { error: null }; },
    }; } },
    async rpc() { return { error: { message: "database error" } }; },
  };
  await assert.rejects(saveRtcReport(client, record, await samplePdf()), (error) => error.code === "report_registration_failed");
  assert.equal(removed.length, 1);
});

test("RTC report rejects invalid PDF before reaching Storage", async () => {
  await assert.rejects(saveRtcReport({}, record, Buffer.from("%PDF-not-valid")), (error) => error.code === "invalid_report_pdf");
});
