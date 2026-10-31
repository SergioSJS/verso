// Copied from Rolai, the maintainer's dice roller
// (https://github.com/SergioSJS/rolai), a test of its rules engine, at commit
// 368d677c8347609c243473046d4f06a1126ddb74, for ADR 0088 item 5.
// Verso's changes: the import line only.
// MIT License, Copyright (c) 2026 Sérgio J. Sousa; the full text is in
// src/dice/rolai/LICENSE.
import { describe, expect, it } from "vitest";
import { rollWithProfile } from "../../src/dice/rolai/index";

// Um caso por outcome_rule de profiles/pbta.yaml: strong_hit (>=10),
// weak_hit (>=7), miss (<7).

describe("profile: pbta", () => {
  it("strong_hit: total >= 10", async () => {
    const result = await rollWithProfile("pbta", { mode: "", mod: 1 }, {
      deterministic: [6, 4], // 6+4+1 = 11
    });
    expect(result.profile).toBe("pbta");
    expect(result.notation).toBe("2d6+1");
    expect(result.groups["roll"]).toEqual({ rolls: [6, 4], modifier: 1, total: 11 });
    expect(result.outcome).toBe("strong_hit");
    // Tiers mutuamente exclusivos: 11 e strong_hit e NAO marca weak_hit.
    expect(result.outcome_flags).toEqual(["strong_hit"]);
  });

  it("weak_hit: total >= 7 (borda exata)", async () => {
    const result = await rollWithProfile("pbta", { mode: "", mod: 0 }, {
      deterministic: [4, 3], // 7
    });
    expect(result.groups["roll"]).toEqual({ rolls: [4, 3], modifier: 0, total: 7 });
    expect(result.outcome).toBe("weak_hit");
    expect(result.outcome_flags).toEqual(["weak_hit"]);
  });

  it("miss: total < 7", async () => {
    const result = await rollWithProfile("pbta", { mode: "", mod: -1 }, {
      deterministic: [4, 3], // 6
    });
    expect(result.groups["roll"]).toEqual({ rolls: [4, 3], modifier: -1, total: 6 });
    expect(result.outcome).toBe("miss");
    expect(result.outcome_flags).toEqual(["miss"]);
  });

  it("modificador zero interpolado ainda produz total", async () => {
    const result = await rollWithProfile("pbta", { mode: "", mod: 0 }, {
      deterministic: [1, 1],
    });
    expect(result.notation).toBe("2d6+0");
    expect(result.groups["roll"]!.total).toBe(2);
  });

  it("vantagem vira 3d6kh2 e soma os 2 maiores", async () => {
    const result = await rollWithProfile(
      "pbta",
      { mode: "adv", mod: 0 },
      { deterministic: [2, 5, 6] },
    );
    expect(result.notation).toBe("2d6adv+0");
    expect(result.groups["roll"]!.rolls).toEqual([5, 6]);
    expect(result.groups["roll"]!.total).toBe(11);
    expect(result.outcome).toBe("strong_hit");
  });

  it("desvantagem mantem os 2 menores", async () => {
    const result = await rollWithProfile(
      "pbta",
      { mode: "dis", mod: 0 },
      { deterministic: [2, 5, 6] },
    );
    expect(result.groups["roll"]!.rolls).toEqual([2, 5]);
    expect(result.groups["roll"]!.total).toBe(7);
    expect(result.outcome).toBe("weak_hit");
  });
});
