# 0002 — TypeScript on Node.js with PostgreSQL for the cloud

Status: **Accepted** (Oct 8, 2026) · Decision D5 · Code: [`services/api`](../../services/api)

## Decision

The cloud services use TypeScript on Node.js 22, with Fastify for HTTP and PostgreSQL 16 for storage.

## Why

- **One language:** the owner dashboard and QR ordering use Next.js, so one language covers all web and cloud code, and the team is small (3–5 developers).
- **Shared code:** the sync rules (`decideUpload`) and the totals engine are shared directly between the simulator, the tests and the API.
- **Why PostgreSQL:**
  - multi-branch data is relational
  - row locks make cloud uploads for one branch apply one at a time
  - `jsonb` stores the raw events
- **Go was the alternative:** it is faster and simpler to deploy, but it would split the codebase into two languages for little gain at our scale (up to about 100 branches per account).

## Consequences

- **Dart port of the totals engine:** the POS app is Flutter (0003), so the totals engine needs a Dart version. Shared fixtures (`packages/pricing/fixtures/totals.json`) keep the two identical.
- **Raw SQL:** for now there is no ORM. Migrations are plain SQL files in `services/api/migrations`.
