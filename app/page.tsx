import Link from "next/link";
import { Button } from "@/components/ui/button";

// Simple placeholder homepage. Signed-in visitors are sent to /portal by the proxy.
export default function Home() {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex h-14 items-center justify-between px-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/joey-logo.png" alt="Joey" className="h-7 w-auto" />
        <nav className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/auth/login">Log in</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/auth/sign-up">Sign up</Link>
          </Button>
        </nav>
      </header>

      <main className="flex flex-1 items-center px-6 pb-24">
        <div className="mx-auto w-full max-w-2xl">
          <h1 className="text-4xl font-medium tracking-tight sm:text-5xl">
            Live Your Best Life
          </h1>
          <p className="mt-4 max-w-lg text-base text-muted-foreground">
            Affordable rent meets help at home that pays for itself.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/auth/sign-up">Create an account</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/auth/login">Log in</Link>
            </Button>
          </div>
        </div>
      </main>

      <footer className="border-t px-6 py-4 text-xs text-muted-foreground">
        © JoeyCo
      </footer>
    </div>
  );
}