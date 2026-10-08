# Phase 0 — Sprint plan (weeks 1–3)

Goal (from the [Master Plan](MASTER_PLAN.md) §4): prove the riskiest parts in code before building features on them.

## Build order

| # | Work item | Why first | Status |
| --- | --- | --- | --- |
| 1 | **Monorepo skeleton**: pnpm workspaces, TypeScript, Vitest, CI | Everything else lives in it | Done |
| 2 | **Totals engine** (`packages/pricing`): discounts, service charge, VAT included/added, cash rounding, split evenly / by item, with golden fixtures | Money must be right before any screen shows a total | Done — fixtures need accountant sign-off |
| 3 | **Sync core** (`packages/sync-core`): event log, ULIDs, hub with term-based failover, outbox and resubmission, order rules | Biggest risk in the product (offline, no lost or duplicate orders) | Done (in-memory; see [ADR 0001](decisions/0001-offline-sync-hub-with-failover.md)) |
| 4 | **Chaos simulation**: deterministic network simulator; kills the hub, splits the network, drops messages; checks for zero lost or duplicate events | Gate 0 criterion | Done — 1,000 seeds pass; found and fixed 2 bugs |
| 5 | **Cloud schema + API skeleton** (`services/api`): PostgreSQL migration for core entities, health endpoint, idempotent event ingest | Cloud is the source of truth for menus and reports | Done |
| 6 | **Decision records** (`docs/decisions/`) | Record D4–D6 as proposed | Done (proposed) |
| 7 | Flutter POS/KDS app shell + Dart port of the totals engine using the same fixtures | The POS computes bills itself when offline | Dart port done (`packages/pricing_dart`: 15 golden + 300 cross-language fixtures); Flutter app shell still needs the Flutter SDK |
| 8 | Real LAN transport for sync (WebSocket + mDNS) and the printing spike on real hardware | Needs devices and printers | Next — hardware lab |
| 9 | **Sign-in and devices** (S1, pulled forward): owner sign-up and sessions, device pairing codes and tokens, staff PINs, role permissions with owner overrides; log upload now requires a paired device | Closes the open API endpoint | Done, with rate limits |
| 10 | Owner dashboard (Next.js) | Phase 1, sprint S1 | Done — see [PHASE1_S1.md](PHASE1_S1.md) |

## Gate 0 checklist

- [x] Chaos test: 1,000 seeded runs, 0 lost, 0 duplicate events (simulation)
- [x] Failover under 10 seconds (simulation: about 1.5 s)
- [ ] Same chaos test over a real LAN transport on devices
- [ ] Failover under 10 seconds on real devices
- [ ] Thai receipts print on all target printers
- [x] Decisions D1–D9 decided by the owner (Oct 8, 2026; see decisions/0004)
- [ ] Totals fixtures signed off by an accountant (see [totals-rules.md](totals-rules.md))
