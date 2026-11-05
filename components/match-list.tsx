export function MatchList({
  rows,
}: {
  rows: { id: string; name: string; email: string; started_at: string; ended_at: string | null }[];
}) {
  const fmt = (d: string) =>
    new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <ul className="divide-y">
      {rows.map((row) => (
        <li key={row.id} className="flex items-center gap-4 px-4 py-3 text-sm sm:px-6">
          <span
            aria-hidden
            className={row.ended_at ? "size-2 rounded-full bg-muted-foreground/40" : "size-2 rounded-full bg-emerald-500"}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate">{row.name}</p>
            <p className="truncate text-xs text-muted-foreground">{row.email}</p>
          </div>
          <p className="shrink-0 text-xs text-muted-foreground">
            {row.ended_at
              ? `${fmt(row.started_at)} – ${fmt(row.ended_at)}`
              : `Active since ${fmt(row.started_at)}`}
          </p>
        </li>
      ))}
    </ul>
  );
}
