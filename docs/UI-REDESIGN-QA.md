# UI redesign verification — 26 October 2026

Scope: presentation, responsive layout, typography, interface copy and progressive disclosure. The auction domain, client adapter, shared contracts and all server modules match the SHA-256 manifest taken before this redesign (10 protected modules, zero changes). Default game timings and room settings were not edited.

## Automated checks

- TypeScript: passed.
- ESLint: passed with no warnings.
- Production build: passed.
- Standard test suite: 18 passed, 4 opt-in integration tests skipped. The existing integration suites were not rerun for this presentation-only change.

## Browser verification

Inspected the actual local app at 1366×900, 390×844 and 360×740. Confirmed no horizontal document overflow in the auction at desktop and narrow phone widths. Catalog photographs loaded successfully.

Completed an eight-lot offline match, including private inspection, a custom $750 bid, a won item, collection display, six-player results, expanded purchase receipt and valuation factors. Rematch returned to a fresh lobby with equal wallets.

With a new local test guest, entered ranked matchmaking, observed the server wait/tier and cancelled. Created a private room through the existing settings form (four lots, explicit bots, 3/5/2-second timings selected only for that test room). The server accepted a custom $1,000 bid; the match completed, saved its result and appeared in History with its receipt. The test guest remained at $5,000 career bankroll and zero ranked matches, as expected for an unranked room. Signed out of that test identity afterward.

Checked nickname validation, code-entry and public-room browsing entry controls, profile display, native dialogs, references, inspection privacy labeling and collection access. Recovery behavior remains on the existing implementation; its form and security copy use the new dialog styling.

## Visual iteration

The first phone auction pushed bidder balances behind the bid dock. Moving secondary actions into Lot info and tightening shorter viewports made the object, price, clock, bidder strip and bidding action visible together. Results were condensed so six standings and all primary actions fit on a 390×844 phone; highlights and full receipts remain expandable.

Current previews are in `docs/screenshots/art-direction/`. The file `results-mobile-before-iteration.jpg` records the earlier, taller results layout. Homepage photo credits are available in How to play; all catalog and font license records are retained.
