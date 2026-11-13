"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { TextArea } from "@/components/application/fields";
import { SignPanel } from "@/components/agreements/sign-panel";
import { markAgreementViewed, requestAgreementChanges, signAgreement } from "@/lib/agreements/actions";
import type { AgreementKind } from "@/lib/agreements/types";

/** The Joey's review (request changes or sign), or the Host's countersignature. */
export function ReviewPanel({
  id,
  kind,
  role,
  version,
  contentHash,
  printedName,
  hasConsent,
}: {
  id: string;
  kind: AgreementKind;
  role: "joey" | "host";
  version: number;
  contentHash: string;
  printedName: string;
  hasConsent: boolean;
}) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (role === "joey") markAgreementViewed(id);
  }, [id, role]);

  const sendRequest = async () => {
    setBusy(true);
    setError(null);
    const res = await requestAgreementChanges(id, comment);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    router.push("/joey/agreements");
  };

  const statement =
    role === "joey"
      ? "By signing, you agree to this agreement as shown above. The Host signs next, and then it's in effect."
      : "By signing, you agree to this agreement as shown above, which the Joey has signed. It takes effect when you sign.";

  return (
    <div className="space-y-4">
      {role === "joey" && (
        <div className="space-y-3 rounded-lg border p-4 text-sm">
          <h3 className="font-medium">Something to change?</h3>
          {asking ? (
            <>
              <TextArea
                aria-label="What you'd like changed"
                rows={4}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="For example: could the start date be December 1 instead?"
              />
              <div className="flex gap-2">
                <Button type="button" size="sm" onClick={sendRequest} disabled={busy || comment.trim().length < 3}>
                  {busy ? "Sending…" : "Send to Host"}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setAsking(false)} disabled={busy}>
                  Cancel
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-muted-foreground">Ask your Host for changes. They&apos;ll send you a new version to review.</p>
              <Button type="button" size="sm" variant="outline" onClick={() => setAsking(true)}>
                Request changes
              </Button>
            </>
          )}
        </div>
      )}

      <SignPanel
        printedName={printedName}
        hasConsent={hasConsent}
        statement={statement}
        addendum={role === "joey" && kind === "housing_license"}
        signLabel={role === "joey" ? "Sign" : "Countersign"}
        onSign={async (typed, ack) => {
          const res = await signAgreement(id, version, contentHash, typed, ack);
          if (!res.ok) return res.error;
          router.refresh();
          return null;
        }}
      />

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
