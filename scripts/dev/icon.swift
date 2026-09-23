import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers
// icon OUT.png — the Verso app icon: a warm paper sheet with its corner turned over (the verso side), on seal red.
let out = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "icon.png"
let S: CGFloat = 1024
let cs = CGColorSpace(name: CGColorSpace.sRGB)!
let ctx = CGContext(data: nil, width: Int(S), height: Int(S), bitsPerComponent: 8, bytesPerRow: 0, space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
func rgb(_ r: CGFloat, _ g: CGFloat, _ b: CGFloat, _ a: CGFloat = 1) -> CGColor { CGColor(colorSpace: cs, components: [r/255, g/255, b/255, a])! }
// Background: rounded square, seal red, faint vertical gradient.
let bg = CGPath(roundedRect: CGRect(x: 0, y: 0, width: S, height: S), cornerWidth: 229, cornerHeight: 229, transform: nil)
ctx.addPath(bg); ctx.clip()
let grad = CGGradient(colorsSpace: cs, colors: [rgb(150, 62, 48), rgb(112, 42, 33)] as CFArray, locations: [0, 1])!
ctx.drawLinearGradient(grad, start: CGPoint(x: 0, y: S), end: CGPoint(x: 0, y: 0), options: [])
// Page with the bottom-right corner cut (CG's y grows upward: "bottom" is low y).
let px: CGFloat = 212, py: CGFloat = 150, pw: CGFloat = 600, ph: CGFloat = 724, fold: CGFloat = 268, r: CGFloat = 34
let page = CGMutablePath()
page.move(to: CGPoint(x: px + r, y: py))
page.addLine(to: CGPoint(x: px + pw - fold, y: py))                 // to the cut
page.addLine(to: CGPoint(x: px + pw, y: py + fold))                 // cut edge
page.addLine(to: CGPoint(x: px + pw, y: py + ph - r))
page.addArc(tangent1End: CGPoint(x: px + pw, y: py + ph), tangent2End: CGPoint(x: px + pw - r, y: py + ph), radius: r)
page.addLine(to: CGPoint(x: px + r, y: py + ph))
page.addArc(tangent1End: CGPoint(x: px, y: py + ph), tangent2End: CGPoint(x: px, y: py + ph - r), radius: r)
page.addLine(to: CGPoint(x: px, y: py + r))
page.addArc(tangent1End: CGPoint(x: px, y: py), tangent2End: CGPoint(x: px + r, y: py), radius: r)
page.closeSubpath()
ctx.saveGState()
ctx.setShadow(offset: CGSize(width: 0, height: -22), blur: 48, color: rgb(40, 10, 6, 0.45))
ctx.addPath(page); ctx.setFillColor(rgb(247, 241, 232)); ctx.fillPath()
ctx.restoreGState()
// Text lines on the page, in a wash of the red.
// A title in the red, then text lines in a wash of it.
let lines: [(CGFloat, CGFloat, CGFloat, CGColor)] = [
  (600, 292, 34, rgb(150, 62, 48)),
  (720, 402, 22, rgb(226, 199, 190)), (720, 482, 22, rgb(226, 199, 190)), (720, 562, 22, rgb(226, 199, 190)), (500, 642, 22, rgb(226, 199, 190)),
]
for (x2, yTop, th, color) in lines {
  let y = S - yTop
  ctx.setFillColor(color)
  let line = CGPath(roundedRect: CGRect(x: 292, y: y - th / 2, width: x2 - 292, height: th), cornerWidth: th / 2, cornerHeight: th / 2, transform: nil)
  ctx.addPath(line); ctx.fillPath()
}
// The flap: the corner turned over, brass, with its own shadow on the page.
let flap = CGMutablePath()
flap.move(to: CGPoint(x: px + pw - fold, y: py))
flap.addLine(to: CGPoint(x: px + pw, y: py + fold))
flap.addLine(to: CGPoint(x: px + pw - fold, y: py + fold))
flap.closeSubpath()
ctx.saveGState()
ctx.setShadow(offset: CGSize(width: -10, height: 10), blur: 26, color: rgb(60, 30, 10, 0.35))
ctx.addPath(flap); ctx.clip()
let fg = CGGradient(colorsSpace: cs, colors: [rgb(214, 168, 96), rgb(176, 128, 58)] as CFArray, locations: [0, 1])!
ctx.drawLinearGradient(fg, start: CGPoint(x: px + pw - fold, y: py + fold), end: CGPoint(x: px + pw - fold * 0.3, y: py + fold * 0.3), options: [.drawsBeforeStartLocation, .drawsAfterEndLocation])
ctx.restoreGState()
let img = ctx.makeImage()!
let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: out) as CFURL, UTType.png.identifier as CFString, 1, nil)!
CGImageDestinationAddImage(dest, img, nil)
CGImageDestinationFinalize(dest)
print("wrote \(out)")
