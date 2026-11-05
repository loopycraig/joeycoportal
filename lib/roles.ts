// Shared by server and client code, so no server-only imports here.
export type Role = "joey" | "host";

export function homeFor(role: Role | null) {
  if (role === "joey") return "/joey";
  if (role === "host") return "/host";
  return "/onboarding";
}
