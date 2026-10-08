# 0003 — Flutter for the POS, waiter and KDS apps

Status: **Accepted** (Oct 8, 2026) · Decision D4

## Decision

Build one Flutter app with POS, waiter and KDS modes, chosen by device role.

## Why

- **Devices:** one codebase runs on iPad, Android tablets and Sunmi-style Android POS devices.
- **Printing:** Sunmi's built-in printer SDK and ESC/POS libraries (LAN, USB, Bluetooth) are available. Thai receipts can be drawn as an image, which avoids printer code-page problems with Thai vowel and tone marks.
- **Speed:** its rendering is predictable on cheap tablets, which matters for the 300 ms response target.
- **React Native was the alternative:** it would share TypeScript with the cloud, but Bluetooth printing and Sunmi support are weaker, and performance on low-end Android tablets is less predictable.

## Consequences

- **Second language:** the team needs Dart as well as TypeScript.
- **Ported code:** the totals engine and the sync node must be ported to Dart, and must pass the same fixtures and the same chaos scenarios. The simulator's message format (`Message` in `packages/sync-core/src/types.ts`) is the contract between them.
