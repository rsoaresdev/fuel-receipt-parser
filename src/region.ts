/**
 * Which way round this device writes a numeric date.
 *
 * The last resort when a receipt prints `08/09/2026` and settles nothing about
 * it: no four-digit year, no component over twelve, no month spelled out, no
 * sibling date that settled itself. See rule 5 in `dates.ts`.
 *
 * It is evidence about the READER and not about the till, which is why it is
 * asked last and why a date resolved this way comes back with a lower
 * confidence for the caller to act on. Still much better than a coin
 * toss: somebody scanning a receipt is usually standing in the country that
 * printed it.
 *
 * Asked of `Intl` rather than of a table of locales, because the answer is a
 * property of the reader's whole region setting and not of their language -
 * an English speaker living in Lisbon writes the day first. Wrapped because
 * `Intl` is not guaranteed on every JavaScript engine, and an
 * unknown answer is a perfectly good one here.
 */

import { CURRENCIES } from "./currencies.js";
import type { ScanContext } from "./types.js";

const COUNTRY_CURRENCIES: Record<string, string> = Object.fromEntries(
	Object.entries({
		EUR: "PT ES FR IT DE AT BE NL IE FI LU MT CY EE LV LT SK SI GR HR AD MC SM VA",
		GBP: "GB GG JE IM",
		USD: "US EC SV PA PR TL",
		AUD: "AU KI NR TV",
		CAD: "CA",
		NZD: "NZ CK NU",
		BRL: "BR",
		MXN: "MX",
		CHF: "CH LI",
		NOK: "NO",
		SEK: "SE",
		DKK: "DK FO GL",
		ISK: "IS",
		PLN: "PL",
		CZK: "CZ",
		HUF: "HU",
		RON: "RO",
		BGN: "BG",
		RSD: "RS",
		TRY: "TR",
		UAH: "UA",
		MDL: "MD",
		ARS: "AR",
		COP: "CO",
		CLP: "CL",
		PEN: "PE",
		JPY: "JP",
		CNY: "CN",
		KRW: "KR",
		INR: "IN",
		SGD: "SG",
		HKD: "HK",
		MYR: "MY",
		THB: "TH",
		IDR: "ID",
		PHP: "PH",
		TWD: "TW",
		VND: "VN",
		PKR: "PK",
		AED: "AE",
		SAR: "SA",
		QAR: "QA",
		KWD: "KW",
		BHD: "BH",
		OMR: "OM",
		JOD: "JO",
		ILS: "IL",
		EGP: "EG",
		MAD: "MA",
		ZAR: "ZA LS NA SZ",
		NGN: "NG",
		KES: "KE",
	}).flatMap(([currency, countries]) =>
		countries.split(" ").map((country) => [country, currency]),
	),
);

/** The currency a country prices fuel in, when the table knows it. */
export function countryCurrency(country?: string): string | undefined {
	return COUNTRY_CURRENCIES[country?.toUpperCase() ?? ""];
}

/** Script selection is independent of the interface language. */
export function receiptRecognitionLanguage(
	country: string,
	language: string,
): string {
	return (
		(
			{
				CN: "zh",
				TW: "zh",
				HK: "zh",
				JP: "ja",
				KR: "ko",
				IN: "hi",
				NP: "ne",
			} as Record<string, string>
		)[country.toUpperCase()] ?? language
	);
}

const CURRENCY_CODES = CURRENCIES.map(({ code }) => ({
	code,
	pattern: new RegExp(`\\b${code}\\b`, "i"),
}));

/** Derive shared symbols once from the catalogue, retaining ambiguous candidates. */
const CURRENCY_SYMBOLS = (() => {
	const aliases = new Map<string, Set<string>>();
	const add = (mark: string, code: string) => {
		const key = mark.toLowerCase();
		const candidates = aliases.get(key) ?? new Set<string>();
		candidates.add(code);
		aliases.set(key, candidates);
	};
	for (const { code, symbol } of CURRENCIES) {
		// A bare L on a fuel receipt is volume evidence, not Moldovan currency.
		if (symbol !== "L") add(symbol, code);
		if (symbol.endsWith("$") && code !== "BRL") add("$", code);
		if (symbol === "kr" || symbol === "kr.") {
			add("kr", code);
			add("kr.", code);
		}
	}
	// Printed variants beyond the catalogue's display symbols.
	add("US$", "USD");
	add("C$", "CAD");
	add("lei", "MDL");
	return [...aliases]
		.sort(([a], [b]) => b.length - a.length)
		.map(([mark, candidates]) => {
			const escaped = mark.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
			return {
				escaped,
				pattern: new RegExp(`(?<![\\p{L}])${escaped}(?![\\p{L}])`, "iu"),
				candidates: [...candidates],
			};
		});
})();

/** Shared regex fragment for currency marks beside amounts and unit prices. */
export const CURRENCY_PATTERN = [
	...new Set([
		...CURRENCIES.map(({ code }) => code.toLowerCase()),
		...CURRENCY_SYMBOLS.map(({ escaped }) => escaped),
	]),
]
	.sort((a, b) => b.length - a.length)
	.join("|");

/** An ambiguous symbol is still evidence that a line contains an amount. */
export function hasReceiptCurrency(text: string): boolean {
	return (
		CURRENCY_CODES.some(({ pattern }) => pattern.test(text)) ||
		CURRENCY_SYMBOLS.some(({ pattern }) => pattern.test(text))
	);
}

/** Explicit ISO codes outrank symbols. An ambiguous symbol needs compatible context. */
export function receiptCurrency(
	text: string,
	context: ScanContext = {},
): string | null {
	const codes = CURRENCY_CODES.filter(({ pattern }) => pattern.test(text));
	if (codes.length) return codes.length === 1 ? codes[0].code : null;
	for (const { pattern, candidates } of CURRENCY_SYMBOLS) {
		if (!pattern.test(text)) continue;
		if (candidates.length === 1) return candidates[0];
		const expected = countryCurrency(context.country) ?? context.currency;
		return expected && candidates.includes(expected) ? expected : null;
	}
	return null;
}

export function regionDateOrder(country?: string): "dmy" | "mdy" | undefined {
	if (country)
		return ["US", "PH", "BZ", "FM", "PW"].includes(country.toUpperCase())
			? "mdy"
			: "dmy";
	try {
		const parts = new Intl.DateTimeFormat(undefined, {
			year: "numeric",
			month: "numeric",
			day: "numeric",
		}).formatToParts(new Date(2026, 0, 2));
		const day = parts.findIndex((part) => part.type === "day");
		const month = parts.findIndex((part) => part.type === "month");
		if (day < 0 || month < 0) return undefined;
		return day < month ? "dmy" : "mdy";
	} catch {
		return undefined;
	}
}
