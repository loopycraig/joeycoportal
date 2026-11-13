// Server only (node:crypto): import from server actions, never from a client component.
import { createHash } from "node:crypto";
import type { RenderedBlock } from "@/lib/agreements/types";

/** SHA-256 of a rendered document. Signatures are only accepted against the current version's hash. */
export function hashRendered(blocks: RenderedBlock[]): string {
  return createHash("sha256").update(JSON.stringify(blocks)).digest("hex");
}
