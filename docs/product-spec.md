# Restaurant Management System — Product Spec

Oct 6, 2026 · @Smithy · Status: Draft

## Overview

We will build a cloud restaurant management system for Thai restaurants, launching with POS, kitchen display, table management and PromptPay payments, then adding QR ordering, inventory, delivery and loyalty.

**Problem.** Small and mid-size restaurants run on separate tools: a cash register, paper tickets, a spreadsheet for stock, and three delivery tablets. Orders get lost, food cost is unknown, and owners cannot see sales when away from the shop.

**Target customers.** Independent cafés, quick-service shops and full-service dine-in restaurants in Thailand with 1 to 10 branches.

**Goals**

- One system for orders from the counter, the table, QR and delivery apps
- Orders reach the kitchen in under 2 seconds, with no paper tickets
- Owners see live sales and food cost from their phone
- Works during internet outages and syncs later

**Success metrics (first 6 months after launch)**

| Metric | Target |
| --- | --- |
| Restaurants live | 50 |
| Average order entry time | under 20 seconds |
| Orders lost or wrong per 1,000 | under 2 |
| Monthly churn | under 3% |

**Out of scope for v1:** payroll, full accounting, hotel/bar-specific features, and markets outside Thailand.

## Users and roles

Six roles cover the restaurant; each staff member logs in with a 4–6 digit PIN on shared devices, and owners and managers also use email login on the web dashboard.

| Role | Main device | Main jobs |
| --- | --- | --- |
| Owner | Phone, web | Sees all branches, sets menu and prices, reads reports |
| Manager | Tablet, web | Runs the shift, approves voids and discounts, manages stock |
| Cashier | POS tablet | Takes payments, opens and closes the cash drawer |
| Waiter | Phone or tablet | Seats guests, takes orders at the table |
| Kitchen / bar | KDS screen | Prepares items, marks them ready |
| Customer | Own phone | Orders and pays by QR, collects loyalty points |

**Permissions**

| Action | Owner | Manager | Cashier | Waiter | Kitchen |
| --- | --- | --- | --- | --- | --- |
| Take orders | Yes | Yes | Yes | Yes | No |
| Take payment | Yes | Yes | Yes | Optional | No |
| Discount or void | Yes | Yes | Needs approval | Needs approval | No |
| Refund | Yes | Yes | No | No | No |
| Edit menu and prices | Yes | Optional | No | No | No |
| See reports | All | Own branch | Own shift | No | No |
| Manage staff | Yes | Own branch | No | No | No |

Every permission is a setting the owner can change per role.

## Phase 1 — MVP features

The MVP lets one restaurant take an order, send it to the kitchen, collect payment and see the day's sales, without paper.

### 1. POS and ordering

*As a waiter, I want to add items with options to a table's order so the kitchen gets exactly what the guest asked for.*

- Menu with categories, photos, Thai and English names
- Modifiers: required (size, spice level) and optional (add egg +10 THB), with min/max choices
- Order types: dine-in, takeaway, delivery (manual entry)
- Notes per item and per order
- Hold and fire: send starters now, mains later
- Split bill by item, by seat or evenly; merge bills
- Discounts (% or THB, per item or bill) and voids, with a reason
- Service charge (e.g. 10%) and VAT 7%, set as included or added
- Mark items sold out (86) from any device

**Acceptance criteria**

- [ ] A 5-item order with modifiers can be entered in under 20 seconds
- [ ] Totals match: subtotal + service charge + VAT, rounded to 0.25 or 1 THB as configured
- [ ] Every void and discount logs who, when, why and who approved

### 2. Kitchen Display System (KDS)

*As a cook, I want new orders to appear on my screen grouped by table so I can cook in order.*

- Routing rules: each item goes to a station (grill, wok, drinks, dessert)
- Ticket shows table, time, modifiers, notes; colour turns yellow then red as it ages (thresholds set per station)
- Bump item or whole ticket as ready; waiter gets a notification
- Recall a bumped ticket
- Fallback to ESC/POS kitchen printers for shops without screens

**Acceptance criteria**

- [ ] Order appears on the KDS within 2 seconds on the local network
- [ ] Orders still reach the KDS when the internet is down

### 3. Tables and floor plan

- Drag-and-drop floor plan per zone (indoor, outdoor, 2nd floor)
- Table status: free, seated, ordered, bill requested, needs cleaning
- Guest count, time seated, move and merge tables
- Basic reservations and a walk-in waitlist with SMS or LINE notification

### 4. Payments

- Cash with change calculation and quick-amount buttons
- Dynamic PromptPay QR with the exact amount, auto-confirmed through the payment provider
- Card through an EDC terminal or SoftPOS
- E-wallets: TrueMoney, Rabbit LINE Pay, ShopeePay
- Split payment across methods
- Receipts: printed 80 mm, or digital by QR/LINE
- Full tax invoice (ใบกำกับภาษีเต็มรูป) on request, with customer tax ID
- Shift open/close with cash count and variance

### 5. Staff management

- Staff profiles, roles and PINs
- Clock in/out with hours report
- Audit log of sensitive actions

### 6. Reports and dashboard

- Live dashboard: today's sales, orders, average bill, covers
- Sales by hour, day, item, category, staff, payment method, order type
- Voids and discounts report
- End-of-day (Z) report
- Export to Excel/CSV

## Phase 2 — Growth features

Phase 2 adds the features that save staff time and protect margin: guests order themselves, stock is tracked by recipe, and delivery orders flow in automatically.

### 7. QR self-ordering

*As a guest, I want to scan the QR on my table, order and pay from my phone without waiting for a waiter.*

- Unique QR per table; no app install, opens in the browser or LINE
- Same menu, photos and modifiers as POS; Thai, English and Chinese
- Order goes straight to KDS, or to staff for approval first (setting)
- Call waiter and request bill buttons
- Pay by PromptPay or card in the browser, or pay at the counter
- Upsell suggestions ("add a drink?")

### 8. Inventory and recipe costing

- Ingredients with units and unit conversion (kg → g, bottle → ml)
- Recipes link each menu item and modifier to ingredients; stock deducted on every sale
- Suppliers, purchase orders and goods received
- Stock counts (daily/weekly) with variance report
- Waste logging with reason
- Low-stock alerts; auto-mark menu items sold out when an ingredient runs out
- Food cost % per dish and theoretical vs actual cost

### 9. Delivery aggregator integration

- Grab, LINE MAN and foodpanda orders arrive in the POS and go to the KDS automatically
- Menu, prices and sold-out status pushed to all channels from one place
- Pause a channel when the kitchen is busy
- Report sales and commission by channel
- Integration via each platform's partner API or a middleware provider (e.g. Klikit)

### 10. CRM and loyalty

- Customer profile by phone number or LINE ID, with visit history
- Points or stamp cards; tiers (Silver, Gold)
- Vouchers and promo codes with rules (min spend, dates, items)
- LINE Official Account: member card, digital receipts, birthday offers, broadcasts
- Consent captured for marketing, as PDPA requires

## Phase 3 — Scale and advanced features

Phase 3 serves chains and adds automation: central control over many branches, AI forecasts, and tax and accounting links.

### 11. Multi-branch

- Central menu with per-branch prices, items and availability
- Consolidated and per-branch reports
- Stock transfers between branches and a central kitchen
- Role access limited to assigned branches

### 12. AI and analytics

- Sales forecast by day and hour, using history, weekday, holidays and weather
- Suggested purchase quantities from the forecast and recipes
- Staff scheduling suggestions based on forecast covers
- Menu engineering: classify dishes by popularity and profit (stars, plowhorses, puzzles, dogs)
- Chat or voice assistant for taking phone/LINE orders

### 13. Self-order kiosk

- Touchscreen ordering for quick-service shops, with card and QR payment

### 14. Tax and accounting

- Revenue Department POS registration support (ภ.พ.06) where required
- e-Tax Invoice and e-Receipt through an approved service provider
- Export or sync to Thai accounting software (FlowAccount, PEAK, Xero)

### 15. Marketing extras

- Online ordering website for pickup and own delivery
- Gift cards
- Happy-hour and time-based pricing

## Non-functional requirements

The system must keep a busy dinner service running even with bad internet, so offline operation and speed come before everything else.

| Area | Requirement |
| --- | --- |
| Offline | POS, KDS and printing keep working for at least 24 hours without internet; data syncs automatically with no duplicates |
| Speed | Screen actions respond in under 300 ms; order to KDS under 2 s on the local network |
| Availability | Cloud services 99.9% uptime; no single local device is required for others to work |
| Security | PIN + role permissions, HTTPS everywhere, encrypted data at rest, no card data stored (PCI DSS handled by the payment provider) |
| Privacy | Thailand PDPA: consent records, data export and delete on request, privacy notice in Thai |
| Language | Thai and English UI; Thai-language receipts; Buddhist Era dates on tax documents where needed |
| Hardware | iPad and Android tablets, Sunmi-style Android POS devices, ESC/POS thermal printers (LAN, USB, Bluetooth), cash drawers, barcode scanners |
| Data | Daily backups kept 30 days; owners can export all their data |
| Scale | 1 to 50 devices per branch; up to 100 branches per account |

## Architecture and data model

Use a local-first design: each device keeps its own database and talks to others on the restaurant's network, and a cloud service syncs everything and connects to outside services.

&#91;embedded content: system architecture · local devices, cloud, integrations\]

Orders flow between POS, KDS and printers on the local network, so service continues when the internet drops; the cloud is the source of truth for menus, reports and integrations.

**Suggested stack:** React Native or Flutter for POS/KDS apps, React/Next.js for QR ordering and the owner dashboard, Node.js or Go for the API, PostgreSQL in the cloud and SQLite on devices.

**Core data entities**

| Entity | Key fields |
| --- | --- |
| Restaurant / Branch | name, tax ID, address, VAT and service charge settings |
| User | name, role, PIN, branches |
| Menu item | names (TH/EN), category, price per branch, station, photo |
| Modifier group | name, min/max choices, options with price |
| Table | zone, number, seats, QR code |
| Order | type, table, staff, status, items, totals, source (POS/QR/Grab) |
| Order item | menu item, modifiers, qty, note, kitchen status |
| Payment | order, method, amount, reference, status |
| Shift | staff, opening cash, closing cash, variance |
| Ingredient / Recipe | unit, cost, stock level; recipe lines per menu item |
| Customer | phone, LINE ID, points, consent |

## Roadmap

Ship the MVP to 5 pilot restaurants in about 4 months, then add one phase every 4 months; durations assume a team of 3–5 developers.

&#91;embedded content: roadmap · 3 phases, 3 gates\]

Each phase starts only after the gate below it is met, so feedback from real restaurants shapes the next phase.

## Open questions and risks

**Open questions**

- [ ] Which restaurant type do we launch with first: café, quick-service or full-service?
- [ ] Sell as subscription (per branch per month), one-time licence, or free POS + paid add-ons?
- [ ] Which payment provider for PromptPay and card (e.g. KBank, SCB, Omise/Opn, 2C2P)?
- [ ] Build delivery integrations directly or use a middleware provider?
- [ ] Do we sell our own hardware bundles?

**Risks**

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Offline sync creates duplicate or lost orders | High | Local-first database with unique order IDs; test outage scenarios early |
| Delivery platforms limit API access | High | Apply for partner programs early; middleware as fallback |
| Strong local competitors (e.g. Wongnai POS, FoodStory, Ocha) | Medium | Focus on one niche and better offline + kitchen flow |
| Tax compliance rules change | Medium | Use an approved e-Tax provider; review with a Thai accountant |
| Staff find it hard to learn | Medium | Simple UI, Thai-first, on-site onboarding for first 20 customers |
