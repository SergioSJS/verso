# Written on the Mac, right on Windows: the checklist

- Date: 2026-10-08
- Why: the maintainer decided that the Windows port is written with Windows
  in mind from the start ([ADR 0069](../adr/0069-windows-port.md),
  Consequences). The first Windows build, on 2026-10-07 and 08, needed every
  fix below; each was a habit that works on macOS and fails on Windows. This
  is what to do instead, so the next change does not repeat them.
- How to check: `scripts/check.sh` runs the end-to-end tests in Chromium
  (WebView2's engine) beside WebKit; `scripts/check-windows.sh` runs clippy
  and the tests on a Windows machine. A change that touches files, paths,
  processes, configuration or the window's focus and keys reads this first.

## 1. Paths

| Habit that fails on Windows | What happened | Write it this way |
|---|---|---|
| `Path::join`/`push` to build a path relative to the folder | `\` went into a board's `"file"` and into `[[npcs\Barão]]` | `crate::rel_join` in `verso-fs` (`/` on every OS); the disk only through `on_disk` |
| `to_string_lossy()` of an OS path, then stored or shown | the index and the contract got `\` | relative paths are already `/`; never stringify an absolute one (invariant 4) |
| a test asserts `"pasta/C.md"` on a path built by the OS | failed on Windows only | build expected and actual the same way, or join components with `/` |
| a name typed by the user, made as is | `CON.md`, `a:b.md`, `nota?` cannot exist on Windows; a synced folder breaks | names every OS keeps ([ADR 0070](../adr/0070-what-travels-with-the-folder.md)); the tutorial's own files too (`demo-vault.mjs check` refuses one) |
| a trailing-dot check on the name without its extension | refused `nota.`, whose file `nota..md` Windows keeps | check the whole file name |
| `a:b` in a test path | Windows reads `A:` as a drive (refused as absolute, not as a name) | expect either refusal |

## 2. Files and the disk

| Habit | What happened | Instead |
|---|---|---|
| `File::open(dir)?.sync_all()` | Windows refuses to open a directory that way | `os::sync_dir` (write access + `FILE_FLAG_BACKUP_SEMANTICS`) |
| `std::fs::rename` once | an antivirus or the indexer holding the file fails it | `os::rename` (retries for ~2.5 s; a read-only target fails at once) |
| retrying a write's rename without looking again | the program that held the note could save it meanwhile: its save replaced, no diff | `os::rename_unless_changed`, re-checking the stamp before each try (invariant 11) |
| a write that names a file in another case than the disk holds it (`Receita.md` for `receita.md`), the temporary file renamed over that name | on NTFS the file takes the case of the new name; the log, the listing and the device then disagree on its spelling (the server's sync test, flaky on a loaded Windows machine, 2026-10-21) | `os::kept_spelling`: the temporary file goes over the name as the disk keeps it; `tests/write.rs` |
| one SQLite commit per item (`synchronous = FULL`) | each commit a real `FlushFileBuffers`: a first index of 5,000 notes took 228 s on Windows, 3 s on macOS | transactions of a few hundred changes per run (`BEGIN IMMEDIATE`, savepoints inside, committed even on a panic), a `busy_timeout` for the other processes; WAL with `synchronous = NORMAL` for a cache — 9 s |
| renaming a folder while a file in it is open | "Access is denied" | close files first; in tests, `Kept` (a closed `TempPath`) rather than `NamedTempFile` |
| `std::os::unix::fs::MetadataExt` (`dev`, `ino`, `nlink`, `uid`) | did not compile | `os::file_id`, `os::link_count`, `os::same_owner` |
| a `compile_error!` for "not Unix" | the whole workspace stopped | a Windows half in `verso-fs/src/os.rs` |
| a Unix-only crate (`xattr`) as a dependency on every OS | did not compile | `[target.'cfg(unix)'.dependencies]`; check with `cargo tree --target x86_64-pc-windows-msvc` |
| a watcher event taken as a change whatever its kind | reading notes made Windows report the folder "modified": the index looped | filter what the OS reports for itself (`directory_touched_only`) |
| reading every file to tell it is unchanged | each opening of 5,000 notes re-read and hashed them all: seconds of CPU on Windows | trust the modified time and length when the file was modified ≥ 2 s before the last complete run began — one date for the index (`unchanged_by_stat`, `meta.verified_from`), never a write per file; read the rest |
| a Windows cloud file read like any other | reading a OneDrive Files On-Demand file downloads it: a first index would pull the whole folder | `placeholder::is_dataless` reads its attributes (`RECALL_ON_DATA_ACCESS`, `RECALL_ON_OPEN`, `OFFLINE`); test with `attrib +O` |
| checking a name's characters only | `OBSIDI~1`, the 8.3 short name of `.obsidian`, got past the hidden rule | `confine::short_name` looks such a name up in its folder (`ShortName`) |
| a test writing through `Workspace::open(dir, None)` | 1167 indexes left in the user's real config folder | always pass a config folder in tests |
| the other way round, right on Linux and Windows, wrong on the Mac: a new or moved file given its name by `link` and `unlink` | FSEvents never reported that file's later removal outside the app (Finder, `rm`): the tree stayed stale and sync sent the deletion only at its 5-minute scan (2026-10-11) | `ops::claim`: `renamex_np` with `RENAME_EXCL` on macOS (`os::rename_exclusive`, through `rustix`), `link` elsewhere; `tests/watch.rs` removes such a file and waits for its event ([ADR 0069](../adr/0069-windows-port.md), revised 2026-10-11) |
| a volume without the exclusive rename but with hard links (macOS: some network volumes), opened like any other | a file Verso named there by `link` and later removed by another program stayed in the tree until a reindex or sync's scan | the person is told once per folder that changes other programs make there may show late, and what Verso writes stays safe; the log has a WARN line (`ops::names_by_link`, probed at opening; [ADR 0048](../adr/0048-file-operations-in-ui.md), revised 2026-10-12) |
| an `io::Error` matched by `kind()` alone for "not supported" | std calls only `ENOSYS` `Unsupported`; exFAT on macOS answers `link` and `renamex_np` with `ENOTSUP` (45), `Uncategorized`: every new or moved file on an exFAT drive failed (found on a mounted image, 2026-10-12) | `ops::not_supported` reads the number too (`ENOTSUP`, `EOPNOTSUPP`) |
| judging a path inside a folder by its name, or by a list of the links looked at earlier | a link out of a served sub-folder, a `DIR` for `dir` (macOS and Windows fold case; macOS also Unicode forms), a folder moved since, and a Windows **junction** (a reparse point that is not a symlink) each got past | `verso_fs::resolves_within`: resolve the real place (`canonicalize`, the system's own) of every part of the path at the moment of use and refuse what the system cannot resolve; the tests with links are `cfg(unix)` where creating links needs a privilege, the check is not |

## 3. Processes, configuration, executables

| Habit | What happened | Instead |
|---|---|---|
| `HOME` for the config folder | unset on Windows: the app would not start | `config_dir()` (`%LOCALAPPDATA%\verso` there: the machine's, not the roaming profile); Claude Desktop's is `%APPDATA%\Claude` |
| a binary named `verso-app` | the CLI never found `verso-app.exe` | `std::env::consts::EXE_SUFFIX` |
| `/usr/bin/true`, `/usr/local/bin`, `open -a`, `osascript` | do not exist on Windows | `cfg` per OS, a Windows path or an explicit "not on this platform yet" |
| `xdg-open` off macOS, text piped to `clip` | "Show in folder" failed on Windows; accents arrived mangled in the clipboard | `explorer /select,"…"` (a raw argument); UTF-16 with its byte order mark to `clip` |
| a test calling `ln`, `chmod`, `test`, `touch`, `sh` | "program not found" | the per-OS helpers of `tests/workspace/shell.rs` (`mklink`, `icacls`, `cmd`, PowerShell) |
| a variable or function used only in some `cfg` branches | clippy `-D warnings` failed on Windows | `cfg` the function, or `let _ = x;` in the other branch — never `#[allow]` |
| a `clippy.toml` entry naming `std::os::unix::…` | "does not refer to a reachable function" on Windows | `allow-invalid = true` on the entries of each OS |
| a GUI binary without `windows_subsystem = "windows"` | the installed app opened a terminal beside its window | `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]` in the app's `main.rs` |
| a window or web view created in a synchronous `#[tauri::command]` | a blank white window on Windows (wry#583) | make the command `async` |

## 4. The window (WebView2 is Chromium)

| Habit | What happened | Instead |
|---|---|---|
| counting on a click not focusing a button (WebKit never does, and undoes a `focus()` made on mousedown) | F2 renamed the clicked row in Chromium only; the arrows walked the tree after a click in Chromium only; the board's keys died after a menu click | focus explicitly after the click, the same in both engines (`tree.ts`: the row takes the arrows, F2 and Delete stay the window's until the keys move the focus); `onMouseDown={(e) => e.preventDefault()}` on buttons that must leave the focus where it was |
| a field's `finish` that removes the field, guarded by `isConnected` or not at all | Chromium fires `blur` inside `remove()`/`replaceWith()`: Enter threw, Escape committed | a `done` flag set before the removal |
| `overflow: hidden` and an inline `<svg>` on each of thousands of rows | in Chromium every row became a scroll container, a paint layer and an SVG layout root: ~120 MB for a tree of 5,000 rows | `overflow: clip` (after `hidden`, for an older engine); `maskIcon` (CSS) for a row's icon; `content-visibility: auto` on a folder's rows, so what is off screen is not restyled when a note opens — its containment cuts an outline drawn outside a row, so focus rings and drop outlines are drawn inside (`outline-offset: -2px`), and a clipped name needs `min-width: 0`; never a loop over every row per action |
| a refused name logged with `fail()` | an ERROR in the log for an answer | `nameTaken()` (INFO) |
| an HTML file's scripts | Chromium logs "Blocked script execution" for the sandbox | expected: the page runs no script by design |

## 5. Tests, CI and tools

| Habit | What happened | Instead |
|---|---|---|
| the app's test harness without the app manifest | `STATUS_ENTRYPOINT_NOT_FOUND` | `build.rs` embeds `windows-app-manifest.xml` in every binary |
| IPC tests calling from `tauri://localhost` | refused by the capability on Windows | `APP_ORIGIN` (`http://tauri.localhost` in WebView2) |
| Git's line-ending conversion on a Windows runner | fixtures would change | `git config --global core.autocrlf false` before the checkout |
| `npm` from PowerShell | the default execution policy refuses `npm.ps1` | `npm.cmd` |
| Tauri's CLI run from `app/ui` | "not a Tauri project" | run it from the tree's root (`npm --prefix app/ui exec -- tauri …`) |
| piping text into PowerShell 5.1 | accents mangled; JSON arrays not enumerated; quotes lost on native arguments | files by `scp`; go through a variable; a `.cmd` file for quoted arguments |
| `check-windows.sh` while `check.sh` runs | the UI bundle was rebuilt under the copy: "Cannot stat", nothing ran on Windows | run them one after the other |
| a `?` in a git pathspec | read as a wildcard | `':(literal)path'` |
| `cmd /C echo {line}>file` | a line ending in a digit makes `1>` a redirection | `(echo {line})>file` |
| a test that bounds a time by an absolute limit (`verso-dialect`'s `pathological_inputs_stay_linear`, 5 s) | the Windows VM under load crossed 5 s | bound linearity by a ratio, time(2N)/time(N) ≤ 2.5, not an absolute time (decided 2026-10-10; the code change is a commit of its own; its retry on a loaded machine — a unit over the bound measured again, up to three attempts, failing only if every one is over, 14ac192 — accepted by the maintainer on 2026-10-12) |

## 6. A file handed to the app (ADR 0114 item 30)

| Habit | What happened or would | Instead |
|---|---|---|
| reading `argv[1]` as a path | "Open with" on Windows may pass a `file://` URL with `%20`; a name with spaces must stay one argument | `loose::path_from_arg` (URL or path, relative to the second launch's cwd); the NSIS command quotes `"%1"` |
| a `\\?\` or UNC path handed on Windows | `Path::parent`/`file_name` still work; `strip_prefix` against an open folder may not match the other spelling | compare normalized absolute paths; a miss opens the file loose, never wrong |
| `file://` from the macOS open event | `to_file_path` percent-decodes; names come NFD from the system | the key hashes the path as given; the name shown is the system's |
| `.MD` on a case-folding disk | classified by the folded extension | `verso_fs::is_note_name` folds; a sibling link stats the name as written |
| a loose file on exFAT | no exclusive rename (ADR 0048 revised 2026-10-12): the create by link falls back | the same `verso-fs` create/write as a folder's |
| the generated `.desktop` on Linux | without `%U`/`%F` in `Exec` no file reaches `argv` | verify on the built package (Linux VM) before trusting the registration |

## 7. A shell on a pseudo-terminal (ADR 0115)

| Habit | What happened or would | Instead |
|---|---|---|
| a GUI app's own `PATH` for the person's tools | a Finder- or Start-menu-launched app has the system's bare `PATH`: `claude`, `gemini`, Homebrew's and npm's global bin are not found | start the person's shell as a login, interactive shell (`argv0` `-zsh`; `$SHELL`, or the password database's shell when unset) and let it build the `PATH`; detect the AI tools by asking that same shell (`command -v`), never by guessing paths |
| one shell for every system | `$SHELL` does not exist on Windows; `cmd.exe` is not what a person expects there | `pwsh.exe` when the `PATH` has it, else `powershell.exe`, the Command Prompt as a choice; the detection asks with `Get-Command` (PowerShell) or `where` (cmd) |
| a pseudo-terminal opened by hand (`openpty`, `ioctl`, `CreatePseudoConsole`) | needs `unsafe` in our tree, which the workspace forbids | `portable-pty` (openpty on macOS and Linux, ConPTY on Windows 10 1809+ and 11) |
| killing only the shell's pid | an agent's `node` children, or `sleep &`, outlive the tab; a crash of the app leaves them running | Unix: hang up the shell's process group and the terminal's foreground group (`killpg` through `nix`, `SIGHUP` then `SIGKILL` after a grace); Windows: the shell in a Job Object with kill-on-close (`win32job`), which also covers a crash of the app |
| "is a program running?" asked the same way everywhere | Unix knows the terminal's foreground group; ConPTY does not tell it | Unix: busy when the foreground group is not the shell's; Windows: ask whenever a terminal is open |
| an AppImage's environment handed to children | its `LD_LIBRARY_PATH` and `APPDIR` load the AppImage's libraries into every program of the shell | strip every variable naming the AppImage's directory, and `APPDIR`, `APPIMAGE`, `ARGV0`, `OWD`, before spawning (Linux only) |
| a read of the output cut at a fixed size and sent as text | a multi-byte character (`ç`, an emoji) split across two reads became two replacement characters | keep the bytes of a character not yet whole for the next read (`pty::whole_text`) |
| the detection's answer read as it comes | ConPTY and prompt themes put cursor moves, titles and colours among the lines; startup files print greetings | the question between two marks, each line of the answer stripped of control sequences before it is read |
| `⌘` and `Ctrl` treated alike in the terminal's keys | on Windows and Linux `Ctrl` is the shell's (Ctrl+C, Ctrl+R, Ctrl+D) | one table (`app/ui/src/terminal/keys.ts`): on macOS every `⌘` key stays the app's; elsewhere only the listed `Ctrl` keys do, and Ctrl+C copies only with a selection |
