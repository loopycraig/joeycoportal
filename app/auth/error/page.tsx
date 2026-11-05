import Link from "next/link";
import { Suspense } from "react";
import { AuthFrame, AuthHeading } from "@/components/auth-frame";

async function ErrorDetail({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  return (
    <p className="text-sm text-muted-foreground">
      {params?.error ?? "We couldn't complete that request."}
    </p>
  );
}

export default function Page({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  return (
    <AuthFrame>
      <div className="flex flex-col gap-6">
        <AuthHeading title="Something went wrong" />
        <Suspense>
          <ErrorDetail searchParams={searchParams} />
        </Suspense>
        <p className="text-sm text-muted-foreground">
          If you followed a link from an email, it may have expired. Try logging in, or
          request a new link.
        </p>
        <Link href="/auth/login" className="text-sm underline-offset-4 hover:underline">
          Back to log in
        </Link>
      </div>
    </AuthFrame>
  );
}
