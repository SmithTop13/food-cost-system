# Restaurant Management System — Master Development Plan

Oct 6, 2026 · Status: Draft · Source: [Product Spec](product-spec.md)

This plan turns the product spec into a phased build. It makes four changes to the spec, all from the spec review:

1. **Phase 0 comes first.** It is a 3-week phase for decisions and proving the offline design.
2. **The MVP is smaller.** It is cut so 3–5 developers can ship it to 5 pilots in about 4 months.
3. **Basic food costing moves into the MVP**, because it is a stated goal and the name of this project.
4. **Tax compliance and PDPA basics move into the MVP**, because pilots need them to operate legally.

---

## 1. Timeline at a glance

| Phase | Weeks | Calendar (start Oct 12, 2026) | Outcome | Exit gate |
| --- | --- | --- | --- | --- |
| **0 — Foundations** | 1–3 | Oct 12 → Oct 30, 2026 | Decisions made, offline sync proven, project skeleton running | Gate 0 |
| **1 — MVP build** | 4–16 | Nov 2, 2026 → Jan 29, 2027 | One restaurant can run a full service without paper | Gate 1 |
| **1P — Pilot** | 17–24 | Feb 1 → Mar 26, 2027 | 5 pilot restaurants live and stable | Gate 2 |
| **2 — Growth** | 25–42 | Mar 29 → Jul 30, 2027 | QR ordering, inventory, delivery, loyalty; general launch | Gate 3 |
| **3 — Scale** | 43–60+ | Aug 2 → Dec 2027 | Chains, AI forecasts, e-Tax, kiosk | — |

The weeks assume a team of 4 developers plus a part-time designer and QA (see §9). With 3 developers, add about 25% to each phase.

Pilot feedback is collected while Phase 2 starts. Phase 2 work that pilots don't need (for example loyalty) can start before Gate 2 if the pilots are stable.

---

## 2. Decisions needed in Phase 0

These decisions block the build. Each has an owner and a deadline. The recommended answer is the default if nobody decides by the deadline.

| # | Decision | Recommended | Why | Deadline |
| --- | --- | --- | --- | --- |
| D1 | Launch segment | **Casual full-service dine-in, 1–3 branches** | Our offline and KDS strengths matter most here, and the same build also serves cafés | Week 1 |
| D2 | Pricing model | Subscription per branch per month, with a free trial | Predictable revenue; matches competitors | Week 2 |
| D3 | Payment provider (PromptPay, card, e-wallets) | One aggregator (shortlist: Opn, 2C2P, KBank) | One integration covers PromptPay and e-wallets. Business verification takes weeks, so **start the application in week 1** | Week 1 |
| D4 | App framework for POS and KDS | **Flutter** | Same app on iPad, Android and Sunmi devices; Sunmi printer SDK; full control over Thai receipt rendering | Week 2 |
| D5 | Backend language | **TypeScript (Node.js)** on PostgreSQL | Same language as the web dashboard; large hiring pool | Week 2 |
| D6 | Offline topology | **Hub with automatic failover** (see §3) | Much simpler than syncing every device with every other, and still meets "no single device required" | Week 3 (after spike) |
| D7 | VAT-registered pilots | Check with a Thai accountant whether ภ.พ.06 POS approval is needed for short-form tax invoices | If it is, MVP pilots that are VAT-registered depend on it | Week 2 |
| D8 | Hardware bundles | No for v1; publish a list of supported hardware | Avoids stock and support burden | Week 3 |
| D9 | Delivery integrations | Middleware provider (e.g. Klikit) in Phase 2 | Faster than three separate partner programs | Before Phase 2 |

---

## 3. Architecture baseline

### Local network

- **Hub:** one device per branch (usually the main POS) runs the local hub service. It keeps the authoritative local copy of orders and sends them to the KDS screens and printers.
- **Failover:** every device keeps a full copy of the branch database (SQLite). If the hub disappears, the next device in a priority list takes over within 10 seconds. Leader election uses a term number, so two hubs can never both accept writes.
- **Discovery:** devices find each other with mDNS. If the router blocks mDNS or isolates devices from each other, the manager can enter IP addresses by hand. Supported routers are listed in the setup guide.

### Data and sync

- **Change log:** every change is an event with a ULID, the device ID, the staff ID and the hub term number. Events are append-only, and replaying them twice gives the same result, so sync never creates duplicates.
- **Conflict rules:**
  - The hub orders the events.
  - Item lines on an order are only added or voided, never edited in place.
  - A bill locks once payment starts.
  - Sold-out (86) status: the latest change wins.
- **Cloud sync:** the hub keeps an outbox of events and uploads it when the internet is available. The cloud is the source of truth for menus, settings and reports. Menu changes flow down to the hub, and the hub passes them to the other devices.
- **Document numbers:** receipt and tax invoice numbers come from per-device number blocks with prefixes, given out by the cloud ahead of time. This keeps them in order and gap-free even offline.

### Payments while offline

| Method | Offline behaviour |
| --- | --- |
| Cash | Works normally |
| Card | Works through a standalone card terminal (EDC); staff record the approval code |
| PromptPay | Shows a static QR. Staff confirm payment manually (a manager PIN is required above a set amount). The payment is checked against the bank record once the device is back online |

### Project layout

```
apps/
  pos/            Flutter — POS, waiter, KDS modes (one app, role-based)
  dashboard/      Next.js — owner/manager web dashboard
  qr/             Next.js — customer QR ordering (Phase 2)
services/
  api/            TypeScript API (REST + WebSocket), PostgreSQL
  sync/           Cloud sync endpoint, outbox ingestion
  workers/        Reports, payment webhooks, notifications
packages/
  pricing/        Order totals engine (TS) + golden test fixtures shared with Dart port
  schema/         Shared event & entity schemas (JSON Schema → TS/Dart codegen)
docs/
```

The totals engine runs both in the cloud (TypeScript) and on devices (Dart). One shared set of test fixtures makes sure both versions always calculate the same totals.

### Data model additions to the spec

The spec's entity list also needs:

- **Structure:** Account (above Restaurant), Device, Station, Zone
- **Documents:** Document sequence, Receipt or tax invoice
- **Audit:** Audit event
- **Order details:** Seat, Price and modifier snapshot on each order item
- **Costing:** Recipe version

Build the model for multiple branches from day one, even though multi-branch screens arrive in Phase 3.

---

## 4. Phase 0 — Foundations (weeks 1–3)

**Goal:** make the hard decisions and prove that offline sync works before building features on top of it.

| Workstream | Deliverables |
| --- | --- |
| Decisions | D1–D8 recorded in `docs/decisions/` as short decision records |
| Offline spike | Hub + 2 devices + 1 KDS on a LAN. Covers: placing orders, unplugging the hub, failover, reconnecting, and syncing to the cloud with zero lost or duplicate orders. Run as an automated chaos test |
| Printing spike | Thai receipt printed as an image on 3 printer models (LAN, USB, Bluetooth) and a Sunmi built-in printer |
| Payments | Provider application submitted; sandbox access for dynamic PromptPay QR |
| Totals spec | Written totals rules with 30+ worked examples, covering discounts, service charge, VAT on the service charge, VAT included vs added, 0.25 and 1 THB rounding, and splitting leftover satang. Reviewed by an accountant |
| Skeleton | Monorepo; CI (lint, test, build); staging environment; error tracking; app builds for iPad and Android |
| Design | Thai-first design system; wireframes for POS order entry, KDS and shift close |

**Gate 0 — exit criteria**

- [ ] The offline chaos test passes 100 runs with 0 lost or duplicate orders
- [ ] Failover takes less than 10 seconds
- [ ] Thai receipts print correctly on all target printers
- [ ] Decisions D1–D8 are recorded
- [ ] The totals examples are signed off

---

## 5. Phase 1 — MVP build (weeks 4–16)

**Goal:** one restaurant can take an order, send it to the kitchen, collect payment, see the day's sales and know its food cost — with no paper.

### Scope

| Area | In MVP | Deferred (to) |
| --- | --- | --- |
| POS & ordering | Menu (TH/EN, photos), modifiers with min/max, dine-in/takeaway/manual delivery, notes, hold & fire, discounts & voids with reasons, service charge, VAT, sold-out (86), split evenly or by item, merge bills | Split by seat (Phase 2) |
| KDS | Station routing, ageing colours, bump/recall, waiter notification, ESC/POS printer fallback | — |
| Tables | Zones, **grid-based** layout, table status, guest count, move & merge | Drag-and-drop floor plan, reservations, waitlist (Phase 2) |
| Payments | Cash, dynamic PromptPay through the provider, card through a standalone terminal (manual entry), split payment, 80 mm printed receipt, full tax invoice, shift open/close with cash variance | E-wallets, SoftPOS, digital receipts by LINE (Phase 2) |
| Staff | Profiles, roles, PINs, configurable permissions with defaults, manager PIN approval, audit log | Clock in/out (Phase 2) |
| Reports | Live dashboard, sales by hour/item/category/staff/payment/order type, voids & discounts, Z report, CSV/Excel export | — |
| **Food cost (new)** | Ingredients with unit cost, recipes per menu item and modifier, **theoretical food cost % per dish**, and food cost on the dashboard | Stock levels, purchase orders, counts (Phase 2) |
| **Compliance (new)** | Short-form and full tax invoices, gap-free numbering, Buddhist Era dates, ภ.พ.06 support if D7 requires it, PDPA privacy notice, consent and data export/delete for staff and invoice customers | e-Tax Invoice (Phase 3) |

### Sprint plan (2-week sprints)

| Sprint | Weeks | Focus | Demo at end of sprint |
| --- | --- | --- | --- |
| S1 | 4–5 | Accounts, branches, devices, PIN login, permissions; menu & modifier admin in dashboard; sync engine from spike hardened | Owner builds a menu on the web; it appears on a tablet |
| S2 | 6–7 | Order entry, modifiers, notes, order types; totals engine (TS + Dart) passes all golden fixtures | Waiter enters a 5-item order in under 20 seconds |
| S3 | 8–9 | KDS: routing, tickets, ageing, bump/recall, notifications; printer fallback; hold & fire | Order reaches KDS in under 2 seconds on LAN, also with internet unplugged |
| S4 | 10–11 | Tables & zones, table status, move & merge; discounts & voids with approval; audit log; sold-out (86) | Full dine-in flow from seating to bill request |
| S5 | 12–13 | Payments: cash, PromptPay dynamic + offline fallback, card terminal, split payment; receipts, tax invoices, numbering; shift open/close | End-to-end service closes with a balanced shift |
| S6 | 14–15 | Reports, Z report, live dashboard, exports; ingredients, recipes, food cost %; PDPA screens | Owner sees today's sales and food cost % on a phone |
| Harden | 16 | Bug fixing, performance on the cheapest supported tablet, 24-hour offline soak test, onboarding tools (menu import from CSV) | Release candidate |

### Testing strategy

- **Golden tests:** shared totals fixtures, run in CI against both the TypeScript and Dart engines.
- **Chaos tests:** every night in CI, the hub is killed, the network is partitioned and clock skew is simulated, then lost and duplicate orders are checked.
- **Performance budget:** 95% of screen actions under 300 ms, and 95% of orders reach the KDS within 2 s. Measured on the cheapest supported Android tablet.
- **Hardware lab:** at least 2 tablets, 1 Sunmi device, 3 printers, 1 cash drawer and 1 card terminal.
- **Dinner rush simulation:** a scripted 3-hour service with 6 devices, 150 orders and a 30-minute internet outage.

**Gate 1 — ready for pilots**

- [ ] All spec acceptance criteria for POS and KDS pass
- [ ] The dinner rush simulation passes with 0 lost orders and a balanced cash count
- [ ] The 24-hour offline soak test passes
- [ ] The payment provider is live in production
- [ ] An accountant has reviewed the tax invoices
- [ ] Thai and English UI is complete

---

## 6. Phase 1P — Pilot (weeks 17–24)

**Goal:** prove the product in 5 real restaurants before general launch.

- **Who:** 5 pilot restaurants: 3 full-service and 2 cafés or quick-service shops. At least one should have unreliable internet.
- **Rollout:** stagger go-live, one restaurant per week. Onboard on-site, and have someone on-site for the first 2 dinner services at each.
- **Support:** an on-call rotation during service hours (11:00–22:00), reachable through a LINE group with each pilot.
- **Telemetry:**
  - Order entry time
  - Time from order to KDS
  - Sync backlog
  - Voids tagged "wrong order"
  - Crash-free sessions
- **Team split:** about 50% fixes from pilot feedback, about 50% Phase 2 groundwork (inventory data model, QR web app skeleton).

**Gate 2 — ready for general launch and full Phase 2**

- [ ] 5 restaurants have each run 4 weeks without going back to paper
- [ ] Fewer than 2 lost or wrong orders per 1,000
- [ ] Average order entry time under 20 seconds
- [ ] 99.5% crash-free sessions
- [ ] At least 3 of the 5 pilots would pay the planned price

---

## 7. Phase 2 — Growth (weeks 25–42)

**Goal:** save staff time and protect margin. Launch publicly and grow to 50 restaurants.

| Block | Weeks | Scope |
| --- | --- | --- |
| 2A — Inventory | 25–30 | Unit conversion, stock deducted on every sale, suppliers, purchase orders, goods received, stock counts with variance, waste logging, low-stock alerts, automatic sold-out, theoretical vs actual cost |
| 2B — QR self-ordering | 25–32 | Per-table QR, browser/LINE, TH/EN/ZH, straight to KDS or staff approval, call waiter / request bill, in-browser PromptPay/card, upsell |
| 2C — Deferred MVP items | 29–34 | Split by seat, drag-and-drop floor plan, reservations & waitlist (SMS/LINE), e-wallets through the aggregator, digital receipts, clock in/out |
| 2D — Delivery | 33–38 | Grab, LINE MAN and foodpanda through middleware; orders go to POS and KDS; push menu and sold-out status; pause a channel; commission reports |
| 2E — CRM & loyalty | 37–42 | Customer profiles, points/stamps, tiers, vouchers & promo codes, LINE OA member card and broadcasts, PDPA marketing consent |

Blocks overlap. Run two streams in parallel: the **POS/kitchen** stream (2A, 2C, 2D) and the **customer-facing web** stream (2B, 2E).

**Gate 3 — ready for Phase 3**

- [ ] 50 restaurants live
- [ ] Monthly churn under 3%
- [ ] Inventory is used by at least 40% of restaurants
- [ ] At least 5 customers are asking for multi-branch features

---

## 8. Phase 3 — Scale (weeks 43–60+)

| Block | Scope | Notes |
| --- | --- | --- |
| 3A — Multi-branch | Central menu with branch overrides, consolidated reports, stock transfers, central kitchen, access limited to assigned branches | The data model is ready from Phase 0, so this is mostly UI and reports |
| 3B — Tax & accounting | e-Tax Invoice / e-Receipt through an approved provider; export to FlowAccount, PEAK, Xero | ภ.พ.06 is already handled in the MVP if D7 required it |
| 3C — AI & analytics | Sales forecasts, purchase suggestions, staff scheduling suggestions, menu engineering matrix | Needs at least 6 months of sales history per restaurant |
| 3D — Kiosk | Self-order kiosk for quick-service shops | Reuses the QR ordering front-end |
| 3E — Marketing extras | Online ordering website, gift cards, happy-hour pricing | — |
| 3F — Assistant | Chat/voice order taking over LINE and phone | Start with LINE chat; voice later |

Priority within Phase 3 is set at Gate 3 by customer demand. The default order is 3A → 3B → 3C → 3D/3E → 3F.

---

## 9. Team

| Role | Phase 0–1 | Phase 2 | Phase 3 |
| --- | --- | --- | --- |
| Tech lead / backend + sync | 1 | 1 | 1 |
| Flutter developers (POS, KDS) | 2 | 2 | 2 |
| Full-stack web developer (dashboard, QR) | 1 | 1–2 | 2 |
| Product designer (part-time) | 0.5 | 0.5 | 0.5 |
| QA / hardware lab | 0.5 | 1 | 1 |
| Onboarding & support | — | 1 (from pilot) | 2 |

---

## 10. Risk register

| Risk | Impact | Likelihood | Mitigation | Owner |
| --- | --- | --- | --- | --- |
| Offline sync loses or duplicates orders | High | Medium | Phase 0 spike, nightly chaos tests, events that are safe to replay | Tech lead |
| Payment provider onboarding delays MVP | High | Medium | Apply in week 1; cash + card terminal work without it | Product |
| ภ.พ.06 / tax rules block VAT-registered pilots | High | Medium | Decision D7 in week 2; pick non-VAT pilots if needed | Product |
| Thai printing problems across printer models | Medium | High | Print receipts as images; publish supported hardware list | Flutter lead |
| Router or Wi-Fi setups block discovery | Medium | Medium | Manual IP fallback; setup checklist; recommended router | Tech lead |
| MVP scope creeps back | High | High | Scope table in §5 is the contract; new items go to the Phase 2 backlog | Product |
| Delivery platforms limit API access | High | Medium | Middleware (D9); apply to partner programs during Phase 1 | Product |
| Competitors (Loyverse, FoodStory, Ocha, Wongnai POS) | Medium | High | Focus on the launch segment; win on offline, kitchen flow and food cost | Product |
| Support load during dinner service | Medium | High | On-call rotation, LINE support group, remote diagnostics in the app | Support |

---

## 11. Next steps (this week)

1. Assign an owner to each decision D1–D9 and confirm the deadlines.
2. Submit the payment provider application (D3).
3. Book a Thai accountant to review D7 and the totals rules.
4. Order the hardware lab devices.
5. Start the offline sync spike and set up the project skeleton.
