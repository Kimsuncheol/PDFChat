import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env, ProcessDocMessage } from "./types";
import { uploadRoute } from "./routes/upload";
import { statusRoute } from "./routes/status";
import { askRoute } from "./routes/ask";
import { handleQueue } from "./queue";

const app = new Hono<{ Bindings: Env }>();

app.use("*", cors());

app.get("/", (c) => c.json({ ok: true, service: "pdfchat-worker" }));
app.route("/upload", uploadRoute);
app.route("/status", statusRoute);
app.route("/ask", askRoute);

export default {
  fetch: app.fetch,
  queue: (batch: MessageBatch<ProcessDocMessage>, env: Env) => handleQueue(batch, env),
};
