// What the window takes from Rolai's rules engine (ADR 0088 item 5): the
// roller, the expression language and the system profiles.

export { roll, createRollState, rollDice } from "./roller";
export type { RollOptions } from "./roller";
export { NotationError, parseNotation } from "./parser";
export { ExpressionError, evaluateExpression, matchesCondition, parseExpression } from "./expression";
export type { ExpressionScope } from "./expression";
export { ProfileError, parseProfile, loadProfile, evaluateOutcomeRules, rollWithProfile, rollOverlay } from "./profile";
export type { SystemProfile, ProfileInput, ProfileField, ProfileInputs, ProfileOption, OutcomeRule } from "./profile";
export { applyInputQuirks } from "./inputQuirks";
export { PROFILE_YAML } from "./profilesData";
export type { RollResult, RollGroup, RandomSource } from "./types";
