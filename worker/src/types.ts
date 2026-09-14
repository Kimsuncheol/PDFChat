export interface Env {
  AI: Ai;
  VECTORIZE: VectorizeIndex;
  PDF_BUCKET: R2Bucket;
  DOC_QUEUE: Queue<ProcessDocMessage>;
  FIRESTORE_PROJECT_ID: string;
  FIRESTORE_CLIENT_EMAIL: string;
  FIRESTORE_PRIVATE_KEY: string;
}

export interface ProcessDocMessage {
  docId: string;
  userId: string;
  r2Key: string;
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}
