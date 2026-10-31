/**
 * The ways a receipt is misread, and the ways the engine gets it back.
 *
 * Every case here is a receipt whose preferred transcription is WRONG in
 * some way a real till roll goes wrong - a comma the print head lost, a digit
 * a crease turned into another, a page the recogniser had second thoughts
 * about - and the assertion is always the same: the sum closes, on the
 * numbers the paper actually carries, and nothing was invented to get there.
 */

import { describe, expect, it } from "vitest";

import { extractReceipt } from "../src/extract.js";
import { namesSomethingElse } from "../src/labels.js";
import { readings, tokenize } from "../src/numbers.js";
import { betterReading, wantsSecondPass } from "../src/read.js";
import type { OcrLine, ReceiptReading } from "../src/types.js";

/** Stacked lines down the page, each optionally with the readings it lost to. */
function page(rows: readonly (string | [string, ...string[]])[]): OcrLine[] {
	return rows.map((row, index) => {
		const [text, ...alternates] = typeof row === "string" ? [row] : row;
		return {
			text,
			alternates,
			box: { x: 0.06, y: 0.04 + index * 0.035, width: 0.88, height: 0.03 },
		};
	});
}

const NOW = new Date(2026, 8, 8);
const read = (rows: Parameters<typeof page>[0]) =>
	extractReceipt(page(rows), { now: NOW, dateOrder: "dmy" });

describe("a photograph without recognised text", () => {
	it("returns an empty reading when both native OCR passes find no lines", () => {
		const first = read([]);
		expect(first).toMatchObject({
			quantity: null,
			unitPrice: null,
			total: null,
			quantityUnit: null,
			currency: null,
			place: null,
			arithmeticChecked: false,
		});
		expect(wantsSecondPass(first)).toBe(true);
		expect(betterReading(first, read([]))).toEqual(first);
	});
});

describe("a separator the print head lost", () => {
	it("offers the printed digits first, and the decimal the paper may have meant after", () => {
		expect(readings("6064").values).toEqual([6064, 60.64, 6.064]);
		expect(readings("32525").values).toEqual([32525, 325.25]);
		expect(readings("899").values).toEqual([899, 8.99]);
		// Too short to be hiding anything, and too long to be a fill.
		expect(readings("12").values).toEqual([12]);
		expect(readings("500000000").values).toEqual([500000000]);
	});

	it("repairs a leading OCR letter only with corroborating arithmetic", () => {
		// The leading digit was recognized as a letter, with the separator
		// intact. What settles it is that 31,93 litres at 899 cannot make a
		// 60,64 bill.
		const receipt = read([
			"GALP",
			"SP95",
			"31,93 L x l,899 EUR/L",
			"TOTAL 60,64 EUR",
			"01/09/2026",
		]);
		expect(receipt.unitPrice?.value).toBe(1.899);
		expect(receipt.unitPrice?.source).not.toBeNull();
	});

	it("closes the sum on a total whose comma did not print", () => {
		const receipt = read([
			"GALP",
			"SP95",
			"31,93 L x 1,899 EUR/L",
			"TOTAL 6064 EUR",
			"01/09/2026",
		]);
		expect(receipt.arithmeticChecked).toBe(true);
		expect(receipt.total?.value).toBe(60.64);
		expect(receipt.total?.source).not.toBeNull();
	});

	it("does not let the implied reading beat a literal one that adds up", () => {
		// Forints: the printed integer is the truth and the implied 325,25 is not.
		const receipt = read([
			"MOL",
			"BENZIN 95",
			"50,00 L",
			"650,5 Ft/L",
			"OSSZESEN 32525 Ft",
			"2026.09.01",
		]);
		expect(receipt.arithmeticChecked).toBe(true);
		expect(receipt.total?.value).toBe(32525);
	});
});

describe("the recogniser's second thoughts", () => {
	it("takes an alternate reading when it is the one that adds up", () => {
		// The crease turned 60,64 into 50,64 in the preferred reading; Vision's
		// second candidate for the line kept the six.
		const receipt = read([
			"GALP",
			"SP95",
			"31,93 L x 1,899 EUR/L",
			["TOTAL 50,64 EUR", "TOTAL 60,64 EUR"],
			"01/09/2026",
		]);
		expect(receipt.arithmeticChecked).toBe(true);
		expect(receipt.total?.value).toBe(60.64);
		// Located on the paper, even without word boxes to cut it from.
		expect(receipt.total?.source).not.toBeNull();
	});

	it("never lets an alternate win a slot on its own", () => {
		// Nothing balances either way. The preferred reading is what the
		// recogniser believed, and the review screen shows that, not its doubts.
		const receipt = read([
			"GALP",
			"SP95",
			"31,93 L",
			"1,899 EUR/L",
			["TOTAL 50,64 EUR", "TOTAL 58,64 EUR"],
			"01/09/2026",
		]);
		expect(receipt.arithmeticChecked).toBe(false);
		expect(receipt.total?.value).toBe(50.64);
	});

	it("cannot balance a number against a second reading of itself", () => {
		// The alternate of the litres line says 60,64 where the preferred says
		// 31,93. Without the place check the solver would take 31,93 as litres
		// and the same patch of paper, re-read, as the total.
		const receipt = read([
			"GALP",
			"SP95",
			["31,93 L", "60,64 L"],
			"1,899 EUR/L",
			"01/09/2026",
		]);
		expect(receipt.arithmeticChecked).toBe(false);
	});

	it("drops an alternate that only repeats the preferred reading", () => {
		const tokens = tokenize(page([["TOTAL 60,64 EUR", "TOTAL 60,64 EUR "]]));
		expect(tokens).toHaveLength(1);
		expect(tokens[0].alternate).toBe(false);
	});

	it("keeps an alternate that reads a different number at the same place", () => {
		const tokens = tokenize(page([["TOTAL 50,64 EUR", "TOTAL 60,64 EUR"]]));
		expect(tokens.map((token) => token.readings[0])).toEqual([50.64, 60.64]);
		expect(tokens[1].alternate).toBe(true);
		expect(tokens[1].lineIndex).toBe(0);
	});
});

describe("numbers that name something else", () => {
	it("knows the tax base, the net and the customer number for what they are", () => {
		for (const line of [
			"Base 49,31",
			"Liquido 49,31",
			"Netto 49,31",
			"Cliente 123456",
			"Matricula 12-AB-34",
			"Transaction 000123",
			"Hora 18:42",
		]) {
			expect(namesSomethingElse(line), line).toBe(true);
		}
	});

	it("does not take the tax base for the total when the total line is faint", () => {
		// The total's comma faded; the base is crisp and labelled. Balanced
		// against the litres and the price, only one of them is the bill.
		const receipt = read([
			"GALP",
			"SP95",
			"31,93 L x 1,899 EUR/L",
			"Base 49,31",
			"IVA 23% 11,33",
			"TOTAL 6064",
			"01/09/2026",
		]);
		expect(receipt.arithmeticChecked).toBe(true);
		expect(receipt.total?.value).toBe(60.64);
	});
});

describe("the second pass", () => {
	const reading = (overrides: Partial<ReceiptReading>): ReceiptReading => ({
		date: null,
		time: null,
		total: null,
		quantity: null,
		unitPrice: null,
		currency: null,
		fuelLabel: null,
		fuelTypeId: null,
		place: null,
		odometer: null,
		quantityUnit: "L",
		energyMode: "fuel",
		arithmeticChecked: false,
		...overrides,
	});
	const field = <T>(value: T) => ({
		value,
		confidence: 0.9,
		source: { lineIndex: 0, box: { x: 0, y: 0, width: 0.1, height: 0.03 } },
	});

	it("is asked for only when the sum did not close", () => {
		expect(wantsSecondPass(reading({ arithmeticChecked: false }))).toBe(true);
		expect(wantsSecondPass(reading({ arithmeticChecked: true }))).toBe(false);
	});

	it("prefers the reading whose sum closes, whichever pass it came from", () => {
		const first = reading({
			quantity: field(31.93),
			unitPrice: field(1.899),
			total: field(50.64),
		});
		const second = reading({
			quantity: field(31.93),
			unitPrice: field(1.899),
			total: field(60.64),
			arithmeticChecked: true,
		});
		expect(betterReading(first, second).total?.value).toBe(60.64);
		expect(betterReading(second, first).total?.value).toBe(60.64);
	});

	it("otherwise prefers more numbers read off the paper, and the first pass on a tie", () => {
		const sparse = reading({ total: field(60.64) });
		const fuller = reading({ total: field(60.64), quantity: field(31.93) });
		expect(betterReading(sparse, fuller).quantity?.value).toBe(31.93);
		expect(betterReading(fuller, sparse).quantity?.value).toBe(31.93);

		// Worth the same; told apart by a unit nothing scores or merges.
		const alike = reading({ total: field(60.64), quantityUnit: "gal" });
		expect(betterReading(sparse, alike).quantityUnit).toBe("L");
		expect(betterReading(alike, sparse).quantityUnit).toBe("gal");
	});

	it("completes the winner with what only the loser read", () => {
		const first = reading({
			total: field(50.64),
			date: field("2026-09-01"),
			place: field("Galp"),
		});
		const second = reading({
			quantity: field(31.93),
			unitPrice: field(1.899),
			total: field(60.64),
			arithmeticChecked: true,
		});
		const merged = betterReading(first, second);
		expect(merged.arithmeticChecked).toBe(true);
		expect(merged.date?.value).toBe("2026-09-01");
		expect(merged.place?.value).toBe("Galp");
	});
});
