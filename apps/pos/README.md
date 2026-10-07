# POS app (Flutter)

POS, waiter and (later) kitchen display in one app. Thai first, English toggle. Runs on iPad,
Android tablets and phones.

## What works (sprint S2)

- **Pairing** with a code from the owner dashboard. The device token is kept in the platform's secure storage.
- **Menu and staff download** from the API, saved on the device. The app keeps working offline from the saved copy, and an unchanged menu is not downloaded again (ETag).
- **Staff sign-in:** tap your name, then enter your PIN. The PIN is checked on the device against the scrypt hash from the server, off the UI thread.
- **Order entry:**
  - dishes by category; sold-out dishes greyed out
  - add-on choices with min/max rules
  - repeat taps raise the quantity
  - notes (long-press a line), dine-in / takeaway / delivery, table number
  - live totals from `packages/pricing_dart`, the same engine as the cloud
- **Sending** saves the order as sync events (`ORDER_OPENED`, `ITEM_ADDED` with a name and price snapshot, `ITEMS_FIRED`) to an outbox. The sync engine sends them to the branch hub (sprint S3).

## Run

```sh
flutter run --dart-define=API_URL=http://<api-host>:3000
flutter test                                   # unit + widget tests, incl. the S2 demo
flutter test screenshots --update-goldens      # re-render docs/screenshots (real fonts)
```

## Tests worth knowing

- `test/s2_demo_test.dart` is the sprint demo. A waiter pairs, signs in, and enters 5 items with add-ons and a table number. The test counts taps, with a budget of 12 (now 11), as the stand-in for "under 20 seconds" until it can be timed with staff on a real tablet.
- `test/pin_test.dart` checks PINs against hashes made by the API's own Node code.
- `test/contract_test.dart` writes the POS's order events to `packages/sync-core/fixtures/pos-order-events.json`. `packages/sync-core/test/pos-contract.test.ts` then replays them through the sync engine's order rules.

Fonts: Noto Sans Thai and Noto Sans are bundled (SIL Open Font License, `assets/fonts/OFL-*.txt`), so Thai looks the same on every device and offline.
