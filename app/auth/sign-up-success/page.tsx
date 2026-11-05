import Link from "next/link";
import { AuthFrame, AuthHeading } from "@/components/auth-frame";

export default function Page() {
  return (
    <AuthFrame>
      <div className="flex flex-col gap-6">
        <AuthHeading title="Check your email">
          We sent you a confirmation link. Click it to finish creating your account.
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
