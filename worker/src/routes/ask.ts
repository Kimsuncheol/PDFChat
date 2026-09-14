import { Hono } from "hono";
import type { Env } from "../types";
import { addDocument, getDocument, listCollection } from "../lib/firestore";
import { embedTexts } from "../lib/embed";

export const askRoute = new Hono<{ Bindings: Env }>();

const CHAT_MODEL = "@cf/meta/llama-3.1-8b-instruct";
const TOP_K = 5;
const HISTORY_LIMIT = 10;

interface AskBody {
  docId: string;
  question: string;
}

askRoute.post("/", async (c) => {
  const body = await c.req.json<AskBody>().catch(() => null);
  if (!body?.docId || !body?.question) {
    return c.json({ error: "Body must include docId and question" }, 400);
  }
  const { docId, question } = body;

  const doc = await getDocument(c.env, `documents/${docId}`);
  if (!doc) return c.json({ error: "Document not found" }, 404);
  if (doc.status !== "ready") {
    return c.json({ error: `Document not ready (status: ${doc.status})` }, 409);
  }

  const [queryVector] = await embedTexts(c.env, [question]);

  const matches = await c.env.VECTORIZE.query(queryVector, {
    topK: TOP_K,
    filter: { docId },
    returnMetadata: true,
  });

  const contextChunks = matches.matches
    .map((m) => (m.metadata as { text?: string } | undefined)?.text)
    .filter((t): t is string => Boolean(t));

  const history = (await listCollection(c.env, `documents/${docId}/chats`, "timestamp", HISTORY_LIMIT))
    .reverse()
    .map((h) => ({ role: h.role as "user" | "assistant", content: h.content as string }));

  const systemPrompt = [
    "You are answering questions about a single PDF document.",
    "Use only the provided excerpts to answer. If the answer isn't in the excerpts, say you don't know.",
    "",
    "Excerpts:",
    ...contextChunks.map((chunk, i) => `[${i + 1}] ${chunk}`),
  ].join("\n");

  const messages = [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: question },
  ];

  const stream = (await c.env.AI.run(CHAT_MODEL, {
    messages,
    stream: true,
  })) as unknown as ReadableStream;

  const [clientStream, captureStream] = stream.tee();

  c.executionCtx.waitUntil(
    persistTurn(c.env, docId, question, captureStream).catch((err) =>
      console.error(`Failed to persist chat turn for ${docId}:`, err),
    ),
  );

  return new Response(clientStream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
    },
  });
});

async function persistTurn(
  env: Env,
  docId: string,
  question: string,
  stream: ReadableStream,
): Promise<void> {
  const answer = await collectSseText(stream);
  const now = new Date().toISOString();
  await addDocument(env, `documents/${docId}/chats`, {
    role: "user",
    content: question,
    timestamp: now,
  });
  await addDocument(env, `documents/${docId}/chats`, {
    role: "assistant",
    content: answer,
    timestamp: new Date().toISOString(),
  });
}

/** Parses Workers AI's SSE stream (`data: {"response":"..."}`) into plain text. */
async function collectSseText(stream: ReadableStream): Promise<string> {
  const reader = stream.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let full = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") continue;
      try {
        const parsed = JSON.parse(payload) as { response?: string };
        if (parsed.response) full += parsed.response;
      } catch {
        // ignore malformed chunks
      }
    }
  }
  return full;
}
