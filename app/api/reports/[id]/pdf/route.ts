import { NextResponse, type NextRequest, after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { reportHtml } from "@/lib/reports/html";
import { renderPdf } from "@/lib/reports/pdf";
import { parseReportContent } from "@/lib/reports/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// §8 PDF route: render the shared report components to branded HTML → puppeteer →
// upload to the private `reports/{member_id}/{report_id}.pdf` bucket → cache
// pdf_path → return a 10-minute signed URL. Access is enforced by the SAME RLS
// read the web view uses: a report the caller's rep_* policy can't see → 404.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  // RLS-scoped read = the access gate.
  const { data: report } = await supabase
    .from("reports")
    .select("id, member_id, content, pdf_path")
    .eq("id", id)
    .maybeSingle();
  if (!report) return new NextResponse("Not found", { status: 404 });

  // Audit the view without blocking the download (it's a fire-and-forget log).
  after(async () => {
    await supabase.rpc("log_report_view", { p_report: id });
  });

  // Private bucket write + pdf_path cache use the service client (the bucket is
  // private; reports are immutable to clinicians). pdf_path is a derived artifact
  // pointer, not workflow state, so §0.4's "transition via RPC" rule doesn't apply.
  const content = parseReportContent(report.content);
  const admin = createAdminClient();
  const objectPath = report.pdf_path ?? `${report.member_id}/${report.id}.pdf`;
  const filename = `${slugify(content.title)}.pdf`;

  // Fast path: the PDF was already generated and cached. Reports are immutable, so
  // re-sign the stored object instead of launching a headless Chromium again.
  if (report.pdf_path) {
    const { data: cachedSigned } = await admin.storage
      .from("reports")
      .createSignedUrl(report.pdf_path, 600, { download: filename });
    if (cachedSigned) return NextResponse.redirect(cachedSigned.signedUrl, 302);
    // Signing the cached object failed (e.g. deleted) — fall through and regenerate.
  }

  let pdf: Buffer;
  try {
    pdf = await renderPdf(await reportHtml(content));
  } catch (e) {
    return NextResponse.json(
      { error: "pdf_unavailable", detail: e instanceof Error ? e.message : String(e) },
      { status: 503 },
    );
  }

  const { error: upErr } = await admin.storage
    .from("reports")
    .upload(objectPath, pdf, { contentType: "application/pdf", upsert: true });
  if (upErr) {
    return NextResponse.json({ error: "upload_failed", detail: upErr.message }, { status: 500 });
  }
  await admin.from("reports").update({ pdf_path: objectPath }).eq("id", report.id);

  const { data: signed, error: signErr } = await admin.storage
    .from("reports")
    .createSignedUrl(objectPath, 600, { download: filename });
  if (signErr || !signed) {
    return NextResponse.json({ error: "sign_failed" }, { status: 500 });
  }
  return NextResponse.redirect(signed.signedUrl, 302);
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "report"
  );
}
