// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/** Puts a module's `this`-typed functions on a class's prototype as its
 *  methods (ADR 0067): a class too long for one file keeps a `declare`
 *  per method, and each area of it lives in a module of its own. The
 *  descriptor is a class method's — writable, configurable, not
 *  enumerable — so nothing tells the two apart. */
export function methods(target: { prototype: object }, fns: Record<string, unknown>): void {
  for (const [name, fn] of Object.entries(fns)) {
    if (typeof fn !== "function") continue;
    Object.defineProperty(target.prototype, name, { value: fn, writable: true, configurable: true, enumerable: false });
  }
}
