import type { Env } from "../types";

export const EMBEDDING_MODEL = "@cf/baai/bge-base-en-v1.5";

export async function embedTexts(env: Env, texts: string[]): Promise<number[][]> {
  const result = await env.AI.run(EMBEDDING_MODEL, { text: texts });
  if (!("data" in result) || !result.data) {
    throw new Error("Embedding model returned no data (unexpected async response)");
  }
  return result.data;
}
