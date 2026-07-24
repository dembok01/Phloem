import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
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
    .select("id, category, file_name, storage_path, size_bytes, created_at")
    .eq("member_id", id)
    .order("created_at", { ascending: false });

  const first = member.full_name.split(" ")[0];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Documents"
        description={`Upload ${first}'s medical documents — blood work, scans, prescriptions — for the care team to see.`}
        crumbs={[{ label: "Portal", href: "/portal" }, { label: "Documents" }]}
      />

      <DocumentUploader memberId={member.id} />

      <div>
        <h2 className="mb-3 text-base font-semibold">Uploaded documents</h2>
        <DocumentList
          documents={(docs ?? []) as DocumentRow[]}
          canDelete
          emptyHint="Nothing uploaded yet. Add blood work, scans, prescriptions or discharge summaries above."
        />
      </div>
    </div>
  );
}
