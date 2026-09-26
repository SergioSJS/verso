import type { EditorView } from "codemirror";
import { type ChangeSpec, EditorSelection, type Extension, Prec } from "@codemirror/state";
import { keymap } from "@codemirror/view";

const ORDERED_RE = /^([ \t]*)(\d+)([.)]\s+)(.*)$/;
const UNORDERED_RE = /^([ \t]*)([-*+]\s+)(.*)$/;

interface LineEdit {
  lineNum: number;
  from: number;
  to: number;
  newText: string;
  newLevel: number;
  newNum?: number;
  prefixDiff: number;
  oldPrefixLen: number;
  newPrefixLen: number;
}

/**
 * Calculates visual indentation depth (1 tab = 1 level, 4 spaces = 1 level, 2 spaces = 1 level).
 */
export function calcIndentLevel(indent: string): number {
  let lvl = 0;
  for (let i = 0; i < indent.length; i++) {
    if (indent[i] === "\t") lvl++;
    else if (indent.slice(i, i + 4) === "    ") { lvl++; i += 3; }
    else if (indent.slice(i, i + 2) === "  ") { lvl++; i += 1; }
  }
  return lvl;
}

/**
 * Smart indent for Markdown lists:
 * - Inserts a TAB (\t) on Tab.
 * - On ordered lists, resets the numbering to 1 if starting a new nested level
 *   under a parent item, or continues the sequence of existing siblings.
 * - Resequences subsequent lines in the list block so there are no numbering gaps.
 */
export function smartIndentList(view: EditorView): boolean {
  const { state } = view;
  const { doc, selection } = state;

  const lineNums: number[] = [];
  for (const range of selection.ranges) {
    const start = doc.lineAt(range.from).number;
    const end = doc.lineAt(range.to).number;
    for (let l = start; l <= end; l++) {
      if (!lineNums.includes(l)) lineNums.push(l);
    }
  }
  lineNums.sort((a, b) => a - b);

  const hasList = lineNums.some((ln) => {
    const text = doc.line(ln).text;
    return ORDERED_RE.test(text) || UNORDERED_RE.test(text);
  });
  if (!hasList) return false;

  const edits = new Map<number, LineEdit>();

  for (const ln of lineNums) {
    const line = doc.line(ln);
    const text = line.text;
    const om = text.match(ORDERED_RE);
    if (om) {
      const currIndent = om[1]!;
      const delim = om[3]!;
      const content = om[4]!;
      const newIndent = currIndent + "\t";
      const targetLevel = calcIndentLevel(newIndent);

      // Look upwards for sibling at targetLevel
      let targetNum = 1;
      for (let p = ln - 1; p >= 1; p--) {
        const prevEdit = edits.get(p);
        const prevLevel = prevEdit !== undefined ? prevEdit.newLevel : calcIndentLevel(doc.line(p).text.match(/^([ \t]*)/)?.[1] ?? "");
        const prevText = doc.line(p).text;
        if (!prevText.trim()) break;

        const pm = prevText.match(ORDERED_RE);
        if (pm || prevEdit?.newNum !== undefined) {
          const num = prevEdit?.newNum ?? (pm ? parseInt(pm[2]!, 10) : 1);
          if (prevLevel === targetLevel) {
            targetNum = num + 1;
            break;
          } else if (prevLevel < targetLevel) {
            targetNum = 1;
            break;
          }
        } else if (UNORDERED_RE.test(prevText)) {
          if (prevLevel < targetLevel) {
            targetNum = 1;
            break;
          }
        } else {
          break;
        }
      }

      const oldPrefix = om[1]! + om[2]! + delim;
      const newPrefix = newIndent + targetNum + delim;
      const newText = newPrefix + content;
      edits.set(ln, {
        lineNum: ln,
        from: line.from,
        to: line.to,
        newText,
        newLevel: targetLevel,
        newNum: targetNum,
        prefixDiff: newPrefix.length - oldPrefix.length,
        oldPrefixLen: oldPrefix.length,
        newPrefixLen: newPrefix.length,
      });
      continue;
    }

    const um = text.match(UNORDERED_RE);
    if (um) {
      const currIndent = um[1]!;
      const marker = um[2]!;
      const content = um[3]!;
      const newIndent = currIndent + "\t";
      const oldPrefix = currIndent + marker;
      const newPrefix = newIndent + marker;
      const newText = newPrefix + content;
      edits.set(ln, {
        lineNum: ln,
        from: line.from,
        to: line.to,
        newText,
        newLevel: calcIndentLevel(newIndent),
        prefixDiff: newPrefix.length - oldPrefix.length,
        oldPrefixLen: oldPrefix.length,
        newPrefixLen: newPrefix.length,
      });
      continue;
    }

    const newText = "\t" + text;
    edits.set(ln, {
      lineNum: ln,
      from: line.from,
      to: line.to,
      newText,
      newLevel: calcIndentLevel(text.match(/^([ \t]*)/)?.[1] ?? "") + 1,
      prefixDiff: 1,
      oldPrefixLen: 0,
      newPrefixLen: 1,
    });
  }

  // Resequence subsequent lines in the list block
  const lastSelectedLn = lineNums[lineNums.length - 1]!;
  for (let k = lastSelectedLn + 1; k <= doc.lines; k++) {
    const kLine = doc.line(k);
    const kText = kLine.text;
    if (!kText.trim()) break;

    const km = kText.match(ORDERED_RE);
    if (!km) {
      if (!UNORDERED_RE.test(kText)) break;
      continue;
    }

    const kLevel = calcIndentLevel(km[1]!);
    let expectedNum = 1;
    for (let p = k - 1; p >= 1; p--) {
      const prevEdit = edits.get(p);
      const prevLevel = prevEdit !== undefined ? prevEdit.newLevel : calcIndentLevel(doc.line(p).text.match(/^([ \t]*)/)?.[1] ?? "");
      const prevText = doc.line(p).text;
      if (!prevText.trim()) break;

      const pm = prevText.match(ORDERED_RE);
      if (pm || prevEdit?.newNum !== undefined) {
        const num = prevEdit?.newNum ?? (pm ? parseInt(pm[2]!, 10) : 1);
        if (prevLevel === kLevel) {
          expectedNum = num + 1;
          break;
        } else if (prevLevel < kLevel) {
          expectedNum = 1;
          break;
        }
      } else if (UNORDERED_RE.test(prevText)) {
        if (prevLevel <= kLevel) {
          expectedNum = 1;
          break;
        }
      } else {
        break;
      }
    }

    const currentNum = parseInt(km[2]!, 10);
    if (currentNum !== expectedNum) {
      const oldPrefix = km[1]! + km[2]! + km[3]!;
      const newPrefix = km[1]! + expectedNum + km[3]!;
      const newText = newPrefix + km[4]!;
      edits.set(k, {
        lineNum: k,
        from: kLine.from,
        to: kLine.to,
        newText,
        newLevel: kLevel,
        newNum: expectedNum,
        prefixDiff: newPrefix.length - oldPrefix.length,
        oldPrefixLen: oldPrefix.length,
        newPrefixLen: newPrefix.length,
      });
    } else {
      edits.set(k, {
        lineNum: k,
        from: kLine.from,
        to: kLine.to,
        newText: kText,
        newLevel: kLevel,
        newNum: currentNum,
        prefixDiff: 0,
        oldPrefixLen: 0,
        newPrefixLen: 0,
      });
    }
  }

  const changes: ChangeSpec[] = [];
  for (const edit of edits.values()) {
    if (edit.newText !== doc.line(edit.lineNum).text) {
      changes.push({ from: edit.from, to: edit.to, insert: edit.newText });
    }
  }

  if (changes.length === 0) return false;

  const newRanges = selection.ranges.map((range) => {
    const startLine = doc.lineAt(range.from);
    const edit = edits.get(startLine.number);
    if (!edit) return range;

    const diff = edit.prefixDiff;
    const oldPrefixEnd = startLine.from + edit.oldPrefixLen;
    let newFrom: number;
    if (range.from >= oldPrefixEnd) {
      newFrom = range.from + diff;
    } else {
      newFrom = startLine.from + edit.newPrefixLen;
    }

    if (range.empty) {
      return EditorSelection.cursor(newFrom);
    }

    const endLine = doc.lineAt(range.to);
    const endEdit = edits.get(endLine.number) ?? edit;
    const newTo = range.to + endEdit.prefixDiff;
    return EditorSelection.range(newFrom, Math.max(newFrom, newTo));
  });

  view.dispatch({
    changes,
    selection: EditorSelection.create(newRanges),
    userEvent: "input.indent",
  });
  return true;
}

/**
 * Smart unindent for Markdown lists:
 * - Removes a TAB (\t) on Shift-Tab.
 * - Recalculates the parent list number.
 * - Resequences subsequent lines in the list block.
 */
export function smartUnindentList(view: EditorView): boolean {
  const { state } = view;
  const { doc, selection } = state;

  const lineNums: number[] = [];
  for (const range of selection.ranges) {
    const start = doc.lineAt(range.from).number;
    const end = doc.lineAt(range.to).number;
    for (let l = start; l <= end; l++) {
      if (!lineNums.includes(l)) lineNums.push(l);
    }
  }
  lineNums.sort((a, b) => a - b);

  const hasList = lineNums.some((ln) => {
    const text = doc.line(ln).text;
    return ORDERED_RE.test(text) || UNORDERED_RE.test(text);
  });
  if (!hasList) return false;

  const edits = new Map<number, LineEdit>();

  for (const ln of lineNums) {
    const line = doc.line(ln);
    const text = line.text;
    const om = text.match(ORDERED_RE);
    if (om) {
      const currIndent = om[1]!;
      if (currIndent.length === 0) continue;
      const delim = om[3]!;
      const content = om[4]!;

      let newIndent = "";
      if (currIndent.endsWith("\t")) newIndent = currIndent.slice(0, -1);
      else if (currIndent.endsWith("    ")) newIndent = currIndent.slice(0, -4);
      else if (currIndent.endsWith("  ")) newIndent = currIndent.slice(0, -2);
      else newIndent = currIndent.replace(/(?: {1,4}|\t)$/, "");

      const targetLevel = calcIndentLevel(newIndent);

      // Look upwards for sibling at targetLevel
      let targetNum = 1;
      for (let p = ln - 1; p >= 1; p--) {
        const prevEdit = edits.get(p);
        const prevLevel = prevEdit !== undefined ? prevEdit.newLevel : calcIndentLevel(doc.line(p).text.match(/^([ \t]*)/)?.[1] ?? "");
        const prevText = doc.line(p).text;
        if (!prevText.trim()) break;

        const pm = prevText.match(ORDERED_RE);
        if (pm || prevEdit?.newNum !== undefined) {
          const num = prevEdit?.newNum ?? (pm ? parseInt(pm[2]!, 10) : 1);
          if (prevLevel === targetLevel) {
            targetNum = num + 1;
            break;
          } else if (prevLevel < targetLevel) {
            targetNum = 1;
            break;
          }
        } else if (UNORDERED_RE.test(prevText)) {
          if (prevLevel <= targetLevel) {
            targetNum = 1;
            break;
          }
        } else {
          break;
        }
      }

      const oldPrefix = om[1]! + om[2]! + delim;
      const newPrefix = newIndent + targetNum + delim;
      const newText = newPrefix + content;
      edits.set(ln, {
        lineNum: ln,
        from: line.from,
        to: line.to,
        newText,
        newLevel: targetLevel,
        newNum: targetNum,
        prefixDiff: newPrefix.length - oldPrefix.length,
        oldPrefixLen: oldPrefix.length,
        newPrefixLen: newPrefix.length,
      });
      continue;
    }

    const um = text.match(UNORDERED_RE);
    if (um) {
      const currIndent = um[1]!;
      if (currIndent.length === 0) continue;
      const marker = um[2]!;
      const content = um[3]!;

      let newIndent = "";
      if (currIndent.endsWith("\t")) newIndent = currIndent.slice(0, -1);
      else if (currIndent.endsWith("    ")) newIndent = currIndent.slice(0, -4);
      else if (currIndent.endsWith("  ")) newIndent = currIndent.slice(0, -2);
      else newIndent = currIndent.replace(/(?: {1,4}|\t)$/, "");

      const oldPrefix = currIndent + marker;
      const newPrefix = newIndent + marker;
      const newText = newPrefix + content;
      edits.set(ln, {
        lineNum: ln,
        from: line.from,
        to: line.to,
        newText,
        newLevel: calcIndentLevel(newIndent),
        prefixDiff: newPrefix.length - oldPrefix.length,
        oldPrefixLen: oldPrefix.length,
        newPrefixLen: newPrefix.length,
      });
      continue;
    }
  }

  // Resequence subsequent lines in the list block
  const lastSelectedLn = lineNums[lineNums.length - 1]!;
  for (let k = lastSelectedLn + 1; k <= doc.lines; k++) {
    const kLine = doc.line(k);
    const kText = kLine.text;
    if (!kText.trim()) break;

    const km = kText.match(ORDERED_RE);
    if (!km) {
      if (!UNORDERED_RE.test(kText)) break;
      continue;
    }

    const kLevel = calcIndentLevel(km[1]!);
    let expectedNum = 1;
    for (let p = k - 1; p >= 1; p--) {
      const prevEdit = edits.get(p);
      const prevLevel = prevEdit !== undefined ? prevEdit.newLevel : calcIndentLevel(doc.line(p).text.match(/^([ \t]*)/)?.[1] ?? "");
      const prevText = doc.line(p).text;
      if (!prevText.trim()) break;

      const pm = prevText.match(ORDERED_RE);
      if (pm || prevEdit?.newNum !== undefined) {
        const num = prevEdit?.newNum ?? (pm ? parseInt(pm[2]!, 10) : 1);
        if (prevLevel === kLevel) {
          expectedNum = num + 1;
          break;
        } else if (prevLevel < kLevel) {
          expectedNum = 1;
          break;
        }
      } else if (UNORDERED_RE.test(prevText)) {
        if (prevLevel <= kLevel) {
          expectedNum = 1;
          break;
        }
      } else {
        break;
      }
    }

    const currentNum = parseInt(km[2]!, 10);
    if (currentNum !== expectedNum) {
      const oldPrefix = km[1]! + km[2]! + km[3]!;
      const newPrefix = km[1]! + expectedNum + km[3]!;
      const newText = newPrefix + km[4]!;
      edits.set(k, {
        lineNum: k,
        from: kLine.from,
        to: kLine.to,
        newText,
        newLevel: kLevel,
        newNum: expectedNum,
        prefixDiff: newPrefix.length - oldPrefix.length,
        oldPrefixLen: oldPrefix.length,
        newPrefixLen: newPrefix.length,
      });
    } else {
      edits.set(k, {
        lineNum: k,
        from: kLine.from,
        to: kLine.to,
        newText: kText,
        newLevel: kLevel,
        newNum: currentNum,
        prefixDiff: 0,
        oldPrefixLen: 0,
        newPrefixLen: 0,
      });
    }
  }

  const changes: ChangeSpec[] = [];
  for (const edit of edits.values()) {
    if (edit.newText !== doc.line(edit.lineNum).text) {
      changes.push({ from: edit.from, to: edit.to, insert: edit.newText });
    }
  }

  if (changes.length === 0) return false;

  const newRanges = selection.ranges.map((range) => {
    const startLine = doc.lineAt(range.from);
    const edit = edits.get(startLine.number);
    if (!edit) return range;

    const diff = edit.prefixDiff;
    const oldPrefixEnd = startLine.from + edit.oldPrefixLen;
    let newFrom: number;
    if (range.from >= oldPrefixEnd) {
      newFrom = Math.max(startLine.from + edit.newPrefixLen, range.from + diff);
    } else {
      newFrom = startLine.from + edit.newPrefixLen;
    }

    if (range.empty) {
      return EditorSelection.cursor(newFrom);
    }

    const endLine = doc.lineAt(range.to);
    const endEdit = edits.get(endLine.number) ?? edit;
    const newTo = range.to + endEdit.prefixDiff;
    return EditorSelection.range(newFrom, Math.max(newFrom, newTo));
  });

  view.dispatch({
    changes,
    selection: EditorSelection.create(newRanges),
    userEvent: "input.unindent",
  });
  return true;
}

export const listKeymap: Extension = Prec.high(
  keymap.of([
    { key: "Tab", run: smartIndentList },
    { key: "Shift-Tab", run: smartUnindentList },
  ])
);
