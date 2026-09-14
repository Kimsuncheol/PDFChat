import { useRef, useState } from "react";
import { uploadPdf } from "../api";

interface UploadProps {
  userId: string;
  onUploaded: (docId: string, filename: string) => void;
}

export function Upload({ userId, onUploaded }: UploadProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setBusy(true);
    setError(null);
    try {
      const { docId } = await uploadPdf(file, userId);
      onUploaded(docId, file.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="upload">
      <label className="upload-label">
        {busy ? "Uploading…" : "Choose a PDF"}
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          onChange={handleChange}
          disabled={busy}
          hidden
        />
      </label>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
