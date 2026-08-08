import { ObjectId, type Filter, type UpdateFilter } from "mongodb";
import { ApiError, finalized, notFound } from "./errors";
import { calculateDocument, type Discount, type LineTotals } from "./calc";
import { documents, type DocumentDoc, type StoredLine } from "./db";
import type { LineInputPayload } from "./schemas";

export interface LineJson {
  id: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
  discount: Discount;
  taxPercent: number;
  totals: LineTotals;
}

export interface DocumentJson {
  id: string;
  title: string;
  customer: string;
  issueDate: string;
  status: "draft" | "finalized";
  lines: LineJson[];
  totals: DocumentDoc["totals"];
  duplicatedFrom: string | null;
  finalizedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export const toDateOnly = (date: Date): string => date.toISOString().slice(0, 10);

export function serializeDocument(doc: DocumentDoc): DocumentJson {
  return {
    id: doc._id.toHexString(),
    title: doc.title,
    customer: doc.customer,
    issueDate: toDateOnly(doc.issueDate),
    status: doc.status,
    lines: doc.lines.map((line) => ({
      id: line._id.toHexString(),
      description: line.description,
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
      discount: line.discount,
      taxPercent: line.taxPercent,
      totals: line.totals,
    })),
    totals: doc.totals,
    duplicatedFrom: doc.duplicatedFrom?.toHexString() ?? null,
    finalizedAt: doc.finalizedAt?.toISOString() ?? null,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export function toObjectId(id: string): ObjectId {
  if (!ObjectId.isValid(id)) throw notFound();
  return new ObjectId(id);
}

function priced(lines: Array<LineInputPayload & { _id?: ObjectId }>) {
  const { lines: lineTotals, totals } = calculateDocument(lines);

  const stored: StoredLine[] = lines.map((line, index) => ({
    _id: line._id ?? new ObjectId(),
    description: line.description,
    quantity: line.quantity,
    unitPriceCents: line.unitPriceCents,
    discount: line.discount,
    taxPercent: line.taxPercent,
    totals: lineTotals[index],
  }));

  return { lines: stored, totals };
}

const asPayload = (line: StoredLine): LineInputPayload & { _id: ObjectId } => ({
  _id: line._id,
  description: line.description,
  quantity: line.quantity,
  unitPriceCents: line.unitPriceCents,
  discount: line.discount,
  taxPercent: line.taxPercent,
});

export async function listDocuments(userId: ObjectId): Promise<DocumentDoc[]> {
  return (await documents())
    .find({ userId })
    .sort({ issueDate: -1, _id: -1 })
    .limit(200)
    .toArray();
}

export async function getDocument(userId: ObjectId, id: ObjectId): Promise<DocumentDoc> {
  const doc = await (await documents()).findOne({ _id: id, userId });
  if (!doc) throw notFound();
  return doc;
}

export async function createDocument(
  userId: ObjectId,
  input: { title: string; customer: string; issueDate: Date; lines: LineInputPayload[] },
): Promise<DocumentDoc> {
  const now = new Date();
  const doc: DocumentDoc = {
    _id: new ObjectId(),
    userId,
    title: input.title,
    customer: input.customer,
    issueDate: input.issueDate,
    status: "draft",
    ...priced(input.lines),
    finalizedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  await (await documents()).insertOne(doc);
  return doc;
}

async function updateDraft(
  userId: ObjectId,
  id: ObjectId,
  update: UpdateFilter<DocumentDoc>,
): Promise<DocumentDoc> {
  const collection = await documents();
  const updated = await collection.findOneAndUpdate(
    { _id: id, userId, status: "draft" },
    update,
    { returnDocument: "after" },
  );
  if (updated) return updated;

  throw (await collection.findOne({ _id: id, userId })) ? finalized() : notFound();
}

async function setLines(
  userId: ObjectId,
  id: ObjectId,
  lines: Array<LineInputPayload & { _id?: ObjectId }>,
  extra: Partial<Pick<DocumentDoc, "title" | "customer" | "issueDate">> = {},
): Promise<DocumentDoc> {
  return updateDraft(userId, id, {
    $set: { ...priced(lines), ...extra, updatedAt: new Date() },
  });
}

export async function updateDocument(
  userId: ObjectId,
  id: ObjectId,
  changes: {
    title?: string;
    customer?: string;
    issueDate?: Date;
    lines?: LineInputPayload[];
  },
): Promise<DocumentDoc> {
  const { lines, ...metadata } = changes;
  if (!lines) {
    return updateDraft(userId, id, { $set: { ...metadata, updatedAt: new Date() } });
  }
  return setLines(userId, id, lines, metadata);
}

export async function deleteDocument(userId: ObjectId, id: ObjectId): Promise<void> {
  const collection = await documents();
  const deleted = await collection.findOneAndDelete({ _id: id, userId, status: "draft" });
  if (deleted) return;

  throw (await collection.findOne({ _id: id, userId })) ? finalized() : notFound();
}

export async function addLine(
  userId: ObjectId,
  id: ObjectId,
  line: LineInputPayload,
): Promise<DocumentDoc> {
  const doc = await getDocument(userId, id);
  return setLines(userId, id, [...doc.lines.map(asPayload), line]);
}

export async function updateLine(
  userId: ObjectId,
  id: ObjectId,
  lineId: ObjectId,
  line: LineInputPayload,
): Promise<DocumentDoc> {
  const doc = await getDocument(userId, id);
  if (!doc.lines.some((existing) => existing._id.equals(lineId))) {
    throw new ApiError(404, "NOT_FOUND", "Line item not found");
  }

  return setLines(
    userId,
    id,
    doc.lines.map((existing) =>
      existing._id.equals(lineId) ? { ...line, _id: lineId } : asPayload(existing),
    ),
  );
}

export async function removeLine(
  userId: ObjectId,
  id: ObjectId,
  lineId: ObjectId,
): Promise<DocumentDoc> {
  const doc = await getDocument(userId, id);
  const remaining = doc.lines.filter((existing) => !existing._id.equals(lineId));
  if (remaining.length === doc.lines.length) {
    throw new ApiError(404, "NOT_FOUND", "Line item not found");
  }

  return setLines(userId, id, remaining.map(asPayload));
}

export async function finalizeDocument(userId: ObjectId, id: ObjectId): Promise<DocumentDoc> {
  const doc = await getDocument(userId, id);
  if (doc.status === "finalized") throw finalized();

  const problems: Array<{ path: string; message: string }> = [];
  if (doc.lines.length === 0) {
    problems.push({ path: "lines", message: "A document must have at least one line to be finalized" });
  }
  doc.lines.forEach((line, index) => {
    if (line.quantity < 1) {
      problems.push({ path: `lines.${index}.quantity`, message: "Quantity must be at least 1" });
    }
    if (line.unitPriceCents < 0) {
      problems.push({ path: `lines.${index}.unitPrice`, message: "Unit price must be 0 or greater" });
    }
  });

  if (problems.length > 0) {
    throw new ApiError(422, "VALIDATION_ERROR", "This document cannot be finalized", problems);
  }

  const now = new Date();
  return updateDraft(userId, id, {
    $set: { status: "finalized", finalizedAt: now, updatedAt: now },
  });
}

export interface Summary {
  from: string;
  to: string;
  status: "draft" | "finalized" | "all";
  documentCount: number;
  totals: DocumentDoc["totals"];
}

export async function summarize(
  userId: ObjectId,
  range: { from: Date; to: Date; status?: "draft" | "finalized" },
): Promise<Summary> {
  const match: Filter<DocumentDoc> = {
    userId,
    issueDate: { $gte: range.from, $lte: range.to },
    ...(range.status ? { status: range.status } : {}),
  };

  const [row] = await (await documents())
    .aggregate<{ documentCount: number } & DocumentDoc["totals"]>([
      { $match: match },
      {
        $group: {
          _id: null,
          documentCount: { $sum: 1 },
          subtotalCents: { $sum: "$totals.subtotalCents" },
          discountCents: { $sum: "$totals.discountCents" },
          taxCents: { $sum: "$totals.taxCents" },
          grandTotalCents: { $sum: "$totals.grandTotalCents" },
        },
      },
    ])
    .toArray();

  return {
    from: toDateOnly(range.from),
    to: toDateOnly(range.to),
    status: range.status ?? "all",
    documentCount: row?.documentCount ?? 0,
    totals: {
      subtotalCents: row?.subtotalCents ?? 0,
      discountCents: row?.discountCents ?? 0,
      taxCents: row?.taxCents ?? 0,
      grandTotalCents: row?.grandTotalCents ?? 0,
    },
  };
}

export async function duplicateDocument(userId: ObjectId, id: ObjectId): Promise<DocumentDoc> {
  const source = await getDocument(userId, id);
  const now = new Date();

  const copy: DocumentDoc = {
    ...source,
    _id: new ObjectId(),
    title: `${source.title} (copy)`.slice(0, 200),
    status: "draft",
    lines: source.lines.map((line) => ({ ...line, _id: new ObjectId() })),
    duplicatedFrom: source._id,
    finalizedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  await (await documents()).insertOne(copy);
  return copy;
}
