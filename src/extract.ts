/** Receipt extraction keeps printed evidence separate from calculated costs.
 * A matching product is useful corroboration, not a guarantee of correct OCR.
 * Totals are references only and never manufacture missing quantity or price.
 */
import { currencyDecimals } from "./currencies.js";
import { readDate, readTime } from "./dates.js";
import { normalizeReceiptText } from "./format.js";
import {
	brandIn,
	fuelTypeIdFor,
	looksLikeProduct,
	names,
	namesSomethingElse,
} from "./labels.js";
import { type NumberToken, samePlace, tokenize } from "./numbers.js";
import { countryCurrency, receiptCurrency, regionDateOrder } from "./region.js";
import type {
	EnergyMode,
	FieldSource,
	OcrLine,
	ReceiptReading,
	ReceiptUnit,
	ScanContext,
	ScannedField,
} from "./types.js";

/** The three unknowns. */
type Slot = "quantity" | "unitPrice" | "total";

interface Candidate {
	value: number;
	token: NumberToken;
	/** Everything but the arithmetic: labels, units, magnitude, neighbours. */
	score: number;
	/**
	 * True when the value is a guess at a separator the print head lost.
	 *
	 * Admitted to the balanced search and nowhere else: a guessed decimal
	 * that closes the sum was checked by the arithmetic, and one that does
	 * not was never on the paper.
	 */
	implied: boolean;
}

/** Half the printed currency quantum, plus floating point slack. */
function tolerance(total: number, currency = "EUR"): number {
	return (
		0.5 * 10 ** -currencyDecimals(currency) +
		Number.EPSILON * Math.max(1, Math.abs(total)) * 8
	);
}

/** How many candidates per slot the search considers. */
const SEARCH_WIDTH = 20;

/**
 * Longer than any label a till prints. A word further back on the same line
 * labels something else, and scanning it would make a long line cost as much
 * per number as the whole line.
 */
const LABEL_REACH = 64;

/** The label nearest a number: what precedes it, else the start of its line. */
function contextFor(token: NumberToken, lines: readonly OcrLine[]): string {
	const before = token.before.trim();
	return before.length > 0
		? before.slice(-LABEL_REACH)
		: lines[token.lineIndex].text.slice(0, LABEL_REACH);
}

/**
 * How well a number fits a slot, before any arithmetic is done.
 *
 * A prior, not a verdict. It exists to order the search - to put the number
 * beside the word `Total` ahead of the one beside the pump number - and the
 * arithmetic can corroborate evidence but cannot create an unlabelled field.
 */
function priorFor(
	slot: Slot,
	value: number,
	token: NumberToken,
	lines: readonly OcrLine[],
	fallbackCurrency: string | null,
): number {
	if (value < 0 || (slot !== "total" && value === 0) || value > 99_999_999)
		return -Infinity;
	// A currency with no minor unit - the yen, the Chilean peso, the won - has
	// no cents to print. `32.437` on a Chilean receipt is thirty-two thousand
	// pesos with a grouping dot, and `5428` is never fifty-four yen and change,
	// however well the implied separator closes the sum.
	const wholeMoney =
		currencyDecimals(token.currency ?? fallbackCurrency ?? "EUR") === 0;
	if (slot === "total" && wholeMoney && !Number.isInteger(value))
		return -Infinity;
	if (/[-−]\s*[\p{Sc}]?\s*$/u.test(token.before)) return -Infinity;
	const label = contextFor(token, lines);
	if (token.unit === "percent" || token.unit === "distance") return -Infinity;
	if (namesSomethingElse(label) && !names(slot, label)) return -Infinity;
	const quantityUnits = ["litre", "gallon", "kwh", "mass", "volume-gas"];
	const rate = token.unit?.startsWith("per-") ?? false;
	let score = 0;
	if (slot === "quantity") {
		if (value > 99_999 || rate || token.unit === "money") return -Infinity;
		if (quantityUnits.includes(token.unit ?? "")) score += 1;
		if (names("quantity", label)) score += 0.7;
		if (/^\s*[x×*]/.test(token.after)) score += 0.65;
		if (
			!quantityUnits.includes(token.unit ?? "") &&
			(names("total", label) || names("unitPrice", label))
		)
			return -Infinity;
	} else if (slot === "unitPrice") {
		if (value > 99_999 || quantityUnits.includes(token.unit ?? ""))
			return -Infinity;
		if (rate) score += 1;
		// A price per litre may carry a decimal even in such a currency (Iceland
		// prices fuel to the tenth of a krona), so it is only discounted, never
		// refused: enough to put `1580` ahead of `1.58` on a Chilean pump.
		if (wholeMoney && !Number.isInteger(value)) score -= 0.1;
		if (names("unitPrice", label)) score += 0.7;
		if (!rate && (names("total", label) || names("quantity", label)))
			return -Infinity;
	} else {
		if (quantityUnits.includes(token.unit ?? "") || rate) return -Infinity;
		// `10,00 x 2,000` multiplies: the number before the sign is a quantity.
		if (/^\s*[x×*]/.test(token.after)) return -Infinity;
		if (names("total", label)) score += 1;
		if (token.unit === "money" || token.currency) score += 0.4;
		if (/subtotal|sub total|netto|neto|liquido|base/i.test(label)) score -= 0.6;
	}
	if (score < 0.35) return -Infinity;
	if (token.glued && token.unit === null) score -= 0.1;
	if (token.repaired) score -= 0.1;
	if (token.alternate) score -= 0.2;
	return score;
}

/**
 * Every reading of every number, ranked for one slot.
 *
 * A token with two readings enters twice, which is exactly how the decimal
 * ambiguity gets resolved: `1,899` competes as both one-point-nine and as
 * eighteen hundred, and only one of them can be part of a triple that balances.
 */
function candidatesFor(
	slot: Slot,
	tokens: readonly NumberToken[],
	lines: readonly OcrLine[],
	fallbackCurrency: string | null,
): Candidate[] {
	const out: Candidate[] = [];
	for (const token of tokens) {
		token.readings.forEach((value, rank) => {
			const score = priorFor(slot, value, token, lines, fallbackCurrency);
			if (!Number.isFinite(score)) return;
			// A token's second reading is its less likely one; break the tie
			// towards the first without letting it outweigh any real evidence.
			out.push({
				value,
				token,
				score:
					score -
					rank * 0.05 +
					Math.max(0, Math.min(1, lines[token.lineIndex].confidence ?? 0)) *
						0.02,
				implied: rank >= token.readings.length - token.implied,
			});
		});
	}
	out.sort((left, right) => right.score - left.score);
	return out.slice(0, SEARCH_WIDTH);
}

interface Solution {
	quantity: Candidate | null;
	unitPrice: Candidate | null;
	total: Candidate | null;
	/** True only when three READ numbers multiplied out. */
	balanced: boolean;
}

function balances(
	quantity: Candidate,
	price: Candidate,
	total: Candidate,
	fallbackCurrency: string | null,
): boolean {
	return (
		Math.abs(quantity.value * price.value - total.value) <=
		tolerance(total.value, total.token.currency ?? fallbackCurrency ?? "EUR")
	);
}

function solve(
	quantities: readonly Candidate[],
	prices: readonly Candidate[],
	totals: readonly Candidate[],
	fallbackCurrency: string | null,
): Solution {
	// Keep the strongest printed total as reference even when a subtotal balances.
	const printedTotal =
		totals.find((c) => !c.implied && !c.token.alternate) ?? null;
	let best: Solution | null = null;
	let bestScore = -Infinity;
	for (const q of quantities)
		for (const p of prices) {
			if (samePlace(q.token, p.token)) continue;
			const t = printedTotal;
			const balanced =
				!!t &&
				!samePlace(t.token, q.token) &&
				!samePlace(t.token, p.token) &&
				balances(q, p, t, fallbackCurrency);
			if (
				(q.implied || p.implied || q.token.alternate || p.token.alternate) &&
				!balanced
			)
				continue;
			const score = q.score + p.score + (balanced ? 1 : 0);
			if (score <= bestScore) continue;
			bestScore = score;
			best = {
				quantity: q,
				unitPrice: p,
				total: t,
				balanced,
			};
		}
	// An alternate total may repair one misread digit, but must clear the same label floor.
	for (const q of quantities)
		for (const p of prices)
			for (const t of totals) {
				if (!t.token.alternate && !t.implied) continue;
				if (
					samePlace(q.token, p.token) ||
					samePlace(q.token, t.token) ||
					samePlace(p.token, t.token)
				)
					continue;
				if (!balances(q, p, t, fallbackCurrency)) continue;
				const score =
					q.score + p.score + t.score + 1 - (printedTotal?.score ?? 0);
				if (score <= bestScore) continue;
				bestScore = score;
				best = {
					quantity: q,
					unitPrice: p,
					total: t,
					balanced: true,
				};
			}
	if (best) return best;
	const quantity =
		quantities.find((c) => !c.implied && !c.token.alternate) ?? null;
	const unitPrice =
		prices.find(
			(c) =>
				!c.implied &&
				!c.token.alternate &&
				(!quantity || !samePlace(c.token, quantity.token)),
		) ?? null;
	const total =
		printedTotal &&
		(!quantity || !samePlace(printedTotal.token, quantity.token)) &&
		(!unitPrice || !samePlace(printedTotal.token, unitPrice.token))
			? printedTotal
			: null;
	return { quantity, unitPrice, total, balanced: false };
}

const FUEL_QUANTITY_UNITS = ["litre", "gallon", "kwh", "mass", "volume-gas"];

/**
 * Whether the paper says the solved triple is fuel or energy: a volume, mass
 * or kWh unit on the quantity, a per-unit rate on the price, or a fuel named
 * on the triple's line or the line above it.
 */
function measuresFuel(
	quantity: NumberToken | undefined,
	rate: NumberToken | undefined,
	lines: readonly OcrLine[],
): boolean {
	if (quantity?.unit && FUEL_QUANTITY_UNITS.includes(quantity.unit))
		return true;
	if (rate?.unit?.startsWith("per-") && rate.unit !== "per-unit") return true;
	const lineIndexes = new Set<number>();
	for (const token of [quantity, rate]) {
		if (!token) continue;
		lineIndexes.add(token.lineIndex);
		if (token.lineIndex > 0) lineIndexes.add(token.lineIndex - 1);
	}
	for (const index of lineIndexes) {
		const line = lines[index];
		if (line && fuelTypeIdFor(line.text) !== null) return true;
	}
	return false;
}

function sourceOf(token: NumberToken): FieldSource {
	return { lineIndex: token.lineIndex, box: token.box };
}

function fieldFrom(
	candidate: Candidate | null,
	balanced: boolean,
): ScannedField<number> | null {
	if (!candidate) return null;
	const confidence = balanced
		? 0.9
		: Math.max(0.25, Math.min(0.75, 0.4 + candidate.score * 0.2));
	return {
		value: candidate.value,
		confidence,
		source: sourceOf(candidate.token),
	};
}

/**
 * Whether the paper is about litres or about kilowatt-hours.
 *
 * Decided before anything else, because it changes what every later rule is
 * looking for. Weighted rather than a first-match, since a charging receipt
 * from a petrol company's network mentions litres nowhere but does mention the
 * petrol company.
 */
function energyModeOf(
	lines: readonly OcrLine[],
	tokens: readonly NumberToken[],
): EnergyMode {
	let charge = 0;
	let fuel = 0;
	for (const token of tokens) {
		if (token.unit === "kwh" || token.unit === "per-kwh") charge += 3;
		if (
			token.unit === "litre" ||
			token.unit === "gallon" ||
			token.unit === "per-litre" ||
			token.unit === "per-gallon"
		) {
			fuel += 3;
		}
	}
	for (const line of lines) {
		if (
			/\bkwh\b|carregament|recarga|ricarica|recharg|ladevorgang|charging|charge point|supercharger/i.test(
				line.text,
			)
		) {
			charge += 2;
		}
		if (
			/\blitro|litre|liter|litri|gasole|gasoil|gazole|diesel|gasolin|benzin|essence|unleaded|petrol|sem chumbo/i.test(
				line.text,
			)
		) {
			fuel += 2;
		}
	}
	return charge > fuel ? "charge" : "fuel";
}

/** The currency the receipt is denominated in, when its marks agree. */
function currencyOf(
	lines: readonly OcrLine[],
	context: ScanContext,
): ScannedField<string> | null {
	const found = new Map<string, number>();
	lines.forEach((line, index) => {
		const code = receiptCurrency(line.text, context);
		if (code) found.set(code, index);
	});
	if (found.size !== 1) return null;
	const [value, lineIndex] = [...found][0];
	return {
		value,
		confidence: 0.85,
		source: { lineIndex, box: lines[lineIndex].box },
	};
}

/** The printed product name, from the line that names a fuel and nothing else. */
function productOf(lines: readonly OcrLine[]): ScannedField<string> | null {
	for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
		const text = lines[lineIndex].text.trim();
		if (!looksLikeProduct(text)) continue;
		return {
			value: text,
			confidence: 0.85,
			source: { lineIndex, box: lines[lineIndex].box },
		};
	}
	return null;
}

/**
 * The station, looked for in the header.
 *
 * The top third of the page only. A brand name in the footer is the fuel card
 * scheme, the loyalty programme or the company that printed the paper, and
 * naming the place after one of those would be worse than leaving it blank.
 */
function placeOf(
	lines: readonly OcrLine[],
	brands: readonly string[] | undefined,
): ScannedField<string> | null {
	const header = Math.ceil(lines.length / 3);
	for (let lineIndex = 0; lineIndex < header; lineIndex += 1) {
		const line = lines[lineIndex];
		if (names("total", line.text) && /\d/.test(line.text)) continue;
		const brand = brandIn(line.text, brands);
		if (!brand) continue;
		return {
			value: brand,
			confidence: 0.8,
			source: { lineIndex, box: line.box },
		};
	}
	return null;
}

/** An odometer named in words, not by the bare unit a road marker shares. */
const ODOMETER_WORD =
	/odomet|odómet|kilomet|quilomet|quilómet|chilomet|conta-quil|mileage|kmstand|tachostand/i;

/** A line that names a road: the words, or a designation like `A-4` or `N-IV`. */
const ROAD_MARKER =
	/\b(?:autovia|autovía|autopista|autostrada|autoestrada|autobahn|carretera|ctra|estrada|rodovia|strada|route|highway|hwy|salida|saída|uscita|ausfahrt|sortie|exit|pk)\b|\b(?:A|AP|N|E|M|IC|IP|EN|SS|RN|BR|CR|D|B)-(?:\d{1,3}|[IVX]{1,5})\b/i;

/**
 * A printed odometer reading, and only a printed one.
 *
 * Fleet-card receipts print the reading the driver keyed at the pump. Everybody
 * else writes it on the back in biro, and handwriting is not what this engine
 * reads. So the bar is high: a whole number, labelled in so many words, with a
 * plausible magnitude. Anything less and the field stays empty, which is the
 * right answer, because an odometer that goes backwards corrupts every
 * consumption figure after it.
 */
function odometerOf(
	tokens: readonly NumberToken[],
	lines: readonly OcrLine[],
): ScannedField<number> | null {
	const header = Math.ceil(lines.length / 3);
	for (const token of tokens) {
		const label = contextFor(token, lines);
		if (!names("odometer", label)) {
			continue;
		}
		// `KM 245` in a station's address is a road marker, not a reading: a
		// motorway station is named by where it stands on the road. So a bare
		// `km` never counts on a line that names a road, nor in the header where
		// the address lives. A label that says odometer in so many words still
		// counts anywhere.
		const text = lines[token.lineIndex].text;
		if (
			!ODOMETER_WORD.test(label) &&
			(ROAD_MARKER.test(text) || token.lineIndex < header)
		) {
			continue;
		}
		const value =
			token.readings.find(
				(v) => Number.isInteger(v) && v >= 100 && v <= 2_000_000,
			) ?? 0;
		if (!Number.isInteger(value) || value < 100 || value > 2_000_000) continue;
		return { value, confidence: 0.7, source: sourceOf(token) };
	}
	return null;
}

/** Read a receipt. The lines may arrive in any order; nothing here assumes one. */
export function extractReceipt(
	lines: readonly OcrLine[],
	context: ScanContext = {},
): ReceiptReading {
	lines = lines.slice(0, 500).map((line) => ({
		...line,
		text: normalizeReceiptText(line.text.slice(0, 1500)),
	}));
	const now = context.now ?? new Date();
	const all = tokenize(lines, context);
	// A timestamp is six numbers and none of them is a measurement.
	const tokens = all.filter((token) => !token.partOfDateTime);

	const energyMode = energyModeOf(lines, all);
	// The currency an unmarked number is in: the one the caller named, else the
	// country's. Only its minor unit is read, for the tolerance of the sum and
	// for whether a total can carry cents at all.
	const fallbackCurrency =
		context.currency ?? countryCurrency(context.country) ?? null;
	const solution = solve(
		candidatesFor("quantity", tokens, lines, fallbackCurrency),
		candidatesFor("unitPrice", tokens, lines, fallbackCurrency),
		candidatesFor("total", tokens, lines, fallbackCurrency),
		fallbackCurrency,
	);

	const quantityToken = solution.quantity?.token;
	const rateToken = solution.unitPrice?.token;
	const unit =
		quantityToken?.unit &&
		["litre", "gallon", "kwh", "mass", "volume-gas"].includes(
			quantityToken.unit,
		)
			? quantityToken.unit
			: rateToken?.unit;
	const unitText = [
		quantityToken?.before,
		quantityToken?.after,
		rateToken?.before,
		rateToken?.after,
	].join(" ");
	let quantityUnit: ReceiptUnit | null =
		unit === "gallon" || unit === "per-gallon"
			? /imperial|imp\.?\s*gal|uk\s*gal|gal\w*\s*\(?(?:uk|imp)/i.test(unitText)
				? "gallon_uk"
				: /us\s*gal|gal\w*\s*\(?us/i.test(unitText) || context.country === "US"
					? "gallon_us"
					: "gal"
			: unit === "mass" || unit === "per-kg"
				? "kg"
				: unit === "volume-gas" || unit === "per-m3"
					? "m3"
					: unit === "kwh" || unit === "per-kwh"
						? "kWh"
						: unit === "litre" || unit === "per-litre"
							? "L"
							: null;
	if (!quantityUnit && solution.quantity)
		quantityUnit = context.quantityUnit ?? null;
	const matchingRate: Record<string, string> = {
		litre: "per-litre",
		gallon: "per-gallon",
		mass: "per-kg",
		"volume-gas": "per-m3",
		kwh: "per-kwh",
	};
	const conflictingRate = !!(
		quantityToken?.unit &&
		rateToken?.unit &&
		matchingRate[quantityToken.unit] &&
		rateToken.unit.startsWith("per-") &&
		rateToken.unit !== "per-unit" &&
		matchingRate[quantityToken.unit] !== rateToken.unit
	);
	// Conflicting printed dimensions are not missing evidence. Keep the
	// quantity's explicit unit and leave the unrelated rate for the original
	// form to complete, rather than relabelling both with a preference.
	// A sum that closes proves the arithmetic, not the purchase: a shop line
	// (`2 x 5,00 10,00`) closes as well as the pump's. It counts as checked
	// only when the paper also says the triple measures fuel or energy.
	const arithmeticChecked =
		solution.balanced &&
		!conflictingRate &&
		measuresFuel(quantityToken, rateToken, lines);
	const odometer = odometerOf(tokens, lines);
	const odoText = odometer?.source ? lines[odometer.source.lineIndex].text : "";
	const odometerUnit = /\b(mi|mls|miles|mileage|miglia)\b/i.test(odoText)
		? ("mi" as const)
		: /\b(km|kms|kilomet|quilomet|chilometr|kmstand|tachostand)/i.test(odoText)
			? ("km" as const)
			: null;
	const product = productOf(lines);
	const date = readDate(
		lines,
		now,
		context.dateOrder ??
			(context.country ? regionDateOrder(context.country) : undefined),
	);

	return {
		date,
		time: readTime(lines, date?.source?.lineIndex),
		total: fieldFrom(solution.total, arithmeticChecked),
		quantity: fieldFrom(solution.quantity, arithmeticChecked),
		unitPrice: conflictingRate
			? null
			: fieldFrom(solution.unitPrice, arithmeticChecked),
		currency: currencyOf(lines, context),
		fuelLabel: product,
		fuelTypeId:
			(product ? fuelTypeIdFor(product.value) : null) ??
			(energyMode === "charge" ? "electric" : null),
		place: placeOf(lines, context.brands),
		odometer,
		odometerUnit,
		quantityUnit,
		energyMode,
		arithmeticChecked,
	};
}
