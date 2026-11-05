import { SignUpForm } from "@/components/sign-up-form";
import { AuthFrame } from "@/components/auth-frame";

export default function Page() {
  return (
    <AuthFrame>
      <SignUpForm />
    </AuthFrame>
  );
}
