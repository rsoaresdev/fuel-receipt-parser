/**
 * What comes off a scanned receipt, and where on the paper each value was.
 *
 * The provenance is not decoration. A review screen can draw the recognised
 * values ON the photograph, each one over the words it was read from, so a
 * reader corrects a number by touching the place it came from. That only works
 * if every field carries its own box, so the box travels with the value from
 * the moment the text is recognised.
 */

/**
 * A recognised box, in coordinates normalised to the corrected image.
 *
 * Origin top-left, both axes 0 to 1. Normalised rather than in pixels because
 * the image is scaled to fit a phone screen and the overlay has to follow it;
 * a pixel box would have to be re-scaled by every consumer, and the one that
 * forgot would draw the highlight in the wrong place.
 */
export interface TextBox {
	x: number;
	y: number;
	width: number;
	height: number;
}

/** One word, when the recogniser was able to break the line into words. */
export interface OcrWord {
	text: string;
	box: TextBox;
}

/**
 * One line as the recogniser returned it.
 *
 * `words` is optional because not every recogniser gives word boxes, but when
 * it does they matter: a fuel line reads `31,93 Lit x 1,899 EUR/Lit 60,64 EUR`
 * and highlighting that whole line three times over would tell the reader
 * nothing. With word boxes each of the three values gets its own patch of
 * paper. Without them the engine estimates one from the character offsets,
 * which is close enough on a receipt's near-monospaced print.
 */
export interface OcrLine {
	text: string;
	box: TextBox;
	words?: readonly OcrWord[];
	/** 0 to 1, as reported by the recogniser. Used only to break ties. */
	confidence?: number;
	/**
	 * The recogniser's other readings of the same line, best first.
	 *
	 * A recogniser keeps several transcriptions of every line and hands over
	 * the one it likes most, which on faded print is not always the right
	 * one: the top reading of a creased `60,64` says `50,64` and the second
	 * says `60,64`. The numbers in these enter the search too, at a discount,
	 * and arithmetic can corroborate them. Agreement does not prove that
	 * the transcription is correct.
	 */
	alternates?: readonly string[];
}

/** Where on the paper a value was read from. */
export interface FieldSource {
	/** Index into the lines the reading was built from. */
	lineIndex: number;
	box: TextBox;
}

/** A value, and the piece of paper it came from. */
export interface ScannedField<T> {
	value: T;
	/**
	 * How sure the engine is, 0 to 1.
	 *
	 * Not meant to be shown as a percentage. Use it to decide which fields to
	 * present as read and which to leave blank for the reader to fill in: a
	 * number on a receipt is either right or it is not, and "87% sure" printed
	 * beside a cost would be worse than silence.
	 */
	confidence: number;
	/** Null when no reliable printed location is available. */
	source: FieldSource | null;
}

/** The fuel kinds a product name can be matched to. */
export type FuelTypeId =
	| "gasoline_95"
	| "gasoline_98"
	| "diesel_simple"
	| "diesel_aditivado"
	| "ethanol_e85"
	| "ethanol_e100"
	| "hydrogen"
	| "lpg"
	| "cng"
	| "adblue"
	| "electric";

/** What the receipt turned out to be a receipt for. */
export type EnergyMode = "fuel" | "charge";
export type ReceiptUnit =
	| "L"
	| "gal"
	| "gallon_us"
	| "gallon_uk"
	| "kg"
	| "m3"
	| "kWh";

/** Everything one scan produced. */
export interface ReceiptReading {
	/** The calendar day, `YYYY-MM-DD`, as text so no time zone can move it. */
	date: ScannedField<string> | null;
	/** Local wall-clock time on the receipt, `HH:mm`, when it printed one. */
	time: ScannedField<string> | null;
	/** The printed total. A reference that checks the other two numbers, not a cost to trust on its own. */
	total: ScannedField<number> | null;
	/** Quantity in quantityUnit, as read from the paper. */
	quantity: ScannedField<number> | null;
	/** Price per quantityUnit. */
	unitPrice: ScannedField<number> | null;
	/** ISO 4217, when the paper names a currency it can be sure of. */
	currency: ScannedField<string> | null;
	/** The product as the receipt spells it: "E5-TOP 95", "GASOLEO SIMPLES". */
	fuelLabel: ScannedField<string> | null;
	/** The kind of fuel, when the product name says which. */
	fuelTypeId: FuelTypeId | null;
	/** The station, when a known brand was found on the paper. */
	place: ScannedField<string> | null;
	/** Only when the receipt PRINTS one. Handwriting is not read. */
	odometer: ScannedField<number> | null;
	/** Litres, gallons, kilograms, cubic metres or kWh: whichever the quantity is in. */
	quantityUnit: ReceiptUnit | null;
	odometerUnit?: "km" | "mi" | null;
	energyMode: EnergyMode;
	/**
	 * Whether quantity times unit price came to the total.
	 *
	 * The single most important field in this object. Arithmetic is a
	 * consistency check, with the printed total used only as a reference. It
	 * never establishes correctness by itself. See `extract.ts`.
	 */
	arithmeticChecked: boolean;
	/**
	 * What the paper sold, as far as it says.
	 *
	 * `fuel` when a unit, a rate or a product name says fuel or energy;
	 * `other` when a sum closes but nothing on the paper is fuel, as on a café
	 * receipt (`2 x 5,00 10,00`); `unknown` when there is too little to tell.
	 */
	kind?: ReceiptKind;
	/**
	 * A discount the receipt prints, for the whole fill.
	 *
	 * A per-litre discount (`Desc. 0,10 EUR/L`) comes back as the amount it
	 * makes on the quantity read, and only when a quantity was read. When the
	 * total is printed after the discount, quantity times price minus this is
	 * what checks it.
	 */
	discount?: ScannedField<ReceiptDiscount> | null;
	/**
	 * Charges the receipt adds to the energy, summed: a session fee, an idle
	 * fee. When the total is printed with them, quantity times price plus
	 * these (less any discount) is what checks it.
	 */
	fees?: ScannedField<number> | null;
	/**
	 * Further fills on the same receipt, each one checked on its own line: a
	 * diesel and an AdBlue, or two pumps. The top-level fields are the fill
	 * the engine thought most likely; these are the others, best first.
	 */
	otherFills?: readonly ReceiptFill[];
}

export type ReceiptKind = "fuel" | "other" | "unknown";

export interface ReceiptDiscount {
	type: "amount" | "percent";
	value: number;
}

/** One fill that closed on its own line. */
export interface ReceiptFill {
	quantity: ScannedField<number>;
	unitPrice: ScannedField<number>;
	total: ScannedField<number>;
	fuelLabel: ScannedField<string> | null;
	fuelTypeId: FuelTypeId | null;
	quantityUnit: ReceiptUnit | null;
}

/** What the caller knows that the paper does not say. */
export interface ScanContext {
	/** Country of purchase, independent of the interface language. */
	country?: string;
	currency?: string;
	quantityUnit?: ReceiptUnit;
	/**
	 * Station names to match the header against, in any case - the matcher
	 * folds case itself.
	 *
	 * Passed in rather than built in, because the full list of a country's
	 * stations is far too large to ship. `KNOWN_BRANDS` is used when absent.
	 */
	brands?: readonly string[];
	/** Anchors a two-digit year and rejects a date far in the future. */
	now?: Date;
	/**
	 * How the reader's own region writes a numeric date.
	 *
	 * `08/09/2026` is the eighth of September in Lisbon and the ninth of August
	 * in Denver, and receipts that print it that way say nothing about which.
	 * When the paper cannot settle it - no four-digit year, no component over
	 * twelve, no month spelled out, no sibling date that settled itself - this
	 * is the last thing left that is better than a coin toss, and the caller
	 * takes it from the device's locale. Absent, the engine falls back to
	 * whichever reading is nearer to today and lowers its confidence to say so.
	 */
	dateOrder?: "dmy" | "mdy" | "ymd";
	/**
	 * The vehicle's tank, in litres, when the caller knows it.
	 *
	 * Used for one thing: when a recogniser drops the decimal separator from
	 * two numbers by the same factor, the sum still closes on the wrong
	 * reading (`4000 L x 1,500 = 6000` for `40,00 x 1,500 = 60,00`). The
	 * arithmetic cannot tell the two apart; a tank of 60 litres can. Without
	 * it such a reading comes back unchecked.
	 */
	tankCapacityLitres?: number;
}
