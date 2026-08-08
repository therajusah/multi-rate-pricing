import { MongoClient, type Collection, type Db, type ObjectId } from "mongodb";
import type { Discount, LineTotals } from "./calc";

export interface UserDoc {
  _id: ObjectId;
  email: string;
  passwordHash: string;
  createdAt: Date;
}

export interface StoredLine {
  _id: ObjectId;
  description: string;
  quantity: number;
  unitPriceCents: number;
  discount: Discount;
  taxPercent: number;
  totals: LineTotals;
}

export interface DocumentTotalsDoc {
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  grandTotalCents: number;
}

export interface DocumentDoc {
  _id: ObjectId;
  userId: ObjectId;
  title: string;
  customer: string;
  issueDate: Date;
  status: "draft" | "finalized";
  lines: StoredLine[];
  totals: DocumentTotalsDoc;
  duplicatedFrom?: ObjectId;
  finalizedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

const globalForMongo = globalThis as typeof globalThis & {
  __mongoDb?: Promise<Db>;
};

async function connect(): Promise<Db> {
  const client = new MongoClient(requireEnv("MONGODB_URI"), {
    serverSelectionTimeoutMS: 5_000,
  });
  await client.connect();
  const db = client.db(process.env.MONGODB_DB ?? "pricing");
  await ensureIndexes(db);
  return db;
}

export function getDb(): Promise<Db> {
  globalForMongo.__mongoDb ??= connect().catch((error) => {
    globalForMongo.__mongoDb = undefined;
    throw error;
  });
  return globalForMongo.__mongoDb;
}

async function ensureIndexes(db: Db): Promise<void> {
  await Promise.all([
    db.collection<UserDoc>("users").createIndex({ email: 1 }, { unique: true }),
    db.collection<DocumentDoc>("documents").createIndex({ userId: 1, issueDate: -1 }),
    db.collection<DocumentDoc>("documents").createIndex({ userId: 1, status: 1 }),
  ]);
}

export async function users(): Promise<Collection<UserDoc>> {
  return (await getDb()).collection<UserDoc>("users");
}

export async function documents(): Promise<Collection<DocumentDoc>> {
  return (await getDb()).collection<DocumentDoc>("documents");
}
