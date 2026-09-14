import type { Env, ProcessDocMessage } from "./types";
import { extractPdfText } from "./lib/pdf";
import { chunkText } from "./lib/chunk";
import { updateDocument } from "./lib/firestore";
import { embedTexts } from "./lib/embed";

const EMBED_BATCH_SIZE = 20;
const UPSERT_BATCH_SIZE = 100;

export async function handleQueue(batch: MessageBatch<ProcessDocMessage>, env: Env): Promise<void> {
  for (const message of batch.messages) {
    const { docId, userId, r2Key } = message.body;
    try {
      await processDocument(env, docId, userId, r2Key);
      message.ack();
    } catch (err) {
      console.error(`Failed to process doc ${docId}:`, err);
      await updateDocument(env, `documents/${docId}`, {
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      }).catch(() => {});
      message.retry();
    }
  }
}

async function processDocument(env: Env, docId: string, userId: string, r2Key: string): Promise<void> {
  const object = await env.PDF_BUCKET.get(r2Key);
  if (!object) throw new Error(`PDF not found in R2: ${r2Key}`);

  const text = await extractPdfText(await object.arrayBuffer());
  const chunks = chunkText(text);
  if (chunks.length === 0) throw new Error("No extractable text in PDF");

  let embedded = 0;
  for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
    const batchChunks = chunks.slice(i, i + EMBED_BATCH_SIZE);

    const embeddings = await embedTexts(env, batchChunks);

    const vectors = batchChunks.map((chunkContent, j) => ({
      id: `${docId}-${i + j}`,
      values: embeddings[j],
      metadata: {
        docId,
        userId,
        chunkIndex: i + j,
        text: chunkContent.slice(0, 1000),
      },
    }));

    for (let v = 0; v < vectors.length; v += UPSERT_BATCH_SIZE) {
      await env.VECTORIZE.upsert(vectors.slice(v, v + UPSERT_BATCH_SIZE));
    }
    embedded += vectors.length;
  }

  await updateDocument(env, `documents/${docId}`, {
    status: "ready",
    chunkCount: embedded,
  });
}
