/** Tokenize numbers while preserving printed locations and alternate readings.
 * Unit evidence and arithmetic can disambiguate candidates. Neither establishes
 * correctness by itself, so the review always permits correction.
 */

import { normalizeReceiptText } from "./format.js";
import { dateTimeRanges, overlapsAny } from "./patterns.js";
import { CURRENCY_PATTERN, receiptCurrency } from "./region.js";
import type { OcrLine, ScanContext, TextBox } from "./types.js";

/**
 * What was printed next to a number, when it says what the number measures.
 *
 * Not the number's type: `money` means a currency mark was touching it, which
 * is evidence towards a total but is equally true of the VAT line and of the
 * change from a fifty.
 */
type TokenUnit =
	| "litre"
	| "gallon"
	| "mass"
	| "volume-gas"
	| "kwh"
	| "money"
	| "per-litre"
	| "per-gallon"
	| "per-kg"
	| "per-m3"
	| "per-kwh"
	| "per-unit"
	| "percent"
	| "distance";

export interface NumberToken {
	/**
	 * Every plausible value, most likely first.
	 *
	 * One entry for a token that can only mean one thing, two when the
	 * separator convention is genuinely undecidable from the token alone.
	 */
	readings: readonly number[];
	lineIndex: number;
	box: TextBox;
	/** Everything printed before it on its line, lowercased. */
	before: string;
	/** Everything printed after it on its line, lowercased. */
	after: string;
	/** ISO 4217, when a currency mark was touching the number. */
	currency: string | null;
	unit: TokenUnit | null;
	/** True when a letter inside the number had to be read as a digit. */
	repaired: boolean;
	/**
	 * True when the number is one field of a printed date or time.
	 *
	 * `2026-08-01 20:46:14` is six numbers to a tokenizer and none of them is a
	 * quantity. Without this the solver gets to try 8 litres at 1 euro for 20,
	 * and receipts have enough real numbers on them without inventing more.
	 */
	partOfDateTime: boolean;
	/**
	 * True when a letter touches the number with no space between.
	 *
	 * `E5-TOP 95` and `NIF 501` are codes, not measurements. Only meaningful
	 * where no unit was found: `31,93L` is glued too, and it is litres.
	 */
	glued: boolean;
	/**
	 * True when the number was read off one of the recogniser's ALTERNATE
	 * transcriptions of its line rather than the one it preferred.
	 *
	 * An alternate is evidence of a lower grade - the recogniser itself
	 * thought less of it - so it enters the search at a discount and never
	 * wins a slot on its own. What it can do is complete a triple that
	 * balances, which is the one situation in which it has been checked.
	 */
	alternate: boolean;
	/** Where on its line the number sits, in characters: `[from, to)`. */
	span: { from: number; to: number };
	/**
	 * How many of the trailing `readings` were IMPLIED rather than printed.
	 *
	 * `6064` reads as 6064 from the paper and as 60,64 from the guess that a
	 * separator was lost. The guess is only ever believed when it closes the
	 * sum: it never fills a slot on its own, never seeds a derived value, and
	 * never stands in the last resort. See `readings`.
	 */
	implied: number;
}

/** Volume words, in the six base languages and their abbreviations. */
const LITRE = "l|lt|lts|ltr|lit|litro|litros|litre|litres|liter|litri";
const GALLON =
	"(?:(?:us|uk|imp(?:erial)?\\.?)\\s+)?(?:gal|gals|gallon|gallons)";
const MASS = "kg|kgs|kilogram|kilograms|kilogramme|chilogrammi";
const GAS_VOLUME = "m3|m³";
const KWH = "kwh|kw\\.h|kw h|quilowatt|kilowatt";

/** `EUR/Lit`, `€ / L`, `EUR/kWh` - a rate, and the strongest signal there is. */
const RATE_AFTER = new RegExp(
	`^[\\s]*(?:${CURRENCY_PATTERN})?\\s*\\/\\s*(${LITRE}|${GALLON}|${KWH}|${MASS}|${GAS_VOLUME})\\b`,
	"i",
);
/** A price word that can head a rate column in place of the currency: `PVP/L`, `Preço/L`. */
const PRICE_WORD =
	"pre[cç]o|precio|prix|price|preis|prezzo|pvp|p\\.?\\s?u\\.?|tarifa|tarif|rate";
/**
 * The same rate written before the value, as a column heading. Without the
 * price word, `PVP/L 1,659` would fall through to `UNIT_BEFORE`, which reads
 * the `L` as litres and the price as a quantity.
 */
const RATE_BEFORE = new RegExp(
	`(?:${CURRENCY_PATTERN}|\\b(?:${PRICE_WORD}))\\s*\\/\\s*(${LITRE}|${GALLON}|${KWH}|${MASS}|${GAS_VOLUME})\\s*[:.]?\\s*$`,
	"i",
);
/** `x 1,899` on a fuel line: a rate by position, with no unit printed at all. */
const TIMES_BEFORE = /(?:^|[\s\d])[x*×]\s*$/i;

const UNIT_AFTER = new RegExp(
	`^[\\s]*(?:(${LITRE})|(${GALLON})|(${KWH})|(${CURRENCY_PATTERN})|(%)|(km|kms|mi|mls|miles)|(${MASS})|(${GAS_VOLUME}))(?![a-zA-Z])`,
	"i",
);
const CURRENCY_BEFORE = new RegExp(`(?:${CURRENCY_PATTERN})\\s*$`, "i");
/** `Litros 15,24` - the column layout, where the unit heads its value. */
const UNIT_BEFORE = new RegExp(
	`\\b(${LITRE}|${GALLON}|${KWH}|${MASS}|${GAS_VOLUME})\\s*[:.]?\\s*$`,
	"i",
);

/**
 * A run of digits, possibly grouped.
 *
 * Interior letters are allowed because thermal print smudges `0` into `O` and
 * `1` into `l`, and a receipt is exactly the kind of paper that happens on.
 * Only interior ones: a leading or trailing letter is nearly always a real unit
 * (`31,93L`), and eating it would turn 31.93 litres into 31,931.
 */
const NUMBER_RUN =
	/\d{1,3}(?:[  ']\d{3})+(?:[.,]\d+)?|[OolIiSsBb][.,]\d[\d.,'  OolIiSsBb]*|\d[\d.,'  OolIiSsBb]*\d|\d/g;

const LETTER_TO_DIGIT: Readonly<Record<string, string>> = {
	O: "0",
	o: "0",
	l: "1",
	I: "1",
	i: "1",
	S: "5",
	s: "5",
	B: "8",
	b: "8",
};

/**
 * The values a printed token could stand for, most likely first.
 *
 * The rules, in the order they are asked:
 *
 * - Both separators present: the LAST one is the decimal point and the other
 *   groups. True in every convention there is, which is why it is first.
 * - No separator at all: the number as printed, first. Then, for a run of
 *   three to five digits, the same digits with a separator the print head
 *   may have lost - `6064` is `60,64` on a receipt whose comma did not take,
 *   and `1899` is `1,899` on the line below it. These readings are offered
 *   last and never win on their own; they exist so a total whose comma faded
 *   can still close the sum, which is the only time they are believed.
 * - One separator, and not exactly three digits after it: it is a decimal
 *   point. Nobody groups thousands into twos or fours.
 * - One separator, exactly three digits after it, one to three before: nothing
 *   in the token can settle it. Both readings come back. A comma leads because
 *   `1,899` on a fuel receipt is very much more often a price than a bill.
 * - More than one separator of the same kind: all of them group.
 *
 * Returned with how many of the trailing readings were implied.
 */
export function readings(raw: string): { values: number[]; implied: number } {
	const values = printedReadings(raw);
	const cleaned = raw.replace(/[^\d.,]/g, "");
	if (values.length === 1 && /^\d{3,5}$/.test(cleaned)) {
		const printed = values[0];
		const guesses = [printed / 100];
		if (cleaned.length === 4) guesses.push(printed / 1000);
		return { values: finite([printed, ...guesses]), implied: guesses.length };
	}
	return { values, implied: 0 };
}

function printedReadings(raw: string): number[] {
	const cleaned = raw.replace(/[   '`]/g, "");
	if (!/\d/.test(cleaned)) return [];

	const dots = (cleaned.match(/\./g) ?? []).length;
	const commas = (cleaned.match(/,/g) ?? []).length;

	if (dots > 0 && commas > 0) {
		const decimal =
			cleaned.lastIndexOf(".") > cleaned.lastIndexOf(",") ? "." : ",";
		return finite([toNumber(cleaned, decimal)]);
	}

	if (dots === 0 && commas === 0) return finite([Number(cleaned)]);

	const separator = dots > 0 ? "." : ",";
	if (dots > 1 || commas > 1) {
		return finite([Number(cleaned.split(separator).join(""))]);
	}

	const at = cleaned.indexOf(separator);
	const before = cleaned.slice(0, at);
	const after = cleaned.slice(at + 1);

	if (after.length !== 3) return finite([toNumber(cleaned, separator)]);
	if (before.length === 0 || before.length > 3) {
		return finite([toNumber(cleaned, separator)]);
	}

	// Undecidable. Both, and let the arithmetic choose.
	return finite([toNumber(cleaned, separator), Number(before + after)]);
}

function toNumber(cleaned: string, decimal: string): number {
	const grouped = decimal === "." ? "," : ".";
	return Number(cleaned.split(grouped).join("").replace(decimal, "."));
}

function finite(values: number[]): number[] {
	const out: number[] = [];
	for (const value of values) {
		if (Number.isFinite(value) && !out.includes(value)) out.push(value);
	}
	return out;
}

/** Turns interior letters back into the digits the printer meant. */
function repair(run: string): { text: string; repaired: boolean } {
	let repaired = false;
	const chars = run.split("");
	for (let index = 0; index < chars.length - 1; index += 1) {
		const digit = LETTER_TO_DIGIT[chars[index]];
		if (digit) {
			chars[index] = digit;
			repaired = true;
		}
	}
	return { text: chars.join(""), repaired };
}

/**
 * The box around characters `[from, to)` of a line.
 *
 * Word boxes when there are any: the words are walked against the line text so
 * a word's own box can be claimed by the characters it covers, and the result
 * is the union of every word the token touches. Otherwise the line box is cut
 * by character ratio, which on receipt print - near enough monospaced, by
 * design, because the tills that print them are - lands within a character or
 * two of the truth.
 */
export function boxForRange(line: OcrLine, from: number, to: number): TextBox {
	const words = line.words;
	if (words && words.length > 0) {
		const union = unionOfWordsCovering(line, words, from, to);
		if (union) return union;
	}
	const length = Math.max(line.text.length, 1);
	const start = Math.max(0, Math.min(from, length)) / length;
	const end = Math.max(0, Math.min(to, length)) / length;
	return {
		x: line.box.x + line.box.width * start,
		y: line.box.y,
		width: Math.max(line.box.width * (end - start), 0),
		height: line.box.height,
	};
}

function unionOfWordsCovering(
	line: OcrLine,
	words: readonly { text: string; box: TextBox }[],
	from: number,
	to: number,
): TextBox | null {
	let cursor = 0;
	let box: TextBox | null = null;
	for (const word of words) {
		if (word.text.length === 0) continue;
		const at = line.text.indexOf(word.text, cursor);
		if (at < 0) continue;
		cursor = at + word.text.length;
		if (at >= to || cursor <= from) continue;
		box = box ? unionBox(box, word.box) : word.box;
	}
	return box;
}

/** The smallest box containing both. */
function unionBox(a: TextBox, b: TextBox): TextBox {
	const x = Math.min(a.x, b.x);
	const y = Math.min(a.y, b.y);
	return {
		x,
		y,
		width: Math.max(a.x + a.width, b.x + b.width) - x,
		height: Math.max(a.y + a.height, b.y + b.height) - y,
	};
}

function rateKind(word: string): TokenUnit {
	if (new RegExp(`^(?:${MASS})$`, "i").test(word)) return "per-kg";
	if (new RegExp(`^(?:${GAS_VOLUME})$`, "i").test(word)) return "per-m3";
	if (new RegExp(`^(?:${KWH})$`, "i").test(word)) return "per-kwh";
	if (new RegExp(`^(?:${GALLON})$`, "i").test(word)) return "per-gallon";
	return "per-litre";
}

function plainKind(word: string): TokenUnit {
	if (new RegExp(`^(?:${MASS})$`, "i").test(word)) return "mass";
	if (new RegExp(`^(?:${GAS_VOLUME})$`, "i").test(word)) return "volume-gas";
	if (new RegExp(`^(?:${KWH})$`, "i").test(word)) return "kwh";
	if (new RegExp(`^(?:${GALLON})$`, "i").test(word)) return "gallon";
	return "litre";
}

/**
 * What the number measures, from whatever was printed beside it.
 *
 * AFTER beats BEFORE, and that ordering is the whole trick. Receipts come in
 * two layouts. Inline, the unit trails its value: `31,93 Lit x 1,899 EUR/Lit
 * 60,64 EUR`. In columns, the unit heads it: `EUR/L 1,789` on one row and
 * `Litros 15,24` on the next. Read naively the two collide, because in the
 * inline layout the `EUR/Lit` belonging to the price sits immediately BEFORE
 * the total, and 60,64 euros would be read as a price per litre.
 *
 * A unit printed before a value is therefore only believed when nothing
 * numeric stands between them - when `before` holds no digits at all. In the
 * column layout it never does; in the inline layout it always does, because
 * the value the unit really belongs to is right there in it.
 */
function unitFor(before: string, after: string): TokenUnit | null {
	const rateAfter = RATE_AFTER.exec(after);
	if (rateAfter) return rateKind(rateAfter[1] ?? "");

	const plainAfter = UNIT_AFTER.exec(after);
	if (plainAfter) {
		if (plainAfter[1]) return "litre";
		if (plainAfter[2]) return "gallon";
		if (plainAfter[3]) return "kwh";
		if (plainAfter[4]) return "money";
		if (plainAfter[5]) return "percent";
		if (plainAfter[6]) return "distance";
		if (plainAfter[7]) return "mass";
		if (plainAfter[8]) return "volume-gas";
	}

	if (/\d/.test(before)) {
		return TIMES_BEFORE.test(before) ? "per-unit" : null;
	}

	const rateBefore = RATE_BEFORE.exec(before);
	if (rateBefore) return rateKind(rateBefore[1] ?? "");

	const plainBefore = UNIT_BEFORE.exec(before);
	if (plainBefore) return plainKind(plainBefore[1] ?? "");

	if (CURRENCY_BEFORE.test(before)) return "money";
	return null;
}

/**
 * Whether two tokens are the same number on the page.
 *
 * The same line and overlapping characters, give or take one: an alternate
 * transcription of a line can be a character shorter or longer than the
 * preferred one, so a number a little to the left or right of where the
 * preferred reading put it is still that number. The solver asks this, not
 * identity, when it insists that the three terms of a sum be three different
 * numbers - or it could balance `31,93` against a second reading of itself.
 */
export function samePlace(a: NumberToken, b: NumberToken): boolean {
	if (a === b) return true;
	if (a.lineIndex !== b.lineIndex) return false;
	// The slack is for alternates only. Between two preferred readings it
	// would merge neighbours one space apart, as in `x 2,000 20,00`.
	const slack = a.alternate || b.alternate ? 2 : 0;
	return a.span.from < b.span.to + slack && b.span.from < a.span.to + slack;
}

/** The numbers in one transcription of a line. */
function tokensIn(
	text: string,
	line: OcrLine,
	lineIndex: number,
	alternate: boolean,
	context: ScanContext,
): NumberToken[] {
	const tokens: NumberToken[] = [];
	const stamps = dateTimeRanges(text);
	const lineCurrency = receiptCurrency(text, context);
	NUMBER_RUN.lastIndex = 0;
	let match = NUMBER_RUN.exec(text);
	while (match) {
		const from = match.index;
		const to = from + match[0].length;
		const { text: repairedText, repaired } = repair(match[0]);
		const { values, implied } = readings(repairedText);
		if (values.length > 0) {
			const before = text.slice(0, from);
			const after = text.slice(to);
			tokens.push({
				readings: values,
				implied,
				lineIndex,
				box: boxForRange(line, from, to),
				before: before.toLowerCase(),
				after: after.toLowerCase(),
				currency: lineCurrency,
				unit: unitFor(before, after),
				repaired,
				partOfDateTime: overlapsAny(stamps, from, to),
				glued: /[a-zà-ÿ]$/i.test(before) || /^[a-zà-ÿ]/i.test(after),
				alternate,
				span: { from, to },
			});
		}
		match = NUMBER_RUN.exec(text);
	}
	return tokens;
}

/**
 * Every number printed on the page, in reading order, with its provenance.
 *
 * The preferred transcription of each line first, then whatever the
 * recogniser's other readings of that line add: a number they place where the
 * preferred reading already put the same value is nothing new and is dropped,
 * a different value at that place is exactly what they are for. Alternates
 * have no word boxes, so their numbers are located by character ratio along
 * the line, which on receipt print is within a character or two of the truth.
 */
export function tokenize(
	lines: readonly OcrLine[],
	context: ScanContext = {},
): NumberToken[] {
	const tokens: NumberToken[] = [];
	lines.forEach((line, lineIndex) => {
		const preferred = tokensIn(
			normalizeReceiptText(line.text),
			line,
			lineIndex,
			false,
			context,
		);
		tokens.push(...preferred);
		for (const alternate of line.alternates ?? []) {
			const placed: OcrLine = { text: alternate, box: line.box };
			for (const token of tokensIn(
				normalizeReceiptText(alternate),
				placed,
				lineIndex,
				true,
				context,
			)) {
				const known = preferred.some(
					(own) =>
						samePlace(own, token) && own.readings[0] === token.readings[0],
				);
				if (!known) tokens.push(token);
			}
		}
	});
	return tokens;
}
