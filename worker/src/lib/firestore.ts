import { getAccessToken } from "./firestore-auth";
import type { Env } from "../types";

type FirestoreValue =
  | { stringValue: string }
  | { integerValue: string }
  | { doubleValue: number }
  | { booleanValue: boolean }
  | { nullValue: null }
  | { timestampValue: string }
  | { arrayValue: { values: FirestoreValue[] } }
  | { mapValue: { fields: Record<string, FirestoreValue> } };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PlainObject = Record<string, any>;

function baseUrl(env: Env): string {
  return `https://firestore.googleapis.com/v1/projects/${env.FIRESTORE_PROJECT_ID}/databases/(default)/documents`;
}

async function authedFetch(env: Env, url: string, init?: RequestInit): Promise<Response> {
  const token = await getAccessToken(env);
  return fetch(url, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
}

function toFirestoreValue(value: unknown): FirestoreValue {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "string") {
    // ISO-8601 dates get stored as timestamps so Firestore can order by them.
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(value)) {
      return { timestampValue: value };
    }
    return { stringValue: value };
  }
  if (typeof value === "number") {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (typeof value === "boolean") return { booleanValue: value };
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(toFirestoreValue) } };
  }
  if (typeof value === "object") {
    return { mapValue: { fields: toFirestoreFields(value as PlainObject) } };
  }
  throw new Error(`Unsupported Firestore value: ${JSON.stringify(value)}`);
}

function fromFirestoreValue(value: FirestoreValue): unknown {
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("nullValue" in value) return null;
  if ("arrayValue" in value) return (value.arrayValue.values ?? []).map(fromFirestoreValue);
  if ("mapValue" in value) return fromFirestoreFields(value.mapValue.fields ?? {});
  return null;
}

export function toFirestoreFields(obj: PlainObject): Record<string, FirestoreValue> {
  const fields: Record<string, FirestoreValue> = {};
  for (const [key, value] of Object.entries(obj)) {
    fields[key] = toFirestoreValue(value);
  }
  return fields;
}

export function fromFirestoreFields(fields: Record<string, FirestoreValue>): PlainObject {
  const obj: PlainObject = {};
  for (const [key, value] of Object.entries(fields)) {
    obj[key] = fromFirestoreValue(value);
  }
  return obj;
}

/** Create or overwrite a document at an explicit path, e.g. "documents/abc123". */
export async function setDocument(env: Env, path: string, data: PlainObject): Promise<void> {
  const res = await authedFetch(env, `${baseUrl(env)}/${path}`, {
    method: "PATCH",
    body: JSON.stringify({ fields: toFirestoreFields(data) }),
  });
  if (!res.ok) {
    throw new Error(`Firestore setDocument(${path}) failed: ${res.status} ${await res.text()}`);
  }
}

/** Merge-update specific fields on an existing document. */
export async function updateDocument(env: Env, path: string, data: PlainObject): Promise<void> {
  const mask = Object.keys(data).map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join("&");
  const res = await authedFetch(env, `${baseUrl(env)}/${path}?${mask}`, {
    method: "PATCH",
    body: JSON.stringify({ fields: toFirestoreFields(data) }),
  });
  if (!res.ok) {
    throw new Error(`Firestore updateDocument(${path}) failed: ${res.status} ${await res.text()}`);
  }
}

export async function getDocument(env: Env, path: string): Promise<PlainObject | null> {
  const res = await authedFetch(env, `${baseUrl(env)}/${path}`);
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Firestore getDocument(${path}) failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { fields?: Record<string, FirestoreValue> };
  return json.fields ? fromFirestoreFields(json.fields) : {};
}

/** Add a new document with an auto-generated id to a collection. */
export async function addDocument(env: Env, collectionPath: string, data: PlainObject): Promise<string> {
  const res = await authedFetch(env, `${baseUrl(env)}/${collectionPath}`, {
    method: "POST",
    body: JSON.stringify({ fields: toFirestoreFields(data) }),
  });
  if (!res.ok) {
    throw new Error(`Firestore addDocument(${collectionPath}) failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { name: string };
  return json.name.split("/").pop() as string;
}

/** List a collection's documents, most-recent-first by `orderByField` (must be a timestamp/string field). */
export async function listCollection(
  env: Env,
  collectionPath: string,
  orderByField: string,
  limit: number,
): Promise<PlainObject[]> {
  const params = new URLSearchParams({
    orderBy: `${orderByField} desc`,
    pageSize: String(limit),
  });
  const res = await authedFetch(env, `${baseUrl(env)}/${collectionPath}?${params.toString()}`);
  if (res.status === 404) return [];
  if (!res.ok) {
    throw new Error(`Firestore listCollection(${collectionPath}) failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { documents?: Array<{ fields?: Record<string, FirestoreValue> }> };
  return (json.documents ?? []).map((d) => (d.fields ? fromFirestoreFields(d.fields) : {}));
}
