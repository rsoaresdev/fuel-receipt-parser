# Receipt scan regression fixtures

This folder stores OCR text regressions, never receipt photographs. A fixture
can reproduce parsing and regional-format failures without retaining the image
or the identity of the person who reported it.

Before adding a fixture from a user report:

1. Keep only the OCR lines needed to reproduce the failure.
2. Remove merchant addresses, tax identifiers, loyalty identifiers, payment
   card fragments, authorization codes, transaction identifiers and names.
3. Replace remaining identifying text with a generic label. Numeric values may
   be changed only when their mathematical relationship and the failure remain
   reproducible.
4. Record every transformation in `redactions`.
5. Set `source` to `anonymized-user-report`. Synthetic cases must stay marked
   as `synthetic` and must never be presented as real reports.
6. Do not commit the original OCR transcript or the source photograph, even
   temporarily.

Each fixture is executable through `test/fixtures.test.ts`, so a
fixed case remains fixed across later parser changes.
