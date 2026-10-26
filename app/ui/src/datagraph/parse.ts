// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { parseCsv } from "./csv";
import { BoxLimit, type Format, type Tree } from "./model";
import { parseJson, parseJsonLines } from "./json";
import { parseToml } from "./toml";
import { parseXml } from "./xml";
import { parseYaml } from "./yamlParse";

/** The text of a file of `format` as a tree of boxes. Never throws on bad text: the error is in the tree. */
export function parse(text: string, format: Format): Tree {
  try {
    return parseText(text, format);
  } catch (e) {
    if (e instanceof BoxLimit) return { format, nodes: [], roots: [], error: null, tooMany: true };
    throw e;
  }
}

function parseText(text: string, format: Format): Tree {
  switch (format) {
    case "json":
    case "jsonc": return parseJson(text, format);
    case "jsonl": return parseJsonLines(text);
    case "yaml": return parseYaml(text);
    case "toml": return parseToml(text);
    case "xml": return parseXml(text);
    case "csv":
    case "tsv": return parseCsv(text, format);
  }
}
