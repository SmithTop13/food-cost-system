# 0001 — Offline sync: hub with automatic failover

Status: Proposed · Decision D6 · Code: [`packages/sync-core`](../../packages/sync-core)

## Context

Service must continue for 24 hours without internet, orders must reach the KDS in under 2 seconds, and "no single local device is required". Two designs were possible:

1. **Peer-to-peer** sync where every device merges every other device's changes (CRDT-style).
2. **One hub per branch** that orders all changes, with another device taking over automatically if it fails.

Peer-to-peer has no single point of failure, but business rules become very hard. Two waiters adding items to a bill that a cashier is closing, at the same time, have no single answer to "what happened first". The hub design gives one order of events and one place to apply the rules, and failover removes the single point of failure.

## Decision

Use one hub per branch with automatic failover.

- **Full copies:** every device keeps the full branch log (SQLite on the device).
- **The hub orders and decides:** the hub puts each event in order and decides whether it is ACCEPTED or REJECTED (with a reason). Rejected events stay in the log, so staff see why and nothing disappears.
- **Waiting for dependencies:** an event that refers to something not yet in the log (for example an item for an order that hasn't arrived) is held for up to 2 seconds before it is rejected.
- **Ballots:** each hub has a ballot (term number + priority rank). A higher term wins, and within a term the higher-priority device wins. A device follows the best hub it can hear.
- **Failover:** if the hub is silent for 1.5 s, the highest-priority device that is still reachable takes over with a new term.
- **No lost events:**
  - Devices keep their own events until they see them in the log.
  - When a device adopts a different hub's log, it resubmits every event its old copy had that the new log is missing.
  - The hub ignores duplicates by event ID (a ULID).
- **Cloud:** the cloud mirrors the log of the hub with the best ballot. A hub only claims a newer term because of the cloud when the newer hub has been silent for 30 s. This stops two halves of a split network fighting through the cloud.
- **Learning about newer terms:** devices include the highest term they know in their pings. If a hub hears of a newer term and no newer hub's heartbeat arrives within 1.5 s, it claims a newer term.

## Evidence

A deterministic simulator ([`test/sim.ts`](../../packages/sync-core/test/sim.ts)) runs a 60-second service on 4 devices with:
- random hub crashes and restarts
- network splits
- up to 30% packet loss
- internet outages
- device clocks up to ±5 minutes off

After the faults are healed:
- every event appears exactly once in the hub log
- all devices hold the same log and state
- the cloud matches the hub

| Check | Result |
| --- | --- |
| 100 seeds (every CI run) | Pass |
| 1,000 seeds (every push to main) | Pass |
| Hub failover time | ≈ 1.5 s (target < 10 s) |
| 120 s with no internet, then reconnect | Cloud catches up, nothing lost |
| Sabotage check: skip resubmitting old-log events | 101 of 104 tests fail (the suite does catch lost orders) |

The 1,000-seed run found two real bugs that 100 seeds missed. Both are fixed, with regression tests:
- hubs on both sides of a split fought over the cloud, and terms ran away
- the cloud lagged behind when a restarted device remembered a newer term

## Consequences

- **Split network:** each side keeps working with its own hub. When it heals, the losing side's events are re-checked against the winning log. Some can be rejected at that point, for example an item added on side A to a bill that side B already closed. Staff must see these rejections on screen. This is a product requirement for S2–S4.
- **Full-log resync:** a device copies the whole log when the hub changes. That is fine for one day's log (thousands of events). A day-boundary snapshot is needed before logs grow large.
- **Not yet proven:**
  - the real LAN transport (WebSocket + mDNS)
  - persistence on the device (SQLite)
  - one-way network faults (A can reach B, but B can't reach A)
  - performance on real tablets
  
  These are Phase 0 items 7–8.
