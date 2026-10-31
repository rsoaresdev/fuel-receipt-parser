# Changelog

All notable changes to this package are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the versions follow [Semantic Versioning](https://semver.org/).

## [1.1.0] - 2026-10-31

### Added

- `discount` on the reading: the discount the receipt prints, as an amount or a percentage. A per-litre discount comes back as the amount it makes on the quantity read. A total printed after the discount is now checked by it, so `arithmeticChecked` can be `true` on a receipt that subtracts one.
- `fees` on the reading: charges added to the energy, such as an EV session fee. A total printed with them is checked through them.
- `kind` on the reading: `"fuel"`, `"other"` for a receipt whose sum closes but which sells no fuel (a café receipt), or `"unknown"`.
- `otherFills` on the reading: further fills on the same receipt, such as a diesel and an AdBlue, each one checked on its own line.
- `context.tankCapacityLitres`. When the OCR drops the decimal separator from the quantity and the total alike, `4000 x 1,500 = 6000` closes as well as `40,00 x 1,500 = 60,00`; the tank settles which one is a fill. Thanks to the Reddit reader who suggested the dropped-separator fixtures.
- `"ymd"` for `context.dateOrder`, and `regionDateOrder` returns it for Japan, China, Korea, Taiwan, Hungary, Lithuania and Mongolia, so `26/10/31` is 31 October 2026 there.
- `regionDateOrder` and `receiptRecognitionLanguage` are exported.
- Fuel kinds `"ethanol_e100"` (Brazil's hydrous ethanol, which is not E85) and `"hydrogen"`.
- Prices in hundredths of the currency: `155.9p` and `149.9 ppl` (UK, Ireland), `179.9 c/L` (Australia, New Zealand).
- The US pump: `11.000 G @ 4.299`, and a price to the tenth of a cent printed small (`$3.45⁹`, read by OCR as `3.45 9`).
- Receipt words in Dutch, Turkish, Polish, Czech, Hungarian, Swedish, Danish, Norwegian, Finnish, Japanese, Korean, Chinese and Arabic, including labels printed against their numbers (`単価172円`), litre marks (`ℓ`, `リットル`, `升`, `리터`, `لتر`), tax, change, cash and discount lines, and fuel names (`軽油`, `경유`, `柴油`, `Motorin`, `Pb95`, `95#汽油`, `Solar`).
- Currency marks `Rs`, `円`, `원`, `元`, `TL`, `Rp`, `baht`, `zl`, `Dhs` and `DH`.
- The Thai Buddhist year (`31/10/2569`) and the Japanese era (`令和8年10月31日`, `R8.10.31`) are converted.
- `scripts/ocr-dump.swift`, which prints the lines Apple Vision reads from a photo, for reporting a receipt the parser gets wrong.

### Changed

- The receipt in "keeps a paid total as reference" (40 L at 1.80, a 4 euro discount, 68 paid) is now checked, through the printed discount. It was unchecked before because the discount was not read.
- A total whose decimal separator the OCR dropped is put back with the currency's own decimals only: `6000` may be 60,00 euros, never 6,000.
- In a currency with no minor unit (won, yen), a number with a three-digit group is read as thousands: `1,650 원` is 1650.

### Fixed

- Rows a recogniser split at a wide gap are joined again before reading, using the line boxes and correcting for a tilted photo, so `GALLONS ........ 11.482` keeps its label. Every `source.lineIndex` still points at the caller's own lines.
- A number with no label on its own line takes the column heading above it: `Litros  PVP/L  Valor` over `38,52  1,659  63,90` is read, and checked.
- `PRICE/GAL $3.459`, with a currency mark between the heading and the value, is read as the price per gallon.
- On a receipt with a shop item as well as fuel, the amount printed on the fuel line can check the fuel when the receipt's total, which includes the shop item, does not.
- A fuel named after a pump number (`Bomba 4 GASOLEO`) is recognised.

## [1.0.1] - 2026-10-31

### Fixed

- A sum that closes no longer counts as checked unless the receipt also shows the triple is fuel or energy: a volume, mass or kWh unit on the quantity, a per-unit rate on the price, or a fuel named on the line or the line above. Before, a shop line such as `2 x 5,00 10,00` could come back with `arithmeticChecked: true` when the units and product names were lost. Thanks to the Reddit reader who suggested the two-triple fixture.
- A number followed by a multiplication sign (`10,00 x 2,000`) is never taken as the total.
- Two numbers one space apart (`x 2,000 20,00`) are no longer treated as the same number, which kept a bare inline fill from being checked.

## [1.0.0] - 2026-10-30

### Added

- `extractReceipt` for fuel and EV charging receipts, with arithmetic checking, field provenance and six base languages.
- `wantsSecondPass` and `betterReading` for a second OCR pass.
- `fuelTypeIdFor`, `KNOWN_BRANDS`, `CURRENCIES` and `currencyDecimals`.

- ESM and CommonJS builds with TypeScript types for both.

### Fixed

- A rate column headed by a price word (`PVP/L`, `Preço/L`, `P.U./L`) is read as the price per litre. Before, the `L` made the price read as a quantity in litres.
- The largest accepted input is read about 7 times faster: folded labels and currency decimals are cached, and a label is looked for in the 64 characters before a number instead of the whole line.
