/**
 * When the receipt says it was printed.
 *
 * `08/09/2026` is the ninth of August in Denver and the eighth of September in
 * Lisbon, and nothing on the paper says which. This is the one field on a
 * receipt that can be read perfectly and still be wrong by a month, so it gets
 * its own file and its own rules.
 *
 * The order of the rules, and none of them is a guess about where the reader
 * lives:
 *
 * 1. A four-digit year in front settles everything. ISO is ISO.
 * 2. A component over twelve is the day. Half of all ambiguous dates settle
 *    themselves this way, and on the days they do not the receipt is often
 *    printed alongside another date that does.
 * 3. A month spelled in letters settles it, in any of the six languages the
 *    app speaks plus English.
 * 4. ANOTHER date on the same receipt that settled itself by rule 2 fixes the
 *    order for all of them. Tills do not change format halfway down a roll.
 * 5. Only then, the tiebreak: of the two readings, the later one that is not in
 *    the future. Not because day-first is more common - it is, but that is a
 *    fact about Europe, not about this reader - but because a receipt gets
 *    scanned soon after it is printed, so the reading nearer to today is nearer
 *    to right. It is the weakest rule here and it is deliberately last.
 *
 * The day comes back as `YYYY-MM-DD` text, never as a `Date`: a receipt's date
 * is a square on a calendar, not an instant, and a `Date` would move it to the
 * day before or after in any time zone but the one it was parsed in.
 */

import { normalizeReceiptText } from "./format.js";
import { boxForRange } from "./numbers.js";
import { DATE_PATTERNS, TIME_PATTERN } from "./patterns.js";
import type { FieldSource, OcrLine, ScannedField } from "./types.js";

/** Month names by prefix, in the six app languages and English. */
const MONTH_PREFIXES: readonly (readonly [string, number])[] = [
	["jan", 1],
	["gen", 1],
	["ene", 1],
	["janv", 1],
	["feb", 2],
	["fev", 2],
	["febr", 2],
	["mar", 3],
	["mär", 3],
	["mrz", 3],
	["marz", 3],
	["apr", 4],
	["abr", 4],
	["avr", 4],
	["may", 5],
	["mai", 5],
	["mag", 5],
	["maio", 5],
	["mayo", 5],
	["jun", 6],
	["juin", 6],
	["giu", 6],
	["jul", 7],
	["juil", 7],
	["lug", 7],
	["aug", 8],
	["ago", 8],
	["aou", 8],
	["août", 8],
	["sep", 9],
	["set", 9],
	["sett", 9],
	["sept", 9],
	["oct", 10],
	["out", 10],
	["okt", 10],
	["ott", 10],
	["nov", 11],
	["dec", 12],
	["dez", 12],
	["dic", 12],
	["déc", 12],
];

/** How far back a printed date is still believable. */
const MAX_AGE_YEARS = 10;
/** How far forward, in days, allowing for a till with a drifting clock. */
const MAX_AHEAD_DAYS = 2;

interface DateHit {
	lineIndex: number;
	from: number;
	to: number;
	/** Filled in when the layout settled itself. */
	day: number | null;
	month: number | null;
	year: number | null;
	/** Both readings, when only the order is unknown. */
	ambiguous: { a: number; b: number; year: number } | null;
	/**
	 * The layout this hit PROVES, when it proves one.
	 *
	 * Only a numeric date that settled itself on a component over twelve says
	 * anything about the till's convention. An ISO date says nothing (every
	 * till prints ISO the same way) and a spelled month says nothing (there is
	 * no order to get wrong). Set on those and rule 4 would spread a fact that
	 * was never established.
	 */
	proves: "dmy" | "mdy" | null;
}

function monthFromName(word: string): number | null {
	const folded = word.toLowerCase().replace(/\.$/, "");
	let best: number | null = null;
	let bestLength = 0;
	for (const [prefix, month] of MONTH_PREFIXES) {
		if (folded.startsWith(prefix) && prefix.length > bestLength) {
			best = month;
			bestLength = prefix.length;
		}
	}
	return best;
}

/**
 * Two digits become a year in this century, which tills have printed since.
 * A year past 2400 is the Thai Buddhist calendar (2569 is 2026), which is
 * 543 years ahead and is no year a receipt could otherwise carry.
 */
function fullYear(value: number): number {
	if (value >= 2400 && value < 2800) return value - 543;
	if (value >= 1000) return value;
	return value >= 70 ? 1900 + value : 2000 + value;
}

function isRealDate(year: number, month: number, day: number): boolean {
	if (month < 1 || month > 12 || day < 1 || day > 31) return false;
	const probe = new Date(year, month - 1, day);
	return probe.getMonth() === month - 1 && probe.getDate() === day;
}

/** `YYYY-MM-DD`, built as text so no zone can move it. */
function toDay(year: number, month: number, day: number): string {
	return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function withinWindow(day: string, now: Date): boolean {
	const latest = new Date(now);
	latest.setDate(latest.getDate() + MAX_AHEAD_DAYS);
	const earliest = new Date(now);
	earliest.setFullYear(earliest.getFullYear() - MAX_AGE_YEARS);
	const asDay = (date: Date) =>
		toDay(date.getFullYear(), date.getMonth() + 1, date.getDate());
	return day <= asDay(latest) && day >= asDay(earliest);
}

/** Every date-shaped run on the page, with its layout resolved as far as it can be. */
function collect(lines: readonly OcrLine[], yearFirst: boolean): DateHit[] {
	const hits: DateHit[] = [];
	lines.forEach((line, lineIndex) => {
		for (const pattern of DATE_PATTERNS) {
			pattern.lastIndex = 0;
			let match = pattern.exec(line.text);
			while (match) {
				const hit = embeddedInLongerRun(line.text, match)
					? null
					: interpret(match, lineIndex, yearFirst);
				if (hit && !hits.some((other) => overlaps(other, hit))) hits.push(hit);
				match = pattern.exec(line.text);
			}
		}
	});
	return hits;
}

/**
 * Whether a date-shaped match is only a slice of a longer run of digit groups.
 *
 * A French phone number, `04.93.45.12.34`, holds `04.93.45` at its start, and
 * a date pattern happily takes it. It is not a date, and read as one it is
 * worse than noise: `93` over twelve would "prove" month-first for every real
 * date on the page. A printed date stands on its own, so a separator and a
 * digit touching either end of the match means the match is part of
 * something else.
 */
function embeddedInLongerRun(text: string, match: RegExpExecArray): boolean {
	const before = text.slice(0, match.index);
	const after = text.slice(match.index + match[0].length);
	return /\d[-/.]$/.test(before) || /^[-/.]\d/.test(after);
}

function overlaps(a: DateHit, b: DateHit): boolean {
	return a.lineIndex === b.lineIndex && a.from < b.to && a.to > b.from;
}

function interpret(
	match: RegExpExecArray,
	lineIndex: number,
	yearFirst: boolean,
): DateHit | null {
	const [whole, one, two, three, four] = match;
	const base = { lineIndex, from: match.index, to: match.index + whole.length };

	// 令和8年10月31日: Reiwa began in 2019, its first year.
	if (one === "令和" || one === "R") {
		return {
			...base,
			day: Number(four),
			month: Number(three),
			year: 2018 + Number(two),
			ambiguous: null,
			proves: null,
		};
	}

	// AUG 01, 2026
	const leadingMonth = monthFromName(one);
	if (leadingMonth && /[a-zà-ÿ]/i.test(one)) {
		return {
			...base,
			day: Number(two),
			month: leadingMonth,
			year: fullYear(Number(three)),
			ambiguous: null,
			proves: null,
		};
	}

	// 01 AGO 2026
	const namedMonth = monthFromName(two);
	if (namedMonth && /[a-zà-ÿ]/i.test(two)) {
		return {
			...base,
			day: Number(one),
			month: namedMonth,
			year: fullYear(Number(three)),
			ambiguous: null,
			proves: null,
		};
	}

	// 2026-08-01, and 2569-10-31 on a Thai till
	if (one.length === 4) {
		return {
			...base,
			day: Number(three),
			month: Number(two),
			year: fullYear(Number(one)),
			ambiguous: null,
			proves: null,
		};
	}

	// 26/10/31 where the region writes the year first. Only by region: the
	// same digits are the 26th of October 2031 in Lisbon.
	if (
		yearFirst &&
		one.length === 2 &&
		three.length === 2 &&
		/^\d+$/.test(two)
	) {
		return {
			...base,
			day: Number(three),
			month: Number(two),
			year: fullYear(Number(one)),
			ambiguous: null,
			proves: null,
		};
	}

	const a = Number(one);
	const b = Number(two);
	const year = fullYear(Number(three));
	if (!Number.isFinite(a) || !Number.isFinite(b)) return null;

	// A component over twelve can only be the day, and settles the layout.
	if (a > 12 && b <= 12) {
		return { ...base, day: a, month: b, year, ambiguous: null, proves: "dmy" };
	}
	if (b > 12 && a <= 12) {
		return { ...base, day: b, month: a, year, ambiguous: null, proves: "mdy" };
	}
	if (a > 12 && b > 12) return null;

	return {
		...base,
		day: null,
		month: null,
		year: null,
		ambiguous: { a, b, year },
		proves: null,
	};
}

/** The day a receipt was printed, and how sure we are of it. */
export function readDate(
	lines: readonly OcrLine[],
	now: Date,
	regionOrder?: "dmy" | "mdy" | "ymd",
): ScannedField<string> | null {
	lines = lines.map((line) => ({
		...line,
		text: normalizeReceiptText(line.text),
	}));
	const ignored =
		/member since|loyalty|valid|expir|warranty|adesao|adesão|fidelidade|validade|vencimento|caducidad|garantie|gultig|gültig|scadenza/i;
	const hits = collect(lines, regionOrder === "ymd").filter(
		(hit) => !ignored.test(lines[hit.lineIndex].text),
	);
	if (hits.length === 0) return null;

	// Rule 4: a sibling that settled itself fixes the layout for the rest. Only
	// where every proof agrees - a receipt printing both orders is a receipt
	// that has taught us nothing.
	//
	// A proof has to be a date first. `04/93/45` settles "month first" on paper
	// and is no day of any calendar, so a hit that does not come out as a real
	// day inside the believable window proves nothing about the till.
	const proofs = new Set(
		hits
			.filter(
				(hit) =>
					hit.proves !== null &&
					hit.day !== null &&
					hit.month !== null &&
					hit.year !== null &&
					isRealDate(hit.year, hit.month, hit.day) &&
					withinWindow(toDay(hit.year, hit.month, hit.day), now),
			)
			.map((hit) => hit.proves),
	);
	const proven = proofs.size === 1 ? proofs.has("dmy") : null;
	// Rule 5a: where the paper proves nothing, the reader's own region is the
	// best evidence there is. It is still evidence about the READER and not
	// about the till, so it never overrides a proof, and a date resolved this
	// way says so in its confidence.
	const dayFirst =
		proven ??
		(regionOrder === "dmy" ? true : regionOrder === "mdy" ? false : null);
	const byRegion = proven === null && regionOrder !== undefined;

	const readings: { day: string; confidence: number; hit: DateHit }[] = [];
	for (const hit of hits) {
		if (hit.day !== null && hit.month !== null && hit.year !== null) {
			if (!isRealDate(hit.year, hit.month, hit.day)) continue;
			const day = toDay(hit.year, hit.month, hit.day);
			if (!withinWindow(day, now)) continue;
			readings.push({ day, confidence: 0.98, hit });
			continue;
		}
		const pair = hit.ambiguous;
		if (!pair) continue;

		const candidates: string[] = [];
		if (dayFirst !== false && isRealDate(pair.year, pair.b, pair.a)) {
			candidates.push(toDay(pair.year, pair.b, pair.a));
		}
		if (dayFirst !== true && isRealDate(pair.year, pair.a, pair.b)) {
			const other = toDay(pair.year, pair.a, pair.b);
			if (!candidates.includes(other)) candidates.push(other);
		}
		const usable = candidates.filter((day) => withinWindow(day, now));
		if (usable.length === 0) continue;

		// Rule 5b, and only here: the later reading that is not in the future.
		usable.sort((left, right) => (left < right ? 1 : -1));
		readings.push({
			day: usable[0],
			confidence: usable.length === 1 ? (byRegion ? 0.8 : 0.9) : 0.6,
			hit,
		});
	}

	if (readings.length === 0) return null;

	// Prefer a named transaction date, then a date beside a clock. Keep page order on ties.
	const dateScore = (hit: DateHit) => {
		const text = lines[hit.lineIndex].text;
		return (
			(/transaction|purchase|issued|emissao|emissão|compra|data|date|fecha|datum|data documento/i.test(
				text,
			)
				? 4
				: 0) + (/\d{1,2}:\d{2}/.test(text) ? 2 : 0)
		);
	};
	readings.sort(
		(a, b) =>
			dateScore(b.hit) - dateScore(a.hit) || a.hit.lineIndex - b.hit.lineIndex,
	);
	const chosen = readings[0];
	return {
		value: chosen.day,
		confidence: chosen.confidence,
		source: sourceOf(lines, chosen.hit),
	};
}

function sourceOf(lines: readonly OcrLine[], hit: DateHit): FieldSource {
	return {
		lineIndex: hit.lineIndex,
		box: boxForRange(lines[hit.lineIndex], hit.from, hit.to),
	};
}

/** The wall-clock time printed on the receipt, `HH:mm`. */
export function readTime(
	lines: readonly OcrLine[],
	dateLine?: number,
): ScannedField<string> | null {
	const indices = lines
		.map((_, index) => index)
		.sort((a, b) =>
			dateLine === undefined
				? a - b
				: Math.abs(a - dateLine) - Math.abs(b - dateLine),
		);
	for (const lineIndex of indices) {
		const line = lines[lineIndex];
		if (/duration|duracao|duração|dauer|durata|elapsed/i.test(line.text))
			continue;
		TIME_PATTERN.lastIndex = 0;
		let match = TIME_PATTERN.exec(line.text);
		while (match) {
			const meridiem = match[4]?.toLowerCase().replace(/\./g, "") ?? "";
			let hours = Number(match[1]);
			const minutes = Number(match[2]);
			if (meridiem === "pm" && hours < 12) hours += 12;
			if (meridiem === "am" && hours === 12) hours = 0;
			if (hours <= 23 && minutes <= 59) {
				return {
					value: `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`,
					confidence: 0.95,
					source: {
						lineIndex,
						box: boxForRange(line, match.index, match.index + match[0].length),
					},
				};
			}
			match = TIME_PATTERN.exec(line.text);
		}
	}
	return null;
}
