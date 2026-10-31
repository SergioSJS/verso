# 3D dice textures — the original images, their source and licence

- Date: 2026-10-21
- Source: the texture images of the 3D dice of Rolai's web client
  (`@3d-dice/dice-box-threejs`, MIT), which that package took from
  MajorVictory's 3DDiceRoller. The images were fetched from
  `https://github.com/MajorVictory/3DDiceRoller` (branch `master`, commit
  `6cfd2191e18b02997a78495b6b301bc72fac9e85`, directory `textures/`) on
  2026-10-21.
- Status: a reference. Shipping these images under The Unlicense was
  approved by the maintainer on 2026-10-21 (X.1 = A). They are the dice's
  textures; a picture that does not load is replaced by the texture Verso
  draws itself (`app/ui/src/dice3d/textures.ts`).

## Licence

The repository `MajorVictory/3DDiceRoller` is licensed under **The Unlicense**
(a public-domain dedication; its `LICENSE` file begins "This is free and
unencumbered software released into the public domain"). The `@3d-dice/dice-box-threejs`
package is MIT and states no separate terms for its images; the explicit
licence of the images is the one of their origin. The Unlicense is not on the
licence allowlist of `deny.toml` and `scripts/check-npm-licenses.mjs` (those
check packages; these are files), which is why the maintainer's approval above is recorded here.

Left out on purpose: the two images of the origin that are not textures of a
die (`thecage.png`, `isabelle.png`) and the bump maps.

## What ships

Nineteen images, one per texture but "Plain", copied unchanged to
`app/ui/dice-textures/` and to `dist/dice-textures/` by the build, kept for
offline use by the service worker. They are used whenever a texture is
chosen in Settings › RPG & Solo Play › Dice and RPG › "3D dice: texture".

| File | SHA-256 |
|---|---|
| `astral.png` | `3aa1f3a7027842ad435f91c1da2c02bdafd88f569e2e32e65dbfca3427d2196d` |
| `cloudy.png` | `1271bb214dfb3c55ba7b39dbc0e7a975f82a004c5ac1062a27a4f151701bf3be` |
| `dragon.png` | `bed634b02308be2b74641313f39903e5d7b762dcb8ca6add40ba0820ef27d851` |
| `feather.png` | `2d3deadd354e6d3a03863996ebe79001b8abad939f202b6ed1acbec802f213ee` |
| `fire.png` | `a3b2ae9e4f12316e04fa83697170db84158adcdc7a261964514d3a64e2be8370` |
| `glitter.png` | `3fab3781da878020dea59ab249add9a2fcba4a9c8df99de5a6618fa39fec65b5` |
| `ice.png` | `2b056bf13182fe99e67f30783bd68e24ab04f0ab9407dd0146d59f88e646e41a` |
| `leopard.png` | `8ee19ef55216fa18d10fa3a1f7b059364cb96193a55ea5233aaf0b1ff15642ac` |
| `lizard.png` | `5e7199eff0e394c0f278c24c86ec4003174da7a8a9f33b62f37f536683432f50` |
| `marble.png` | `9129c296e4f13402e33eb75fcda4282ffb0f3ed19e9d75d889134ec00ff4f56a` |
| `metal.png` | `d3743c4b124441e01bc7e9d6e6e6e8bd3407a80e4f0caf7b86d5d7c4e48be606` |
| `paper.png` | `b9b02b456edb2eb560786e24ebf21b6420870e6b986fe6ddaa13a6ca3538d53c` |
| `skulls.png` | `d99e15e1d95b70cfe3d514f636bba6f4a24858fc00b467598497805d3ab04678` |
| `speckles.png` | `f78b689f061cd09fc0467e0629c94834d2cac9bb5562d8f6432f4a780b002699` |
| `stainedglass.png` | `c85894b704329c185b32968f48bd8cd28f68afca4bac460419840eb84e61552e` |
| `stars.png` | `51b0359d724169230f1319621c040da6717b8944d28ee9ad49230062d0526e0f` |
| `tiger.png` | `5a9e9b17e587c9fbaf7d6d56319fc67aa5479a8f6daffa5ebe6cb6514a0848b7` |
| `water.png` | `c9fb9c485e416cafd56ecf5be97c9c8ab6afd65d772d8861114840f499170dcb` |
| `wood.png` | `b86059a0ff4851c631526b3bb4dbe13aa887a48053a333ce9d36f207346917a2` |

## Credit

On the Credits page of the settings, "3D Dice Roller (MajorVictory)", with the
link to the repository and the licence.
