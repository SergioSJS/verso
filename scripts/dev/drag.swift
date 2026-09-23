// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
//
// Drives the app window from outside for verification (a CGEvent tool;
// `swiftc -O -o drag drag.swift`). Not part of the product.
import Foundation
import CoreGraphics
// drag x1 y1 x2 y2 [steps]  — screen coordinates, left button.
let a = CommandLine.arguments.dropFirst().compactMap { Double($0) }
guard a.count >= 4 else { fputs("usage: drag x1 y1 x2 y2 [steps]\n", stderr); exit(2) }
let steps = a.count > 4 ? Int(a[4]) : 20
func post(_ type: CGEventType, _ x: Double, _ y: Double) {
  let e = CGEvent(mouseEventSource: nil, mouseType: type, mouseCursorPosition: CGPoint(x: x, y: y), mouseButton: .left)
  e?.post(tap: .cghidEventTap)
  usleep(30_000)
}
post(.mouseMoved, a[0], a[1])
post(.leftMouseDown, a[0], a[1])
for i in 1...steps {
  let f = Double(i) / Double(steps)
  post(.leftMouseDragged, a[0] + (a[2] - a[0]) * f, a[1] + (a[3] - a[1]) * f)
}
usleep(200_000)
post(.leftMouseUp, a[2], a[3])
