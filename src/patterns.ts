/**
 * The shapes a date or a time takes on a receipt.
 *
 * Its own file so that both halves of the engine can use it without importing
 * each other: `numbers.ts` needs to know which characters belong to a
 * timestamp so it can stop offering `08` as a plausible number of litres, and
 * `dates.ts` needs to read the timestamp itself.
 */

/**
 * Every printed date layout, most specific first.
 *
 * ISO leads because it is unambiguous and because every till that prints one
 * prints it correctly. The two-digit forms that follow are the ones that
 * cannot be told apart from the paper alone: `08/09/2026` is the ninth of
 * August in Denver and the eighth of September in Lisbon, and the receipt does
 * not say which side of the Atlantic it was printed on. `dates.ts` resolves
 * those, and not by guessing.
 */
export const DATE_PATTERNS: readonly RegExp[] = [
	// 令和8年10月31日, R8.10.31: the Japanese era, in its eighth year in 2026
	/(?<![A-Za-z])(令和|R)\s?(\d{1,2})[年./-](\d{1,2})[月./-](\d{1,2})日?/g,
	// 2026-08-01, 2026/08/01
	/\b(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})(?:日|\b)/g,
	// 01-08-2026, 01/08/26, 1.8.2026
	/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/g,
	// 01 AGO 2026, 1 Aug 26, 01-SEP-2026
	/\b(\d{1,2})\.?[\s-]([a-zà-ÿ]{3,12})\.?[\s-](\d{2,4})\b/gi,
	// AUG 01, 2026
	/\b([a-zà-ÿ]{3,12})\.?\s(\d{1,2}),?\s(\d{4})\b/gi,
];

/** `20:46:14`, `23:23`, `8:05 PM`. */
export const TIME_PATTERN =
	/\b(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]\.?m\.?)?/gi;

interface CharRange {
	from: number;
	to: number;
}

/** Character ranges on a line that belong to a printed date or time. */
export function dateTimeRanges(text: string): CharRange[] {
	const ranges: CharRange[] = [];
	for (const pattern of [...DATE_PATTERNS, TIME_PATTERN]) {
		pattern.lastIndex = 0;
		let match = pattern.exec(text);
		while (match) {
			ranges.push({ from: match.index, to: match.index + match[0].length });
			match = pattern.exec(text);
		}
	}
	return ranges;
}

/** Whether `[from, to)` overlaps any of the ranges. */
export function overlapsAny(
	ranges: readonly CharRange[],
	from: number,
	to: number,
): boolean {
	return ranges.some((range) => from < range.to && to > range.from);
}
