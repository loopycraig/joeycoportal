"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { ChevronsUpDown, Laptop, LogOut, Moon, Sun } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const THEMES = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Laptop },
] as const;

function initials(name: string) {
  const parts = name.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

/**
 * Who's signed in, as one row in the sidebar footer. Opens a menu with the theme and Log out.
 * `compact` shows just the avatar, for the phone header.
 */
export function AccountMenu({ name, email, compact = false }: { name: string; email: string; compact?: boolean }) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const logout = async () => {
    await createClient().auth.signOut();
    router.push("/auth/login");
    router.refresh();
  };

  const avatar = (
    <span
      aria-hidden
      className="grid size-7 shrink-0 place-items-center rounded-full bg-foreground/10 text-[11px] font-medium text-foreground"
    >
      {initials(name)}
    </span>
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account and settings"
        className={cn(
          "flex items-center gap-2.5 rounded-md text-left transition-colors hover:bg-foreground/5",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring data-[state=open]:bg-foreground/5",
          compact ? "p-1" : "w-full px-2 py-1.5",
        )}
      >
        {avatar}
        {!compact && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">{name}</span>
              <span className="block truncate text-xs text-muted-foreground">{email}</span>
            </span>
            <ChevronsUpDown aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
          </>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent side={compact ? "bottom" : "top"} align={compact ? "end" : "start"} className="w-52">
        {compact && (
          <>
            <DropdownMenuLabel className="font-normal">
              <span className="block truncate text-sm">{name}</span>
              <span className="block truncate text-xs text-muted-foreground">{email}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={mounted ? theme : undefined} onValueChange={setTheme}>
          {THEMES.map(({ value, label, Icon }) => (
            <DropdownMenuRadioItem key={value} value={value} className="gap-2">
              <Icon aria-hidden className="size-3.5 text-muted-foreground" />
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={logout} className="gap-2">
          <LogOut aria-hidden className="size-3.5 text-muted-foreground" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
