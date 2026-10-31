// Runs the built package on the oldest Node in `engines`, through import and require.
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const lines = [
	"PRIO ENERGY, S.A.",
	"E5-TOP 95",
	"31,93 Lit x 1,899 EUR/Lit 60,64 EUR",
	"TOTAL 60,64 EUR",
	"2026-08-03 14:12:09",
].map((text, index) => ({
	text,
	box: { x: 0.05, y: 0.05 + index * 0.04, width: 0.9, height: 0.03 },
}));

for (const [via, parser] of [
	["import", await import("fuel-receipt-parser")],
	["require", require("fuel-receipt-parser")],
]) {
	const reading = parser.extractReceipt(lines, { country: "PT" });
	assert.equal(reading.arithmeticChecked, true, via);
	assert.equal(reading.total?.value, 60.64, via);
	assert.equal(reading.date?.value, "2026-08-03", via);
	console.log(`${via}: ok`);
}
