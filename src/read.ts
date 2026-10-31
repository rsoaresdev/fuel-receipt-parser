/**
 * Reading a page twice, and keeping the better reading.
 *
 * The first pass reads the photograph as it is. When its three numbers do
 * not multiply out, the caller can ask the recogniser for a second look at the same
 * page in black and white with the contrast pushed - print that faded past
 * what the first pass could resolve often comes back on the second - and the
 * two readings are held against each other here.
 *
 * "Better" has one meaning that outranks every other: a sum that closes. A
 * reading whose litres times price come to its total was checked by
 * arithmetic, and no number of well-labelled fields on the other reading can
 * compete with that. Below it, more numbers read off the paper beat fewer,
 * and a tie goes to the first pass, because the plain image is the one the
 * reader is looking at and the one whose boxes were cut from real words.
 *
 * Whichever wins, the loser still fills in what the winner missed. A second
 * pass that closed the sum but lost the date to the contrast has not lost the
 * date: the first pass read it, and it is the same paper.
 */

import type { ReceiptReading } from "./types.js";

/** Whether a reading is worth a second, harder look. */
export function wantsSecondPass(reading: ReceiptReading): boolean {
	return !reading.arithmeticChecked;
}

/** What a reading is worth, for choosing between two of the same page. */
function worth(reading: ReceiptReading): number {
	let score = reading.arithmeticChecked ? 100 : 0;
	for (const field of [reading.quantity, reading.unitPrice, reading.total]) {
		if (!field) continue;
		score += 10 + field.confidence;
	}
	return score;
}

/** The better of two readings of the same page, completed by the other. */
export function betterReading(
	first: ReceiptReading,
	second: ReceiptReading,
): ReceiptReading {
	const winner = worth(second) > worth(first) ? second : first;
	const loser = winner === first ? second : first;

	return {
		...winner,
		date: winner.date ?? loser.date,
		time: winner.time ?? loser.time,
		currency: winner.currency ?? loser.currency,
		fuelLabel: winner.fuelLabel ?? loser.fuelLabel,
		fuelTypeId: winner.fuelTypeId ?? loser.fuelTypeId,
		place: winner.place ?? loser.place,
		odometer: winner.odometer ?? loser.odometer,
		odometerUnit: winner.odometer ? winner.odometerUnit : loser.odometerUnit,
	};
}
