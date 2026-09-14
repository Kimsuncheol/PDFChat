import { Hono } from "hono";
import type { Env } from "../types";
import { setDocument } from "../lib/firestore";

export const uploadRoute = new Hono<{ Bindings: Env }>();

uploadRoute.post("/", async (c) => {
  const form = await c.req.formData();
  // workers-types mistypes FormData#get as always returning `string | null`,
  // but the runtime returns a real File for file fields.
  const file = form.get("file") as unknown as File | null;
  const userId = form.get("userId");

  if (!(file instanceof File)) {
    return c.json({ error: "Missing 'file' field" }, 400);
  }
  if (typeof userId !== "string" || !userId) {
    return c.json({ error: "Missing 'userId' field" }, 400);
  }
  if (file.type !== "application/pdf") {
    return c.json({ error: "Only application/pdf is accepted" }, 400);
  }

  const docId = crypto.randomUUID();
  const r2Key = `${userId}/${docId}.pdf`;

  await c.env.PDF_BUCKET.put(r2Key, await file.arrayBuffer(), {
    httpMetadata: { contentType: "application/pdf" },
  });

  await setDocument(c.env, `documents/${docId}`, {
    docId,
    userId,
    filename: file.name,
    r2Key,
    status: "processing",
    createdAt: new Date().toISOString(),
  });

  await c.env.DOC_QUEUE.send({ docId, userId, r2Key });

  return c.json({ docId, status: "processing" });
});
