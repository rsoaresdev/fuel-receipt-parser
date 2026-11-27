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
		.replace(/[\u202f\u2009]/g, "\u00a0")
		.replace(/(\d[.,]\d{2})\u2079/g, "$19")
		.replace(
			/^.*(?:(?<![a-z])(?:gal(?:s|lons?)?|ppg)(?![a-z])|@).*$/i,
			tenthOfACent,
		);
}

/**
 * A US pump prices fuel to a tenth of a cent and prints the tenth small:
 * `$3.45\u2079`, which a recogniser often reads as `3.45 9`. On a line about
 * gallons the stray 9 is joined back on (and the space moved after it, so
 * every character keeps its offset): `3.45 9` is read as 3.459.
 */
function tenthOfACent(line: string): string {
	return line.replace(/(\d\.\d{2}) 9(?![\d.,])/g, "$19 ");
}
