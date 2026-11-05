import { LoginForm } from "@/components/login-form";
import { AuthFrame } from "@/components/auth-frame";

export default function Page() {
  return (
    <AuthFrame>
      <LoginForm />
    </AuthFrame>
  );
}
