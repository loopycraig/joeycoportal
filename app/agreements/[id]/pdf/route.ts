import { createClient } from "@/lib/supabase/server";
import { getAgreement } from "@/lib/agreements/queries";
import { agreementPdfName, renderAgreementPdf } from "@/lib/agreements/pdf";

// A signed agreement as a PDF, for either party. The session's own permissions (RLS) decide
// whether this person can see it; only agreements signed by everyone can be downloaded.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return new Response("Sign in to download this agreement.", { status: 401 });

  const { id } = await params;
  const agreement = await getAgreement(id);
  if (!agreement) return new Response("Agreement not found.", { status: 404 });
  if (agreement.status !== "executed") {
    return new Response("Only agreements signed by everyone can be downloaded.", { status: 409 });
  }

  const pdf = await renderAgreementPdf(agreement);
  const name = agreementPdfName(agreement);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
