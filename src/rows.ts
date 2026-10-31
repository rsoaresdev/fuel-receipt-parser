/**
 * Printed rows, put back together from what the recogniser split apart.
 *
 * A recogniser breaks a row wherever the print leaves a wide gap, so
 * `GALLONS ........ 11.482` arrives as two observations, and a table of
 * columns arrives one column at a time. The engine reads a number's label
 * from what precedes it on its line, so a split row loses every label. This
 * joins the pieces that share a baseline, left to right, and puts the rows in
 * reading order. Lines without a usable box are left exactly as they came.
 */

import { boxForRange, type NumberToken, unitFor } from "./numbers.js";
import type { OcrLine, OcrWord, TextBox } from "./types.js";

/** Wider than the space inside a grouped number, so two pieces never read as one. */
const GAP = "   ";

export interface Rows {
	lines: OcrLine[];
	/** The caller's line a box on a joined row was read from. */
	origin: (lineIndex: number, box: TextBox) => number;
}

function centreY(box: TextBox, slope: number): number {
	return box.y + box.height / 2 - slope * (box.x + box.width / 2);
}

/**
 * The page's tilt, as the drop in `y` per unit of `x`, read off the lines
 * that have words far enough apart to measure it. A photo taken at a slight
 * angle puts the two ends of one row at different heights, and on a wide row
 * that difference is larger than the print.
 */
function slopeOf(lines: readonly OcrLine[]): number {
	const slopes: number[] = [];
	for (const line of lines) {
		const words = line.words ?? [];
		if (words.length < 2) continue;
		const first = words[0].box;
		const last = words[words.length - 1].box;
		const run = last.x + last.width / 2 - (first.x + first.width / 2);
		if (run < 0.1) continue;
		slopes.push(
			(last.y + last.height / 2 - (first.y + first.height / 2)) / run,
		);
	}
	if (slopes.length === 0) return 0;
	slopes.sort((a, b) => a - b);
	return slopes[Math.floor(slopes.length / 2)];
}

/** Word boxes for a piece, estimated from character offsets when it has none. */
function wordsOf(line: OcrLine): readonly OcrWord[] {
	if (line.words && line.words.length > 0) return line.words;
	return [...line.text.matchAll(/\S+/g)].map((match) => ({
		text: match[0],
		box: boxForRange(line, match.index, match.index + match[0].length),
	}));
}

function union(boxes: readonly TextBox[]): TextBox {
	const x = Math.min(...boxes.map((b) => b.x));
	const y = Math.min(...boxes.map((b) => b.y));
	return {
		x,
		y,
		width: Math.max(...boxes.map((b) => b.x + b.width)) - x,
		height: Math.max(...boxes.map((b) => b.y + b.height)) - y,
	};
}

export function joinRows(lines: readonly OcrLine[]): Rows {
	const identity: Rows = { lines: [...lines], origin: (index) => index };
	if (
		lines.length < 2 ||
		lines.some((line) => !(line.box.height > 0 && line.box.width > 0))
	)
		return identity;

	const slope = slopeOf(lines);
	const order = lines
		.map((line, index) => ({ line, index, centre: centreY(line.box, slope) }))
		.sort((a, b) => a.centre - b.centre || a.index - b.index);

	const rows: { pieces: typeof order; centre: number; height: number }[] = [];
	for (const piece of order) {
		const row = rows.find(
			(candidate) =>
				Math.abs(candidate.centre - piece.centre) <
					Math.min(candidate.height, piece.line.box.height) / 2 &&
				candidate.pieces.every(
					(other) =>
						other.line.box.x + other.line.box.width <= piece.line.box.x ||
						piece.line.box.x + piece.line.box.width <= other.line.box.x,
				),
		);
		if (row) {
			row.pieces.push(piece);
		} else {
			rows.push({
				pieces: [piece],
				centre: piece.centre,
				height: piece.line.box.height,
			});
		}
	}

	const joined = rows.map(({ pieces }) => {
		if (pieces.length === 1) return pieces[0].line;
		pieces.sort((a, b) => a.line.box.x - b.line.box.x);
		const texts = pieces.map((piece) => piece.line.text);
		const alternates: string[] = [];
		pieces.forEach((piece, at) => {
			for (const alternate of piece.line.alternates ?? []) {
				if (alternates.length >= 3) break;
				alternates.push(
					texts.map((text, i) => (i === at ? alternate : text)).join(GAP),
				);
			}
		});
		const confidences = pieces
			.map((piece) => piece.line.confidence)
			.filter((value): value is number => value !== undefined);
		return {
			text: texts.join(GAP),
			box: union(pieces.map((piece) => piece.line.box)),
			words: pieces.flatMap((piece) => wordsOf(piece.line)),
			...(confidences.length > 0 && { confidence: Math.min(...confidences) }),
			...(alternates.length > 0 && { alternates }),
		};
	});

	return {
		lines: joined,
		origin(lineIndex, box) {
			const pieces = rows[lineIndex]?.pieces;
			if (!pieces) return lineIndex;
			const middle = box.x + box.width / 2;
			let best = pieces[0];
			for (const piece of pieces) {
				const { x, width } = piece.line.box;
				const distance = Math.max(x - middle, middle - (x + width), 0);
				const bestBox = best.line.box;
				if (
					distance <
					Math.max(bestBox.x - middle, middle - (bestBox.x + bestBox.width), 0)
				)
					best = piece;
			}
			return best.index;
		},
	};
}

/**
 * A number with no words before it, under a row of headings, takes the
 * heading above it as its label: `Litros  PVP/L  Valor` over
 * `38,52  1,659  63,90`. The heading's unit becomes the number's unit, so
 * `Litros` makes litres of a bare `38,52` the same way it would beside it.
 */
export function labelColumns(
	tokens: readonly NumberToken[],
	lines: readonly OcrLine[],
): void {
	for (const token of tokens) {
		if (/\p{L}/u.test(token.before) || token.lineIndex === 0) continue;
		const above = lines[token.lineIndex - 1];
		if (/\d/.test(above.text)) continue;
		const left = token.box.x;
		const right = token.box.x + token.box.width;
		const words = wordsOf(above);
		let heading = words
			.filter(({ box }) => box.x < right && left < box.x + box.width)
			.map(({ text }) => text)
			.join(" ");
		// A right-aligned number under a left-aligned heading: the nearest
		// heading, if it is no further off than the wider of the two.
		if (!heading) {
			const middle = left + token.box.width / 2;
			const nearest = words
				.map((word) => ({
					word,
					distance: Math.abs(word.box.x + word.box.width / 2 - middle),
				}))
				.sort((a, b) => a.distance - b.distance)[0];
			if (
				nearest &&
				nearest.distance < Math.max(nearest.word.box.width, token.box.width)
			)
				heading = nearest.word.text;
		}
		if (!heading) continue;
		token.heading = heading;
		token.unit ??= unitFor(heading, "");
	}
}
