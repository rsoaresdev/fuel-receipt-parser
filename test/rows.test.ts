/**
 * What a real recogniser hands over, rather than lines stacked neatly down
 * the page: a row split at every wide gap, columns out of order, a tilted
 * photo. The labels only reach their numbers once the pieces are rows again.
 */

import { describe, expect, it } from "vitest";

import { extractReceipt } from "../src/extract.js";
import type { OcrLine } from "../src/types.js";
import {
	cafeOnly,
	galpColumns,
	repsolWithShopItem,
	shellGallons,
	totalTilted,
} from "./fixtures/vision.js";

const NOW = new Date(2026, 9, 31);

describe("rows split by the recogniser", () => {
	it("points every fill's sources at the caller's own lines", () => {
		const at = (text: string, y: number, x = 0.05, width = 0.5): OcrLine => ({
			text,
			box: { x, y, width, height: 0.02 },
		});
		const lines = [
			at("GASOLEO", 0.1),
			at("31,93 L x 1,899 EUR/L", 0.14),
			at("60,64", 0.14, 0.7, 0.2),
			at("ADBLUE", 0.2),
			at("10,00 L x 1,000 EUR/L", 0.24),
			at("10,00", 0.24, 0.7, 0.2),
			at("TOTAL 70,64 EUR", 0.3),
		];
		const receipt = extractReceipt(lines, { now: NOW });
		const fill = receipt.otherFills?.[0];
		expect(fill?.quantity.value).toBe(10);
		expect(lines[fill?.quantity.source?.lineIndex ?? -1].text).toBe(
			"10,00 L x 1,000 EUR/L",
		);
		expect(lines[fill?.total.source?.lineIndex ?? -1].text).toBe("10,00");
		expect(lines[fill?.fuelLabel?.source?.lineIndex ?? -1].text).toBe("ADBLUE");
	});

	it("reads a table whose headings sit above the values", () => {
		const receipt = extractReceipt(galpColumns, { now: NOW });
		expect(receipt.quantity?.value).toBe(38.52);
		expect(receipt.unitPrice?.value).toBe(1.659);
		expect(receipt.total?.value).toBe(63.9);
		expect(receipt.quantityUnit).toBe("L");
		expect(receipt.fuelTypeId).toBe("diesel_simple");
		expect(receipt.arithmeticChecked).toBe(true);
	});

	it("joins a label to a value printed far to its right", () => {
		const receipt = extractReceipt(shellGallons, {
			now: NOW,
			dateOrder: "mdy",
		});
		expect(receipt.quantity?.value).toBe(11.482);
		expect(receipt.unitPrice?.value).toBe(3.459);
		expect(receipt.total?.value).toBe(39.72);
		expect(receipt.quantityUnit).toBe("gal");
		expect(receipt.arithmeticChecked).toBe(true);
	});

	it("reads a tilted photo", () => {
		const receipt = extractReceipt(totalTilted, { now: NOW });
		expect(receipt.total?.value).toBe(79.23);
		expect(receipt.arithmeticChecked).toBe(true);
	});

	it("points every source at the caller's own line", () => {
		const receipt = extractReceipt(galpColumns, { now: NOW });
		expect(galpColumns[receipt.quantity?.source?.lineIndex ?? -1].text).toBe(
			"38,52",
		);
		expect(galpColumns[receipt.unitPrice?.source?.lineIndex ?? -1].text).toBe(
			"1,659",
		);
	});

	it("still refuses to check a shop receipt", () => {
		expect(extractReceipt(cafeOnly, { now: NOW }).arithmeticChecked).toBe(
			false,
		);
	});

	it("leaves lines without a usable box alone", () => {
		const flat: OcrLine[] = [
			"GASOLEO",
			"Litros 42,10",
			"PVP/L 1,659",
			"TOTAL 69,84",
		].map((text) => ({ text, box: { x: 0, y: 0, width: 0, height: 0 } }));
		const receipt = extractReceipt(flat, { now: NOW });
		expect(receipt.quantity?.value).toBe(42.1);
		expect(receipt.arithmeticChecked).toBe(true);
	});
});

describe("a receipt with a shop item beside the fuel", () => {
	it("checks the fuel line against its own amount", () => {
		const receipt = extractReceipt(repsolWithShopItem, { now: NOW });
		expect(receipt.quantity?.value).toBe(42.15);
		expect(receipt.unitPrice?.value).toBe(1.589);
		expect(receipt.total?.value).toBe(66.98);
		expect(receipt.arithmeticChecked).toBe(true);
	});

	it("prefers the receipt's total when that one closes too", () => {
		const receipt = extractReceipt(
			["GASOLINA 95", "42,15 L x 1,589 EUR/L 66,98", "TOTAL 66,98 EUR"].map(
				(text, index) => ({
					text,
					box: { x: 0.06, y: 0.04 + index * 0.035, width: 0.88, height: 0.03 },
				}),
			),
			{ now: NOW },
		);
		expect(receipt.total?.source?.lineIndex).toBe(2);
		expect(receipt.arithmeticChecked).toBe(true);
	});
});

describe("a US pump's rate heading", () => {
	it("reads PRICE/GAL with the dollar sign before the value", () => {
		const receipt = extractReceipt(
			[
				"REGULAR UNLD",
				"GALLONS 11.482",
				"PRICE/GAL $3.459",
				"FUEL TOTAL $39.72",
			].map((text, index) => ({
				text,
				box: { x: 0.06, y: 0.04 + index * 0.035, width: 0.88, height: 0.03 },
			})),
			{ now: NOW, dateOrder: "mdy" },
		);
		expect(receipt.unitPrice?.value).toBe(3.459);
		expect(receipt.arithmeticChecked).toBe(true);
	});
});
