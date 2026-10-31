import { describe, expect, it } from "vitest";

import { readDate } from "../src/dates.js";
import { extractReceipt } from "../src/extract.js";
import type { OcrLine } from "../src/types.js";

const box = { x: 0, y: 0, width: 1, height: 0.02 };
const L = (text: string): OcrLine => ({ text, box });
const now = new Date(2026, 8, 10, 12);

describe("a phone number is not a date", () => {
	it("does not let a dotted phone number decide the date order", () => {
		const lines = [
			L("TOTALENERGIES RELAIS NICE"),
			L("Tel. 04.93.45.12.34"),
			L("Le 08/09/2026 a 10:15"),
			L("GAZOLE 31,93 L x 1,899 EUR/L"),
			L("MONTANT TTC 60,64 EUR"),
		];
		expect(extractReceipt(lines, { now, country: "FR" }).date?.value).toBe(
			"2026-09-08",
		);
	});

	it("never reads a slice of a longer digit run as a date", () => {
		expect(readDate([L("04.93.45.12.34")], now)).toBeNull();
	});

	it("still lets a real sibling date settle the order", () => {
		const read = readDate(
			[L("DATA 08/09/2026"), L("VALIDO ATE 25/12/2026")],
			now,
		);
		// The validity line is ignored as a reading, and nothing else proves
		// anything, so the region (day first) answers.
		expect(read?.value).toBe("2026-09-08");
		expect(readDate([L("08/09/2026"), L("13/09/2026 10:00")], now)?.value).toBe(
			"2026-09-08",
		);
	});
});

describe("a road marker is not an odometer", () => {
	it("ignores KM 245 in a motorway station's address", () => {
		const reading = extractReceipt(
			[
				L("REPSOL E.S. LA MANCHA"),
				L("AUTOVIA A-4 KM 245"),
				L("45200 MADRIDEJOS"),
				L("GASOLEO A"),
				L("LITROS 31,93"),
				L("PRECIO 1,899 EUR/L"),
				L("TOTAL 60,64 EUR"),
			],
			{ now, country: "ES" },
		);
		expect(reading.odometer).toBeNull();
		expect(reading.arithmeticChecked).toBe(true);
	});

	it("still reads a reading labelled as one", () => {
		const reading = extractReceipt(
			[
				L("GALP ENERGIA"),
				L("R. CASTILHO 50"),
				L("LISBOA"),
				L("GASOLEO 31,93 L x 1,899 EUR/L"),
				L("TOTAL 60,64 EUR"),
				L("KILOMETROS 124530"),
			],
			{ now, country: "PT" },
		);
		expect(reading.odometer?.value).toBe(124530);
	});
});

describe("currencies with no minor unit", () => {
	it("reads an unmarked yen receipt in whole yen", () => {
		const reading = extractReceipt(
			[L("QUANTITY 31.93 L"), L("PRICE 170 /L"), L("TOTAL 5428")],
			{ now, country: "JP", currency: "JPY" },
		);
		expect(reading.unitPrice?.value).toBe(170);
		expect(reading.total?.value).toBe(5428);
		expect(reading.arithmeticChecked).toBe(true);
	});

	it("reads a Chilean grouping dot as thousands", () => {
		const reading = extractReceipt(
			[
				L("COPEC"),
				L("GASOLINA 93"),
				L("LITROS 20,53"),
				L("PRECIO $ 1.580 /LT"),
				L("TOTAL $ 32.437"),
			],
			{ now, country: "CL" },
		);
		expect(reading.unitPrice?.value).toBe(1580);
		expect(reading.total?.value).toBe(32437);
	});

	it("reads an unmarked Chilean receipt from the country alone", () => {
		const reading = extractReceipt(
			[L("LITROS 20,53"), L("PRECIO 1580 /L"), L("TOTAL 32437")],
			{ now, country: "CL" },
		);
		expect(reading.unitPrice?.value).toBe(1580);
		expect(reading.total?.value).toBe(32437);
	});

	it("leaves a euro receipt's implied comma alone", () => {
		const reading = extractReceipt(
			[L("LITROS 31,93"), L("PRECIO 1,899 EUR/L"), L("TOTAL 6064")],
			{ now, country: "PT" },
		);
		expect(reading.total?.value).toBe(60.64);
	});
});
