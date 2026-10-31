/** Keep character offsets intact so normalized OCR still points at the photograph. */
export function normalizeReceiptText(text: string): string {
	const zeroes = [
		0xff10, 0x660, 0x6f0, 0x966, 0x9e6, 0xa66, 0xae6, 0xb66, 0xbe6, 0xc66,
		0xce6, 0xd66, 0xe50, 0xed0, 0xf20, 0x1040, 0x17e0,
	];
	return text
		.replace(/\p{Nd}/gu, (char) => {
			const code = char.charCodeAt(0);
			const zero = zeroes.find((start) => code >= start && code <= start + 9);
			return zero === undefined ? char : String(code - zero);
		})
		.replace(/٫/g, ".")
		.replace(/٬/g, ",")
		.replace(/[’ʼ]/g, "'")
		.replace(/[％٪]/g, "%")
		.replace(/．/g, ".")
		.replace(/，/g, ",")
		.replace(/[\u202f\u2009]/g, "\u00a0");
}

export function decimalInput(raw: string): number | null {
	const normalized = normalizeReceiptText(raw).trim().replace(/[\s']/g, "");
	if (!/^(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(normalized)) return null;
	const value = Number(normalized.replace(",", "."));
	return Number.isFinite(value) ? value : null;
}

export function localNumber(
	value: number,
	locale: string,
	maximumFractionDigits = 3,
	minimumFractionDigits = 0,
): string {
	return new Intl.NumberFormat(locale, {
		useGrouping: false,
		maximumFractionDigits,
		minimumFractionDigits,
	}).format(value);
}

/** Localize a validated receipt amount without rounding converted values. */
export function localReceiptNumber(value: string, locale: string): string {
	if (!value.trim()) return "";
	const amount = Number(value);
	if (!Number.isFinite(amount)) return "";
	return new Intl.NumberFormat(locale, {
		useGrouping: false,
		maximumSignificantDigits: 21,
	}).format(amount);
}
