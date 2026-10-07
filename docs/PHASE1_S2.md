# Phase 1 · Sprint S2 (weeks 6–7)

From the [Master Plan](MASTER_PLAN.md) §5: order entry, modifiers, notes, order types; totals engine in TypeScript and Dart.
**Demo:** a waiter enters a 5-item order in under 20 seconds.

| Item | Status |
| --- | --- |
| Flutter POS app (`apps/pos`): pairing, menu and roster download with offline cache, staff PIN sign-in | Done |
| Order entry: categories, sold out, modifiers with min/max, quantity, notes, dine-in/takeaway/delivery, table | Done |
| Live totals with the Dart engine (`packages/pricing_dart`), the same as the cloud | Done |
| Sending saves sync events to an on-device outbox; contract test against the sync engine's order rules | Done |
| Branch pricing settings (VAT mode, service charge, rounding) in the device menu download | Done |
| Demo: 5 items with modifiers and a table in **11 taps** (budget 12 ≈ 18 s at 1.5 s per tap) | Done in a widget test; time it with staff on a real tablet |

## Measure on real hardware

- **PIN check time:** scrypt (N=16384) took 1.4 s in a debug test run on the build server. It runs off the UI thread. If it is slow on the cheapest tablet, keep a per-shift fast check on the device after the first sign-in, or lower N for PINs (PINs are only 4–6 digits, so the cost mostly slows offline guessing).
- **Order entry timing** with real staff and the 20-second target.

## Next (S3)

- The sync engine on the device: the Dart port of `packages/sync-core` with SQLite storage, replacing the outbox.
- Kitchen display: routing to stations, tickets, ageing colours, bump and recall.
- Hold and fire.
