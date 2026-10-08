# Brief for our Thai accountant

Prepared Oct 8, 2026, for decision D7 ([decision record 0004](decisions/0004-business-decisions.md)).
Thai version: [accountant-brief.th.md](accountant-brief.th.md)

## Who we are

We are building a POS for Thai restaurants: ordering on tablets, a kitchen display, PromptPay and card payments, and receipts and tax invoices. Our first restaurants are full-service dine-in with 1–3 branches, and **some are VAT-registered**.

The POS must keep working without internet for up to 24 hours. So receipts and short-form tax invoices are often issued offline, and sent to the cloud later.

We need your answers before our 5 pilot restaurants start using the system (planned for February 2027).

## A. Revenue Department approval (ภ.พ.06)

1. **Approval:** a VAT-registered restaurant using our tablets to issue short-form tax invoices (ใบกำกับภาษีอย่างย่อ), is approval required (คำขออนุมัติใช้เครื่องบันทึกการเก็บเงิน, ภ.พ.06)?
   - Is it required for each device, or for each branch?
   - Who applies: the restaurant or us (the software vendor)?
   - How long does approval usually take?
2. **Per-device facts:** must each device's details (serial number, POS number) appear on the invoice?
3. **Changes:** if a device is replaced, or the software is updated, does the restaurant need to apply again or notify the Revenue Department?

## B. Invoice numbering while offline

4. Each device gets its own block of numbers from the cloud in advance, with a prefix per device, for example `A01-000001`, `A01-000002`… on device A01. Within each device the numbers stay in order with no gaps, even offline.
   - Is a separate sequence per device acceptable?
   - Or must numbers run in one sequence per branch?
5. **Cancellation:** when an issued short-form invoice is cancelled (the customer changes their mind after paying), what must we issue? A credit note (ใบลดหนี้)? Can its number come from the same block?
6. **Full tax invoice (ใบกำกับภาษีเต็มรูป):** when a customer asks for one:
   - Which fields are required? We currently plan: seller name, address, tax ID and branch code (00000 for head office); buyer name, address, tax ID and branch code; date; and items with VAT shown separately.
   - Can it be issued later than the sale, for example the next day?
   - Must the short-form invoice for the same sale then be cancelled?
7. **Dates:** must tax invoices show the Buddhist Era year (พ.ศ.), or is the Gregorian year acceptable?

## C. How totals are calculated

Our rules are in [totals-rules.md](totals-rules.md). All amounts are in satang and rounded half-up. Please check these four points.

### Example A: dine-in, prices before VAT, 10% service charge, rounded to 0.25 THB

| Line | Amount |
| --- | --- |
| Pad Thai 80.00 × 2 | 160.00 |
| Thai tea 45.00 × 1 | 45.00 |
| **Subtotal** | **205.00** |
| Service charge 10% | 20.50 |
| VAT 7% on 225.50 (food + service charge) | 15.79 (15.785 rounded half-up) |
| Total before rounding | 241.29 |
| Rounding to nearest 0.25 | −0.04 |
| **To pay** | **241.25** |

### Example B: the same order, menu prices include VAT, rounded to 1 THB

| Line | Amount |
| --- | --- |
| Subtotal (VAT included) | 205.00 |
| Service charge 10% (of the VAT-inclusive subtotal) | 20.50 |
| Total | 225.50 |
| of which VAT (225.50 × 7/107) | 14.75 |
| Rounding to nearest 1 THB | +0.50 |
| **To pay** | **226.00** |

### Example C: Example A split by item into two bills

| Bill | Food | Service | VAT | To pay |
| --- | --- | --- | --- | --- |
| Pad Thai | 160.00 | 16.00 | 12.32 | 188.25 |
| Thai tea | 45.00 | 4.50 | 3.47 | 53.00 |
| **Total** | 205.00 | 20.50 | 15.79 | 241.25 |

The VAT of 15.79 is shared between the bills in proportion to each bill's amount. The rounding is shared the same way, so the bills always add up to the original total.

### Questions on totals

8. **Cash rounding:** is VAT calculated on the amount before rounding, as in Example A? Or must the rounding difference change the VAT base?
9. **Service charge with VAT-inclusive prices:** in Example B, may the service charge be 10% of the VAT-inclusive subtotal? Or must it be 10% of the price excluding VAT?
10. **Split bills:** when each split bill gets its own short-form tax invoice, is sharing VAT as in Example C acceptable? Or must each invoice calculate its own VAT from its own lines? That could make the parts differ from the whole by a satang.
11. **Zero total:** for a fully discounted bill (100% off, total 0.00), should we issue a tax invoice showing zero, or a non-tax document?

## D. Later (not needed before pilots)

12. **e-Tax Invoice / e-Receipt:** when should we connect to an approved e-Tax Invoice & e-Receipt service provider, and which providers do you recommend?
13. **Records:** how long must the restaurant keep receipt and tax invoice records, and in what form?
