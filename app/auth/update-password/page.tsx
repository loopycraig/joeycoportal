import { UpdatePasswordForm } from "@/components/update-password-form";
import { AuthFrame } from "@/components/auth-frame";

export default function Page() {
  return (
    <AuthFrame>
      <UpdatePasswordForm />
    </AuthFrame>
  );
}
