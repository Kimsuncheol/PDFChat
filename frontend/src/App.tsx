import { useEffect, useRef, useState } from "react";
import { Upload } from "./components/Upload";
import { Chat } from "./components/Chat";
import { getStatus } from "./api";

type DocState =
  | { phase: "idle" }
  | { phase: "processing"; docId: string; filename: string }
  | { phase: "ready"; docId: string; filename: string }
  | { phase: "error"; message: string };

function getUserId(): string {
  const key = "pdfchat-user-id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

export default function App() {
  const [state, setState] = useState<DocState>({ phase: "idle" });
  const userId = useRef(getUserId());

  useEffect(() => {
    if (state.phase !== "processing") return;
    const { docId } = state;

    const interval = setInterval(async () => {
      try {
        const s = await getStatus(docId);
        if (s.status === "ready") {
          setState({ phase: "ready", docId, filename: s.filename });
        } else if (s.status === "error") {
          setState({ phase: "error", message: s.error ?? "Processing failed" });
        }
      } catch (err) {
        setState({ phase: "error", message: err instanceof Error ? err.message : String(err) });
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [state]);

  return (
    <main className="app">
      <h1>PDFChat</h1>

      {state.phase === "idle" && (
        <Upload
          userId={userId.current}
          onUploaded={(docId, filename) => setState({ phase: "processing", docId, filename })}
        />
      )}

      {state.phase === "processing" && <p>Processing "{state.filename}"…</p>}

      {state.phase === "error" && (
        <div>
          <p className="error">{state.message}</p>
          <button onClick={() => setState({ phase: "idle" })}>Try again</button>
        </div>
      )}

      {state.phase === "ready" && <Chat docId={state.docId} filename={state.filename} />}
    </main>
  );
}
