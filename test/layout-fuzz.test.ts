/**
 * The same receipt, handed over the way different recognisers hand it over:
 * every row split at a gap between words, and the pieces in a shuffled order.
 * Whatever the order and the splits, the reading must not change. Seeded, so
 * a failure reproduces.
 */

import { describe, expect, it } from "vitest";

import { extractReceipt } from "../src/extract.js";
import type { OcrLine, ScanContext } from "../src/types.js";
import { RECEIPT_TEXT_FIXTURES } from "./fixtures/cases.js";

const NOW = new Date(2026, 9, 31);

const RECEIPTS: readonly { rows: readonly string[]; context: ScanContext }[] = [
	...RECEIPT_TEXT_FIXTURES.map((fixture) => ({
		rows: fixture.lines,
		context: fixture.context,
	})),
	{
		rows: [
			"PRIO",
			"GASOLEO SIMPLES",
			"31,93 Lit x 1,899 EUR/Lit 60,64 EUR",
			"TOTAL 60,64 EUR",
		],
		context: { now: NOW },
	},
	{
		rows: ["GALP", "GASOLEO", "Litros 38,52", "PVP/L 1,659", "TOTAL EUR 63,90"],
		context: { now: NOW },
	},
	{
		rows: [
			"REGULAR UNLD",
			"GALLONS 11.482",
			"PRICE/GAL $3.459",
			"FUEL TOTAL $39.72",
		],
		context: { now: NOW, dateOrder: "mdy" },
	},
	{
		rows: [
			"GASOLEO",
			"Litros 40,00",
			"PVP/L 1,800",
			"Desconto -4,00",
			"TOTAL 68,00 EUR",
		],
		context: { now: NOW },
	},
	{
		rows: ["IONITY", "Energia 42,30 kWh", "0,59 EUR/kWh", "Total 24,96 EUR"],
		context: { now: NOW },
	},
];

/** Mulberry32: small, seeded, and the same on every engine. */
function random(seed: number): () => number {
	let state = seed;
	return () => {
		state = (state + 0x6d2b79f5) | 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const LEFT = 0.06;
const WIDTH = 0.88;

function row(text: string, index: number, from = 0, to = text.length): OcrLine {
	const length = Math.max(text.length, 1);
	return {
		text: text.slice(from, to).trim(),
		box: {
			x: LEFT + (WIDTH * from) / length,
			y: 0.04 + index * 0.035,
			width: (WIDTH * (to - from)) / length,
			height: 0.03,
		},
	};
}

/**
 * Each row cut at one space, as a recogniser cuts at a wide gap. Never inside
 * a grouped number (`1 234,56`): a recogniser does not see a gap there.
 */
function scattered(rows: readonly string[], next: () => number): OcrLine[] {
	const pieces = rows.flatMap((text, index) => {
		const gaps = [...text.matchAll(/ /g)]
			.map((match) => match.index)
			.filter(
				(at) =>
					!(/\d/.test(text[at - 1] ?? "") && /\d/.test(text[at + 1] ?? "")),
			);
		if (gaps.length === 0 || next() < 0.3) return [row(text, index)];
		const at = gaps[Math.floor(next() * gaps.length)];
		return [row(text, index, 0, at), row(text, index, at + 1)];
	});
	for (let i = pieces.length - 1; i > 0; i -= 1) {
		const j = Math.floor(next() * (i + 1));
		[pieces[i], pieces[j]] = [pieces[j], pieces[i]];
	}
	return pieces;
}

function summary(lines: readonly OcrLine[], context: ScanContext) {
	const r = extractReceipt(lines, context);
	return {
		quantity: r.quantity?.value ?? null,
		unitPrice: r.unitPrice?.value ?? null,
		total: r.total?.value ?? null,
		arithmeticChecked: r.arithmeticChecked,
	};
}

describe("a reading does not depend on how the OCR cut and ordered the rows", () => {
	RECEIPTS.forEach(({ rows, context }, receipt) => {
		it(`receipt ${receipt + 1}: ${rows[0]}`, () => {
			const expected = summary(
				rows.map((text, index) => row(text, index)),
				context,
			);
			expect(expected.arithmeticChecked).toBe(true);
			for (let seed = 1; seed <= 25; seed += 1) {
				const lines = scattered(rows, random(seed * 7919 + receipt));
				expect({ seed, ...summary(lines, context) }).toEqual({
					seed,
					...expected,
				});
			}
		});
	});
});
