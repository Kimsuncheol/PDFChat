# PDFChat

Upload a PDF, ask questions about it. Runs entirely on Cloudflare (Workers,
Workers AI, Vectorize, R2, Queues) with Firestore used for document/chat
metadata via its REST API.

## Structure

```
worker/     Cloudflare Worker: upload, ingest pipeline, chat endpoint
frontend/   Vite + React app: upload UI + chat UI (deploy to Cloudflare Pages)
```

## How it works

1. `POST /upload` (worker) — stores the PDF in R2, creates a Firestore
   `documents/{docId}` record with `status: "processing"`, and enqueues a
   processing message.
2. Queue consumer — pulls the PDF from R2, extracts text (`unpdf`), chunks
   it, embeds each chunk with Workers AI (`bge-base-en-v1.5`), upserts into
   Vectorize, then flips the Firestore doc to `status: "ready"`.
3. `GET /status/:docId` — frontend polls this until `"ready"`.
4. `POST /ask` — embeds the question, queries Vectorize filtered by
   `docId`, builds a prompt from retrieved chunks + prior chat turns
   (Firestore), streams a Llama 3.1 response back, and persists the turn.

## One-time Cloudflare setup

```bash
cd worker
npx wrangler vectorize create pdfchat-chunks --dimensions=768 --metric=cosine
npx wrangler r2 bucket create pdfchat-pdfs
npx wrangler queues create pdfchat-processing
```

These names must match `wrangler.toml`.

## Firestore setup

1. Create a Firebase/GCP project with Firestore in **Native mode**.
2. Create a service account with the "Cloud Datastore User" role, download
   its JSON key.
3. Set secrets for the worker:

```bash
cd worker
npx wrangler secret put FIRESTORE_CLIENT_EMAIL   # value: client_email from the JSON key
npx wrangler secret put FIRESTORE_PRIVATE_KEY    # value: private_key from the JSON key (keep the \n's)
```

4. Set `FIRESTORE_PROJECT_ID` in `worker/wrangler.toml`.

## Local dev

```bash
cd worker && npm install && npm run dev      # http://localhost:8787
cd frontend && npm install && npm run dev    # http://localhost:5173
```

Copy `frontend/.env.example` to `frontend/.env` and point it at the worker.

## Deploy

```bash
cd worker && npm run deploy
cd frontend && npm run build && npx wrangler pages deploy dist
```

## Notes / things left as stubs

- No auth — `userId` is passed as a plain form field. Wire up real auth
  (Firebase Auth, Access, etc.) before shipping.
- Vectorize metadata filtering by `docId` requires the index's metadata
  field to be marked filterable (`wrangler vectorize create-metadata-index`).
- Chat history is capped to the last 10 turns per request to bound prompt
  size — adjust in `worker/src/routes/ask.ts`.
