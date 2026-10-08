# 0004 — Business decisions: segment, pricing, payments, tax, hardware, delivery

Status: **Accepted** (Oct 8, 2026) · Decisions D1, D2, D3, D7, D8, D9

| # | Decision | Chosen | Same as recommended? |
| --- | --- | --- | --- |
| D1 | Launch segment | Casual full-service dine-in, 1–3 branches | Yes |
| D2 | Pricing model | **Free POS + paid add-ons** | No — recommended was a monthly subscription per branch |
| D3 | Payment provider | Opn Payments (Omise) | Yes |
| D7 | VAT-registered pilots | Yes: the owner books a Thai accountant ([brief](../accountant-brief.md)) | Yes |
| D8 | Hardware | **Sell hardware bundles** | No — recommended was a supported-hardware list only |
| D9 | Delivery integrations | Middleware (e.g. Klikit) in Phase 2 | Yes |

## Consequences

### D1 — full-service dine-in
- **MVP:** tables, hold and fire, and split bills stay in the MVP, as planned.
- **Pilots:** at least 3 of the 5 should be full-service restaurants.

### D2 — free POS, paid add-ons
The free tier has to be good enough to win restaurants from Loyverse, FoodStory and Ocha. Revenue then depends on how many restaurants buy add-ons.

**Proposed split** (to confirm with the owner before S6):

| Free | Paid add-ons |
| --- | --- |
| POS, KDS, tables, cash/PromptPay/card, receipts and tax invoices, shift close, Z report, today's sales | **Food cost** (recipe costing, then inventory in Phase 2), **advanced reports** and exports, **multi-branch**, **delivery integrations**, **CRM and loyalty**, QR self-ordering |

**What this changes in the build:**
- **Plans per account:** each account needs a plan with its paid add-ons switched on, and the API must check it on paid features. This is a small schema change in S4–S6, before any paid feature ships.
- **Payment collection:** taking add-on payments needs a billing provider. Opn subscriptions could handle this.
- **Gate 2:** "at least 3 of the 5 pilots would pay the planned price" becomes "at least 3 of the 5 pilots would pay for at least one add-on".
- **New risk:** too few restaurants buy an add-on (see Master Plan §10).

### D3 — Opn Payments
- **Apply now:** merchant onboarding (business verification) takes weeks.
- **Build:** the integration is sprint S5 work. It covers dynamic PromptPay QR with automatic confirmation, plus cards.
- **Offline:** when the internet is down, payments fall back to the plan in Master Plan §3.

### D7 — VAT-registered pilots
- **Accountant first:** before pilots, the accountant confirms whether ภ.พ.06 approval is needed for each POS device, and answers the four questions in [totals-rules.md](../totals-rules.md).
- **If approval is needed:** the application process becomes an MVP workstream.

### D8 — sell hardware bundles
A new workstream from Phase 1:
- **Choose bundles:** pick 1–2 bundles (for example a Sunmi-style Android POS with a built-in printer, a KDS screen and a cash drawer) from the hardware lab tests. The printing spike decides which printers are reliable for Thai text.
- **Supplier:** an agreement with a Thai distributor covering price, stock, warranty and replacement turnaround.
- **Provisioning:** pre-install and pre-configure devices before shipping, so a restaurant only types the pairing code.
- **Repairs:** a process for faulty devices, with a spare-unit pool for pilots.

**New risks:** stock tying up cash, and support load from hardware faults (Master Plan §10).

### D9 — delivery middleware
- **Phase 2:** compare middleware providers (fees, platform coverage, API) before Phase 2 starts.
- **Now:** still apply to the Grab, LINE MAN and foodpanda partner programmes early, as a fallback.
