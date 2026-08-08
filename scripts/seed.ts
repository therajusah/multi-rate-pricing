import { strict as assert } from "node:assert";
import { ObjectId } from "mongodb";
import { documents, users } from "../src/lib/db";
import { createDocument, finalizeDocument } from "../src/lib/documents";
import { hashPassword } from "../src/lib/password";
import { formatScaled2 } from "../src/lib/money";
import { createDocumentSchema } from "../src/lib/schemas";

const EMAIL = "demo@example.com";
const PASSWORD = "demo12345";

const SAMPLE = {
  title: "Sample quote",
  customer: "Acme Inc.",
  issueDate: "2026-08-01",
  lines: [
    {
      description: "Widget A",
      quantity: 2,
      unitPrice: "100.00",
      discount: { type: "percent", value: "10" },
      taxPercent: "5",
    },
    { description: "Widget B", quantity: 1, unitPrice: "50.00", taxPercent: "5" },
    {
      description: "Service fee",
      quantity: 1,
      unitPrice: "200.00",
      discount: { type: "fixed", value: "20.00" },
    },
  ],
};

async function main() {
  const user = await (await users()).findOneAndUpdate(
    { email: EMAIL },
    {
      $setOnInsert: {
        _id: new ObjectId(),
        email: EMAIL,
        passwordHash: await hashPassword(PASSWORD),
        createdAt: new Date(),
      },
    },
    { upsert: true, returnDocument: "after" },
  );
  assert(user, "failed to create the demo user");

  await (await documents()).deleteMany({ userId: user._id });

  const input = createDocumentSchema.parse(SAMPLE);
  const draft = await createDocument(user._id, input);

  assert.deepEqual(draft.totals, {
    subtotalCents: 45_000,
    discountCents: 4_000,
    taxCents: 1_150,
    grandTotalCents: 42_150,
  });

  const finalizedInput = createDocumentSchema.parse({
    ...SAMPLE,
    title: "Retainer — August",
    issueDate: "2026-08-15",
    lines: [{ description: "Monthly retainer", quantity: 1, unitPrice: "1500.00", taxPercent: "5" }],
  });
  const second = await createDocument(user._id, finalizedInput);
  await finalizeDocument(user._id, second._id);

  console.log(`Seeded ${EMAIL} / ${PASSWORD}`);
  console.log(`  draft     "${draft.title}"  grand total ${formatScaled2(draft.totals.grandTotalCents)}`);
  console.log(`  finalized "${second.title}"  grand total ${formatScaled2(second.totals.grandTotalCents)}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
