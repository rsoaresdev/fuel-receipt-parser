import { describe, expect, it } from "vitest";

import { extractReceipt } from "../src/extract.js";
import type { OcrLine } from "../src/types.js";
import { RECEIPT_TEXT_FIXTURES } from "./fixtures/cases.js";

function page(rows: readonly string[]): OcrLine[] {
	return rows.map((text, index) => ({
		text,
		box: { x: 0.06, y: 0.04 + index * 0.08, width: 0.88, height: 0.05 },
	}));
}

describe("receipt scan text fixtures", () => {
	for (const fixture of RECEIPT_TEXT_FIXTURES) {
		it(fixture.id, () => {
			const receipt = extractReceipt(page(fixture.lines), fixture.context);

			expect({
				quantity: receipt.quantity?.value ?? null,
				unitPrice: receipt.unitPrice?.value ?? null,
				total: receipt.total?.value ?? null,
				currency: receipt.currency?.value ?? null,
				date: receipt.date?.value ?? null,
				quantityUnit: receipt.quantityUnit,
				arithmeticChecked: receipt.arithmeticChecked,
			}).toEqual(fixture.expected);
		});
	}
});
