// Copied from Rolai, the maintainer's dice roller
// (https://github.com/SergioSJS/rolai), a test of its rules engine, at commit
// 368d677c8347609c243473046d4f06a1126ddb74, for ADR 0088 item 5.
// Verso's changes: the import line only.
// MIT License, Copyright (c) 2026 Sérgio J. Sousa; the full text is in
// src/dice/rolai/LICENSE.
import { describe, expect, it } from "vitest";
import { rollWithProfile } from "../../src/dice/rolai/index";

// Um caso por outcome_rule de profiles/fitd.yaml: critical (>=2 seis),
// full_success (1 seis), partial_success (max>=4 sem seis), miss (max<4).
// Os tiers sao mutuamente exclusivos — outcome_flags tem exatamente um
// tier por rolagem.

describe("profile: fitd", () => {
  it("critical: dois ou mais 6", async () => {
    const result = await rollWithProfile("fitd", { pool_size: 4 }, {
      deterministic: [6, 6, 2, 3],
    });
    expect(result.profile).toBe("fitd");
    expect(result.notation).toBe("4d6");
    expect(result.groups["pool"]!.rolls).toEqual([6, 6, 2, 3]);
    expect(result.outcome).toBe("critical");
    expect(result.outcome_flags).toEqual(["critical"]);
  });

  it("full_success: exatamente um 6", async () => {
    const result = await rollWithProfile("fitd", { pool_size: 4 }, {
      deterministic: [6, 2, 3, 1],
    });
    expect(result.outcome).toBe("full_success");
    expect(result.outcome_flags).toEqual(["full_success"]);
  });

  it("partial_success: sem 6, max >= 4", async () => {
    const result = await rollWithProfile("fitd", { pool_size: 4 }, {
      deterministic: [5, 4, 2, 1],
    });
    expect(result.outcome).toBe("partial_success");
    expect(result.outcome_flags).toEqual(["partial_success"]);
  });

  it("miss: max < 4", async () => {
    const result = await rollWithProfile("fitd", { pool_size: 4 }, {
      deterministic: [3, 2, 1, 2],
    });
    expect(result.outcome).toBe("miss");
    expect(result.outcome_flags).toEqual(["miss"]);
  });

  it("interpola o tamanho do pool na notacao", async () => {
    const result = await rollWithProfile("fitd", { pool_size: 2 }, {
      deterministic: [1, 2],
    });
    expect(result.notation).toBe("2d6");
    expect(result.groups["pool"]!.rolls).toEqual([1, 2]);
  });

  // Regra do FitD pra pool 0 (ou negativo): rola 2d6 e fica so com o
  // menor — "0d6" nao existe, entao o profile troca pra "2d6kl1".
  it("pool_size 0: rola 2d6 e fica com o menor", async () => {
    const result = await rollWithProfile("fitd", { pool_size: 0 }, {
      deterministic: [6, 2],
    });
    expect(result.notation).toBe("2d6kl1");
    expect(result.groups["pool"]!.rolls).toEqual([2]);
    expect(result.groups["pool"]!.dropped).toEqual([6]);
    expect(result.outcome).toBe("miss");
  });

  it("pool_size 0: o menor ainda pode ser sucesso pleno", async () => {
    const result = await rollWithProfile("fitd", { pool_size: 0 }, {
      deterministic: [5, 6],
    });
    expect(result.groups["pool"]!.rolls).toEqual([5]);
    expect(result.outcome).toBe("partial_success");
  });

  it("pool_size negativo tambem cai no fallback de 2d6kl1", async () => {
    const result = await rollWithProfile("fitd", { pool_size: -2 }, {
      deterministic: [4, 1],
    });
    expect(result.notation).toBe("2d6kl1");
    expect(result.groups["pool"]!.rolls).toEqual([1]);
    expect(result.outcome).toBe("miss");
  });
});
