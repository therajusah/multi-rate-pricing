# Multi-Rate Pricing Calculator

Create quote-style documents with line items, per-line discounts and tax, and a
summary report over an issue-date range. Every amount is calculated and stored
server-side; the client never supplies a total.

**Live URL:** 
**Demo login:** `demo@example.com` / `demo12345` (created by `npm run seed`)

Stack: Next.js 16 (App Router, route handlers as the REST API) · TypeScript ·
MongoDB 8 · Zod · Tailwind CSS 4 · Vitest.

---

## Prerequisites and step-by-step setup

**Prerequisites:** Node.js 20+ (developed on 24) and Docker for MongoDB.

```bash
# 1. Install dependencies
npm install

# 2. Start MongoDB (localhost:27017, data kept in a named volume)
npm run db:up          # docker compose up -d
docker compose ps      # wait until pricing-mongo is "healthy"

# 3. Configure the environment
cp .env.example .env.local
# then set a real secret:
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"

# 4. Seed the demo account and the sample document from the brief
npm run seed

# 5. Run it
npm run dev            # http://localhost:3000
```


| Variable         | Required | Notes                                                         |
| ---------------- | -------- | ------------------------------------------------------------- |
| `MONGODB_URI`    | yes      | `mongodb://localhost:27017` locally, an Atlas SRV URI in prod |
| `MONGODB_DB`     | no       | Defaults to `pricing`                                         |
| `SESSION_SECRET` | yes      | ≥ 32 characters; signs the session cookie                     |


Indexes (unique `users.email`, `documents{userId, issueDate}`,
`documents{userId, status}`) are created on first connection — there is no
separate migration step.

### Checks

```bash
npm test           # 22 unit tests on the calculation module
npm run typecheck  # tsc --noEmit
./scripts/smoke.sh # 41 end-to-end API assertions against a running server
```

`scripts/smoke.sh` exercises the whole contract: auth, per-field validation
errors, the sample document's totals, cross-user isolation, the immutability of
finalized documents, duplication, and the report. Point it at a deployment with
`BASE=https://your-app ./scripts/smoke.sh`.

---



## Calculation and rounding policy

**Nothing is stored as a floating-point number.** Amounts are integer **cents**
(`$100.00` → `10000`) and percentages are integer **hundredths of a percent**
(`10%` → `1000`, `7.5%` → `750`). Both share one parser and one formatter in
[src/lib/money.ts](src/lib/money.ts).

Input arrives as a decimal string or number and is converted through its
*string* form, never by multiplying: `Math.round(1.005 * 100)` is `100`, not
`101`, because `1.005` is really `1.00499…` in binary floating point. A value
with more than 2 decimal places is rejected rather than silently rounded.

Percentages are applied with exact `BigInt` multiply-divide, **rounded half up
(away from zero) to whole cents**:

```ts
mulDivRoundHalfUp(a, b, d) = (a*b*2 + sign(a*b)*d) / (2*d)   // BigInt, truncating division
```



### Per-line order of operations

Every line is computed by `calculateLine` in [src/lib/calc.ts](src/lib/calc.ts),
which is the **only** place amounts are produced — API routes, the seed script
and the browser preview all call it:

1. `subtotal = quantity × unitPrice` (exact, no rounding needed)
2. `discount` = the fixed amount, or `round(subtotal × discountPercent)`
3. `afterDiscount = subtotal − discount`
4. `tax = round(afterDiscount × taxPercent)` — **tax is charged on the
  discounted amount, never on the original subtotal**
5. `lineTotal = afterDiscount + tax`

Rounding happens **once per line, at each of steps 2 and 4**. Document totals
are plain sums of those already-rounded line values, so

```
grandTotal ≡ subtotal − totalDiscount + totalTax
```

holds by construction. It is asserted in the tests and it means the summary
report can never disagree with the documents it covers.

### Worked example (the sample from the brief)


| Line        | Qty | Unit price | Discount    | Tax | Subtotal | Discount amt | After discount | Tax amt | Line total |
| ----------- | --- | ---------- | ----------- | --- | -------- | ------------ | -------------- | ------- | ---------- |
| Widget A    | 2   | 100.00     | 10%         | 5%  | 200.00   | 20.00        | 180.00         | 9.00    | 189.00     |
| Widget B    | 1   | 50.00      | —           | 5%  | 50.00    | 0.00         | 50.00          | 2.50    | 52.50      |
| Service fee | 1   | 200.00     | 20.00 fixed | —   | 200.00   | 20.00        | 180.00         | 0.00    | 180.00     |


Widget A's tax is `5% of 180.00 = 9.00`, not `5% of 200.00`.


| Document total | Amount     | Derivation              |
| -------------- | ---------- | ----------------------- |
| Subtotal       | **450.00** | 200 + 50 + 200          |
| Total discount | **40.00**  | 20 + 0 + 20             |
| Total tax      | **11.50**  | 9.00 + 2.50 + 0         |
| Grand total    | **421.50** | 189.00 + 52.50 + 180.00 |


`npm run seed` creates exactly this document and asserts these numbers.

### Validation rules and the choices behind them


| Rule                                          | Behaviour                                                                                                                 |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Percent **or** fixed discount, never both     | The API models `discount` as a tagged union, so "both" is unrepresentable rather than merely rejected                     |
| Fixed discount greater than the line subtotal | **Rejected** with `422`, not clamped — silently charging a different discount than the one entered is worse than an error |
| Fixed discount exactly equal to the subtotal  | Allowed; the line settles at 0.00                                                                                         |
| Discount percent / tax percent                | 0–100 inclusive                                                                                                           |
| Quantity                                      | Whole number ≥ 1 (see Assumptions)                                                                                        |
| Unit price                                    | ≥ 0                                                                                                                       |
| Any money or percent value                    | At most 2 decimal places, ≤ 10,000,000,000                                                                                |


---



## Finalize/immutability rules


| Status      | Behaviour                                                                                                      |
| ----------- | -------------------------------------------------------------------------------------------------------------- |
| `draft`     | Fully editable: metadata, lines, delete                                                                        |
| `finalized` | Read-only. Metadata edits, line add/edit/delete, delete and re-finalize all fail with `409 DOCUMENT_FINALIZED` |


Documents are always created as drafts. `POST /api/documents/:id/finalize`
promotes one, and refuses if the document has no lines or any line has
`quantity < 1` or a negative price (`422` with the offending line's path).

Immutability is not a check in each route — it lives in the update filter, in
one helper in [src/lib/documents.ts](src/lib/documents.ts):

```ts
collection.findOneAndUpdate({ _id: id, userId, status: "draft" }, update, { returnDocument: "after" });
```

Ownership and editability are therefore enforced *by the database*, so a write
cannot slip in between a check and its update, and a concurrent double-finalize
resolves to one winner. When the filter matches nothing, the document is read
back once to answer `404` (missing, or not yours) versus `409` (finalized).
Deletion follows the same rule: finalized documents cannot be deleted.

**Duplication is supported.** `POST /api/documents/:id/duplicate` copies any
document — typically a finalized one — into a new editable draft with fresh line
ids, `" (copy)"` appended to the title, and `duplicatedFrom` pointing at the
original. That is the intended way to "change" a finalized document.

**Printable view.** `/documents/:id/print` renders a print-friendly HTML page
(metadata, lines, totals) with chrome hidden via `no-print` / `@media print`;
use the on-page button for Print / Save as PDF through the browser.

---



## API

Session is an httpOnly cookie; every endpoint below except the auth ones
requires it. All amounts in requests are decimal strings or numbers
(`"100.00"`, `100`, `7.5`); all amounts in responses are **integer cents**.


| Method   | Path                                       | Purpose                             |
| -------- | ------------------------------------------ | ----------------------------------- |
| `POST`   | `/api/auth/signup`                         | Create an account and sign in       |
| `POST`   | `/api/auth/login`                          | Sign in                             |
| `POST`   | `/api/auth/logout`                         | Sign out                            |
| `GET`    | `/api/auth/me`                             | Current user                        |
| `GET`    | `/api/documents`                           | List your documents                 |
| `POST`   | `/api/documents`                           | Create a draft (lines optional)     |
| `GET`    | `/api/documents/:id`                       | Read one                            |
| `PATCH`  | `/api/documents/:id`                       | Update metadata and/or all lines    |
| `DELETE` | `/api/documents/:id`                       | Delete a draft                      |
| `POST`   | `/api/documents/:id/lines`                 | Append a line                       |
| `PATCH`  | `/api/documents/:id/lines/:lineId`         | Replace a line                      |
| `DELETE` | `/api/documents/:id/lines/:lineId`         | Remove a line                       |
| `POST`   | `/api/documents/:id/finalize`              | Draft → finalized                   |
| `POST`   | `/api/documents/:id/duplicate`             | Copy into a new draft               |
| `GET`    | `/api/reports/summary?from=&to=[&status=]` | Totals over an inclusive date range |


Mutating a document returns the whole recalculated document, so a client never
has to derive totals.

```bash
curl -X POST http://localhost:3000/api/documents \
  -H 'content-type: application/json' -b cookies.txt \
  -d '{
    "title": "Sample quote", "customer": "Acme Inc.", "issueDate": "2026-08-01",
    "lines": [
      {"description":"Widget A","quantity":2,"unitPrice":"100.00","discount":{"type":"percent","value":"10"},"taxPercent":"5"},
      {"description":"Widget B","quantity":1,"unitPrice":"50.00","taxPercent":"5"},
      {"description":"Service fee","quantity":1,"unitPrice":"200.00","discount":{"type":"fixed","value":"20.00"}}
    ]
  }'
# → 201 { "document": { ..., "totals": { "subtotalCents": 45000, "discountCents": 4000,
#                                        "taxCents": 1150, "grandTotalCents": 42150 } } }
```

Errors always take one shape, with `details` naming the exact field:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [{ "path": "lines.0.discount.value", "message": "Fixed discount must not exceed the line subtotal" }]
  }
}
```

Codes: `VALIDATION_ERROR` (422), `INVALID_CREDENTIALS` / `UNAUTHORIZED` (401),
`NOT_FOUND` (404), `EMAIL_TAKEN` (409), `DOCUMENT_FINALIZED` (409),
`INTERNAL_ERROR` (500).

### Report

`GET /api/reports/summary?from=2026-08-01&to=2026-08-31` returns the document
count and the summed subtotal, discount, tax and grand total for documents whose
`issueDate` falls in the range, **inclusive of both endpoints**. Dates are plain
calendar dates interpreted as UTC. Drafts and finalized documents are both
included; add `&status=finalized` to narrow it. Because it sums stored totals
produced by the shared module, the report always ties out to the individual
documents.

---



## Data model

Two collections. Line items are embedded rather than stored separately: they are
only ever read and written together with their parent, and embedding makes each
document a single atomic write — no transactions, so no replica set is needed
for local development.

```
users      { _id, email (unique), passwordHash, createdAt }

documents  { _id, userId, title, customer, issueDate, status,
             lines: [ { _id, description, quantity, unitPriceCents,
                        discount: null | { type: "percent"|"fixed", value },
                        taxPercent, totals: { … } } ],
             totals: { subtotalCents, discountCents, taxCents, grandTotalCents },
             duplicatedFrom?, finalizedAt, createdAt, updatedAt }
```

Totals are recomputed and persisted on every write, which makes the report a
single `$match` + `$group` aggregation over the `{userId, issueDate}` index
instead of a fan-out over line items.

### Security

- Passwords are hashed with `scrypt` (Node standard library, per-user random
salt, constant-time comparison) — a real KDF with no native build dependency.
- Sessions are HS256 JWTs in an httpOnly, sameSite=lax, secure-in-production
cookie.
- `userId` always comes from the session and is applied as a filter on every
query. It is never read from a request body or path.
- Login answers identically for an unknown email and a wrong password, and
hashes against a decoy so the two paths cost the same time.
- Every input is validated by Zod before it reaches the database.

---



## Deployment

**Vercel + MongoDB Atlas** (what the live URL runs on):

1. Create a free Atlas cluster, add a database user, and allow access from
  `0.0.0.0/0` (Vercel's build and function IPs are not fixed).
2. Import the repository into Vercel — the framework preset is detected.
3. Set `MONGODB_URI`, `MONGODB_DB` and `SESSION_SECRET` in Project Settings →
  Environment Variables, then deploy.
4. Seed the deployed database from your machine:
  `MONGODB_URI="<atlas-uri>" npm run seed`.

The Mongo client is cached on `globalThis`, so warm serverless invocations reuse
the connection pool instead of opening one per request.

**DigitalOcean App Platform** (or any container host): the included
`Dockerfile` sets `DOCKER_BUILD=true` so Next emits standalone output. Vercel
builds omit standalone (it breaks their NFT tracing step). Point App Platform
at the repo, choose Dockerfile as the build strategy, expose port 3000 and set
the same three environment variables.

---



## Assumptions and tradeoffs

- **Single currency, no currency field.** Everything is "cents" of one implied
currency and rendered as a plain `450.00`. Multi-currency would need a
per-document currency plus a minor-unit exponent, since not every currency has
two decimal places.
- **Quantity is a whole number ≥ 1**, matching the brief. Fractional quantities
(0.5 hours) would need the subtotal itself to be a rounded product rather than
an exact one.
- **Tax is a simple per-line percent.** No tax codes, jurisdictions,
inclusive-vs-exclusive pricing, or withholding.
- **Rounding is half-up per line.** Banker's rounding or rounding only at the
document level would both be defensible; the important part is that one policy
is applied in one module and the totals stay internally consistent.
- **The API exposes both whole-document** `PATCH` **and per-line endpoints.** The UI
uses `PATCH` because the editor edits several rows at once; the per-line
endpoints exist for API consumers and are covered by the smoke test.
- **Line edits are read-modify-write on the whole array**, so two people editing
the same draft simultaneously would be last-write-wins. Finalizing is not
affected — that path still requires `status: "draft"` in the update filter, so
it stays atomic.
- **The report includes drafts by default**, on the assumption that a pipeline  
view is more useful than a strictly billed one; `?status=finalized` narrows it.

