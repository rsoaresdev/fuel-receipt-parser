/**
 * What else a fuel receipt prints: a discount that changes what was paid,
 * a second fill on the same paper, and receipts that are not for fuel at all.
 */

import { describe, expect, it } from "vitest";

import { extractReceipt } from "../src/extract.js";

const NOW = new Date(2026, 9, 31);

function read(rows: readonly string[]) {
	return extractReceipt(
		rows.map((text, index) => ({
			text,
			box: { x: 0.06, y: 0.04 + index * 0.035, width: 0.88, height: 0.03 },
		})),
		{ now: NOW },
	);
}

describe("a printed discount", () => {
	it("reads an amount and checks the total paid", () => {
		const r = read([
			"GASOLEO",
			"Litros 40,00",
			"PVP/L 1,800",
			"Desconto -4,00",
			"TOTAL 68,00 EUR",
		]);
		expect(r.discount?.value).toEqual({ type: "amount", value: 4 });
		expect(r.arithmeticChecked).toBe(true);
	});

	it("turns a per-litre discount into the amount it makes", () => {
		const r = read([
			"GASOLEO",
			"Litros 40,00",
			"PVP/L 1,800",
			"Desc. 0,10 EUR/L",
			"TOTAL 68,00 EUR",
		]);
		expect(r.discount?.value).toEqual({ type: "amount", value: 4 });
		expect(r.arithmeticChecked).toBe(true);
	});

	it("reads a percentage", () => {
		const r = read([
			"GASOLEO",
			"Litros 40,00",
			"PVP/L 1,800",
			"Desconto 5%",
			"TOTAL 68,40 EUR",
		]);
		expect(r.discount?.value).toEqual({ type: "percent", value: 5 });
		expect(r.arithmeticChecked).toBe(true);
	});

	it("takes the amount on a line that prints both", () => {
		const r = read([
			"GASOLEO",
			"Litros 40,00",
			"PVP/L 1,800",
			"Desconto 5% -3,60",
			"TOTAL 68,40 EUR",
		]);
		expect(r.discount?.value).toEqual({ type: "amount", value: 3.6 });
	});

	it("does not check a total the discount does not explain", () => {
		const r = read([
			"GASOLEO",
			"Litros 40,00",
			"PVP/L 1,800",
			"Desconto -3,00",
			"TOTAL 68,00 EUR",
		]);
		expect(r.arithmeticChecked).toBe(false);
	});

	it("leaves a per-litre discount out when no quantity was read", () => {
		expect(
			read(["GASOLEO", "Desc. 0,10 EUR/L", "TOTAL 68,00 EUR"]).discount,
		).toBeNull();
	});
});

describe("two fills on one receipt", () => {
	it("returns the second one, checked on its own line", () => {
		const r = read([
			"GASOLEO",
			"40,00 L x 1,600 EUR/L 64,00",
			"ADBLUE",
			"10,00 L x 0,899 EUR/L 8,99",
			"TOTAL 72,99 EUR",
		]);
		expect(r.arithmeticChecked).toBe(true);
		const fills = [
			{ quantity: r.quantity?.value, fuel: r.fuelTypeId },
			...(r.otherFills ?? []).map((fill) => ({
				quantity: fill.quantity.value,
				fuel: fill.fuelTypeId,
			})),
		];
		expect(fills).toHaveLength(2);
		expect(fills.map((fill) => fill.quantity).sort()).toEqual([10, 40]);
		expect(r.otherFills?.[0].quantityUnit).toBe("L");
	});

	it("has none on a receipt with one fill", () => {
		expect(
			read(["GASOLEO", "40,00 L x 1,600 EUR/L 64,00", "TOTAL 64,00 EUR"])
				.otherFills,
		).toEqual([]);
	});

	it("does not offer a shop line as a fill", () => {
		expect(
			read([
				"GASOLEO",
				"40,00 L x 1,600 EUR/L 64,00",
				"AGUA 2 x 1,20 2,40",
				"TOTAL 66,40 EUR",
			]).otherFills,
		).toEqual([]);
	});
});

describe("what the receipt is for", () => {
	it("calls a pump receipt fuel", () => {
		expect(
			read(["GASOLEO", "Litros 40,00", "PVP/L 1,800", "TOTAL 72,00 EUR"]).kind,
		).toBe("fuel");
	});

	it("calls a café receipt other", () => {
		expect(
			read(["CAFE CENTRAL", "BOLO 2 x 5,00 10,00", "TOTAL 10,00 EUR"]).kind,
		).toBe("other");
	});

	it("does not judge a receipt it could not read", () => {
		expect(read(["OBRIGADO"]).kind).toBe("unknown");
	});
});

describe("a discount below a fuel line that prints its own amount", () => {
	it("checks the paid total, not the amount before the discount", () => {
		const r = read([
			"GASOLEO SIMPLES",
			"40,00 L x 1,800 EUR/L 72,00",
			"Desconto Cartao -4,00",
			"TOTAL EUR 68,00",
		]);
		expect(r.total?.value).toBe(68);
		expect(r.total?.source?.lineIndex).toBe(3);
		expect(r.arithmeticChecked).toBe(true);
	});
});

describe("each fill's own product", () => {
	it("names every fill by the product printed over it", () => {
		const r = read([
			"GASOLEO",
			"40,00 L x 1,600 EUR/L 64,00",
			"ADBLUE",
			"10,00 L x 0,899 EUR/L 8,99",
			"TOTAL EUR 72,99",
		]);
		const fuels = [r, ...(r.otherFills ?? [])].map((fill) => [
			fill.quantity?.value,
			fill.fuelTypeId,
		]);
		expect(fuels).toContainEqual([40, "diesel_simple"]);
		expect(fuels).toContainEqual([10, "adblue"]);
	});
});
