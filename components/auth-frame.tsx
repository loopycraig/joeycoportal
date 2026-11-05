import Link from "next/link";

// Shared frame for the logged-out pages: small wordmark on top, centered column.
export function AuthFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex h-14 items-center px-6">
        <Link
          href="/"
          className="rounded focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/joey-logo.png" alt="Joey" className="h-6 w-auto" />
        </Link>
      </header>
      <main className="flex flex-1 items-center justify-center px-6 pb-20">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}

export function AuthHeading({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <h1 className="text-xl font-medium tracking-tight">{title}</h1>
      {children && <p className="text-sm text-muted-foreground">{children}</p>}
    </div>
  );
}