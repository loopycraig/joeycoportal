// Thin client for the Clarify REST API (JSON:API).
// Docs: https://developer.clarify.ai/docs

const BASE = "https://api.clarify.ai/v1/workspaces";

export class ClarifyError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export type ClarifyRecord = { id: string; type: string; attributes: Record<string, unknown> };

function env() {
  const key = process.env.CLARIFY_API_KEY;
  const workspace = process.env.CLARIFY_WORKSPACE;
  if (!key || !workspace) throw new Error("CLARIFY_API_KEY and CLARIFY_WORKSPACE must be set");
  return { key, workspace };
}

export function clarifyConfigured() {
  return Boolean(process.env.CLARIFY_API_KEY && process.env.CLARIFY_WORKSPACE);
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const { key, workspace } = env();
  const res = await fetch(`${BASE}/${workspace}${path}`, {
    method,
    headers: {
      Authorization: `api-key ${key}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const json = (await res.json()) as { errors?: { detail?: string | null; title?: string }[] };
      detail = json.errors?.map((e) => e.detail ?? e.title).filter(Boolean).join("; ") || detail;
    } catch {
      /* not JSON */
    }
    throw new ClarifyError(`Clarify ${method} ${path} → ${res.status}: ${detail}`, res.status);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

/** Creates a person, or updates the existing one with the same email. */
export async function upsertPersonByEmail(attributes: Record<string, unknown>): Promise<ClarifyRecord> {
  const res = await request<{ data: ClarifyRecord }>("POST", "/objects/person/records", {
    match_on: "email_addresses",
    data: { type: "person", attributes },
  });
  return res.data;
}

export type RelationshipLink = { field: string; entity: string; id: string };

/** Creates a record on any object, optionally linking it to other records. */
export async function createRecord(
  object: string,
  attributes: Record<string, unknown>,
  links: RelationshipLink[] = [],
): Promise<ClarifyRecord> {
  const res = await request<{ data: ClarifyRecord }>("POST", `/objects/${object}/records`, {
    data: { type: object, attributes },
    relationships: links.map((l) => ({
      relationshipFieldName: l.field,
      operation: "link",
      targets: [{ entity: l.entity, _id: l.id }],
    })),
  });
  if (!res?.data?.id) throw new ClarifyError(`Clarify created no ${object} record`, 502);
  return res.data;
}

/** Partial update: only the attributes given are changed. */
export async function updateRecord(
  object: string,
  id: string,
  attributes: Record<string, unknown>,
): Promise<ClarifyRecord> {
  const res = await request<{ data: ClarifyRecord }>("PATCH", `/objects/${object}/records/${encodeURIComponent(id)}`, {
    data: { type: object, id, attributes },
  });
  return res.data;
}

export async function getRecord(object: string, id: string): Promise<ClarifyRecord> {
  const res = await request<{ data: ClarifyRecord }>("GET", `/objects/${object}/records/${encodeURIComponent(id)}`);
  return res.data;
}

export async function deleteRecord(object: string, id: string): Promise<void> {
  await request<void>("DELETE", `/objects/${object}/records/${encodeURIComponent(id)}`);
}

/** Records updated after a timestamp, one page at a time. */
export async function listUpdatedAfter(
  object: string,
  after: string,
  offset: number,
  limit = 100,
): Promise<{ records: ClarifyRecord[]; hasMore: boolean }> {
  const qs = new URLSearchParams({
    "filter[_updated_at][Is after]": after,
    "page[limit]": String(limit),
    "page[offset]": String(offset),
  });
  const res = await request<{ data: ClarifyRecord[]; links?: { next?: string | null } }>(
    "GET",
    `/objects/${object}/resources?${qs}`,
  );
  return { records: res.data ?? [], hasMore: Boolean(res.links?.next) && (res.data?.length ?? 0) === limit };
}

/** Select fields can come back as a string or an object; normalize to the label. */
export function readSelect(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return readSelect(value[0]);
  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    for (const k of ["name", "label", "value", "title"]) if (typeof v[k] === "string") return v[k] as string;
    if (Array.isArray(v.items)) return readSelect(v.items[0]);
  }
  return null;
}

export function readUpdatedAt(r: ClarifyRecord): string | null {
  const v = r.attributes._updated_at ?? r.attributes.updated_at;
  return typeof v === "string" ? v : null;
}
