// v2.3 plan 11 §Fault matrix — the census guard.
//
// The matrix asks nine stateful packages to be demonstrated under nine fault shapes. Left as prose it
// rots in one direction only: a cell that loses its test reads exactly like a cell that never needed
// one. So the table is checked in both directions here, the way the ownership census is — a
// citation must name a test that exists in the file it claims, an `na` must say why, and the number
// of unproven cells is printed so it can only move deliberately.

import { FAULT_PACKAGES, FAULT_SHAPES, cellKey, citationMatches, countByStatus, loadFaultMatrix, readTestFile } from "../../test/findings/faultMatrix";

const matrix = loadFaultMatrix();
const cells = matrix.cells;

describe("plan-11 fault matrix census", () => {
  test("every package and shape pair is accounted for", () => {
    const missing = FAULT_PACKAGES.flatMap((entry) => FAULT_SHAPES.filter((shape) => !cells[cellKey(entry, shape)]).map((shape) => cellKey(entry, shape)));
    expect(missing).toEqual([]);
  });

  test("no row describes a pair the matrix does not have", () => {
    const known = new Set(FAULT_PACKAGES.flatMap((entry) => FAULT_SHAPES.map((shape) => cellKey(entry, shape))));
    expect(Object.keys(cells).filter((key) => !known.has(key))).toEqual([]);
  });

  test("every cited cell names a test that is really there, in the file it names", () => {
    const broken: string[] = [];
    for (const [key, cell] of Object.entries(cells)) {
      if (cell.status !== "covered" && cell.status !== "partial") continue;
      for (const citation of [cell.evidence, ...(cell.alsoEvidence ?? [])]) {
        const source = citation?.split("#")[0] ?? "";
        const title = citation?.split("#").slice(1).join("#") ?? "";
        if (!source || !title) {
          broken.push(`${key}: ${cell.status} without an evidence citation`);
          continue;
        }
        const text = readTestFile(source);
        if (text === null) {
          broken.push(`${key}: ${source} does not exist`);
        } else if (!citationMatches(text, title)) {
          broken.push(`${key}: "${title}" is not in ${source}`);
        }
      }
    }
    expect(broken.sort()).toEqual([]);
  });

  test("an unproven cell says something, and does not pretend to cite", () => {
    const bad = Object.entries(cells)
      .filter(([, cell]) => cell.status === "todo" || cell.status === "na")
      .filter(([, cell]) => cell.evidence !== undefined || cell.alsoEvidence !== undefined || !cell.note.trim())
      .map(([key, cell]) => `${key}: ${cell.evidence || cell.alsoEvidence ? "cites a test while unproven" : "says nothing"}`);
    expect(bad).toEqual([]);
  });

  // The number itself is the point: it is the plan's own progress meter, and a cell may only leave
  // the todo list by gaining a citation (checked above) or an `na` reason.
  test("reports how much of the matrix is proven", () => {
    const counts = countByStatus(matrix);
    const total = FAULT_PACKAGES.length * FAULT_SHAPES.length;
    // eslint-disable-next-line no-console
    console.log(`fault matrix: ${counts.covered} covered, ${counts.partial} partial, ${counts.na} not applicable, ${counts.todo} todo (of ${total})`);
    expect(counts.covered + counts.partial + counts.na + counts.todo).toBe(total);
    // The file says what it is, because the next reader's first question is who owns a cell.
    expect(matrix.$comment ?? "").toContain("plan 11");
  });

  test("the file's own description states the package and shape counts it holds", () => {
    const words = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
    const comment = (matrix.$comment ?? "").toLowerCase();
    expect(comment).toContain(`${words[FAULT_PACKAGES.length]} stateful packages`);
    expect(comment).toContain(`${words[FAULT_SHAPES.length]} fault shapes`);
  });
});
