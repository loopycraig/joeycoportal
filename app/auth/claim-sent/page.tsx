import Link from "next/link";
import { AuthFrame, AuthHeading } from "@/components/auth-frame";

/** After signing up with an email JoeyCo already set up an account for (from their match). */
export default function Page() {
  return (
    <AuthFrame>
      <div className="flex flex-col gap-6">
        <AuthHeading title="Check your email">
          JoeyCo already set up your account. We sent you a link to choose your password. Once you do,
          you&apos;ll see your match in the portal.
        </AuthHeading>
        <p className="text-sm text-muted-foreground">
          Don&apos;t see it after a few minutes? Check your spam folder.
        </p>
        <Link href="/auth/login" className="text-sm underline-offset-4 hover:underline">
          Back to log in
        </Link>
      </div>
    </AuthFrame>
  );
}
