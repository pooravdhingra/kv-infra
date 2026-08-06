# Product specification

## Product principle

The operator dashboard is a clean action layer, Google Sheets are the verification layer, and WhatsApp is the supplier communication layer. The home screen should answer “What should I do next?”

## MVP users

One authenticated operator role. Role management and customer access are not part of the MVP.

## MVP capabilities

1. Create, edit, and archive a SKU.
2. Create an order and a human-readable order sheet tab.
3. Calculate total quantity, gross weight, and volume.
4. Check packed and unpacked stock and suggest the next valid action.
5. Reserve packed stock; pack/QA unpacked stock.
6. Request shortfall stock from a prioritized supplier through WhatsApp.
7. Surface three-day supplier follow-ups until explicitly received or disabled.
8. Receive material, finish packing/QA, and allocate it to an order.
9. Maintain one inventory summary row per SKU.

## Primary screens

- Operator login and action-focused home
- SKU list and create/edit form
- New order and order detail/stock check
- Supplier request and pending requests
- Receive material
- Packing overview, start packing, and finish packing
- Inventory list and detail
- Settings/connections

## Suggested action order

1. If packed available quantity covers the requirement, suggest reserve.
2. Otherwise, if unpacked quantity can cover the gap and no supplier request exists, suggest pack/QA.
3. If stock cannot cover the gap and no request exists, suggest supplier request.
4. If a request exists and is not received, show the supplier/request state.
5. If linked material is received, suggest pack/QA and then assignment.

## Out of scope

Client portal, predictive analytics, shipping documents, sticker printing, nested packing hierarchy, full management analytics, and container optimization.

## Measurement units

Carton dimensions are stored in centimetres. Volume is cubic metres:

`LENGTH × BREADTH × HEIGHT × NO OF CTNS / 1,000,000`.

Carton weight is stored and displayed in kilograms. New SKU identifiers are assigned automatically in independent OEM sequences: `B` for Bajaj, `T` for TVS, `P` for Piaggio, and `X` for Other. Existing identifiers remain unchanged.
