# Changelog

All notable changes to this package are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the versions follow [Semantic Versioning](https://semver.org/).

## [1.2.0] - 2026-11-27

### Added

- `Gasóleo Evologic` and `Óptima Diesel` read as additised diesel, and `Alves Bandeira` as a station.
- Mobi.E's `Taxa OPC` and `Taxa EGME` are fees added to the energy, so a Portuguese charging receipt that prints them can be checked.

### Fixed

- A fuel named on the same line as its numbers (`GASOLEO 40,00 L x 1,600 EUR/L 64,00`) is named: `fuelLabel` is `GASOLEO` and `fuelTypeId` is `diesel_simple`. Before, both were `null`, or the label was the whole line with its numbers.
- The sources of each fill in `otherFills` point at the caller's own lines. When the recogniser split a row in pieces they pointed at the joined rows instead, so a review screen drew the second fill's highlights on the wrong line.
- A line that mentions `Portugal`, `Galp` or `Legal` is no longer read as a US gallon line, which had turned `12.50 9` into `12.509`.
- `country: "BG"` prices in euros, as Bulgaria has since 1 January 2026. A receipt printed in leva (`лв.`) is still read as BGN.
- `currency` passed by the caller now settles an ambiguous symbol such as `$` ahead of the currency implied by `country`.
- A second fill on the same receipt is checked to the receipt's own currency precision, not always to the euro cent.
- `Total IVA 11,22` or `Valor IVA 11,22` is no longer taken for the total when the sum cannot close. A total whose label names a tax ranks below one that does not, unless the label says the tax is included (`Total c/IVA`, `inkl. MwSt`, `TTC`).
- `Miles & More 123456` and other loyalty schemes that count miles or points are no longer read as an odometer in miles.
- A recogniser's `alternates` are bounded like the lines themselves: the first three per line, each cut to 1500 characters. A line with dozens of very long alternates could run the parser out of memory.

### Changed

- About 20 times faster on a typical receipt: the solver asked whether each total names the fuel once per pair of candidates, not once per total.

### Removed

- `src/units.ts` and the `decimalInput`, `localNumber` and `localReceiptNumber` helpers in `src/format.ts`. None was exported from the package or used by it.

## [1.1.2] - 2026-11-01

### Fixed

- `11.000 G @ 4.299 $47.29`, a US pump line with the amount after the price, is read and checked. The `$` was taken as a suffix of the price per gallon, so the line did not close.
- An ISO 8601 stamp with a `T` between the date and the time (`2026-10-31T14:12:09`) gives its date and its time. Before, the date was missed and the time read as `12:09`.


## [1.1.1] - 2026-11-01

### Fixed

- `11.482 G @ $3.299`, with a currency mark between the `@` and the price, is read as the price per gallon.
- A price in pence or cents printed with no mark after `@` (`40.00L @ 169.9`, in Australia, Canada and the UK) is read as 1.699 when that closes the sum, and kept as printed when it does not.
- `30.00 LTR 155.9 P/LTR` keeps its quantity. The `00 LTR 155` in it was being read as a date.
- `PPL 155.9` and `P/LTR 155.9`, with the pence mark heading the price, are read as the price per litre.
- On a receipt whose total includes a car wash or a snack, the amount labelled as the fuel's (`FUEL 77.99`, or a fuel name) checks the fuel when the total does not.

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
