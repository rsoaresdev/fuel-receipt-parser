// Prints the OCR lines Apple Vision reads from a receipt photo, as the
// `OcrLine[]` JSON the parser takes. macOS only.
//
//   swift scripts/ocr-dump.swift receipt.jpg [language] > lines.json
//
// Accurate recognition with language correction off (it "corrects" numbers),
// the three best candidates per line, and boxes flipped to a top-left origin.
// Redact the output before you share it: see test/fixtures/README.md.

import AppKit
import Foundation
import Vision

let arguments = CommandLine.arguments
guard arguments.count >= 2,
	let image = NSImage(contentsOfFile: arguments[1]),
	let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil)
else {
	FileHandle.standardError.write("usage: swift scripts/ocr-dump.swift <image> [language]\n".data(using: .utf8)!)
	exit(64)
}

let request = VNRecognizeTextRequest()
if let latest = VNRecognizeTextRequest.supportedRevisions.max() { request.revision = latest }
request.recognitionLevel = .accurate
request.usesLanguageCorrection = false
request.minimumTextHeight = 0.01
request.automaticallyDetectsLanguage = true
let supported = (try? request.supportedRecognitionLanguages()) ?? []
request.recognitionLanguages = ([arguments.count > 2 ? arguments[2] : "en"] + ["en"])
	.compactMap { code in supported.first { $0.hasPrefix(String(code.prefix(2))) } }

try VNImageRequestHandler(cgImage: cgImage, options: [:]).perform([request])

func topLeft(_ box: CGRect) -> [String: Double] {
	["x": box.minX, "y": 1 - box.maxY, "width": box.width, "height": box.height]
}

let lines: [[String: Any]] = (request.results ?? []).compactMap { observation in
	let candidates = observation.topCandidates(3)
	guard let best = candidates.first, !best.string.trimmingCharacters(in: .whitespaces).isEmpty
	else { return nil }
	var line: [String: Any] = [
		"text": best.string,
		"confidence": Double(best.confidence),
		"box": topLeft(observation.boundingBox),
	]
	let alternates = candidates.dropFirst().map(\.string).filter { $0 != best.string }
	if !alternates.isEmpty { line["alternates"] = Array(Set(alternates)) }
	return line
}

let json = try JSONSerialization.data(withJSONObject: lines, options: [.prettyPrinted, .sortedKeys])
print(String(data: json, encoding: .utf8)!)
