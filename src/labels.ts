/**
 * The words a receipt uses, in the languages of the forecourts it reads.
 *
 * A number on a fuel receipt means whatever the word next to it says it means,
 * and receipts are printed in the language of the forecourt, not of the phone.
 * Somebody who drives from Porto to Bordeaux comes home with one till roll
 * saying `Total C/IVA` and another saying `Montant TTC`, and both have to
 * read the same way.
 *
 * Six base languages (Portuguese, Spanish, French, Italian, German, English),
 * plus English and the abbreviations that survive translation (`L`, `EUR/L`,
 * `PVP`). These are not translation keys and never become visible text: they
 * are evidence, matched against paper. That is why they can be a flat list of
 * fragments rather than anything more structured, and why adding a word here
 * costs nothing.
 *
 * NEGATIVE WORDS EARN THEIR PLACE. A receipt prints many more numbers than the
 * three that matter: a VAT breakdown, a tax number, a pump number, the change
 * from a fifty, a loyalty balance. Left unweighted, `IVA 23% 11,34` is a
 * perfectly good candidate for a total. Knowing what a number is NOT is worth
 * as much here as knowing what it is.
 */

import { hasReceiptCurrency } from "./region.js";
import type { FuelTypeId } from "./types.js";

/** The three values worth solving for, plus the one worth taking if offered. */
type FieldKind = "total" | "quantity" | "unitPrice" | "odometer";

interface Lexicon {
	/** Words that name this field. Matched as whole words, case-folded. */
	words: readonly string[];
	/** Fragments that need no word boundary, because they carry none. */
	fragments?: readonly string[];
}

const TOTAL: Lexicon = {
	words: [
		"total",
		"totale",
		"totaal",
		"gesamt",
		"gesamtbetrag",
		"summe",
		"betrag",
		"endbetrag",
		"zu zahlen",
		"importe",
		"importe total",
		"a pagar",
		"total a pagar",
		"valor",
		"valor total",
		"montante",
		"montant",
		"montant total",
		"net a payer",
		"a payer",
		"ttc",
		"importo",
		"importo totale",
		"amount",
		"amount due",
		"amount paid",
		"paid",
		"grand total",
		"sale",
		"venda",
		"venta",
		"vente",
		"vendita",
		"total pago",
		"valor pago",
		"pago",
		"pagado",
		"importe pagado",
		"paye",
		"payé",
		"pagato",
		"bezahlt",
		"gezahlt",
		"total geral",
		"totale da pagare",
		"somma",
		"te betalen",
		"totaalbedrag",
		"toplam",
		"genel toplam",
		"tutar",
		"ödenecek",
		"suma",
		"razem",
		"do zapłaty",
		"należność",
		"celkem",
		"k úhradě",
		"összesen",
		"fizetendő",
		"summa",
		"att betala",
		"totalt",
		"i alt",
		"at betale",
		"å betale",
		"yhteensä",
		"maksettava",
		"total bayar",
		"total harga",
		"合計",
		"合计",
		"總計",
		"总计",
		"お買上計",
		"金額",
		"金额",
		"实付",
		"합계",
		"결제금액",
		"총액",
		"المجموع",
		"الإجمالي",
		"الاجمالي",
		"المبلغ",
	],
};

const QUANTITY: Lexicon = {
	words: [
		"litros",
		"litro",
		"litres",
		"litre",
		"liter",
		"litri",
		"quantidade",
		"qtd",
		"qtde",
		"cantidad",
		"cant",
		"quantite",
		"quantité",
		"quantity",
		"qty",
		"menge",
		"volume",
		"volumen",
		"gallons",
		"gallon",
		"gal",
		"kwh",
		"energia",
		"energy",
		"energie",
		"consumo",
		"abastecido",
		"dispensed",
		"delivered",
		"carga",
		"charged",
		"hoeveelheid",
		"miktar",
		"ilość",
		"litry",
		"množství",
		"mennyiség",
		"mängd",
		"määrä",
		"volym",
		"數量",
		"数量",
		"給油量",
		"油量",
		"加油量",
		"수량",
		"주유량",
		"الكمية",
	],
};

const UNIT_PRICE: Lexicon = {
	words: [
		"preco",
		"preço",
		"precio",
		"prix",
		"price",
		"preis",
		"prezzo",
		"unitario",
		"unitário",
		"unit",
		"unitaire",
		"einzelpreis",
		"pvp",
		"pu",
		"p.u",
		"tarifa",
		"tarif",
		"rate",
		"por litro",
		"per litro",
		"per litre",
		"par litre",
		"pro liter",
		"al litro",
		"prijs",
		"literprijs",
		"eenheidsprijs",
		"birim fiyat",
		"fiyat",
		"cena",
		"cena jedn",
		"jednotková cena",
		"egységár",
		"pris",
		"literpris",
		"a-pris",
		"hinta",
		"yksikköhinta",
		"litrahinta",
		"harga",
		"単価",
		"单价",
		"單價",
		"단가",
		"السعر",
		"سعر اللتر",
	],
	fragments: ["€/l", "eur/l", "$/gal", "/litro", "/litre", "/liter", "/kwh"],
};

const ODOMETER: Lexicon = {
	words: [
		"km",
		"kms",
		"kilometros",
		"quilometros",
		"quilómetros",
		"kilometer",
		"kilometraje",
		"kilometrage",
		"kilométrage",
		"chilometri",
		"odometer",
		"odometro",
		"odómetro",
		"conta-quilometros",
		"mileage",
		"miles",
		"miglia",
		"kmstand",
		"tachostand",
		"kilometerstand",
		"kilometraj",
		"przebieg",
		"走行距離",
		"주행거리",
	],
};

/**
 * Numbers that are certainly not a total, a quantity or a price.
 *
 * `total` is checked before this list is applied, because `Total C/IVA` is a
 * total that happens to name the tax it includes, and reading it as a VAT line
 * would throw away the most important number on the page.
 */
const NOT_A_VALUE: readonly string[] = [
	"iva",
	"vat",
	"tva",
	"mwst",
	"ust",
	"btw",
	"imposto",
	"impuesto",
	"tax",
	"taxa",
	"isp",
	"nif",
	"nipc",
	"cif",
	"contribuinte",
	"vat no",
	"tax id",
	"steuernummer",
	"partita iva",
	"siret",
	"troco",
	"change",
	"cambio",
	"vuelto",
	"rendu",
	"resto",
	"bomba",
	"pump",
	"pompe",
	"pompa",
	"surtidor",
	"zapfsaule",
	"zapfsäule",
	"mangueira",
	"nozzle",
	"cartao",
	"cartão",
	"card",
	"carte",
	"karte",
	"tarjeta",
	"carta",
	"contactless",
	"aid",
	"tid",
	"mid",
	"auth",
	"autorizacao",
	"autorização",
	"fatura",
	"factura",
	"invoice",
	"recibo",
	"receipt",
	"ticket",
	"talao",
	"talão",
	"beleg",
	"rechnung",
	"documento",
	"doc",
	"serie",
	"série",
	"atcud",
	"telefone",
	"telefono",
	"phone",
	"tel",
	"fax",
	"codigo postal",
	"postal",
	"cp",
	"desconto",
	"descuento",
	"discount",
	"remise",
	"rabatt",
	"sconto",
	"saldo",
	"balance",
	"pontos",
	"puntos",
	"points",
	"punkte",
	"loyalty",
	"operador",
	"operator",
	"caixa",
	"caja",
	"caisse",
	"kasse",
	"terminal",
	"loja",
	"store",
	"posto",
	"station",
	"nc",
	"n.c",
	// The tax base and the net figure: the right numbers, before the tax
	// that the total already includes.
	"base",
	"liquido",
	"líquido",
	"neto",
	"netto",
	"net",
	"arredondamento",
	"arredond",
	"rounding",
	"gorjeta",
	"tip",
	"propina",
	"pourboire",
	"trinkgeld",
	"mancia",
	// Who the customer is, what they drive, and which transaction this was.
	"cliente",
	"client",
	"customer",
	"kunde",
	"socio",
	"sócio",
	"member",
	"matricula",
	"matrícula",
	"plate",
	"placa",
	"kennzeichen",
	"immatriculation",
	"targa",
	"ref",
	"referencia",
	"referência",
	"transacao",
	"transação",
	"transaction",
	"trans",
	"seq",
	"sequencia",
	"numero",
	"número",
	"number",
	"nr",
	// The clock and the calendar, for a line the timestamp filter did not
	// recognise as one.
	"hora",
	"heure",
	"uhrzeit",
	"ora",
	"time",
	"data",
	"date",
	"fecha",
	"datum",
	"kdv",
	"ptu",
	"dph",
	"áfa",
	"moms",
	"mva",
	"alv",
	"gst",
	"hst",
	"pst",
	"qst",
	"sst",
	"ppn",
	"消費税",
	"税额",
	"增值税",
	"부가세",
	"부가가치세",
	"ضريبة",
	"wisselgeld",
	"para üstü",
	"reszta",
	"お釣り",
	"おつり",
	"거스름돈",
	"找零",
	"الباقي",
	"numerario",
	"numerário",
	"efectivo",
	"espèces",
	"bargeld",
	"contanti",
	"cash",
	"contant",
	"nakit",
	"gotówka",
	"現金",
	"현금",
	"现金",
	"نقدا",
	"korting",
	"indirim",
	"rabat",
	"sleva",
	"kedvezmény",
	"alennus",
	"割引",
	"値引",
	"할인",
	"折扣",
	"优惠",
	"خصم",
	"fee",
	"fees",
	"gebühr",
	"frais",
	"commissione",
];

/**
 * How strongly a fragment of text names a field, from 0 to 1.
 *
 * The scan is over the tail of what came before the number and the head of
 * what came after, because a label two inches away on the same line is
 * labelling something else. `total` on a line of its own, in the column layout,
 * is picked up by the row logic in `extract.ts` and not here.
 */
const NO_FRAGMENTS: readonly string[] = [];

function lexiconHit(text: string, lexicon: Lexicon): boolean {
	const folded = fold(text);
	for (const fragment of foldAll(lexicon.fragments ?? NO_FRAGMENTS)) {
		if (folded.includes(fragment)) return true;
	}
	for (const word of foldAll(lexicon.words)) {
		if (hasWord(folded, word)) return true;
	}
	return false;
}

/*
 * Every number on a receipt asks the same few labels whether they name it, so
 * the same text is folded many times over. Both caches are bounded: the text
 * one is cleared when full, and the word lists are keyed weakly by the array.
 */
const FOLD_CACHE_LIMIT = 2048;
const foldedText = new Map<string, string>();
const foldedLists = new WeakMap<readonly string[], readonly string[]>();

/** Case, accents and punctuation removed, so `Preço` matches `PRECO`. */
function fold(text: string): string {
	const cached = foldedText.get(text);
	if (cached !== undefined) return cached;
	const folded = text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
	if (foldedText.size >= FOLD_CACHE_LIMIT) foldedText.clear();
	foldedText.set(text, folded);
	return folded;
}

function foldAll(words: readonly string[]): readonly string[] {
	let folded = foldedLists.get(words);
	if (!folded) {
		folded = words.map(fold);
		foldedLists.set(words, folded);
	}
	return folded;
}

/** `a` to `z` or `0` to `9`, the characters a whole word cannot touch. */
function isWordChar(code: number): boolean {
	return (code >= 97 && code <= 122) || (code >= 48 && code <= 57);
}

function hasWord(folded: string, word: string): boolean {
	let at = folded.indexOf(word);
	while (at >= 0) {
		const end = at + word.length;
		const openStart = !isWordChar(word.charCodeAt(0));
		const openEnd = !isWordChar(word.charCodeAt(word.length - 1));
		if (
			(openStart || at === 0 || !isWordChar(folded.charCodeAt(at - 1))) &&
			(openEnd || end >= folded.length || !isWordChar(folded.charCodeAt(end)))
		)
			return true;
		at = folded.indexOf(word, at + 1);
	}
	return false;
}

const LEXICONS: Readonly<Record<FieldKind, Lexicon>> = {
	total: TOTAL,
	quantity: QUANTITY,
	unitPrice: UNIT_PRICE,
	odometer: ODOMETER,
};

/** Whether the text names this field. */
export function names(kind: FieldKind, text: string): boolean {
	return lexiconHit(text, LEXICONS[kind]);
}

/** Whether the text names something whose number is never one of ours. */
export function namesSomethingElse(text: string): boolean {
	const folded = fold(text);
	return foldAll(NOT_A_VALUE).some((word) => hasWord(folded, word));
}

/** A discount, in the six base languages and the abbreviations tills print. */
const DISCOUNT: readonly string[] = [
	"desconto",
	"descontos",
	"desc",
	"descuento",
	"descuentos",
	"dto",
	"discount",
	"remise",
	"rabatt",
	"nachlass",
	"sconto",
	"korting",
	"indirim",
	"rabat",
	"sleva",
	"kedvezmény",
	"alennus",
	"割引",
	"値引",
	"할인",
	"折扣",
	"优惠",
	"خصم",
];

/** A charge added to the energy itself, as on an EV charging receipt. */
const FEE: readonly string[] = [
	"fee",
	"fees",
	"session fee",
	"service fee",
	"connection fee",
	"idle fee",
	"parking fee",
	"gebühr",
	"startgebühr",
	"blockiergebühr",
	"frais",
	"frais de session",
	"taxa de sessão",
	"taxa de serviço",
	"tarifa de sesión",
	"costo di sessione",
	"commissione",
];

/** Whether the text names a fee charged on top of the energy. */
export function namesFee(text: string): boolean {
	const folded = fold(text);
	return foldAll(FEE).some((word) => hasWord(folded, word));
}

/** Whether the text names a discount. */
export function namesDiscount(text: string): boolean {
	const folded = fold(text);
	return foldAll(DISCOUNT).some((word) => hasWord(folded, word));
}

/**
 * Fuel products, keyed to the `FuelTypeId` values in `types.ts`.
 *
 * Order matters and is the point: `V-Power Diesel` is an additivated diesel and
 * `V-Power` alone is a 98, so the diesel rules are asked first. Likewise `98`
 * before `95`, since `E5-TOP 98` contains neither the word petrol nor the word
 * 95 but is unmistakably one of the two.
 */
const FUEL_RULES: readonly (readonly [FuelTypeId, RegExp])[] = [
	[
		"diesel_aditivado",
		/\b(?:diesel|gasoleo|gazole|gasoil|gasolio|dieselkraftstoff)\b[^\n]{0,20}\b(?:aditivado|adit|premium|plus|top|evolution|excellium|ultimate|momentum|v-?power|extra|energy|efficient)\b|\b(?:aditivado|premium|excellium|ultimate|v-?power|momentum|evolution)\b[^\n]{0,20}\b(?:diesel|gasoleo|gazole|gasoil|gasolio)\b/i,
	],
	[
		"diesel_simple",
		/\b(?:diesel|gasoleo|gasóleo|gazole|gasoil|gasolio|dieselkraftstoff|b7|b10|xtl|hvo|motorin|dizel|solar|biosolar|dexlite)\b/i,
	],
	["ethanol_e85", /\b(?:e85|superethanol)\b/i],
	// Brazil's hydrous ethanol is E100, not E85: a different fuel and price.
	["ethanol_e100", /\b(?:etanol|ethanol|alcool|e100)\b/i],
	[
		"hydrogen",
		/\b(?:hydrogen|wasserstoff|hydrogene|hidrogenio|hidrogeno|idrogeno|h2)\b/i,
	],
	[
		"lpg",
		/\b(?:glp|lpg|gpl|autogas|autogás|autogaz|propano|propane|fluglpg)\b/i,
	],
	["adblue", /\b(?:adblue|def|ar ?32)\b/i],
	["cng", /\b(?:gnc|cng|gnv|metano|erdgas|methane|biometano)\b/i],
	["gasoline_98", /(?:^|[^\d.,])(?:98|sp98)(?![\d.,])/i],
	["gasoline_95", /(?:^|[^\d.,])(?:95|sp95|sc95)(?![\d.,])/i],
	[
		"electric",
		/\b(?:kwh|ac|dc|hpc|carregamento|recarga|ricarica|recharge|ladevorgang|charging|charge\s?point)\b/i,
	],
];

/**
 * Fuels named in scripts with no word boundaries for `\\b` to find, matched on
 * the text as printed: folding would take Hangul apart into its letters.
 */
const SCRIPT_FUEL_RULES: readonly (readonly [FuelTypeId, RegExp])[] = [
	["diesel_simple", /軽油|경유|柴油|디젤|ديزل/],
	["hydrogen", /水素|수소|氢/],
	["electric", /充電|충전|充电/],
];

/** Gasoline named without a grade: a product, but no RON to assign. */
const UNGRADED_GASOLINE = /レギュラー|ハイオク|휘발유|汽油|بنزين/;

/** The catalogue id a printed product name corresponds to, when one does. */
export function fuelTypeIdFor(text: string): FuelTypeId | null {
	for (const [id, pattern] of SCRIPT_FUEL_RULES) {
		if (pattern.test(text)) return id;
	}
	text = fold(text);
	// Octane scales and marketing grades differ by country. Keep generic
	// product names for review without assigning them a RON grade.

	for (const [id, pattern] of FUEL_RULES) {
		if (pattern.test(text)) return id;
	}
	return null;
}

/**
 * Lines that could be the printed name of what was bought.
 *
 * A product line is short, names a fuel, carries no money mark and names
 * nothing administrative. The money test is what separates `E5-TOP 95` from
 * `TOTAL 0,98 EUR`, which the octane rules alone would happily call a 98: the
 * price line has a currency on it and the product line never does.
 */
export function looksLikeProduct(text: string): boolean {
	const trimmed = text.trim();
	if (trimmed.length === 0 || trimmed.length > 42) return false;
	if (hasReceiptCurrency(trimmed)) return false;
	if (names("total", trimmed) || names("unitPrice", trimmed)) return false;
	if (namesSomethingElse(trimmed)) return false;
	if (
		!/\b(?:diesel|gasoleo|gazole|gasoil|gasolio|dieselkraftstoff|b7|b10|xtl|hvo|e85|etanol|ethanol|superethanol|glp|gpl|lpg|autogas|autogaz|propano|propane|gnc|cng|gnv|metano|erdgas|methane|biometano|electric|kwh|carregamento|recarga|ricarica|recharge|charging|ladevorgang|regular|premium|magna|unleaded|gasolina|gasoline|benzin|benzina|essence|petrol|e5|e10|v-?power|ultimate|adblue|def|sp95|sp98|sc95|motorin|dizel|solar|biosolar|dexlite|pertalite|pertamax|gasohol|kursunsuz|benzine|bleifrei|super|pb9[58]|e100|alcool|hidrogenio|hydrogen|wasserstoff|h2)\b|^(?:ron\s*)?9[58]$/i.test(
			fold(trimmed),
		) &&
		!UNGRADED_GASOLINE.test(trimmed) &&
		fuelTypeIdFor(trimmed) === null
	)
		return false;
	return (
		fuelTypeIdFor(trimmed) !== null ||
		UNGRADED_GASOLINE.test(trimmed) ||
		/\b(regular|premium|magna|unleaded|gasolina|gasoline|benzin|benzina|essence|petrol|e5|e10|v-?power|ultimate|etanol|ethanol|pertalite|pertamax|gasohol|kursunsuz|benzine|bleifrei|super|pb9[58])\b/i.test(
			fold(trimmed),
		)
	);
}

/**
 * Fuel brands, for naming the station.
 *
 * A starting set, not an authority: a caller that knows the brands of the
 * country the reader is in passes them as `ScanContext.brands`. These are the
 * ones that turn up often enough across Europe and the Americas to be worth
 * recognising with no list at all.
 *
 * Matched as whole words against the top of the receipt, where the header is.
 */
export const KNOWN_BRANDS: readonly string[] = [
	"Petrobras",
	"Ipiranga",
	"Raízen",
	"Pemex",
	"G500",
	"Ampol",
	"Caltex",
	"United Petroleum",
	"7-Eleven",
	"Gull",
	"Z Energy",
	"Galp",
	"Prio",
	"Repsol",
	"BP",
	"Cepsa",
	"Shell",
	"Petrogal",
	"Intermarché",
	"Continente",
	"Auchan",
	"Pingo Doce",
	"Leclerc",
	"Carrefour",
	"Avia",
	"Total",
	"TotalEnergies",
	"Esso",
	"Agip",
	"Eni",
	"Q8",
	"Tamoil",
	"IP",
	"Aral",
	"Jet",
	"Star",
	"Orlen",
	"OMV",
	"MOL",
	"Lukoil",
	"Circle K",
	"Statoil",
	"Preem",
	"Neste",
	"Ingo",
	"Gulf",
	"Texaco",
	"Chevron",
	"Exxon",
	"Mobil",
	"Sunoco",
	"Citgo",
	"Marathon",
	"Speedway",
	"Wawa",
	"Sheetz",
	"Costco",
	"Sam's Club",
	"Pilot",
	"Love's",
	"Flying J",
	"Casey's",
	"QuikTrip",
	"RaceTrac",
	"Buc-ee's",
	"Petro-Canada",
	"Esso Express",
	"Plenergy",
	"Ballenoil",
	"Petroprix",
	"Alcampo",
	"Eroski",
	"BonÀrea",
	"GasExpress",
	"CLH",
	"DISA",
	"Meroil",
	"Moeve",
	"Ionity",
	"Tesla Supercharger",
	"Supercharger",
	"Fastned",
	"Allego",
	"IONWAY",
	"MOBI.E",
	"Miio",
	"GoWatts",
	"KLE",
	"Power Dot",
	"Atlante",
	"Electra",
	"Zunder",
	"Iberdrola",
	"Endesa",
	"Wenea",
	"EasyCharger",
	"Ubitricity",
	"Shell Recharge",
	"BP Pulse",
	"ChargePoint",
	"EVBox",
	"Electrify America",
	"EVgo",
	"Blink",
	"Pod Point",
	"Osprey",
	"GRIDSERVE",
];

/**
 * The brand named on a receipt, spelled as the LIST spells it.
 *
 * Which is why the list carries display casing rather than lowercase keys: the
 * name goes onto the reader's screen as it is, and
 * "bp pulse" is not how anybody writes it. Matching folds case itself, so a
 * receipt shouting `PRIO ENERGY, S.A.` still finds `Prio`.
 *
 * Longest match wins, so `shell recharge` beats `shell` and the reader gets
 * the charging network rather than the petrol company that owns it.
 */
export function brandIn(
	text: string,
	brands: readonly string[] = KNOWN_BRANDS,
): string | null {
	const folded = fold(text);
	let best: string | null = null;
	for (const brand of brands) {
		const candidate = fold(brand);
		if (candidate.length < 2) continue;
		if (!hasWord(folded, candidate)) continue;
		if (!best || candidate.length > fold(best).length) best = brand;
	}
	return best;
}
