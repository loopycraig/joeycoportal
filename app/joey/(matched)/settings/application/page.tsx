import { redirect } from "next/navigation";

// The application moved into Agreements.
export default function JoeySettingsApplicationPage() {
  redirect("/joey/agreements/application");
}
