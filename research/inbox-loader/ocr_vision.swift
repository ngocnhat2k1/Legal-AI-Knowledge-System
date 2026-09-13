// OCR a scanned PDF or image with macOS Vision (Vietnamese + English), print plain text.
//
//   swiftc -O ocr_vision.swift -o ocr_vision   # compile once
//   ./ocr_vision <file.pdf|file.tif|file.jpg> [maxPages] [pngDir]
//
// With pngDir, every rendered page is also written as page-N.png, so a second,
// independent reader can check the OCR — Vision garbles HS codes on old scans
// (`8479.89.30` came back as `84/9.89.30`).
//
// Rung 4 of the source ladder (.agent/docs/inbox-ingest-workflow.md): used ONLY when the
// authoritative text cannot be fetched from Công báo. Output is never cited as law; it
// goes to the notebook under an OCR label. Ships with macOS — no install, no network.
import Foundation
import PDFKit
import Vision
import CoreGraphics
import ImageIO

func recognize(_ image: CGImage) -> String {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.recognitionLanguages = ["vi-VT", "en-US"]
    request.usesLanguageCorrection = true
    let handler = VNImageRequestHandler(cgImage: image, options: [:])
    try? handler.perform([request])
    return (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }.joined(separator: "\n")
}

func render(_ page: PDFPage, scale: CGFloat = 2.5) -> CGImage? {
    let box = page.bounds(for: .mediaBox)
    let w = Int(box.width * scale), h = Int(box.height * scale)
    guard let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
                              space: CGColorSpaceCreateDeviceRGB(),
                              bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
    ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
    ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
    ctx.scaleBy(x: scale, y: scale)
    page.draw(with: .mediaBox, to: ctx)
    return ctx.makeImage()
}

let path = CommandLine.arguments[1]
let url = URL(fileURLWithPath: path)
let maxPages = CommandLine.arguments.count > 2 ? Int(CommandLine.arguments[2]) ?? Int.max : Int.max
let pngDir = CommandLine.arguments.count > 3 ? CommandLine.arguments[3] : nil

func savePNG(_ image: CGImage, _ n: Int) {
    guard let dir = pngDir else { return }
    let out = URL(fileURLWithPath: dir).appendingPathComponent("page-\(n).png")
    guard let dest = CGImageDestinationCreateWithURL(out as CFURL, "public.png" as CFString, 1, nil) else { return }
    CGImageDestinationAddImage(dest, image, nil)
    CGImageDestinationFinalize(dest)
}
if path.lowercased().hasSuffix(".pdf") {
    guard let doc = PDFDocument(url: url) else { FileHandle.standardError.write("cannot open pdf\n".data(using: .utf8)!); exit(1) }
    for i in 0..<min(doc.pageCount, maxPages) {
        guard let page = doc.page(at: i), let img = render(page) else { continue }
        savePNG(img, i + 1)
        print("<<<PAGE \(i + 1)>>>")
        print(recognize(img))
    }
} else {
    guard let src = CGImageSourceCreateWithURL(url as CFURL, nil) else { FileHandle.standardError.write("cannot open image\n".data(using: .utf8)!); exit(1) }
    for i in 0..<min(CGImageSourceGetCount(src), maxPages) {
        guard let img = CGImageSourceCreateImageAtIndex(src, i, nil) else { continue }
        savePNG(img, i + 1)
        print("<<<PAGE \(i + 1)>>>")
        print(recognize(img))
    }
}
