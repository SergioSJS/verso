// A small stand-in for the part of vitest that Rolai's rules-engine tests
// use (describe, it, expect with toBe / toEqual / toBeUndefined / toContain /
// toHaveLength / toMatchObject / toThrow, and `.rejects`), over node:test and
// node:assert, so the tests copied from Rolai run unchanged (ADR 0088 item 5).
import { describe, it } from "node:test";
import assert from "node:assert/strict";

export { describe, it };

// vitest's toEqual: structural, an undefined property is the same as none.
function clean(v) {
  if (Array.isArray(v)) return v.map(clean);
  if (v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype) {
    const o = {};
    for (const k of Object.keys(v)) if (v[k] !== undefined) o[k] = clean(v[k]);
    return o;
  }
  return v;
}

function subset(actual, expected, path = "") {
  if (expected && typeof expected === "object") {
    assert.ok(actual && typeof actual === "object", `${path || "value"} is not an object`);
    for (const k of Object.keys(expected)) subset(actual[k], expected[k], `${path}.${k}`);
  } else assert.deepEqual(actual, expected, path);
}

function throwing(fn, what, ok) {
  try {
    fn();
  } catch (e) {
    return ok(e);
  }
  assert.fail(`${what} did not throw`);
}

function check(e, expected) {
  if (expected === undefined) return;
  if (typeof expected === "string") assert.ok(String(e?.message).includes(expected), `"${e?.message}" lacks "${expected}"`);
  else if (expected instanceof RegExp) assert.match(String(e?.message), expected);
  else assert.ok(e instanceof expected, `${e} is not a ${expected.name}`);
}

export function expect(actual) {
  return {
    toBe: (x) => assert.strictEqual(actual, x),
    toEqual: (x) => assert.deepStrictEqual(clean(actual), clean(x)),
    toBeUndefined: () => assert.strictEqual(actual, undefined),
    toContain: (x) => assert.ok(actual.includes(x), `${JSON.stringify(actual)} lacks ${JSON.stringify(x)}`),
    toHaveLength: (n) => assert.strictEqual(actual.length, n),
    toMatchObject: (x) => subset(actual, x),
    toThrow: (expected) => throwing(actual, "the function", (e) => check(e, expected)),
    rejects: {
      toThrow: async (expected) => {
        let err;
        try {
          await actual;
        } catch (e) {
          err = e;
        }
        assert.ok(err !== undefined, "the promise did not reject");
        check(err, expected);
      },
    },
  };
}
