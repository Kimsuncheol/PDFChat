import { SignJWT, importPKCS8 } from "jose";
import type { Env } from "../types";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/datastore";

// Per-isolate cache so we don't mint a new token on every request.
let cachedToken: { value: string; expiresAt: number } | null = null;

export async function getAccessToken(env: Env): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt - 60 > now) {
    return cachedToken.value;
  }

  const privateKey = await importPKCS8(
    normalizePrivateKey(env.FIRESTORE_PRIVATE_KEY),
    "RS256",
  );

  const assertion = await new SignJWT({ scope: SCOPE })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(env.FIRESTORE_CLIENT_EMAIL)
    .setAudience(TOKEN_URL)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(privateKey);

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!res.ok) {
    throw new Error(`Firestore auth failed: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: data.access_token, expiresAt: now + data.expires_in };
  return cachedToken.value;
}

function normalizePrivateKey(key: string): string {
  // Service-account JSON keys store literal "\n" — restore real newlines.
  return key.includes("\\n") ? key.replace(/\\n/g, "\n") : key;
}
