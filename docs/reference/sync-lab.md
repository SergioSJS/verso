# The sync lab

A UniVerso on this machine, a test vault and the tools to exercise sync
([ADR 0079](../adr/0079-sync-a-local-folder-with-a-server.md)) with real
apps and many devices, kept between runs so that every campaign starts from
the same place and every load test is comparable with the ones before it.
Everything in it is test data, under `target/sync-lab/`, never committed.

## 1. The lab

```
scripts/sync-lab/lab.sh up        # build verso if needed, seed the vault once, start the server, make people and folders
scripts/sync-lab/lab.sh status
scripts/sync-lab/lab.sh load --devices 50 --seconds 120 --label "what changed"
scripts/sync-lab/lab.sh down
scripts/sync-lab/lab.sh reset     # asks, then deletes target/sync-lab
```

The server listens on `http://localhost:7351` (`VERSO_LAB_PORT`), its data in
`target/sync-lab/data`, its folders in `target/sync-lab/folders`, its log in
`target/sync-lab/server.log`. It serves the window in a browser from
`app/ui/dist` (`VERSO_UI_DIR`) when `app/ui` is built — `npm run build` in
`app/ui` before `up`; without it the address answers 404 and `up` says so.
`up` makes:

- the admin `admin@lab.test`, and **Ana** and **Bia**, editors of both
  folders, with generated passwords;
- the folder **Caderno**, the seeded vault, and **Carga**, empty, for the
  load test;
- `target/sync-lab/lab.json` (mode 600): the address, the folders' ids and
  directories, the accounts and their passwords.

A device of the desktop app joins the lab without clicking, as the campaign
of 2026-10-10 did: the app opens the folder once (its key is the stem of
`<config>/index/<name>-<hex>.json`), then `<config>/servers.json` gets a
device token — approved for an account through the API (`/api/device/start`,
`/api/device/approve` with the code in the body, `/api/device/poll`) — and `<config>/sync-<key>.json`
names the server and the folder; the app, opened again on the folder, syncs.
`VERSO_CONFIG_DIR` gives a second copy of the app a configuration of its
own; a copy built with another identifier (`tauri build --config
'{"identifier":"…","productName":"…"}'`) runs beside the installed one. A VM
reaches the lab through an SSH reverse tunnel, `ssh -R
7351:127.0.0.1:7351 <vm>`, since the app takes `http` only for `localhost`.

## 2. The test vault

`node scripts/sync-lab/seed.mjs <empty folder>` writes the same vault every
time: notes with links and a property, folders three deep, a name in
Unicode's composed form (NFC) and one in the decomposed form macOS writes
(NFD), an emoji, double spaces, an empty file, a PNG, a 1 MB binary, a
binary of `--big-mb` megabytes (60 by default, the same bytes on every
machine) and a batch of `--batch` notes (120). The names and the large
files are made here rather than committed: git normalizes names on macOS,
and the repository does not carry tens of megabytes.

## 3. The load test

`scripts/server-load.mjs` (through `lab.sh load`, or alone against any
server) opens `--devices` connections over real device sessions — one
session per account, since starting a device's sign-in is limited per
address — and for `--seconds` each one, at random: reads the changes after
its cursor; sends a new file (one in twenty of 2 MB, the others a few kB);
edits one of its files with the base it holds; edits the **hot note** that
every device shares, with the base it last saw, and is refused as
`changed` when another device was first; reads one of its files back and
checks the hash; deletes one of its files.

At the end it reports, per operation, **p50, p90, p95, p99 and the
maximum** latency in milliseconds, the operations per second, the errors by
kind (`put_hot:changed` is the expected contention, not a fault), and the
**integrity**: every file a device last wrote holds exactly those bytes on
the server's disk, every file it deleted is gone, and the hot note holds the
last version accepted. A problem makes it exit with 1.

Each run is appended to `scripts/sync-lab/results.jsonl` — date, commit,
machine, devices, accounts, duration, the numbers above — unless
`--no-record`. That file is the history to follow; the notable runs are
summarized below.

| Date | Commit | Machine | Devices × s | ops/s | put_new p50 / p90 / p99 ms | changes p50 / p99 ms | Integrity | Note |
|---|---|---|---|---|---|---|---|---|
| 2026-10-10 | 6c39720 | Apple M3 Max, 48 GB | 50 × 60 | 102 | 527 / 816 / 1 233 | 504 / 1 102 | 0 problems | before: whole-folder reconcile per write and per question |
| 2026-10-10 | 6c39720 | Apple M3 Max, 48 GB | 100 × 60 | 74 | 1 437 / 2 261 / 2 688 | 1 423 / 2 648 | 0 problems | before |
| 2026-10-10 | 6c39720 | Apple M3 Max, 48 GB | 200 × 60 | — | — | — | 0 problems | before: most devices could not open the folder |
| 2026-10-10 | d541924 | Apple M3 Max, 48 GB | 1 × 30 | 84 | 15 / 18 / 149 | 0.2 / 0.7 | 0 problems | after: per-path reconcile, reading connections, NORMAL |
| 2026-10-10 | d541924 | Apple M3 Max, 48 GB | 10 × 30 | 124 | 95 / 241 / 368 | 0.3 / 2.2 | 0 problems | after |
| 2026-10-10 | d541924 | Apple M3 Max, 48 GB | 50 × 60 | 123 | 637 / 894 / 1 328 | 0.4 / 3.9 | 0 problems | after; one folder writes one file at a time |
| 2026-10-10 | d541924 | Apple M3 Max, 48 GB | 100 × 60 | 117 | 1 317 / 1 802 / 2 641 | 0.6 / 26 | 0 problems | after |
| 2026-10-10 | d541924 | Apple M3 Max, 48 GB | 200 × 60 | 99 | 3 051 / 4 251 / 5 565 | 1.1 / 133 | 0 problems | after; 460 MB resident |
| 2026-10-10 | d541924 | Linux VM, Proxmox, 4 vCPU, 5.4 GB, virtual disk | 1 × 30 | 10 | 99 / 1 212 / 1 561 | 2.3 / 43 | 0 problems | the disk's fsync bounds every write |
| 2026-10-10 | d541924 | same VM | 50 × 60 | 19 | 3 878 / 5 524 / 6 783 | 5.1 / 185 | 0 problems | |
| 2026-10-10 | d541924 | same VM | 200 × 60 | 16 | 16 419 / 21 329 / 23 547 | 20 / 1 378 | 0 problems | 1 GB resident |
| 2026-10-11 | e8cfa8c | Apple M3 Max, 48 GB | 50 × 60 | 133 | 533 / 827 / 1 467 | 0.4 / 22 | 0 problems | round 2 of the campaign, the final build: NFC name resolution and `one_name` without allocation in the put |

## 4. The campaign's scenarios

What the campaign of 2026-10-10 ran on two installed apps, a browser and
the server, and what a campaign runs again before a release that touches
sync. Each is judged by the files of every device and the server compared
byte for byte, and by the logs (every `sync` line, every `WARN` and
`ERROR`).

- **Crossing**: an edit each way; a new note in folders three deep; a
  rename; a folder moved with what it holds (no empty folder left
  behind); a rename of the case alone; names with accents in both Unicode
  forms, an emoji, spaces; an empty file; a picture; files of 60, 300, 700
  and 900 MB.
- **The same file**: two devices editing one note at the same instant; one
  deleting while the other edits (the edit wins); one renaming while the
  other edits (both kept); a device closed while both edit (a conflict on
  its return); the browser typing in a room while a device edits the same
  note.
- **Guards**: a mass deletion (more than a fifth, more than 50) pauses
  and the restored files cancel it; a reader's changes stay on their
  device, said, and the server's still arrive; a role changed while
  connected; the quota refusing one file and passing the rest; the
  device's session ended by the admin; the member removed from the folder;
  the app killed in the middle of an upload; the server killed in the
  middle of a download (nothing half-written, resumed, same hashes).
- **The window**: the status bar's states; the sync section; a conflict's
  difference; deleting the copy; pause and resume; turning sync off and
  on again (it goes on from its base).
- **Platforms**: the same, with devices on macOS, Windows and Linux on one
  server, including a note named on one system in NFC and on another in
  NFD.
