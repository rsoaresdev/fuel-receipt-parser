import { describe, expect, it } from "vitest";
import { CURRENCIES } from "../src/currencies.js";
import { extractReceipt } from "../src/extract.js";
import { receiptCurrency, receiptRecognitionLanguage } from "../src/region.js";
import type { OcrLine, ScanContext } from "../src/types.js";
import { receiptUnitMetadata, storedReceiptUnit } from "../src/units.js";

function read(rows: string[], context: ScanContext = {}) {
	const lines: OcrLine[] = rows.map((text, i) => ({
		text,
		box: { x: 0.05, y: 0.03 + i * 0.04, width: 0.9, height: 0.03 },
	}));
	return extractReceipt(lines, { now: new Date(2026, 8, 8), ...context });
}

describe("receipt evidence", () => {
	it("keeps a paid total as reference even when a subtotal balances", () => {
		const r = read([
			"Shell",
			"40 L x 1.80 EUR/L",
			"Subtotal 72 EUR",
			"Desconto 4 EUR",
			"Total 68 EUR",
		]);
		expect(r.quantity?.value).toBe(40);
		expect(r.unitPrice?.value).toBe(1.8);
		expect(r.total?.value).toBe(68);
		expect(r.arithmeticChecked).toBe(false);
		// The pump price stays what was printed: 40 x 1.80 is 72 before the discount.
		expect((r.quantity?.value ?? 0) * (r.unitPrice?.value ?? 0)).toBe(72);
	});
	it.each([
		["TOTAL 72 EUR"],
		["72"],
		["Turno 2", "Bomba 04"],
		["IVA 23% 11.34 EUR"],
		["Tax ٢٣٪ ١١٫٣٤ EUR"],
	])("never invents inputs from non-fill numbers %j", (...rows: string[]) => {
		const r = read(rows);
		expect(r.quantity).toBeNull();
		expect(r.unitPrice).toBeNull();
		expect(r.arithmeticChecked).toBe(false);
	});
	it("rejects a small misread amount that the former percentage tolerance accepted", () => {
		expect(
			read(["31.93 L x 1.899 EUR/L", "TOTAL 60.84 EUR"]).arithmeticChecked,
		).toBe(false);
	});
	it("does not call an inferred reference a verified amount", () => {
		const r = read(["31.93 L x 1.899 EUR/L"]);
		expect(r.total).toBeNull();
		expect(r.arithmeticChecked).toBe(false);
	});
	it("does not turn a refund quantity into a fill", () => {
		expect(read(["Quantity -20 L", "Price 1.8 EUR/L"]).quantity).toBeNull();
	});
	it("does not assign marketing grades to a RON fuel id", () => {
		for (const product of [
			"Regular 87",
			"Premium 91",
			"V-Power",
			"Gasolina comum",
			"Magna",
		]) {
			const r = read([product, "20 L", "PRICE 1.5 USD/L"], { country: "MX" });
			expect(r.fuelTypeId).toBeNull();
			expect(r.fuelLabel?.value).toBe(product);
		}
	});
});

describe("supported currencies and numbers", () => {
	it.each([
		["US$", "USD"],
		["CA$", "CAD"],
		["C$", "CAD"],
		["A$", "AUD"],
		["NZ$", "NZD"],
		["R$", "BRL"],
		["HK$", "HKD"],
		["S$", "SGD"],
	])(
		"keeps the explicit symbol %s ahead of a bare dollar",
		(symbol, currency) => {
			expect(receiptCurrency(`Total ${symbol}36`, { country: "MX" })).toBe(
				currency,
			);
		},
	);
	it("retains ambiguity for lei and does not interpret litres as lei", () => {
		expect(receiptCurrency("36 lei")).toBeNull();
		expect(receiptCurrency("36 lei", { country: "MD" })).toBe("MDL");
		expect(receiptCurrency("36 lei", { country: "RO" })).toBe("RON");
		expect(receiptCurrency("36 L", { country: "MD" })).toBeNull();
	});
	it.each(CURRENCIES.map((c) => c.code))(
		"recognizes explicit %s",
		(currency) => {
			const r = read(["20 L", "Price 1.8 /L", `Total 36 ${currency}`]);
			expect(r.currency?.value).toBe(currency);
		},
	);
	it.each([
		["US", "USD"],
		["CA", "CAD"],
		["AU", "AUD"],
		["MX", "MXN"],
		["NZ", "NZD"],
		["AR", "ARS"],
		["CO", "COP"],
		["CL", "CLP"],
		["TW", "TWD"],
	])("resolves dollars for %s", (country, currency) => {
		expect(receiptCurrency("Total $36", { country })).toBe(currency);
	});
	it.each([
		["JP", "JPY"],
		["CN", "CNY"],
	])("resolves yen or yuan for %s", (country, currency) =>
		expect(receiptCurrency("Total ¥3000", { country })).toBe(currency),
	);
	it.each([
		["NO", "NOK"],
		["SE", "SEK"],
		["DK", "DKK"],
		["IS", "ISK"],
	])("resolves kr. for %s", (country, currency) =>
		expect(receiptCurrency("Total 300 kr.", { country })).toBe(currency),
	);
	it("does not guess an ambiguous or conflicting currency", () => {
		expect(receiptCurrency("Total $36")).toBeNull();
		expect(receiptCurrency("Total 36 USD 30 EUR")).toBeNull();
		expect(read(["20 L", "Price 1.8 GBP/L", "Total £36"]).currency?.value).toBe(
			"GBP",
		);
	});
	it.each(["1 234,56", "1’234.56", "١٬٢٣٤٫٥٦", "１，２３４．５６"])(
		"reads grouped numbers %s",
		(value) => {
			expect(read([`Quantity ${value} L`]).quantity?.value).toBe(1234.56);
		},
	);
});

describe("unit and date context", () => {
	it.each([
		["10 US gal", "3 USD/US gal", "gallon_us"],
		["10 gal (US)", "3 USD/gal", "gallon_us"],
		["10 imp gal", "3 GBP/gal", "gallon_uk"],
		["10 kg", "3 EUR/kg", "kg"],
		["10 m3", "3 BRL/m3", "m3"],
		["10 kWh", "3 EUR/kWh", "kWh"],
	])("keeps the unit of %s", (q, p, unit) => {
		const r = read([q, p]);
		expect(r.quantity?.value).toBe(10);
		expect(r.unitPrice?.value).toBe(3);
		expect(r.quantityUnit).toBe(unit);
	});
	it("leaves unspecified gallons unresolved outside a known country", () => {
		expect(read(["10 gal", "Price 3 /gal"]).quantityUnit).toBe("gal");
		expect(
			read(["10 gal", "Price 3 /gal"], { country: "US" }).quantityUnit,
		).toBe("gallon_us");
	});
	it("keeps the quantity and leaves a conflicting price for the original form", () => {
		const reading = read(["10 L", "Price 3 USD/gal"]);
		expect(reading.quantityUnit).toBe("L");
		expect(reading.quantity?.value).toBe(10);
		expect(reading.unitPrice).toBeNull();
	});
	it("takes the price unit when the quantity has only a label", () => {
		expect(read(["Quantity 10", "Price 3 /gal"]).quantityUnit).toBe("gal");
	});
	it("selects the purchase date and nearby time over membership history", () => {
		const r = read([
			"Member since 2020-01-01 08:30",
			"Duration 01:20",
			"Purchase 2026-09-08 19:42",
		]);
		expect(r.date?.value).toBe("2026-09-08");
		expect(r.time?.value).toBe("19:42");
	});
	it.each([
		"08. März 2026",
		"8 março 2026",
		"8 marzo 2026",
		"8 mars 2026",
		"March 8, 2026",
	])("reads a spelled month in %s", (date) =>
		expect(read([date]).date?.value).toBe("2026-03-08"),
	);
	it("keeps odometer units and rejects roadside distances", () => {
		expect(read(["Odometer 54,321 mi"]).odometer?.value).toBe(54321);
		expect(read(["Odometer 54,321 mi"]).odometerUnit).toBe("mi");
		expect(read(["Highway exit 123 km"]).odometer).toBeNull();
	});
	it("chooses the native script from the receipt country", () => {
		expect(receiptRecognitionLanguage("JP", "en")).toBe("ja");
		expect(receiptRecognitionLanguage("CN", "pt")).toBe("zh");
		expect(receiptRecognitionLanguage("PT", "en")).toBe("en");
	});
});

describe("unit persistence", () => {
	it("does not assign the current account preference to an old ambiguous gallon", () => {
		const original = { quantityUnit: "gal" };
		const unit = storedReceiptUnit(original);
		expect(unit).toBe("gal");
		expect(receiptUnitMetadata(unit ?? "L")).toEqual({
			quantityUnit: "gal",
			volumeUnit: undefined,
		});
	});
	it.each(["gallon_us", "gallon_uk", "L", "kg", "m3", "kWh"] as const)(
		"round trips %s",
		(unit) => {
			expect(storedReceiptUnit(receiptUnitMetadata(unit))).toBe(unit);
		},
	);
});

describe("reference edge cases", () => {
	it("recognizes an ISO currency printed as a standalone heading", () => {
		expect(
			read(["USD", "20 L", "Price 1.8 /L", "Total 36"]).currency?.value,
		).toBe("USD");
	});
	it("requires currency confirmation when separate rows conflict", () => {
		expect(
			read(["20 L", "Price 1.8 EUR/L", "Total 36 USD"]).currency,
		).toBeNull();
	});
	it("retains a printed zero as a reference for a full discount", () => {
		expect(read(["20 L", "Price 1.8 EUR/L", "Total 0 EUR"]).total?.value).toBe(
			0,
		);
	});
});
