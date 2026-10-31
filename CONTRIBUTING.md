# Contributing

Thank you for helping. Issues and pull requests are welcome.

## A receipt the parser gets wrong

Open an issue with the OCR text of the receipt, line by line, what the parser returned and what it should have returned. Never attach the photo, and remove anything that identifies a person before you post (see below).

A pull request that fixes it is even better:

1. Add the case to `test/fixtures/cases.ts`, following the redaction rules in [test/fixtures/README.md](test/fixtures/README.md). On a Mac, `sh scripts/ocr-dump.sh receipt.jpg` prints the lines and boxes Apple Vision reads from a photo, the way an app hands them to the parser; redact the output before you share it.
2. Make it pass without breaking any other test.
3. Add a `CHANGELOG.md` entry.

## Redaction

Before you share any receipt text, remove or replace tax identifiers, addresses, loyalty and card numbers, authorisation and transaction codes, and names. Keep the numbers that the bug depends on. If you change a number, keep the sum true.

## Rules the parser keeps

- A number printed on the paper is never replaced by a computed one.
- A missing value stays `null`.
- `arithmeticChecked` is `true` only when quantity × unit price comes to the total, less a discount the paper prints.

A change that breaks one of these is not accepted, even if it makes a test pass.

## Development

Development needs Node 22.18 or later (the build and test tools require it). The published package runs on Node 20 and later, which CI checks with `npm run smoke`.

```bash
npm install
npm run coverage
npm run lint
npm run typecheck
npm run build && npm run check:package
```

`npm run format` fixes the formatting.
