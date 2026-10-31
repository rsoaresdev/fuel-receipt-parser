export { CURRENCIES, type Currency, currencyDecimals } from "./currencies.js";
export { extractReceipt } from "./extract.js";
export { fuelTypeIdFor, KNOWN_BRANDS } from "./labels.js";
export { betterReading, wantsSecondPass } from "./read.js";
export type {
	EnergyMode,
	FieldSource,
	FuelTypeId,
	OcrLine,
	OcrWord,
	ReceiptReading,
	ReceiptUnit,
	ScanContext,
	ScannedField,
	TextBox,
} from "./types.js";
