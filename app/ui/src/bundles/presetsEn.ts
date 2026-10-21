// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { BUILTIN_PRESETS } from "./presets";
import type { TemplateBundle } from "./types";
import { PRESET_TEXT_EN } from "./words";

/** The built-in bundles for a person whose window is in English (ADR 0098
 *  item 10, decided 2026-10-21): the same folders and notes, named and
 *  written in English, so "Sessões" becomes "Sessions". Each has the id of
 *  its Portuguese twin; the name and description are `PRESET_TEXT_EN`'s. */

const campaign: TemplateBundle = {
  version: 1,
  id: "dados-criticos-campanha",
  name: "",
  description: "",
  category: "rpg",
  folders: ["1. Party", "2. Sessions", "3. Factions", "4. NPCs", "5. Places", "6. Items", "7. Hexcrawl", "Templates"],
  files: [
    {
      path: "Campaign Overview.md",
      frontmatter: { type: "campaign", status: "active", start_date: "{{date}}" },
      content: `# {{title}}

## Campaign Overview

- **Game Master:** 
- **System:** 
- **Tone / Atmosphere:** 

## Arc Summary

1. **Opening Arc:** 
2. **Development:** 
3. **Expected Climax:** 

## Quick Shortcuts
- [[GM Screen|Secret GM Screen]]
- [[1. Party/Session Zero|Session Zero and Agreements]]
- [[1. Party/Character Goals|Party Goals]]
- [[Templates/Character Sheet|Character Sheet Template]]
- [[Templates/NPC Sheet|NPC Sheet Template]]
`,
    },
    {
      path: "GM Screen.md",
      content: `# GM Screen — {{title}}

> [!secret]
> ## Secrets and Conspiracies
> - **The Big Villain:** 
> - **The Twist:** 
> - **The Enemies' Timeline:** What happens if the heroes do not act?

## Quick Session Notes
- **Rumour of the Week:** 
- **NPC in the Spotlight:** 
- **Next Encounter:** 
`,
    },
    {
      path: "Campaign Structure.md",
      content: `# Campaign Structure — {{title}}

## The Opening Hook

## The 3 Main Clues
1. 
2. 
3. 

## The 3 Possible Endings
- **Triumphant Victory:** 
- **Pyrrhic Victory:** 
- **Defeat and Consequences:** 
`,
    },
    {
      path: "1. Party/Session Zero.md",
      content: `# Session Zero — {{title}}

## Table Agreements & Lines and Veils
- **Lines (never at the table):** 
- **Veils (happen off-screen):** 

## Character Creation and Connections
- How did the party meet?
- What debt or goal do they share?
`,
    },
    {
      path: "1. Party/Character Goals.md",
      content: `# Character Goals — {{title}}

| Character | Player | Short-term Goal | Long-term Goal |
|---|---|---|---|
| | | | |
`,
    },
    {
      path: "Templates/Character Sheet.md",
      frontmatter: { type: "character", player: "", class: "", level: 1 },
      content: `# {{title}}

\`\`\`statblock
name: {{title}}
hp: 10
ac: 10
speed: 30 ft.
\`\`\`

## Biography and Concept
- **Concept / Archetype:** 
- **Appearance and Presence:** 
- **Personality Traits:** 

## Motivations & Goals
- **Personal Goal:** 
- **Bond with the Party:** 
- **Secret or Regret:** 

## Equipment & Inventory
- Adventurer's Backpack
- Coins: 
`,
    },
    {
      path: "Templates/NPC Sheet.md",
      frontmatter: { type: "npc", faction: "", attitude: "neutral" },
      content: `# {{title}}

\`\`\`statblock
name: {{title}}
hp: 12
ac: 11
\`\`\`

> [!info] Quick Summary
> - **Occupation / Role:** 
> - **Usual Location:** 
> - **First Impression:** 

## Personality and Mannerisms

## Motivation and Desires

> [!secret]
> ## Secrets and Hooks
> What this NPC hides at all costs.
`,
    },
    {
      path: "Templates/Session Log.md",
      frontmatter: { type: "session", date: "{{date}}", number: 1 },
      content: `# Session — {{title}}

- **Date:** {{date}}
- **Present:** 
- **Location at the Start:** 

## Main Events
1. 
2. 
3. 

## Clues and Revelations

## Rewards and Spoils

## Hook for the Next Session
`,
    },
    {
      path: "Templates/Place Sheet.md",
      frontmatter: { type: "place", region: "" },
      content: `# {{title}}

## Sensory Description
- **What you see:** 
- **What you hear:** 
- **What you smell:** 

## Points of Interest
1. 
2. 
3. 

> [!secret]
> ## Dangers and Opportunities
> Hidden dangers, traps or secret passages of this place.
`,
    },
    {
      path: "Templates/Faction Sheet.md",
      frontmatter: { type: "faction", influence: "moderate" },
      content: `# {{title}}

- **Leader:** 
- **Headquarters:** 
- **Public Goal:** 

## Notable Members

> [!secret]
> ## Hidden Agenda
> The secret plan of this faction.
`,
    },
  ],
};

const world: TemplateBundle = {
  version: 1,
  id: "dados-criticos-mundo",
  name: "",
  description: "",
  category: "world",
  folders: ["Regions", "Pantheon", "Factions"],
  files: [
    {
      path: "Lore.md",
      content: `# Lore and History of {{title}}

## The Ages of the World
- **Age of Myths:** 
- **Ancient Age:** 
- **Current Age:** 

## Great Past Conflicts
`,
    },
    {
      path: "Creation Myth.md",
      content: `# Creation Myth — {{title}}

## The Origin of the Cosmos

## The First Beings
`,
    },
    {
      path: "Deities.md",
      content: `# Deities and Beliefs — {{title}}

| Deity | Domains | Sacred Symbol | Relation to Mortals |
|---|---|---|---|
| | | | |
`,
    },
    {
      path: "Culture.md",
      content: `# Customs and Culture — {{title}}

## Traditions and Festivals
## Food and Clothing
## Beliefs and Superstitions
`,
    },
    {
      path: "Languages.md",
      content: `# Languages and Dialects — {{title}}

- **Common Tongue:** 
- **Regional Dialects:** 
- **Arcane or Forgotten Tongues:** 
`,
    },
  ],
};

const fiction: TemplateBundle = {
  version: 1,
  id: "escrita-ficcao",
  name: "",
  description: "",
  category: "writing",
  folders: ["1. Chapters", "2. Characters", "3. Settings", "4. Timeline", "5. Research"],
  files: [
    {
      path: "_Synopsis and Overview — {{title}}.md",
      content: `# {{title}}

## Logline
One sentence that sums up the protagonist, the central conflict and the stakes.

## Full Synopsis

## Three-Act Structure
- **Act 1 (Inciting Incident):** 
- **Act 2 (Complications & Midpoint):** 
- **Act 3 (Climax & Resolution):** 
`,
    },
    {
      path: "1. Chapters/Chapter 01.md",
      content: `# Chapter 01

*Start here with a strong image or a striking action...*
`,
    },
    {
      path: "2. Characters/Protagonist.md",
      frontmatter: { role: "protagonist" },
      content: `# Protagonist

- **Age / Occupation:** 
- **What they want (Conscious Goal):** 
- **What they need (Unconscious Need):** 
- **The Lie they believe:** 
- **The Wound from the Past (Ghost):** 
`,
    },
  ],
};

const para: TemplateBundle = {
  version: 1,
  id: "caderno-pessoal-para",
  name: "",
  description: "",
  category: "notes",
  folders: ["1. Projects", "2. Areas", "3. Resources", "4. Archive"],
  files: [
    {
      path: "_Focus Board.md",
      content: `# My Focus Board

## Active Projects (With a deadline and a defined outcome)
- See the folder 1. Projects

## Areas of Responsibility (Standards to maintain)
- Health, Finances, Career, Home.

## Useful Resources (Topics of interest for reference)
- See the folder 3. Resources
`,
    },
  ],
};

const BY_ID: Record<string, TemplateBundle> = Object.fromEntries(
  [campaign, world, fiction, para].map((b) => {
    const text = PRESET_TEXT_EN[b.id];
    return [b.id, { ...b, name: text?.name ?? b.id, description: text?.description ?? "" }];
  }),
);

/** `bundle` as the language asks: a built-in one in English when the window
 *  is not in Portuguese; any other bundle (an imported one, whose author
 *  wrote it as they wanted) as it is. */
export function bundleInLanguage(bundle: TemplateBundle, portuguese: boolean): TemplateBundle {
  if (portuguese || !BUILTIN_PRESETS.includes(bundle)) return bundle;
  return BY_ID[bundle.id] ?? bundle;
}
