/**
 * Receipts from pumps around the world, one layout or language each: how the
 * price is written (pence, cents per litre, a tenth of a cent), which words
 * label it (Dutch, Turkish, Polish, Japanese, Korean, Chinese, Arabic), which
 * calendar dates it (the Thai Buddhist year, the Japanese era, year first) and
 * what it sells (hydrous ethanol, hydrogen, a charge with a session fee).
 *
 * Synthetic and anonymous: the stations are brands, the numbers are made up
 * and every sum is true.
 */

import { describe, expect, it } from "vitest";

import { extractReceipt } from "../src/extract.js";
import { regionDateOrder } from "../src/region.js";
import type { ScanContext } from "../src/types.js";

const NOW = new Date(2026, 9, 31);

function read(rows: readonly string[], context: ScanContext = {}) {
	return extractReceipt(
		rows.map((text, index) => ({
			text,
			box: { x: 0.06, y: 0.04 + index * 0.035, width: 0.88, height: 0.03 },
		})),
		{
			now: NOW,
			dateOrder: context.country ? regionDateOrder(context.country) : undefined,
			...context,
		},
	);
}

function summary(r: ReturnType<typeof read>) {
	return {
		quantity: r.quantity?.value ?? null,
		unitPrice: r.unitPrice?.value ?? null,
		total: r.total?.value ?? null,
		checked: r.arithmeticChecked,
	};
}

describe("prices written in hundredths", () => {
	it("reads pence per litre after @ (UK)", () => {
		const r = read(
			["Tesco", "SUPER UNLEADED E5", "40.00 L @ 155.9p", "TOTAL £62.36"],
			{ country: "GB" },
		);
		expect(summary(r)).toEqual({
			quantity: 40,
			unitPrice: 1.559,
			total: 62.36,
			checked: true,
		});
		expect(r.currency?.value).toBe("GBP");
	});

	it("reads cents per litre (AU)", () => {
		const r = read(
			["Ampol", "E10 UNLEADED", "40.00 L @ 179.9 c/L", "TOTAL $71.96"],
			{ country: "AU" },
		);
		expect(r.unitPrice?.value).toBe(1.799);
		expect(r.arithmeticChecked).toBe(true);
	});

	it("reads a ppl column", () => {
		const r = read(
			["BP", "DIESEL", "Litres 40.00", "Price 149.9 ppl", "Total £59.96"],
			{
				country: "GB",
			},
		);
		expect(r.unitPrice?.value).toBe(1.499);
		expect(r.arithmeticChecked).toBe(true);
	});

	it("leaves a bare c alone where no price stands", () => {
		const r = read(
			["Ambient 25 c", "Litres 40.00", "Price 1.499 /L", "Total £59.96"],
			{
				country: "GB",
			},
		);
		expect(r.unitPrice?.value).toBe(1.499);
	});

	it("reads pence or cents printed with no mark after @", () => {
		for (const [country, mark] of [
			["AU", "$"],
			["CA", "$"],
			["GB", "£"],
		]) {
			const r = read(["Ampol", "E10", "40.00L @ 169.9", `TOTAL ${mark}67.96`], {
				country,
			});
			expect(summary(r)).toEqual({
				quantity: 40,
				unitPrice: 1.699,
				total: 67.96,
				checked: true,
			});
		}
	});

	it("keeps an unmarked price as printed when hundredths do not close", () => {
		const r = read(["40.00L @ 169.9", "TOTAL £50.00"], { country: "GB" });
		expect(r.unitPrice?.value).toBe(169.9);
		expect(r.arithmeticChecked).toBe(false);
	});

	it("reads LTR and P/LTR on one line", () => {
		const r = read(
			["BP", "UNLEADED", "30.00 LTR 155.9 P/LTR", "TOTAL £46.77"],
			{
				country: "GB",
			},
		);
		expect(summary(r)).toEqual({
			quantity: 30,
			unitPrice: 1.559,
			total: 46.77,
			checked: true,
		});
		expect(r.date).toBeNull();
	});

	it("reads a PPL heading before the price", () => {
		const r = read(
			["BP", "UNLEADED", "LITRES 30.00", "PPL 155.9", "TOTAL £46.77"],
			{
				country: "GB",
			},
		);
		expect(summary(r)).toEqual({
			quantity: 30,
			unitPrice: 1.559,
			total: 46.77,
			checked: true,
		});
	});
});

describe("a US pump", () => {
	it("reads a $ between @ and the price", () => {
		const r = read(["Shell", "UNLEADED", "11.482 G @ $3.299", "TOTAL $37.88"], {
			country: "US",
		});
		expect(summary(r)).toEqual({
			quantity: 11.482,
			unitPrice: 3.299,
			total: 37.88,
			checked: true,
		});
	});

	it("checks the fuel amount when the total includes a car wash or a snack", () => {
		for (const extra of ["CAR WASH 8.00", "SNACKS 8.00"]) {
			const r = read(
				["Shell", "23.640 G @ 3.299", "FUEL 77.99", extra, "TOTAL $85.99"],
				{ country: "US" },
			);
			expect(summary(r)).toEqual({
				quantity: 23.64,
				unitPrice: 3.299,
				total: 77.99,
				checked: true,
			});
		}
	});

	it("joins the tenth of a cent printed small", () => {
		for (const price of ["PRICE/GAL $3.45 9", "PRICE/GAL $3.45⁹"]) {
			const r = read(["Shell", "GALLONS 12.345", price, "FUEL TOTAL $42.70"], {
				country: "US",
			});
			expect(r.unitPrice?.value).toBe(3.459);
			expect(r.arithmeticChecked).toBe(true);
		}
	});

	it("reads G for gallons and @ for the price", () => {
		const r = read(
			["Chevron", "PREMIUM 93", "11.000 G @ 4.299", "TOTAL $47.29"],
			{
				country: "US",
			},
		);
		expect(summary(r)).toEqual({
			quantity: 11,
			unitPrice: 4.299,
			total: 47.29,
			checked: true,
		});
		expect(r.quantityUnit).toBe("gallon_us");
		// 93 is an AKI grade: a product, but never a RON 95 or 98.
		expect(r.fuelTypeId).toBeNull();
		expect(r.fuelLabel?.value).toBe("PREMIUM 93");
	});
});

describe("labels beyond the six base languages", () => {
	it.each([
		[
			"NL",
			[
				"Shell",
				"Euro 95 E10",
				"Liter 40,00",
				"Prijs/L 2,099",
				"Totaal EUR 83,96",
			],
			{ quantity: 40, unitPrice: 2.099, total: 83.96 },
		],
		[
			"TR",
			[
				"Opet",
				"Kurşunsuz 95",
				"Miktar 40,00 LT",
				"Birim Fiyat 45,50 TL",
				"TOPLAM 1.820,00 TL",
			],
			{ quantity: 40, unitPrice: 45.5, total: 1820 },
		],
		[
			"PL",
			["ORLEN", "Pb95", "Ilość 40,00 l", "Cena 6,49 zł/l", "SUMA PLN 259,60"],
			{ quantity: 40, unitPrice: 6.49, total: 259.6 },
		],
		[
			"JP",
			["ENEOS", "レギュラー", "数量 35.20 L", "単価 172 円/L", "合計 6,054 円"],
			{ quantity: 35.2, unitPrice: 172, total: 6054 },
		],
		[
			"KR",
			["SK에너지", "경유", "수량 40.00 L", "단가 1,650 원", "합계 66,000 원"],
			{ quantity: 40, unitPrice: 1650, total: 66000 },
		],
		[
			"CN",
			[
				"中国石化",
				"95#汽油",
				"数量 40.00 升",
				"单价 7.85 元",
				"合计 314.00 元",
			],
			{ quantity: 40, unitPrice: 7.85, total: 314 },
		],
		[
			"AE",
			[
				"ADNOC",
				"Special 95",
				"الكمية 40.00 لتر",
				"السعر 2.58",
				"المجموع 103.20",
			],
			{ quantity: 40, unitPrice: 2.58, total: 103.2 },
		],
	] as const)("%s", (country, rows, expected) => {
		expect(summary(read(rows, { country }))).toEqual({
			...expected,
			checked: true,
		});
	});

	it("reads labels glued to their numbers", () => {
		const r = read(
			["ENEOS", "軽油", "給油量35.20ℓ", "単価172円", "合計6,054円"],
			{
				country: "JP",
			},
		);
		expect(summary(r)).toEqual({
			quantity: 35.2,
			unitPrice: 172,
			total: 6054,
			checked: true,
		});
		expect(r.fuelTypeId).toBe("diesel_simple");
		expect(r.currency?.value).toBe("JPY");
	});

	it.each([
		["IN", ["Rate 102.50 Rs/L", "Amount Rs 2,613.75"], "INR"],
		["ID", ["Harga/L Rp 10.000", "Total Rp 200.000"], "IDR"],
		["TR", ["Birim Fiyat 45,50 TL", "TOPLAM 1.820,00 TL"], "TRY"],
		["KR", ["단가 1,650 원", "합계 66,000 원"], "KRW"],
	] as const)("reads the currency a %s till prints", (country, rows, code) => {
		expect(read(rows, { country }).currency?.value).toBe(code);
	});
});

describe("calendars", () => {
	it("reads the Thai Buddhist year", () => {
		expect(read(["PTT", "31/10/2569"], { country: "TH" }).date?.value).toBe(
			"2026-10-31",
		);
	});

	it("reads the Japanese era", () => {
		for (const stamp of ["令和8年10月31日", "R8.10.31"]) {
			expect(read(["ENEOS", stamp], { country: "JP" }).date?.value).toBe(
				"2026-10-31",
			);
		}
	});

	it("reads a two-digit year first where the region writes it so", () => {
		expect(
			read(["ENEOS", "26/10/31 10:12"], { country: "JP" }).date?.value,
		).toBe("2026-10-31");
		expect(regionDateOrder("KR")).toBe("ymd");
	});
});

describe("what the pump sold", () => {
	it.each([
		["ETANOL HIDRATADO", "ethanol_e100"],
		["Etanol E85", "ethanol_e85"],
		["Wasserstoff H2", "hydrogen"],
		["水素", "hydrogen"],
		["Motorin", "diesel_simple"],
		["경유", "diesel_simple"],
		["95#汽油", "gasoline_95"],
		["Pb98", "gasoline_98"],
		["ハイオク", null],
		["Pertalite", null],
	] as const)("%s", (product, id) => {
		const r = read([product, "Litros 40,00", "PVP/L 1,800", "TOTAL 72,00 EUR"]);
		expect(r.fuelTypeId).toBe(id);
		expect(r.fuelLabel?.value).toBe(product);
	});
});

describe("an EV charge with a session fee", () => {
	it("checks the total through the fee", () => {
		const r = read([
			"IONITY",
			"Energie 42,30 kWh",
			"0,59 EUR/kWh",
			"Session fee 1,00 EUR",
			"Total 25,96 EUR",
		]);
		expect(r.fees?.value).toBe(1);
		expect(r.total?.value).toBe(25.96);
		expect(r.arithmeticChecked).toBe(true);
	});

	it("does not check a fee the total does not explain", () => {
		expect(
			read([
				"Energie 42,30 kWh",
				"0,59 EUR/kWh",
				"Session fee 2,00 EUR",
				"Total 25,96 EUR",
			]).arithmeticChecked,
		).toBe(false);
	});
});

describe("a decimal separator the recogniser dropped", () => {
	// 40,00 x 1,500 = 60,00, with both separators lost: the sum still closes
	// on 4000 x 1,500 = 6000, and arithmetic cannot tell the two apart.
	const rows = ["GASOLEO", "Litros 4000", "PVP/L 1,500", "TOTAL 6000 EUR"];

	it("is not checked when nothing can tell the readings apart", () => {
		expect(read(rows).arithmeticChecked).toBe(false);
	});

	it("is settled by the tank", () => {
		expect(summary(read(rows, { tankCapacityLitres: 60 }))).toEqual({
			quantity: 40,
			unitPrice: 1.5,
			total: 60,
			checked: true,
		});
	});

	it("still reads a tank's worth printed as it is", () => {
		expect(
			summary(
				read(["GASOLEO", "Litros 40,00", "PVP/L 1,500", "TOTAL 60,00 EUR"], {
					tankCapacityLitres: 60,
				}),
			),
		).toEqual({ quantity: 40, unitPrice: 1.5, total: 60, checked: true });
	});

	it.each([
		["the quantity", ["Litros 3852", "PVP/L 1,659", "TOTAL 63,90 EUR"]],
		["the price", ["Litros 38,52", "PVP/L 1659", "TOTAL 63,90 EUR"]],
		["the total", ["Litros 38,52", "PVP/L 1,659", "TOTAL 6390 EUR"]],
		[
			"the quantity and the total",
			["Litros 3852", "PVP/L 1,659", "TOTAL 6390 EUR"],
		],
	] as const)("is put back in %s when only one reading closes", (_, rows) => {
		expect(summary(read(["GASOLEO", ...rows]))).toEqual({
			quantity: 38.52,
			unitPrice: 1.659,
			total: 63.9,
			checked: true,
		});
	});

	it.each([
		["one", ["Litros 38,52", "PVP/L 1.659", "TOTAL 63,90 EUR"]],
		["every", ["Litros 38.52", "PVP/L 1.659", "TOTAL 63.90 EUR"]],
	] as const)("survives a comma read as a period in %s number", (_, rows) => {
		expect(summary(read(["GASOLEO", ...rows]))).toEqual({
			quantity: 38.52,
			unitPrice: 1.659,
			total: 63.9,
			checked: true,
		});
	});

	it("keeps a three-decimal currency's own decimals", () => {
		expect(
			summary(
				read(
					["KNPC", "Ultra 98", "40.000 L x 0.105 KWD/L", "Total 4.200 KWD"],
					{
						country: "KW",
					},
				),
			),
		).toEqual({ quantity: 40, unitPrice: 0.105, total: 4.2, checked: true });
	});
});
