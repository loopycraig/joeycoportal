"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";

// A small wrapper around the native <dialog>: focus trapping, Escape to close
// and the backdrop all come from the browser.
export function Modal({
  open,
  onClose,
  title,
  size = "md",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** "lg" for documents. */
  size?: "md" | "lg";
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className={`w-[calc(100%-2rem)] ${size === "lg" ? "max-w-2xl" : "max-w-md"} rounded-lg border bg-popover p-0 text-popover-foreground shadow-2xl backdrop:bg-black/60`}
    >
      <div className="flex h-11 items-center justify-between border-b px-4">
        <h2 className="text-sm font-medium">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <X className="size-4" />
        </button>
      </div>
      {/* Long content scrolls inside the dialog; the title bar stays put. */}
      <div className="max-h-[calc(100svh-6rem)] overflow-y-auto p-4">{open && children}</div>
    </dialog>
  );
}
