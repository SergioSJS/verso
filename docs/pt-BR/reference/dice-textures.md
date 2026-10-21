# Texturas dos dados 3D — as imagens originais, a origem e a licença

- Data: 2026-10-21
- Fonte: as imagens de textura dos dados 3D do cliente web do Rolai
  (`@3d-dice/dice-box-threejs`, MIT), que o pacote tomou do 3DDiceRoller de
  MajorVictory. As imagens foram baixadas de
  `https://github.com/MajorVictory/3DDiceRoller` (branch `master`, commit
  `6cfd2191e18b02997a78495b6b301bc72fac9e85`, diretório `textures/`) em
  2026-10-21.
- Estado: uma referência. Distribuir estas imagens sob a Unlicense foi
  aprovado pelo mantenedor em 2026-10-21 (X.1 = A). São as texturas dos dados;
  uma imagem que não carregue é trocada pela textura que o próprio Verso
  desenha (`app/ui/src/dice3d/textures.ts`).

## Licença

O repositório `MajorVictory/3DDiceRoller` está sob a **Unlicense** (dedicação ao
domínio público; o arquivo `LICENSE` começa com "This is free and unencumbered
software released into the public domain"). O pacote `@3d-dice/dice-box-threejs`
é MIT e não declara termos à parte para as imagens; a licença explícita das
imagens é a da origem delas. A Unlicense não está na lista de licenças do
`deny.toml` nem de `scripts/check-npm-licenses.mjs` (essas verificam pacotes;
estes são arquivos), e por isso a aprovação do mantenedor acima fica registrada aqui.

Ficaram de fora de propósito: as duas imagens da origem que não são texturas de
dado (`thecage.png`, `isabelle.png`) e os mapas de relevo.

## O que vem no aplicativo

Dezenove imagens, uma por textura menos "Lisa", copiadas sem mudança para
`app/ui/dice-textures/` e para `dist/dice-textures/` pela build, guardadas para
uso sem conexão pelo service worker. Valem sempre que uma textura é escolhida
em Ajustes › Recursos › "Dados 3D: textura".

| Arquivo | SHA-256 |
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

## Crédito

Na página de Créditos dos ajustes, "3D Dice Roller (MajorVictory)", com o link
do repositório e a licença.
