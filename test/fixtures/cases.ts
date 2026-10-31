import type { ReceiptReading, ScanContext } from "../../src/types.js";

type ExpectedReceipt = {
	quantity: number | null;
	unitPrice: number | null;
	total: number | null;
	currency: string | null;
	date: string | null;
	quantityUnit: ReceiptReading["quantityUnit"];
	arithmeticChecked: boolean;
};

export type ReceiptTextFixture = {
	id: string;
	source: "synthetic" | "anonymized-user-report";
	regression: string;
	redactions: readonly string[];
	context: ScanContext;
	lines: readonly string[];
	expected: ExpectedReceipt;
};

/**
 * A fictional receipt with the most common European layout: decimal commas
 * and a per-litre price in EUR.
 */
export const RECEIPT_TEXT_FIXTURES: readonly ReceiptTextFixture[] = [
	{
		id: "fictional-pt-eur-basic",
		source: "synthetic",
		regression: "decimal commas with an EUR per-litre price",
		redactions: [],
		context: {
			country: "PT",
			currency: "EUR",
			dateOrder: "dmy",
			now: new Date(2026, 8, 10),
		},
		lines: ["FUEL", "18/08/2026", "38,20 L", "1,689 EUR/L", "TOTAL 64,52 EUR"],
		expected: {
			quantity: 38.2,
			unitPrice: 1.689,
			total: 64.52,
			currency: "EUR",
			date: "2026-08-18",
			quantityUnit: "L",
			arithmeticChecked: true,
		},
	},
];
