/**
 * Vision output for synthetic receipts, as the recogniser returned it: rows
 * split wherever the print leaves a wide gap, columns out of reading order,
 * a tilted photo. The receipts were drawn for the tests (no real merchant,
 * tax number or card), photographed as images and read by Apple Vision with
 * the settings the OdoKeep app uses. Only text and box are kept.
 */

import type { OcrLine } from "../../src/types.js";

export const galpColumns: OcrLine[] = [
	{
		text: "GALP ENERGIA",
		box: {
			x: 0.3333,
			y: 0.3154,
			width: 0.3396,
			height: 0.0203,
		},
	},
	{
		text: "Posto Lisboa Av. Brasil",
		box: {
			x: 0.1192,
			y: 0.3361,
			width: 0.4881,
			height: 0.0195,
		},
	},
	{
		text: "NIF 504499777",
		box: {
			x: 0.1191,
			y: 0.3599,
			width: 0.2712,
			height: 0.0167,
		},
	},
	{
		text: "FATURA SIMPLIFICADA FS 2026/18342",
		box: {
			x: 0.1192,
			y: 0.4069,
			width: 0.6861,
			height: 0.0196,
		},
	},
	{
		text: "Data: 28-10-2026",
		box: {
			x: 0.1195,
			y: 0.4317,
			width: 0.3333,
			height: 0.0162,
		},
	},
	{
		text: "18:42",
		box: {
			x: 0.4872,
			y: 0.4328,
			width: 0.1106,
			height: 0.0167,
		},
	},
	{
		text: "Bomba 4",
		box: {
			x: 0.1192,
			y: 0.4776,
			width: 0.1483,
			height: 0.0157,
		},
	},
	{
		text: "Litros",
		box: {
			x: 0.1194,
			y: 0.5013,
			width: 0.1228,
			height: 0.0149,
		},
	},
	{
		text: "38,52",
		box: {
			x: 0.1161,
			y: 0.5245,
			width: 0.1073,
			height: 0.0208,
		},
	},
	{
		text: "GASOLEO",
		box: {
			x: 0.3018,
			y: 0.4795,
			width: 0.1479,
			height: 0.0133,
		},
	},
	{
		text: "PVP/L",
		box: {
			x: 0.4086,
			y: 0.5026,
			width: 0.1073,
			height: 0.0151,
		},
	},
	{
		text: "Valor",
		box: {
			x: 0.6351,
			y: 0.5042,
			width: 0.1072,
			height: 0.0149,
		},
	},
	{
		text: "1,659",
		box: {
			x: 0.3239,
			y: 0.5262,
			width: 0.1038,
			height: 0.0189,
		},
	},
	{
		text: "63,90",
		box: {
			x: 0.5497,
			y: 0.5267,
			width: 0.1079,
			height: 0.02,
		},
	},
	{
		text: "IVA 23%",
		box: {
			x: 0.1163,
			y: 0.5726,
			width: 0.1479,
			height: 0.0148,
		},
	},
	{
		text: "TOTAL EUR",
		box: {
			x: 0.1164,
			y: 0.5959,
			width: 0.1887,
			height: 0.0147,
		},
	},
	{
		text: "MULTIBANCO",
		box: {
			x: 0.1132,
			y: 0.6192,
			width: 0.2107,
			height: 0.0145,
		},
	},
	{
		text: "11,95",
		box: {
			x: 0.6321,
			y: 0.5741,
			width: 0.1069,
			height: 0.0189,
		},
	},
	{
		text: "63,90",
		box: {
			x: 0.6315,
			y: 0.5976,
			width: 0.1078,
			height: 0.0203,
		},
	},
	{
		text: "63,90",
		box: {
			x: 0.6319,
			y: 0.6218,
			width: 0.1073,
			height: 0.0194,
		},
	},
	{
		text: "Obrigado pela preferencia",
		box: {
			x: 0.1132,
			y: 0.6657,
			width: 0.5189,
			height: 0.0176,
		},
	},
];

export const repsolWithShopItem: OcrLine[] = [
	{
		text: "REPSOL",
		box: {
			x: 0.421,
			y: 0.3508,
			width: 0.1707,
			height: 0.0197,
		},
	},
	{
		text: "E.S. MADRID SUR",
		box: {
			x: 0.122,
			y: 0.3701,
			width: 0.3157,
			height: 0.0217,
		},
	},
	{
		text: "CIF B12345678",
		box: {
			x: 0.122,
			y: 0.3933,
			width: 0.2718,
			height: 0.0185,
		},
	},
	{
		text: "Fecha 27/10/2026 09:15",
		box: {
			x: 0.1188,
			y: 0.4396,
			width: 0.4574,
			height: 0.0218,
		},
	},
	{
		text: "GASOLINA 95",
		box: {
			x: 0.1158,
			y: 0.4869,
			width: 0.2307,
			height: 0.0182,
		},
	},
	{
		text: "42,15 L x 1,589 EUR/L",
		box: {
			x: 0.1153,
			y: 0.5084,
			width: 0.4421,
			height: 0.0274,
		},
	},
	{
		text: "AGUA 2 x 1,20",
		box: {
			x: 0.1163,
			y: 0.5332,
			width: 0.2738,
			height: 0.0223,
		},
	},
	{
		text: "TOTAL",
		box: {
			x: 0.1132,
			y: 0.5799,
			width: 0.1101,
			height: 0.0174,
		},
	},
	{
		text: "TARJETA",
		box: {
			x: 0.1096,
			y: 0.6033,
			width: 0.1551,
			height: 0.0175,
		},
	},
	{
		text: "IVA 21% incluido",
		box: {
			x: 0.1094,
			y: 0.626,
			width: 0.3379,
			height: 0.0215,
		},
	},
	{
		text: "66,98",
		box: {
			x: 0.6132,
			y: 0.5145,
			width: 0.1101,
			height: 0.0233,
		},
	},
	{
		text: "2,40",
		box: {
			x: 0.6507,
			y: 0.5375,
			width: 0.0917,
			height: 0.0223,
		},
	},
	{
		text: "69,38",
		box: {
			x: 0.6321,
			y: 0.5843,
			width: 0.1069,
			height: 0.0218,
		},
	},
	{
		text: "69,38",
		box: {
			x: 0.6288,
			y: 0.6089,
			width: 0.1103,
			height: 0.022,
		},
	},
];

export const cafeOnly: OcrLine[] = [
	{
		text: "CAFE CENTRAL",
		box: {
			x: 0.3361,
			y: 0.3614,
			width: 0.3373,
			height: 0.0218,
		},
	},
	{
		text: "NIF 509876543",
		box: {
			x: 0.119,
			y: 0.3817,
			width: 0.2747,
			height: 0.0182,
		},
	},
	{
		text: "Data 29-10-2026 08:03",
		box: {
			x: 0.1187,
			y: 0.428,
			width: 0.4387,
			height: 0.0218,
		},
	},
	{
		text: "BOLO 2 x 5,00",
		box: {
			x: 0.116,
			y: 0.4765,
			width: 0.2743,
			height: 0.0204,
		},
	},
	{
		text: "CAFE 1 x 0,80",
		box: {
			x: 0.116,
			y: 0.5004,
			width: 0.2741,
			height: 0.0211,
		},
	},
	{
		text: "AGUA 1 x 1,50",
		box: {
			x: 0.1158,
			y: 0.5232,
			width: 0.2744,
			height: 0.0221,
		},
	},
	{
		text: "TOTAL",
		box: {
			x: 0.1126,
			y: 0.5702,
			width: 0.111,
			height: 0.0154,
		},
	},
	{
		text: "NUMERARIO",
		box: {
			x: 0.1101,
			y: 0.5945,
			width: 0.1918,
			height: 0.016,
		},
	},
	{
		text: "TROCO",
		box: {
			x: 0.1132,
			y: 0.6177,
			width: 0.107,
			height: 0.0147,
		},
	},
	{
		text: "10,00",
		box: {
			x: 0.6351,
			y: 0.4795,
			width: 0.1103,
			height: 0.0221,
		},
	},
	{
		text: "0,80",
		box: {
			x: 0.6541,
			y: 0.5029,
			width: 0.0912,
			height: 0.0218,
		},
	},
	{
		text: "1,50",
		box: {
			x: 0.6537,
			y: 0.5258,
			width: 0.0888,
			height: 0.0224,
		},
	},
	{
		text: "12,30",
		box: {
			x: 0.6316,
			y: 0.575,
			width: 0.1079,
			height: 0.0201,
		},
	},
	{
		text: "15,00",
		box: {
			x: 0.6318,
			y: 0.597,
			width: 0.1106,
			height: 0.021,
		},
	},
	{
		text: "2,70",
		box: {
			x: 0.6475,
			y: 0.6204,
			width: 0.0918,
			height: 0.0209,
		},
	},
];

export const shellGallons: OcrLine[] = [
	{
		text: "SHELL",
		box: {
			x: 0.4245,
			y: 0.327,
			width: 0.1509,
			height: 0.0233,
		},
	},
	{
		text: "1450 MAIN ST",
		box: {
			x: 0.1162,
			y: 0.347,
			width: 0.2581,
			height: 0.0211,
		},
	},
	{
		text: "SPRINGFIELD IL",
		box: {
			x: 0.1164,
			y: 0.3705,
			width: 0.3019,
			height: 0.0205,
		},
	},
	{
		text: "10/26/2026 5:31 PM",
		box: {
			x: 0.1132,
			y: 0.4157,
			width: 0.4057,
			height: 0.0247,
		},
	},
	{
		text: "PUMP# 07",
		box: {
			x: 0.116,
			y: 0.4645,
			width: 0.1767,
			height: 0.0202,
		},
	},
	{
		text: "REGULAR UNLD",
		box: {
			x: 0.1164,
			y: 0.4884,
			width: 0.2579,
			height: 0.0189,
		},
	},
	{
		text: "GALLONS",
		box: {
			x: 0.1164,
			y: 0.5116,
			width: 0.1541,
			height: 0.0189,
		},
	},
	{
		text: "PRICE/GAL",
		box: {
			x: 0.1163,
			y: 0.5347,
			width: 0.1983,
			height: 0.0207,
		},
	},
	{
		text: "FUEL TOTAL",
		box: {
			x: 0.1162,
			y: 0.5578,
			width: 0.2173,
			height: 0.0197,
		},
	},
	{
		text: "CREDIT",
		box: {
			x: 0.113,
			y: 0.6044,
			width: 0.1356,
			height: 0.0224,
		},
	},
	{
		text: "THANK YOU",
		box: {
			x: 0.1162,
			y: 0.6523,
			width: 0.1953,
			height: 0.0196,
		},
	},
	{
		text: "11.482",
		box: {
			x: 0.4243,
			y: 0.5113,
			width: 0.1357,
			height: 0.0224,
		},
	},
	{
		text: "$3.459",
		box: {
			x: 0.4241,
			y: 0.5344,
			width: 0.136,
			height: 0.0243,
		},
	},
	{
		text: "$39.72",
		box: {
			x: 0.4245,
			y: 0.5567,
			width: 0.1352,
			height: 0.0233,
		},
	},
	{
		text: "$39.72",
		box: {
			x: 0.4245,
			y: 0.6032,
			width: 0.1352,
			height: 0.0233,
		},
	},
];

export const totalTilted: OcrLine[] = [
	{
		text: "TOTALENERGIES",
		box: {
			x: 0.2785,
			y: 0.3398,
			width: 0.3677,
			height: 0.0432,
		},
	},
	{
		text: "Relais Lyon Est",
		box: {
			x: 0.0856,
			y: 0.379,
			width: 0.3172,
			height: 0.0335,
		},
	},
	{
		text: "Le 25/10/2026 a 12:07",
		box: {
			x: 0.0999,
			y: 0.4169,
			width: 0.4383,
			height: 0.042,
		},
	},
	{
		text: "Pompe 2 GAZOLE",
		box: {
			x: 0.1107,
			y: 0.4706,
			width: 0.3176,
			height: 0.0361,
		},
	},
	{
		text: "Volume",
		box: {
			x: 0.1195,
			y: 0.5087,
			width: 0.1258,
			height: 0.0174,
		},
	},
	{
		text: "Prix unit.",
		box: {
			x: 0.1228,
			y: 0.5232,
			width: 0.2124,
			height: 0.0272,
		},
	},
	{
		text: "Montant",
		box: {
			x: 0.1259,
			y: 0.5511,
			width: 0.157,
			height: 0.024,
		},
	},
	{
		text: "45,30 L",
		box: {
			x: 0.403,
			y: 0.4874,
			width: 0.1552,
			height: 0.0291,
		},
	},
	{
		text: "1,749 EUR/L",
		box: {
			x: 0.4109,
			y: 0.503,
			width: 0.2378,
			height: 0.0359,
		},
	},
	{
		text: "79,23 EUR",
		box: {
			x: 0.4179,
			y: 0.5312,
			width: 0.1965,
			height: 0.0318,
		},
	},
	{
		text: "TVA 20%",
		box: {
			x: 0.1416,
			y: 0.5974,
			width: 0.1565,
			height: 0.0236,
		},
	},
	{
		text: "TOTAL TTC",
		box: {
			x: 0.1454,
			y: 0.6181,
			width: 0.1971,
			height: 0.0272,
		},
	},
	{
		text: "CB SANS CONTACT",
		box: {
			x: 0.1511,
			y: 0.6336,
			width: 0.3206,
			height: 0.0338,
		},
	},
	{
		text: "13,21",
		box: {
			x: 0.4284,
			y: 0.5834,
			width: 0.1102,
			height: 0.0246,
		},
	},
	{
		text: "79,23 EUR",
		box: {
			x: 0.4339,
			y: 0.6019,
			width: 0.1987,
			height: 0.0307,
		},
	},
];
