# fuel-receipt-parser

[![npm](https://img.shields.io/npm/v/fuel-receipt-parser.svg)](https://www.npmjs.com/package/fuel-receipt-parser)
[![CI](https://github.com/rsoaresdev/fuel-receipt-parser/actions/workflows/ci.yml/badge.svg)](https://github.com/rsoaresdev/fuel-receipt-parser/actions/workflows/ci.yml)
[![bundle size](https://img.shields.io/bundlephobia/minzip/fuel-receipt-parser)](https://bundlephobia.com/package/fuel-receipt-parser)
[![license](https://img.shields.io/npm/l/fuel-receipt-parser.svg)](LICENSE)

**Turn the OCR text of a fuel or EV charging receipt into structured data: litres, price per litre, total, date, time, currency, fuel type and station.** The parser checks its own reading with arithmetic (litres × price = total) and never invents a number that is not printed on the paper.

It works with any OCR engine (Apple Vision, Google ML Kit, Tesseract, Google Cloud Vision, AWS Textract), has zero dependencies, ships ESM and CommonJS with TypeScript types, and runs in React Native, Expo, Jest, browsers, Node.js and edge runtimes. All processing happens on the device: no image or text leaves it.

```bash
npm install fuel-receipt-parser
```

```ts
import { extractReceipt } from "fuel-receipt-parser";

const reading = extractReceipt(
	[
		{
			text: "PRIO ENERGY, S.A.",
			box: { x: 0.05, y: 0.05, width: 0.9, height: 0.03 },
		},
		{ text: "E5-TOP 95", box: { x: 0.05, y: 0.09, width: 0.9, height: 0.03 } },
		{
			text: "31,93 Lit x 1,899 EUR/Lit 60,64 EUR",
			box: { x: 0.05, y: 0.13, width: 0.9, height: 0.03 },
		},
		{
			text: "IVA 23% 11,34",
			box: { x: 0.05, y: 0.17, width: 0.9, height: 0.03 },
		},
		{
			text: "TOTAL 60,64 EUR",
			box: { x: 0.05, y: 0.21, width: 0.9, height: 0.03 },
		},
		{
			text: "2026-08-03 14:12:09",
			box: { x: 0.05, y: 0.25, width: 0.9, height: 0.03 },
		},
	],
	{ country: "PT" },
);

reading.quantity?.value; // 31.93
reading.unitPrice?.value; // 1.899
reading.total?.value; // 60.64
reading.currency?.value; // "EUR"
reading.date?.value; // "2026-08-03"
reading.time?.value; // "14:12"
reading.fuelLabel?.value; // "E5-TOP 95"
reading.fuelTypeId; // "gasoline_95"
reading.place?.value; // "Prio"
reading.quantityUnit; // "L"
reading.arithmeticChecked; // true
```

## Why this parser

Most receipt parsers look for the word "total" and hope. A fuel receipt is harder: the VAT line looks like a total, the price per litre has three decimals, `1,899` means 1.899 in Lisbon and 1899 in Denver, and a thermal printer fades exactly the digit you need.

This parser treats the receipt as a sum to solve:

- **Arithmetic is the judge.** It searches for the three numbers where quantity × unit price = total. When it finds them, `arithmeticChecked` is `true`. That is also how it settles an ambiguous `1,899`.
- **It never invents.** A printed number is never replaced by a computed one. When a value is missing, the field is `null`. When three numbers disagree, all three come back unchecked for a person to settle.
- **Every value says where it came from.** Each field carries the line index and a normalised box on the page, so a review screen can highlight the exact words a value was read from.
- **It reads many layouts and languages.** Inline lines (`31,93 Lit x 1,899 EUR/Lit 60,64 EUR`), label columns (`Litros 15,24`), US gallons, kWh for EV charging, kg for CNG, and labels in Portuguese, Spanish, French, Italian, German and English.
- **It handles dates properly.** `08/09/2026` is resolved from the paper when possible (a four-digit year, a component over twelve, a month spelled out) and from the reader's region only as a last resort, with lower confidence.

## Connecting your OCR

The parser takes lines of text with a box in coordinates normalised from 0 to 1, origin top-left. Word boxes, confidence and alternate transcriptions are optional, and they improve the result when your OCR provides them.

```ts
import type { OcrLine } from "fuel-receipt-parser";

// Tesseract.js
const { data } = await worker.recognize(image);
const lines: OcrLine[] = data.lines.map((line) => ({
	text: line.text,
	confidence: line.confidence / 100,
	box: {
		x: line.bbox.x0 / width,
		y: line.bbox.y0 / height,
		width: (line.bbox.x1 - line.bbox.x0) / width,
		height: (line.bbox.y1 - line.bbox.y0) / height,
	},
}));
```

With Apple Vision (`VNRecognizeTextRequest`), flip the y axis, because Vision's origin is bottom-left, and pass `topCandidates(3)` beyond the first as `alternates`. With Google ML Kit, map each `TextLine` and its `elements` to `words`.

### Reading a page twice

When the first reading does not add up, ask your OCR for a second look (for example a high-contrast black and white version of the photo) and keep the better of the two:

```ts
import {
	betterReading,
	extractReceipt,
	wantsSecondPass,
} from "fuel-receipt-parser";

let reading = extractReceipt(firstPass, context);
if (wantsSecondPass(reading)) {
	reading = betterReading(reading, extractReceipt(secondPass, context));
}
```

`betterReading` prefers a reading that adds up, then the one with more values, and fills the winner's gaps from the other.

## API

### `extractReceipt(lines, context?): ReceiptReading`

`lines` can arrive in any order. At most 500 lines of 1,500 characters are read, and a label is looked for in the 64 characters before a number, so even the largest input that passes these limits is read in under a second on a laptop. A real receipt takes a few milliseconds.

`context` is optional and holds what the paper does not say:

| Field          | Type             | Use                                                                                           |
| -------------- | ---------------- | --------------------------------------------------------------------------------------------- |
| `country`      | `string`         | ISO 3166 country of purchase, for example `"PT"`. Decides the currency of a bare `$` or `kr`. |
| `currency`     | `string`         | ISO 4217 code to assume when the receipt prints none.                                         |
| `quantityUnit` | `ReceiptUnit`    | Unit to assume when the receipt prints none.                                                  |
| `brands`       | `string[]`       | Station names to look for. Defaults to `KNOWN_BRANDS`.                                        |
| `dateOrder`    | `"dmy" \| "mdy"` | How the reader's region writes numeric dates, the last resort for `08/09/2026`.               |
| `now`          | `Date`           | Anchors two-digit years and rejects dates far in the future. Defaults to the current date.    |

### `ReceiptReading`

Each value field is a `ScannedField<T> | null`:

```ts
interface ScannedField<T> {
	value: T;
	confidence: number; // 0 to 1
	source: { lineIndex: number; box: TextBox } | null;
}
```

| Field       | Value                                                                                 |
| ----------- | ------------------------------------------------------------------------------------- |
| `quantity`  | Amount bought, in `quantityUnit`.                                                     |
| `unitPrice` | Price per `quantityUnit`.                                                             |
| `total`     | Printed total. A reference that checks the other two, not a cost to trust on its own. |
| `currency`  | ISO 4217 code.                                                                        |
| `date`      | `YYYY-MM-DD` text, so no time zone can move it to another day.                        |
| `time`      | `HH:mm`, local time as printed.                                                       |
| `fuelLabel` | Product as printed, for example `"GASOLEO SIMPLES"`.                                  |
| `place`     | Station brand, spelled as the brand list spells it.                                   |
| `odometer`  | Only when the receipt prints one.                                                     |

Plain fields: `fuelTypeId` (`"gasoline_95"`, `"gasoline_98"`, `"diesel_simple"`, `"diesel_aditivado"`, `"ethanol_e85"`, `"lpg"`, `"cng"`, `"adblue"`, `"electric"` or `null`), `quantityUnit` (`"L"`, `"gal"`, `"gallon_us"`, `"gallon_uk"`, `"kg"`, `"m3"`, `"kWh"` or `null`), `odometerUnit`, `energyMode` (`"fuel"` or `"charge"`) and `arithmeticChecked`.

Use `confidence` to decide which fields to show as read and which to leave for the user to fill in. It is not meant to be shown as a percentage.

### Other exports

- `wantsSecondPass(reading)` and `betterReading(first, second)`: see above.
- `fuelTypeIdFor(text)`: the fuel kind of a product name, or `null`.
- `KNOWN_BRANDS`: the default station list.
- `CURRENCIES` and `currencyDecimals(code)`: the currencies the parser recognises.

## Privacy

Receipts carry tax numbers, card digits and addresses. The parser reads only what it needs, keeps no state between calls and makes no network request. The test fixtures are anonymised: see [test/fixtures/README.md](test/fixtures/README.md) before adding one from a real receipt.

## Contributing

A receipt the parser gets wrong is the best contribution there is. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
