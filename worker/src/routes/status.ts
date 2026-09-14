import { Hono } from "hono";
import type { Env } from "../types";
import { getDocument } from "../lib/firestore";

export const statusRoute = new Hono<{ Bindings: Env }>();

statusRoute.get("/:docId", async (c) => {
  const docId = c.req.param("docId");
  const doc = await getDocument(c.env, `documents/${docId}`);
  if (!doc) return c.json({ error: "Not found" }, 404);
  return c.json({
    docId,
    status: doc.status,
    filename: doc.filename,
    chunkCount: doc.chunkCount ?? null,
    error: doc.error ?? null,
  });
});
