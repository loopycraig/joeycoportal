"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { acknowledgeNotice, markAgreementViewed } from "@/lib/agreements/actions";

/** The Joey confirms they received a notice. Nothing to sign. */
export function AcknowledgePanel({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    markAgreementViewed(id);
  }, [id]);

  const acknowledge = async () => {
    setBusy(true);
    setError(null);
    const res = await acknowledgeNotice(id);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    router.refresh();
  };

  return (
    <section className="space-y-3 rounded-lg border p-4 text-sm">
      <h3 className="font-medium">Acknowledge</h3>
      <p className="text-muted-foreground">
        This is a notice, so there&apos;s nothing to sign. Confirm you&apos;ve received it and it stays in your Agreements.
      </p>
      <Button type="button" size="sm" onClick={acknowledge} disabled={busy}>
        {busy ? "Saving…" : "I've received this notice"}
      </Button>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
