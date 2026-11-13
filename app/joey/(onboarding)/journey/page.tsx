import { redirect } from "next/navigation";

// The journey now lives at the top of the application page. Kept so old links still work.
export default function JoeyJourneyPage() {
  redirect("/joey/application");
}
