# Restaurant Management System

A cloud restaurant management system for Thai restaurants: POS, kitchen display, tables and PromptPay payments, working offline first.

- [Product spec](docs/product-spec.md)
- [Master development plan](docs/MASTER_PLAN.md)
- [Phase 0 sprint](docs/PHASE0_SPRINT.md) ← current
- [Decision records](docs/decisions/)

## Repository layout

| Path | What it is |
| --- | --- |
| `apps/dashboard` | Owner dashboard (Next.js, Thai/English): sign-up, menu editor, device pairing, staff. Screenshots in [docs/screenshots](docs/screenshots) |
| `packages/pricing` | Order totals engine: discounts, service charge, VAT, cash rounding, split bills. Golden fixtures in `fixtures/totals.json` ([rules](docs/totals-rules.md)) |
| `packages/sync-core` | Offline sync: branch event log, hub failover, order rules, and the chaos simulator in `test/` ([design](docs/decisions/0001-offline-sync-hub-with-failover.md)) |
| `services/api` | Cloud API (Fastify + PostgreSQL): schema migrations, owner sign-in, device pairing, staff PINs, branch log upload |

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

Run more chaos seeds (CI runs 100 in the main test job and 1,000 in a separate job):

```sh
CHAOS_SEEDS=1000 pnpm --filter @fcs/sync-core exec vitest run test/chaos.test.ts
```

Run the dashboard end-to-end test (real API, dashboard and browser; needs PostgreSQL):

```sh
createdb fcs_e2e
API_URL=http://localhost:3101 pnpm build      # API_URL is baked into the dashboard's /api rewrite
E2E_DATABASE_URL=postgres://localhost/fcs_e2e pnpm --filter @fcs/dashboard e2e
```

Run the API locally:

```sh
pnpm build
DATABASE_URL=postgres://localhost/fcs_dev pnpm --filter @fcs/api start   # applies migrations, listens on :3000
```

## API

| Endpoint | Who | What |
| --- | --- | --- |
| `POST /v1/signup` | Anyone | New restaurant: account, first branch and owner |
| `POST /v1/auth/login` · `POST /v1/auth/logout` · `GET /v1/me` | Owner, manager | Dashboard sessions (30 days) |
| `POST /v1/branches/:id/pairing-codes` | `MANAGE_DEVICES` | One-time code (15 min) to pair a tablet |
| `POST /v1/devices/pair` | New tablet | Exchange the code for a device token and hub priority |
| `GET /v1/branches/:id/devices` · `DELETE …/devices/:deviceId` | `MANAGE_DEVICES` | List devices; retire a lost one (its token stops working) |
| `GET` · `POST /v1/branches/:id/staff` | `MANAGE_STAFF` | List staff; add staff with a 4–6 digit PIN (only the owner can add managers) |
| `GET /v1/menu` | Signed in | The account's menu with every branch's overrides |
| `POST`/`PATCH`/`DELETE /v1/menu/categories…`, `…/items…`; `POST`/`PUT`/`DELETE /v1/menu/modifier-groups…` | `EDIT_MENU` | Edit the shared menu (deletes archive) |
| `PUT /v1/branches/:id/menu/items/:itemId` | `EDIT_MENU` | Branch price, availability and kitchen station for one item |
| `GET` · `POST /v1/branches/:id/stations` | `EDIT_MENU` | Kitchen stations with ticket ageing thresholds |
| `GET /v1/devices/me/menu` | Paired device | The branch's resolved menu; send `If-None-Match` to skip unchanged menus |
| `GET /v1/devices/me/roster` | Paired device | Staff PIN hashes, roles and permissions, for signing in offline |
| `POST /v1/branches/:id/log/upload` | Paired device of that branch | Upload the branch log ([rules](docs/decisions/0001-offline-sync-hub-with-failover.md)) |
| `GET /v1/branches/:id/log` | That branch's devices; `SEE_REPORTS_*` | Read the branch log |

Tokens go in `Authorization: Bearer <token>`. Only SHA-256 hashes of tokens and scrypt hashes of passwords and PINs are stored. Permissions default to the spec's table (`services/api/src/permissions.ts`); owners can override them per role.
