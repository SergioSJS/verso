// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
//
// Drives the app window from outside for verification (a CGEvent tool;
// `swiftc -O -o mouse mouse.swift`). Not part of the product.
import Foundation
import CoreGraphics
// mouse right X Y        — right click
// mouse scroll X Y DY    — wheel, DY lines (negative = down)
let a = Array(CommandLine.arguments.dropFirst())
guard a.count >= 3, let x = Double(a[1]), let y = Double(a[2]) else { fputs("usage\n", stderr); exit(2) }
let p = CGPoint(x: x, y: y)
func post(_ e: CGEvent?) { e?.post(tap: .cghidEventTap); usleep(40_000) }
post(CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: p, mouseButton: .left))
if a[0] == "right" {
  post(CGEvent(mouseEventSource: nil, mouseType: .rightMouseDown, mouseCursorPosition: p, mouseButton: .right))
  post(CGEvent(mouseEventSource: nil, mouseType: .rightMouseUp, mouseCursorPosition: p, mouseButton: .right))
} else if a[0] == "scroll", a.count >= 4, let dy = Int32(a[3]) {
  for _ in 0..<5 { post(CGEvent(scrollWheelEvent2Source: nil, units: .line, wheelCount: 1, wheel1: dy, wheel2: 0, wheel3: 0)) }
}
