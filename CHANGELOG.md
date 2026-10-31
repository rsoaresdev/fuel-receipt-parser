# Changelog

All notable changes to this package are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the versions follow [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-10-30

### Added

- `extractReceipt` for fuel and EV charging receipts, with arithmetic checking, field provenance and six base languages.
- `wantsSecondPass` and `betterReading` for a second OCR pass.
- `fuelTypeIdFor`, `KNOWN_BRANDS`, `CURRENCIES` and `currencyDecimals`.

- ESM and CommonJS builds with TypeScript types for both.

### Fixed

- A rate column headed by a price word (`PVP/L`, `Preço/L`, `P.U./L`) is read as the price per litre. Before, the `L` made the price read as a quantity in litres.
- The largest accepted input is read about 7 times faster: folded labels and currency decimals are cached, and a label is looked for in the 64 characters before a number instead of the whole line.
