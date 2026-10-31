/**
 * Reading a fuel receipt, with the arithmetic as the judge.
 *
 * Two of the receipts below follow real Prio and Plenergy receipts line for
 * line, with the identifying details (tax numbers, address, invoice number,
 * date and time) replaced. The rest are the
 * ways a receipt goes wrong: a faded line, a digit the print head ate, a VAT
 * row that looks exactly like a total, a date that two continents read
 * differently, a currency with no cents.
 *
 * WHAT THESE TESTS ARE REALLY FOR. It is easy to write a receipt reader that
 * passes on clean input, and useless. Everything here that matters is about
 * what the engine does when it is NOT sure - and the rule it must never break
 * is that it does not invent. A number that is on the paper is never replaced
 * by one that is not; a missing input remains empty; three numbers that disagree come back all three, unchecked, for a
 * person to settle. `arithmeticChecked` is the flag the review screen leans
 * on, so every case below asserts it.
 */

import { describe, expect, it } from "vitest";

import { extractReceipt } from "../src/extract.js";
import { readings, tokenize } from "../src/numbers.js";
import type { OcrLine } from "../src/types.js";

/** Stacked lines down the page, which is all the engine assumes of a layout. */
function page(rows: readonly string[]): OcrLine[] {
	return rows.map((text, index) => ({
		text,
		box: { x: 0.06, y: 0.04 + index * 0.035, width: 0.88, height: 0.03 },
	}));
}

/** A fixed "today", so a receipt does not age out of the tests. */
const NOW = new Date(2026, 8, 8);

const read = (rows: readonly string[], order?: "dmy" | "mdy") =>
	extractReceipt(page(rows), { now: NOW, dateOrder: order });

/**
 * A Prio receipt layout: the whole fill is on one line,
 * with the volume, the rate and the total separated only by spaces and an `x`.
 */
const PRIO = [
	"PRIO ENERGY, S.A.",
	"NIF: 500000000",
	"AV. DA REPUBLICA, 1",
	"1000-001 LISBOA",
	"FATURA SIMPLIFICADA FS 2026/000123",
	"E5-TOP 95",
	"31,93 Lit x 1,899 EUR/Lit 60,64 EUR",
	"IVA 23% 11,34",
	"TOTAL 60,64 EUR",
	"Bomba 04  Turno 2",
	"2026-08-03 14:12:09",
	"Obrigado pela sua preferencia",
];

/**
 * A Plenergy receipt layout: the same three numbers, but in
 * label-then-value rows, where the unit is printed BEFORE the figure it
 * belongs to. The two layouts pull in opposite directions and both are here
 * for that reason - see `unitFor` in `numbers.ts`.
 */
const PLENERGY = [
	"PLENERGY",
	"ESTACAO DE SERVICO",
	"NIF 500 000 001",
	"GASOLEO SIMPLES",
	"EUR/L 1,789",
	"Litros 15,24",
	"EUR Total C/IVA 27,26",
	"IVA 23%  5,10",
	"Cartao ****0000",
	"2026-08-21 09:41",
];

describe("two real receipt layouts", () => {
	it("reads the Prio fill off its single packed line", () => {
		const receipt = read(PRIO);
		expect(receipt.arithmeticChecked).toBe(true);
		expect(receipt.quantity?.value).toBe(31.93);
		expect(receipt.unitPrice?.value).toBe(1.899);
		expect(receipt.total?.value).toBe(60.64);
		expect(receipt.currency?.value).toBe("EUR");
		expect(receipt.date?.value).toBe("2026-08-03");
		expect(receipt.time?.value).toBe("14:12");
		expect(receipt.fuelTypeId).toBe("gasoline_95");
		// Spelled as the brand list spells it, not as the receipt shouts it:
		// the name goes on to the record's place field.
		expect(receipt.place?.value).toBe("Prio");
		expect(receipt.energyMode).toBe("fuel");
		expect(receipt.quantityUnit).toBe("L");
	});

	it("reads the Plenergy fill off its label columns", () => {
		const receipt = read(PLENERGY);
		expect(receipt.arithmeticChecked).toBe(true);
		expect(receipt.quantity?.value).toBe(15.24);
		expect(receipt.unitPrice?.value).toBe(1.789);
		expect(receipt.total?.value).toBe(27.26);
		expect(receipt.date?.value).toBe("2026-08-21");
		expect(receipt.fuelTypeId).toBe("diesel_simple");
		expect(receipt.fuelLabel?.value).toBe("GASOLEO SIMPLES");
	});

	it("points every value at the words it was read from", () => {
		const receipt = read(PRIO);
		// The three figures share the same line and must not share a box, or
		// the review screen would highlight the same strip of paper three
		// times over and tell the reader nothing.
		const boxes = [receipt.quantity, receipt.unitPrice, receipt.total].map(
			(field) => field?.source?.box,
		);
		expect(boxes.every(Boolean)).toBe(true);
		expect(new Set(boxes.map((box) => box?.x)).size).toBe(3);
		for (const box of boxes) {
			expect(box?.x).toBeGreaterThanOrEqual(0);
			expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(1.0001);
		}
	});
});

describe("the decimal separator, which the paper never states", () => {
	it("offers both readings of a figure that could be either", () => {
		// A single separator with exactly three digits after it is undecidable
		// from the token alone: 1,899 euros per litre, or 1899 of something.
		expect(readings("1,899").values).toEqual([1.899, 1899]);
		expect(readings("1.899").values).toEqual([1.899, 1899]);
	});

	it("settles a figure that is not undecidable", () => {
		expect(readings("31,93").values).toEqual([31.93]);
		expect(readings("1.234,56").values).toEqual([1234.56]);
		expect(readings("1,234.56").values).toEqual([1234.56]);
		expect(readings("12").values).toEqual([12]);
	});

	it("lets the arithmetic choose between them", () => {
		// 31,93 x 1,899 = 60,64. 31,93 x 1899 = 60 634. Only one of those is a
		// tank of petrol, and the engine is never told which country it is in.
		expect(read(PRIO).unitPrice?.value).toBe(1.899);
	});

	it("reads a receipt printed the other way round", () => {
		const receipt = read([
			"BP",
			"DIESEL",
			"QTY 120.00 L",
			"PRICE 1.659",
			"TOTAL 199.08 GBP",
			"01/09/2026",
		]);
		expect(receipt.arithmeticChecked).toBe(true);
		expect(receipt.quantity?.value).toBe(120);
		expect(receipt.unitPrice?.value).toBe(1.659);
		expect(receipt.currency?.value).toBe("GBP");
	});
});

describe("numbers that are not the ones we want", () => {
	it("does not take the VAT line for the total", () => {
		const receipt = read([
			"GALP",
			"SP95",
			"IVA 23% 26,00",
			"20,00 L x 1,80 EUR/L",
			"Total a pagar 36,00",
			"01/09/2026",
		]);
		expect(receipt.total?.value).toBe(36);
		expect(receipt.arithmeticChecked).toBe(true);
	});

	it("does not take the change from a fifty for the total", () => {
		const receipt = read([
			"GALP",
			"SP95",
			"20,00 L x 1,80 EUR/L",
			"TOTAL 36,00",
			"DINHEIRO 50,00",
			"TROCO 14,00",
			"01/09/2026",
		]);
		expect(receipt.total?.value).toBe(36);
	});

	it("does not take the timestamp apart for quantities", () => {
		// `2026-08-01 20:46:14` is six numbers to a tokenizer and none of them
		// is a measurement. 20 litres at 1,46 would come to 29,20, and there
		// is no such row on the receipt.
		const tokens = tokenize(page(["2026-08-01 20:46:14"]));
		expect(tokens.every((token) => token.partOfDateTime)).toBe(true);
	});

	it("does not read a pump number as a price", () => {
		const receipt = read([
			"GALP",
			"SP95",
			"Bomba 04",
			"Litros 45,00",
			"TOTAL 78,71 EUR",
			"01/09/2026",
		]);
		expect(receipt.unitPrice).toBeNull();
	});
});

describe("when the printer lost a line", () => {
	it("does not infer a missing price from the total", () => {
		const receipt = read([
			"GALP",
			"GASOLEO",
			"Litros 45,00",
			"TOTAL 78,71 EUR",
			"01/09/2026",
		]);
		expect(receipt.unitPrice).toBeNull();
		// A discount could be included in the total, so division is not evidence.
		expect(receipt.quantity?.source).not.toBeNull();
		// An incomplete reading cannot corroborate the printed total.
		expect(receipt.arithmeticChecked).toBe(false);
	});

	it("does not infer a missing quantity from the total", () => {
		// 61,22 / 1,749 is 35,00285…, and no pump ever dispensed that.
		const receipt = read([
			"GALP",
			"SP95",
			"EUR/L 1,749",
			"TOTAL 61,22 EUR",
			"01/09/2026",
		]);
		expect(receipt.quantity).toBeNull();
	});

	it("keeps the printed reference empty when no total was read", () => {
		const receipt = read([
			"GALP",
			"SP95",
			"35,00 L x 1,749 EUR/L",
			"01/09/2026",
		]);
		expect(receipt.total).toBeNull();
		expect(receipt.arithmeticChecked).toBe(false);
	});
});

describe("when a digit was misread", () => {
	it("keeps all three printed numbers rather than inventing a fourth", () => {
		// The total is 60,64 on the paper and the crease turned it into 50,64.
		// The engine could divide 50,64 by 1,899 and print 26,667 litres, and
		// it would look every bit as confident as a correct reading. It must
		// not: 31,93 IS on the receipt, the reader can see it, and replacing it
		// with a computed figure hides the one thing worth telling them, which
		// is that these three numbers do not agree.
		const receipt = read([
			"GALP",
			"SP95",
			"31,93 L",
			"1,899 EUR/L",
			"TOTAL 50,64 EUR",
			"01/09/2026",
		]);
		expect(receipt.arithmeticChecked).toBe(false);
		expect(receipt.quantity?.value).toBe(31.93);
		expect(receipt.unitPrice?.value).toBe(1.899);
		expect(receipt.total?.value).toBe(50.64);
		// All three are on the paper, so all three can be pointed at.
		expect(receipt.quantity?.source).not.toBeNull();
		expect(receipt.unitPrice?.source).not.toBeNull();
		expect(receipt.total?.source).not.toBeNull();
	});

	it("repairs a letter the print head left inside a number", () => {
		const receipt = read([
			"GALP",
			"SP95",
			"3l,93 L x 1,899 EUR/L",
			"TOTAL 6O,64 EUR",
			"01/09/2026",
		]);
		expect(receipt.quantity?.value).toBe(31.93);
		expect(receipt.total?.value).toBe(60.64);
		expect(receipt.arithmeticChecked).toBe(true);
	});
});

describe("the date, which two continents read differently", () => {
	it("takes an ISO date at its word", () => {
		expect(read(PRIO).date?.value).toBe("2026-08-03");
	});

	it("settles the layout from a component over twelve", () => {
		const receipt = read([
			"SHELL",
			"UNLEADED 87",
			"GALLONS   12.446",
			"PRICE/GAL   3.499",
			"TOTAL   $43.55",
			"08/16/2026 09:12 AM",
		]);
		expect(receipt.date?.value).toBe("2026-08-16");
		expect(receipt.time?.value).toBe("09:12");
		expect(receipt.quantityUnit).toBe("gal");
		expect(receipt.currency).toBeNull(); // A bare dollar sign needs country context.
	});

	it("does not use a validity date to decide the transaction format", () => {
		const rows = [
			"GALP",
			"SP95",
			"20,00 L x 1,80 EUR/L",
			"TOTAL 36,00 EUR",
			"08/09/2026",
			"Validade 12/25/2026",
		];
		// Promotional expiry dates do not establish the purchase date format.
		expect(read(rows, "dmy").date?.value).toBe("2026-09-08");
		expect(read(rows, "dmy").date?.confidence).toBeLessThan(0.9);
	});

	it("uses the reader's own region when the paper settles nothing", () => {
		const rows = [
			"GALP",
			"SP95",
			"20,00 L x 1,80 EUR/L",
			"TOTAL 36,00",
			"08/09/2026",
		];
		expect(read(rows, "dmy").date?.value).toBe("2026-09-08");
		expect(read(rows, "mdy").date?.value).toBe("2026-08-09");
	});

	it("says how sure it is, so the review screen can ask", () => {
		const rows = [
			"GALP",
			"SP95",
			"20,00 L x 1,80 EUR/L",
			"TOTAL 36,00",
			"08/09/2026",
		];
		expect(read(PRIO).date?.confidence).toBeGreaterThan(0.9);
		expect(read(rows).date?.confidence).toBeLessThan(0.9);
	});

	it("reads a month spelled out, in any of the six base languages", () => {
		for (const [printed, expected] of [
			["01 AGO 2026", "2026-08-01"],
			["01 AOUT 2026", "2026-08-01"],
			["1 Aug 2026", "2026-08-01"],
			["01 SET 2026", "2026-09-01"],
			["01 DEZ 2025", "2025-12-01"],
			["01 GEN 2026", "2026-01-01"],
		] as const) {
			const receipt = read(["GALP", "SP95", "20,00 L x 1,80 EUR/L", printed]);
			expect(receipt.date?.value).toBe(expected);
		}
	});

	it("refuses a date it cannot believe", () => {
		// A till whose clock never got set, and one whose year is a typo.
		expect(read(["GALP", "SP95", "01/01/1999"]).date).toBeNull();
		expect(read(["GALP", "SP95", "01/01/2099"]).date).toBeNull();
	});

	it("takes the earliest date, not a coupon's expiry", () => {
		const receipt = read([
			"GALP",
			"SP95",
			"20,00 L x 1,80 EUR/L",
			"TOTAL 36,00 EUR",
			"2026-08-16 10:00",
			"Cupao valido ate 2026-12-31",
		]);
		expect(receipt.date?.value).toBe("2026-08-16");
	});
});

describe("charging, which is the same problem in different units", () => {
	it("reads a charging session and knows it is not petrol", () => {
		const receipt = read([
			"IONITY GmbH",
			"Charging session",
			"Energy 42,85 kWh",
			"Price 0,59 EUR/kWh",
			"Total 25,28 EUR",
			"16/08/2026 14:07",
		]);
		expect(receipt.energyMode).toBe("charge");
		expect(receipt.quantityUnit).toBe("kWh");
		expect(receipt.quantity?.value).toBe(42.85);
		expect(receipt.unitPrice?.value).toBe(0.59);
		expect(receipt.total?.value).toBe(25.28);
		expect(receipt.fuelTypeId).toBe("electric");
		expect(receipt.arithmeticChecked).toBe(true);
	});
});

describe("currencies the engine has never been told about", () => {
	it("balances a receipt with no subunit at all", () => {
		// Nothing here is in a range this file could have guessed. The volume
		// is, which is why litres are the only magnitude the engine leans on:
		// a tank holds the same number of them in Budapest as in Lisbon.
		const receipt = read([
			"MOL",
			"BENZIN 95",
			"50,00 L",
			"650,5 Ft/L",
			"OSSZESEN 32525 Ft",
			"2026.09.01",
		]);
		expect(receipt.arithmeticChecked).toBe(true);
		expect(receipt.quantity?.value).toBe(50);
		expect(receipt.unitPrice?.value).toBe(650.5);
		expect(receipt.total?.value).toBe(32525);
		expect(receipt.currency?.value).toBe("HUF");
	});
});

describe("what it does with nothing", () => {
	it("comes back empty rather than confident", () => {
		const receipt = read(["OBRIGADO", "VOLTE SEMPRE"]);
		expect(receipt.total).toBeNull();
		expect(receipt.quantity).toBeNull();
		expect(receipt.unitPrice).toBeNull();
		expect(receipt.date).toBeNull();
		expect(receipt.arithmeticChecked).toBe(false);
	});

	it("does not mind what order the lines arrive in", () => {
		// A text recogniser sorts by confidence as readily as by position, and
		// nothing in the engine may assume a receipt reads top to bottom.
		const receipt = read([
			"TOTAL 36,00 EUR",
			"01/09/2026",
			"GALP",
			"20,00 L",
			"1,80 EUR/L",
		]);
		expect(receipt.arithmeticChecked).toBe(true);
		expect(receipt.total?.value).toBe(36);
	});
});

describe("the odometer, which is nearly always handwritten", () => {
	it("takes a printed reading when the receipt labels one", () => {
		const receipt = read([
			"FLEET CARD",
			"DIESEL",
			"KM 148230",
			"45,00 L x 1,749 EUR/L",
			"TOTAL 78,71 EUR",
			"01/09/2026",
		]);
		expect(receipt.odometer?.value).toBe(148230);
	});

	it("leaves it empty rather than guess", () => {
		// An odometer that goes backwards corrupts every consumption figure
		// after it, so an unlabelled number is never one.
		expect(read(PRIO).odometer).toBeNull();
		expect(read(PLENERGY).odometer).toBeNull();
	});
});

describe("a rate column headed by a price word", () => {
	it.each([
		"PVP/L 1,659",
		"Preço/L 1,659",
		"Preco/Litro 1,659",
		"P.U./L 1,659",
		"Prix/L 1,659",
	])("reads %s as the price per litre, not as litres", (rateLine) => {
		const receipt = read([
			"GALP",
			"GASOLEO",
			"Litros 42,10",
			rateLine,
			"TOTAL 69,84 EUR",
		]);
		expect(receipt.quantity?.value).toBe(42.1);
		expect(receipt.unitPrice?.value).toBe(1.659);
		expect(receipt.arithmeticChecked).toBe(true);
	});

	it("still reads a bare unit heading as the quantity", () => {
		const receipt = read([
			"GASOLEO",
			"L 42,10",
			"EUR/L 1,659",
			"TOTAL 69,84 EUR",
		]);
		expect(receipt.quantity?.value).toBe(42.1);
		expect(receipt.arithmeticChecked).toBe(true);
	});
});

describe("a second complete triple that is not fuel", () => {
	// Fuel at 10 L x 2.000 = 20.00 and a shop item at 2 x 5.00 = 10.00 both
	// close. With the units and product names lost, nothing says which one is
	// the fill-up, so neither may come back checked.
	it.each([
		[
			"bare lines, no grand total",
			["10,00 x 2,000 20,00 EUR", "2 x 5,00 10,00 EUR"],
		],
		["shop line first", ["2 x 5,00 10,00 EUR", "10,00 x 2,000 20,00 EUR"]],
		[
			"a shop product name and a total that matches it",
			["10,00 x 2,000 20,00", "CAFE 2 x 5,00", "TOTAL 10,00 EUR"],
		],
		[
			"only the shop line complete",
			["10,00 x 2,000", "2 x 5,00 10,00", "TOTAL 10,00 EUR"],
		],
	])("stays unchecked: %s", (_name, rows) => {
		expect(read(rows).arithmeticChecked).toBe(false);
	});

	it("checks the fuel triple when its unit survives", () => {
		const receipt = read([
			"GASOLINA 95",
			"10,00 L x 2,000 EUR/L 20,00 EUR",
			"2 x 5,00 10,00 EUR",
		]);
		expect(receipt.arithmeticChecked).toBe(true);
		expect(receipt.quantity?.value).toBe(10);
		expect(receipt.total?.value).toBe(20);
	});

	it("checks a bare triple when the line above names the fuel", () => {
		const receipt = read(["GASOLEO SIMPLES", "10,00 x 2,000 20,00 EUR"]);
		expect(receipt.arithmeticChecked).toBe(true);
	});

	it("never takes a number before a multiplication sign as the total", () => {
		const receipt = read(["10,00 x 2,000 20,00 EUR", "2 x 5,00 10,00 EUR"]);
		expect(receipt.total?.value).not.toBe(10);
	});
});
