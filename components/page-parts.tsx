// Plain building blocks, safe to use from server or client components.

import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  actions,
  className,
}: {
  title: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex h-12 shrink-0 items-center justify-between gap-4 border-b px-4 sm:px-6", className)}>
      <h1 className="text-sm font-medium">{title}</h1>
      {actions}
    </header>
  );
}

export function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="border-b bg-card px-4 py-2 text-xs sm:px-6 font-medium text-muted-foreground">
      {children}
    </h2>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 items-center justify-center p-10">
      <div className="max-w-sm text-center">
        <p className="text-sm font-medium">{title}</p>
        {children && <div className="mt-1 text-sm text-muted-foreground">{children}</div>}
        {action && <div className="mt-4">{action}</div>}
      </div>
    </div>
  );
}

export const textareaClass =
  "flex min-h-[72px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

export const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";
