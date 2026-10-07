# Phase 1 · Sprint S1 (weeks 4–5)

From the [Master Plan](MASTER_PLAN.md) §5: accounts, branches, devices, PIN login, permissions; menu and modifier admin in the dashboard.
**Demo:** the owner builds a menu on the web and it appears on a tablet.

| Item | Status |
| --- | --- |
| Accounts, branches, owner sign-in, device pairing, staff PINs, role permissions | Done (pulled into Phase 0) |
| Menu API: categories, items, modifier groups (min/max), per-branch price / availability / station, kitchen stations | Done |
| Menu download for devices, with ETag so unchanged menus are skipped | Done |
| Owner dashboard (Next.js, Thai first, English toggle): sign-up/in, menu editor, device pairing, staff | Done — [screenshots](screenshots) |
| Demo as an automated end-to-end test (`apps/dashboard/e2e/s1-demo.spec.ts`), run in CI | Done — the POS side is played by API calls until the Flutter app exists |
| POS app receives the menu (Flutter) | Blocked: Flutter toolchain (Phase 0 item 7) |
| Sync engine hardened on a real LAN transport | Blocked: hardware lab (Phase 0 item 8) |

| Rate limits on sign-in, sign-up and pairing (Postgres-backed, `Retry-After`) | Done |
| Dashboard session in an httpOnly SameSite cookie behind a same-origin `/api` route, with a CSRF header check | Done |
| Totals engine ported to Dart for the POS app (`packages/pricing_dart`), matching TypeScript on all shared fixtures | Done |

## Known gaps to close before pilots

- Menu editing UI: editing an existing item's names, category or modifiers, reordering, photos, and editing modifier groups (the API supports all except photo upload).
- Owner-facing permission editor (the API reads overrides; there is no endpoint to change them yet).
