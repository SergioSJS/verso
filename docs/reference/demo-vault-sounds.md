# Demo vault sounds — the sample tracks, their source and licence

- Date: 2026-10-31
- Source: made for Verso by the build agent of ADR 0116 phase 1, 2026-10-31,
  for note 36 (*Som e Música na Mesa* / *Sound and Music at the Table*), as
  ADR 0116 item 31 asks ("a short CC0 or own-made sample track in each
  vault's attachments"). No recording or sample of anyone's is in them.
- Status: a reference.

## The files

`demo-vault/assets/sons/taverna.mp3` and `demo-vault/assets/sons/estrada.mp3`,
shared by both vaults (the English vault links `assets/` as the Portuguese
one does). Each is nine seconds, mono, 22.05 kHz, MP3 at 40 kbit/s
(45 659 bytes).

## How they were made

Synthesised by a short Python script (standard library only): plucked notes
— a sine with its second and third harmonics under an exponential decay —
over a soft drone of the key's root and fifth, with half-second fades; then
`lame -m m -b 40 --resample 22.05`.

- *taverna*: D major, a jig's lilt (D4 F♯4 A4 D5 A4 F♯4 G4 B4 G4 A4 E4), a
  beat of 0.3 s, a drone on D3.
- *estrada*: A minor, slower (A3 E4 C4 A4 G4 E4), a beat of 0.42 s, a drone
  on A2.

## Licence

**CC0 1.0** (public-domain dedication): made for the project, given to
everyone. The MP3 tags say so (`CC0 1.0`).
