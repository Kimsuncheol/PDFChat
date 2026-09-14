const WORKER_URL = import.meta.env.VITE_WORKER_URL;

export interface UploadResponse {
  docId: string;
  status: string;
}

export interface StatusResponse {
  docId: string;
  status: "processing" | "ready" | "error";
  filename: string;
  chunkCount: number | null;
  error: string | null;
}

export async function uploadPdf(file: File, userId: string): Promise<UploadResponse> {
  const form = new FormData();
  form.append("file", file);
  form.append("userId", userId);

  const res = await fetch(`${WORKER_URL}/upload`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`Upload failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function getStatus(docId: string): Promise<StatusResponse> {
  const res = await fetch(`${WORKER_URL}/status/${docId}`);
  if (!res.ok) throw new Error(`Status check failed: ${res.status} ${await res.text()}`);
  return res.json();
}

/** Streams the answer, invoking onToken for each text delta as it arrives. */
export async function askQuestion(
  docId: string,
  question: string,
  onToken: (token: string) => void,
): Promise<void> {
  const res = await fetch(`${WORKER_URL}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ docId, question }),
  });
  if (!res.ok || !res.body) throw new Error(`Ask failed: ${res.status} ${await res.text()}`);

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";

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
        if (parsed.response) onToken(parsed.response);
      } catch {
        // ignore malformed chunks
      }
    }
  }
}
