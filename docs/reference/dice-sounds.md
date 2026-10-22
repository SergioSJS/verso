# 3D dice sounds — the recordings, their source and licence

- Date: 2026-10-22
- Source: the sound files of the 3D dice of Rolai's web client
  (`apps/web/public/sounds/dicehit/` and `sounds/surfaces/`), byte for byte the
  ones of the `@3d-dice/dice-box-threejs` 0.0.12 package (MIT,
  `https://github.com/3d-dice/dice-box-threejs`, `public/sounds/`). That
  package is "based on Major's 3D Dice" and its recordings are the
  MP3 versions of the ones in `sounds/` of MajorVictory's 3DDiceRoller
  (`https://github.com/MajorVictory/3DDiceRoller`, branch `master`, commit
  `6cfd2191e18b02997a78495b6b301bc72fac9e85`; the counts match: 15 `dicehit`
  recordings for plastic, 6 `coinhit`, and the `felt`, `metal`, `wood_table`
  and `wood_tray` folders of 7, 9, 7 and 7). Copied on 2026-10-22.
- Status: a reference. The maintainer asked for Rolai's sounds
  (2026-10-22, T.7). Neither repository names an author or a separate licence
  for the recordings; see below.

## Licence

The repository `MajorVictory/3DDiceRoller`, where the recordings come from, is
licensed under **The Unlicense** (a public-domain dedication; its `LICENSE`
file begins "This is free and unencumbered software released into the public
domain"), with no separate credit or licence for the `sounds/` folder. The
`dice-box-threejs` package, which converted them to MP3, is **MIT** and also
states no separate terms for them. So the licence that applies to the files,
by the licence of everything published with them, is the Unlicense (and the
MIT notice of the package for the MP3s). What no one states is who recorded
them first; if an original author is ever found who says otherwise, these
files go. The Unlicense is not on the licence allowlist of `deny.toml` and
`scripts/check-npm-licenses.mjs` (those check packages; these are files), as
with the textures ([dice-textures.md](dice-textures.md)).

Left out on purpose: the coin recordings (Verso has no coin), the `wood_table`,
`wood_tray` and `metal` surfaces (Rolai's default table is felt), and the
unused dice materials' alternatives.

## What ships

Forty-six files, copied unchanged to `app/ui/dice-sounds/` and to
`dist/dice-sounds/` by the build, kept for offline use by the service worker:
`dicehit_plastic1..15`, `dicehit_wood1..12`, `dicehit_metal1..12` and
`surface_felt1..7`. They are fetched only when the switch **Dice sound** is on
(Settings › RPG & Solo Play › Dice and RPG; off by default), and played as
Rolai plays them: a die hitting the table sounds a felt recording, a die
hitting a die one of its material (plastic; wood and metal for those
materials), at a volume that follows the speed of the hit, and a hit too
slow to count is silent (`app/ui/src/dice3d/sound.ts`).

| File | SHA-256 |
|---|---|
| `dicehit_metal1.mp3` | `d9fdea605fcf18f5c8052600c110daa98aeffba200b4cb88854eb1c22f3195d3` |
| `dicehit_metal10.mp3` | `d227719f343c86de91b173c4a01fedd5c8c3b91de6fa0eb6a6ef47c8c5558f7d` |
| `dicehit_metal11.mp3` | `15aed7ec0950f65aec8c83f5747c3453eba6403c4d16a526f105383c912a9266` |
| `dicehit_metal12.mp3` | `98b789301d270905cfcf56ab909f79ac30542543b9226de6d8653bf3fa38f64d` |
| `dicehit_metal2.mp3` | `760bf69e01afa92a64f6b00945b9f20743cf864893ab81284ed7df65565ec934` |
| `dicehit_metal3.mp3` | `d416553826bdd7ef672d4eb8b6c632ab3acf9cb503eabbc90c22eb18fb0ec6ba` |
| `dicehit_metal4.mp3` | `0d184f161020c9c749cce6029212b3419b863bd1c71c39e977130fcb44556d54` |
| `dicehit_metal5.mp3` | `fda0277d411b2bcbdf0262e1b2fd31d23850141b5f77a6477b87d3ab37a53c44` |
| `dicehit_metal6.mp3` | `96b5e6b66adf0f0408e217ca83c9a20e2682c5385fe36611d571d13910fd42ec` |
| `dicehit_metal7.mp3` | `2a27fb76c2f4dd7c31238761f1fde7e6ae1257bd531781aa7dabd6321622caa1` |
| `dicehit_metal8.mp3` | `ba9559beacb4a8611ca5c9b27812f89d6a235b459c5717fe8b85d3a7505f5bf3` |
| `dicehit_metal9.mp3` | `05fada473d6da5ee3de72cfc9b43bb43be8a9cb69b1b56d220498b9161558eaa` |
| `dicehit_plastic1.mp3` | `9ce4d859db43b064635b0b88523dc8edf2b02bc311d13029358efc1114557d28` |
| `dicehit_plastic10.mp3` | `9bdddc372a7283475ec846e126e5d9cde80f5c967eea738d33bdcfcac5cc6014` |
| `dicehit_plastic11.mp3` | `f5f848e0e976e473e941f0d5702266e8aea250b87c62d8fe19e913d8d22481a9` |
| `dicehit_plastic12.mp3` | `896fbf61ca0f1fd0fc7acac0fed232b4be624263888f299f50ee1d08021ad8ff` |
| `dicehit_plastic13.mp3` | `bb223c241ac75b49e2252b299cafc79923051b3fdc51ae72bad5edcde2fa11b3` |
| `dicehit_plastic14.mp3` | `17b08f6ed60b8e59783a0fb9a10d3e7d42ef8bd3cd485a2dc40011dc18e6a65a` |
| `dicehit_plastic15.mp3` | `0d7fd2f64ca76d8f4ed343e9b1168987891fb0ed3ddb3e965d92a2c1fbe303b4` |
| `dicehit_plastic2.mp3` | `7e965a0ea12a68b09c31000bc83c56d5e2937d0849c0ca03911625e8da164d54` |
| `dicehit_plastic3.mp3` | `31e59ab2afad281d9e9bb7a549869bcbb53d2d2b044bfb468cbd380fe9a15adc` |
| `dicehit_plastic4.mp3` | `5ca7c673a1f42afceb28a35e6b4fcdcfb7432994a583fdaaa982b864f064092d` |
| `dicehit_plastic5.mp3` | `9491c53cadba7f660ce0a33317f9342ab1a7d34b2c6e12e3d3fa5f699333515f` |
| `dicehit_plastic6.mp3` | `0caff10b36f11631e576fa69aa99f090452885a0bc4e7b878789a934d0b1afc8` |
| `dicehit_plastic7.mp3` | `cfcc6efc557159ff4e79ce161de506bd5536adae3c3c77e1ac17290d76bbb565` |
| `dicehit_plastic8.mp3` | `e4695c634ba992898228aeaa4cfb7b380b424ea3a2e3de9f16cbc50eee4005c5` |
| `dicehit_plastic9.mp3` | `8fca55986c1b14760ad2db78fcf71db580d87544edc9f7ad8be7e0e10c1f60e7` |
| `dicehit_wood1.mp3` | `4091a9b768e4194e35889bdc56cb009316d0388f3b2d1af6bc870de991ac9334` |
| `dicehit_wood10.mp3` | `270da79575a85b3c64769590218e2619d97cb45dafb176b0dbee6b21418184d6` |
| `dicehit_wood11.mp3` | `8d75bd756114b17faf62e56e59dd28ed761a3e844dc07b23dee85a859663e164` |
| `dicehit_wood12.mp3` | `c7b47e37a1a4dab38112f27eaaf292892a68692b70d1657299388eb12a25cbf9` |
| `dicehit_wood2.mp3` | `04bf9ded028889c7b6a1008b398b476de0e30d32cfce0c91a3a50521e2cf4936` |
| `dicehit_wood3.mp3` | `a4560eae19447eedc9c6afdd396d294a1257d579b111f073713c66af5c4fcb58` |
| `dicehit_wood4.mp3` | `0544e592b50b80d2d6746416163734ea3cc6a87ae3dc1bfd2544e4f573809203` |
| `dicehit_wood5.mp3` | `d07b726118054333ed539d620efa433985bdae33eb44afac234e9c10256079e2` |
| `dicehit_wood6.mp3` | `4a7cc85fe9fdb0efaed60c8e3fc9ecd5afc7463a00186fe0f688e0a0b8caf187` |
| `dicehit_wood7.mp3` | `2eb72c8b6dd2f0bca40ad6c57e3e3c4397e22651e84d489c033cddfbfbf71232` |
| `dicehit_wood8.mp3` | `d08baf04ec41ff1c613b5bc528f449d1b6c163bb174db6dc5b893abfcfde0d9b` |
| `dicehit_wood9.mp3` | `f7de50045fd4b4e3e56a30980ce16d4d77832ce7e060b9add02606e0777a704a` |
| `surface_felt1.mp3` | `30cc8556bdb5d8847f201aac064cd022837597f07482230182e5cf6b4b700aa7` |
| `surface_felt2.mp3` | `d48e2ae7fc43946dfc09e952d0ca48297f942a71679090ff40bd897a6787fecd` |
| `surface_felt3.mp3` | `5546e3442cadfce09effc3cfa8630aea76577b5fafb42b651c7c4ecce508ed01` |
| `surface_felt4.mp3` | `d83ea3b67d3f9739e4189ea448a8b9019f6d81a695ebc14b06a35f998e49a940` |
| `surface_felt5.mp3` | `a10ec96eba6269ebce9b6d3999e092607442e30a1d0880769bfd7de906ccc964` |
| `surface_felt6.mp3` | `850937879e2c8362973495646b9654a4c389435998c1b417a78debd061e6d709` |
| `surface_felt7.mp3` | `2452c76c4b022095d86de60ca63d8f739444a3c5e76687e0141bbd9cb8d31ee4` |

## Credit

On the Credits page of the settings, "3D Dice Roller (MajorVictory)" (the same
entry as the textures) says the sounds come from there too, through
`dice-box-threejs`, with the link and the licence.
