# Restaurant Management System

A cloud restaurant management system for Thai restaurants: POS, kitchen display, tables and PromptPay payments, working offline first.

- [Product spec](docs/product-spec.md)
- [Master development plan](docs/MASTER_PLAN.md)
- [Phase 0 sprint](docs/PHASE0_SPRINT.md) ← current
- [Decision records](docs/decisions/)

## Repository layout

| Path | What it is |
| --- | --- |
| `packages/pricing` | Order totals engine: discounts, service charge, VAT, cash rounding, split bills. Golden fixtures in `fixtures/totals.json` ([rules](docs/totals-rules.md)) |
| `packages/sync-core` | Offline sync: branch event log, hub failover, order rules, and the chaos simulator in `test/` ([design](docs/decisions/0001-offline-sync-hub-with-failover.md)) |
| `services/api` | Cloud API (Fastify + PostgreSQL): schema migrations, branch log upload |

## Development

Requires Node.js 22 and pnpm 10.

```sh
pnpm install
pnpm test                    # builds, then runs all tests (API tests skip without a database)
pnpm typecheck
```

API tests need PostgreSQL 16:

```sh
createdb fcs_test
DATABASE_URL=postgres://localhost/fcs_test pnpm --filter @fcs/api test
```

Run more chaos seeds (CI runs 100 on every push, and 1,000 on pushes to main):

```sh
CHAOS_SEEDS=1000 pnpm --filter @fcs/sync-core exec vitest run test/chaos.test.ts
```

Run the API locally:

```sh
pnpm build
DATABASE_URL=postgres://localhost/fcs_dev pnpm --filter @fcs/api start   # applies migrations, listens on :3000
```
