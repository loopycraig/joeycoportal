"use client";

import { createClient } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import { homeFor, type Role } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { useState } from "react";

const ROLES: { value: Role; title: string; description: string }[] = [
  {
    value: "joey",
    title: "I'm a Joey",
    description: "Log your hours and submit timecards to the Hosts you work with.",
  },
  {
    value: "host",
    title: "I'm a Host",
    description: "Add your Joeys and approve the timecards they submit.",
  },
];

export function OnboardingForm({ defaultName }: { defaultName: string }) {
  const [name, setName] = useState(defaultName);
  const [role, setRole] = useState<Role | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!role) return;
    setIsLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Your session expired. Log in again.");

      const { error: nameError } = await supabase
        .from("profiles")
        .update({ full_name: name.trim() })
        .eq("id", user.id);
      if (nameError) throw nameError;

      const { error: roleError } = await supabase.rpc("set_my_role", { p_role: role });
      if (roleError) throw roleError;

      router.push(homeFor(role));
      router.refresh();
    } catch (err: unknown) {
      setError(friendlyError(err, "Couldn't save your details. Try again."));
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div className="grid gap-1">
        <h1 className="text-xl font-medium tracking-tight">Set up your account</h1>
        <p className="text-sm text-muted-foreground">
          Tell us your name and how you&apos;ll use Joey.
        </p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="full-name">Full name</Label>
        <Input
          id="full-name"
          autoComplete="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">I&apos;m joining as</legend>
        {ROLES.map((option) => {
          const selected = role === option.value;
          return (
            <label
              key={option.value}
              className={cn(
                "flex cursor-pointer gap-3 rounded-md border p-3 transition-colors",
                "has-[:focus-visible]:ring-1 has-[:focus-visible]:ring-ring",
                selected
                  ? "border-primary bg-primary/10"
                  : "border-border hover:bg-accent",
              )}
            >
              <input
                type="radio"
                name="role"
                value={option.value}
                checked={selected}
                onChange={() => setRole(option.value)}
                className="sr-only"
              />
              <span
                aria-hidden
                className={cn(
                  "mt-0.5 size-4 shrink-0 rounded-full border",
                  selected ? "border-[5px] border-primary" : "border-muted-foreground/50",
                )}
              />
              <span className="grid gap-0.5">
                <span className="text-sm font-medium">{option.title}</span>
                <span className="text-sm text-muted-foreground">{option.description}</span>
              </span>
            </label>
          );
        })}
        <p className="text-xs text-muted-foreground">
          This can&apos;t be changed later.
        </p>
      </fieldset>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <Button type="submit" disabled={!role || !name.trim() || isLoading}>
        {isLoading
          ? "Saving…"
          : role === "host"
            ? "Continue as Host"
            : role === "joey"
              ? "Continue as Joey"
              : "Continue"}
      </Button>
    </form>
  );
}
