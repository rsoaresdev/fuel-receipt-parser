/** Currencies the engine recognises on a receipt, by ISO 4217 code and printed symbol. */
export interface Currency {
	readonly code: string;
	readonly symbol: string;
}

export const CURRENCIES: readonly Currency[] = [
	{ code: "EUR", symbol: "€" },
	{ code: "GBP", symbol: "£" },
	{ code: "CHF", symbol: "CHF" },
	{ code: "NOK", symbol: "kr" },
	{ code: "SEK", symbol: "kr" },
	{ code: "DKK", symbol: "kr." },
	{ code: "ISK", symbol: "kr." },
	{ code: "PLN", symbol: "zł" },
	{ code: "CZK", symbol: "Kč" },
	{ code: "HUF", symbol: "Ft" },
	{ code: "RON", symbol: "Lei" },
	{ code: "BGN", symbol: "лв." },
	{ code: "RSD", symbol: "RSD" },
	{ code: "TRY", symbol: "₺" },
	{ code: "UAH", symbol: "₴" },
	{ code: "MDL", symbol: "L" },
	{ code: "USD", symbol: "$" },
	{ code: "CAD", symbol: "CA$" },
	{ code: "BRL", symbol: "R$" },
	{ code: "MXN", symbol: "$" },
	{ code: "ARS", symbol: "$" },
	{ code: "COP", symbol: "$" },
	{ code: "CLP", symbol: "$" },
	{ code: "PEN", symbol: "S/" },
	{ code: "AUD", symbol: "A$" },
	{ code: "NZD", symbol: "NZ$" },
	{ code: "JPY", symbol: "¥" },
	{ code: "CNY", symbol: "¥" },
	{ code: "KRW", symbol: "₩" },
	{ code: "INR", symbol: "₹" },
	{ code: "SGD", symbol: "S$" },
	{ code: "HKD", symbol: "HK$" },
	{ code: "MYR", symbol: "RM" },
	{ code: "THB", symbol: "฿" },
	{ code: "IDR", symbol: "Rp" },
	{ code: "PHP", symbol: "₱" },
	{ code: "TWD", symbol: "$" },
	{ code: "VND", symbol: "₫" },
	{ code: "PKR", symbol: "₨" },
	{ code: "AED", symbol: "د.إ" },
	{ code: "SAR", symbol: "ر.س" },
	{ code: "QAR", symbol: "ر.ق" },
	{ code: "KWD", symbol: "د.ك" },
	{ code: "BHD", symbol: "د.ب" },
	{ code: "OMR", symbol: "ر.ع." },
	{ code: "JOD", symbol: "د.ا" },
	{ code: "ILS", symbol: "₪" },
	{ code: "EGP", symbol: "ج.م" },
	{ code: "MAD", symbol: "د.م." },
	{ code: "ZAR", symbol: "R" },
	{ code: "NGN", symbol: "₦" },
	{ code: "KES", symbol: "KSh" },
];

const decimals = new Map<string, number>();

/** How many decimals a currency prints, 2 when the runtime does not know the code. */
export function currencyDecimals(currency: string): number {
	let known = decimals.get(currency);
	if (known === undefined) {
		try {
			known =
				new Intl.NumberFormat("en", {
					style: "currency",
					currency,
				}).resolvedOptions().maximumFractionDigits ?? 2;
		} catch {
			known = 2;
		}
		// Bounded by the inputs a caller can pass, so a flood of junk codes stops being cached.
		if (decimals.size < 512) decimals.set(currency, known);
	}
	return known;
}
