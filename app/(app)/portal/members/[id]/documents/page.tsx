import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { DocumentUploader } from "@/components/documents/document-uploader";
import { DocumentList, type DocumentRow } from "@/components/documents/document-list";

// §10 caregiver "Documents" — the family uploads the member's real medical documents
// (blood work, scans, prescriptions) anytime, for the doctor and admin to see. RLS
// (`doc_*` in migration 0014) scopes the list to this caregiver's own member.
export default async function PortalDocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: member } = await supabase
    .from("members")
    .select("id, full_name")
    .eq("id", id)
    .maybeSingle();
  if (!member) notFound();

  const { data: docs } = await supabase
    .from("member_documents")
    .select("id, category, file_name, storage_path, size_bytes, created_at, mime_type")
    .eq("member_id", id)
    .order("created_at", { ascending: false });

  const first = member.full_name.split(" ")[0];

  // 0014 admits the member's own login to `doc_select` but grants insert/delete
  // to the caregiver only. The member's home now links here, so the page has to
  // match: showing them an uploader would be a control that always fails.
  const profile = await getSessionProfile();
  const canWrite = profile?.role !== "member";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Documents"
        description={
          canWrite
            ? `Upload ${first}'s medical documents — blood work, scans, prescriptions — for the care team to see.`
            : "Medical documents your family has shared with your care team."
        }
        crumbs={[{ label: "Portal", href: "/portal" }, { label: "Documents" }]}
      />

      {canWrite ? <DocumentUploader memberId={member.id} /> : null}

      <div>
        <h2 className="mb-3 text-base font-semibold">
          {canWrite ? "Uploaded documents" : "Your documents"}
        </h2>
        <DocumentList
          documents={(docs ?? []) as DocumentRow[]}
          canDelete={canWrite}
          emptyHint={
            canWrite
              ? "Nothing uploaded yet. Add blood work, scans, prescriptions or discharge summaries above."
              : "Nothing here yet. Documents your family adds for the care team will appear here."
          }
        />
      </div>
    </div>
  );
}
