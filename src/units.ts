import type { ReceiptUnit } from "./types.js";

/** Keep ambiguous historical gallons ambiguous when a record is edited. */
export function receiptUnitMetadata(unit: ReceiptUnit) {
	return {
		quantityUnit: unit === "gallon_us" || unit === "gallon_uk" ? "gal" : unit,
		volumeUnit:
			unit === "gallon_us" || unit === "gallon_uk"
				? unit
				: unit === "L"
					? "liter"
					: undefined,
	};
}

export function receiptUnitLabel(unit: ReceiptUnit | null): string {
	return unit === "gallon_us"
		? "gal (US)"
		: unit === "gallon_uk"
			? "gal (imp)"
			: (unit ?? "?");
}

export function storedReceiptUnit(
	metadata: Record<string, unknown> | undefined,
): ReceiptUnit | null {
	const unit = metadata?.quantityUnit;
	if (unit === "gal" && metadata?.volumeUnit === "gallon_us")
		return "gallon_us";
	if (unit === "gal" && metadata?.volumeUnit === "gallon_uk")
		return "gallon_uk";
	return ["L", "gal", "gallon_us", "gallon_uk", "kg", "m3", "kWh"].includes(
		String(unit),
	)
		? (unit as ReceiptUnit)
		: null;
}

const GALLONS: readonly ReceiptUnit[] = ["gal", "gallon_us", "gallon_uk"];

/**
 * Whether two quantities are measured in the same unit, compared as units and
 * never as the labels the screen prints for them.
 *
 * A bare "gal" (what older builds and a CSV import store) names no gallon in
 * particular, so it agrees with either: nobody logs one car in both. A US
 * gallon and an imperial one are still two units.
 */
export function sameReceiptUnit(a: ReceiptUnit, b: ReceiptUnit): boolean {
	if (a === b) return true;
	return (
		(a === "gal" || b === "gal") && GALLONS.includes(a) && GALLONS.includes(b)
	);
}
