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
| one SQLite commit per item (`synchronous = FULL`) | each commit a real `FlushFileBuffers`: a first index of 5,000 notes took 228 s on Windows, 3 s on macOS | transactions of a few hundred changes per run (`BEGIN IMMEDIATE`, savepoints inside, committed even on a panic), a `busy_timeout` for the other processes; WAL with `synchronous = NORMAL` for a cache — 9 s |
| renaming a folder while a file in it is open | "Access is denied" | close files first; in tests, `Kept` (a closed `TempPath`) rather than `NamedTempFile` |
| `std::os::unix::fs::MetadataExt` (`dev`, `ino`, `nlink`, `uid`) | did not compile | `os::file_id`, `os::link_count`, `os::same_owner` |
| a `compile_error!` for "not Unix" | the whole workspace stopped | a Windows half in `verso-fs/src/os.rs` |
| a Unix-only crate (`xattr`) as a dependency on every OS | did not compile | `[target.'cfg(unix)'.dependencies]`; check with `cargo tree --target x86_64-pc-windows-msvc` |
| a watcher event taken as a change whatever its kind | reading notes made Windows report the folder "modified": the index looped | filter what the OS reports for itself (`directory_touched_only`) |
| checking a name's characters only | `OBSIDI~1`, the 8.3 short name of `.obsidian`, got past the hidden rule | `confine::short_name` looks such a name up in its folder (`ShortName`) |
| a test writing through `Workspace::open(dir, None)` | 1167 indexes left in the user's real config folder | always pass a config folder in tests |

## 3. Processes, configuration, executables

| Habit | What happened | Instead |
|---|---|---|
| `HOME` for the config folder | unset on Windows: the app would not start | `config_dir()` (`%APPDATA%\verso` there); Claude Desktop's is `%APPDATA%\Claude` |
| a binary named `verso-app` | the CLI never found `verso-app.exe` | `std::env::consts::EXE_SUFFIX` |
| `/usr/bin/true`, `/usr/local/bin`, `open -a`, `osascript` | do not exist on Windows | `cfg` per OS, a Windows path or an explicit "not on this platform yet" |
| `xdg-open` off macOS, text piped to `clip` | "Show in folder" failed on Windows; accents arrived mangled in the clipboard | `explorer /select,"…"` (a raw argument); UTF-16 with its byte order mark to `clip` |
| a test calling `ln`, `chmod`, `test`, `touch`, `sh` | "program not found" | the per-OS helpers of `tests/workspace/shell.rs` (`mklink`, `icacls`, `cmd`, PowerShell) |
| a variable or function used only in some `cfg` branches | clippy `-D warnings` failed on Windows | `cfg` the function, or `let _ = x;` in the other branch — never `#[allow]` |
| a `clippy.toml` entry naming `std::os::unix::…` | "does not refer to a reachable function" on Windows | `allow-invalid = true` on the entries of each OS |
| a window or web view created in a synchronous `#[tauri::command]` | a blank white window on Windows (wry#583) | make the command `async` |

## 4. The window (WebView2 is Chromium)

| Habit | What happened | Instead |
|---|---|---|
| counting on a click not focusing a button (WebKit never does, and undoes a `focus()` made on mousedown) | F2 renamed the clicked row in Chromium only; the arrows walked the tree after a click in Chromium only; the board's keys died after a menu click | focus explicitly after the click, the same in both engines (`tree.ts`: the row takes the arrows, F2 and Delete stay the window's until the keys move the focus); `onMouseDown={(e) => e.preventDefault()}` on buttons that must leave the focus where it was |
| a field's `finish` that removes the field, guarded by `isConnected` or not at all | Chromium fires `blur` inside `remove()`/`replaceWith()`: Enter threw, Escape committed | a `done` flag set before the removal |
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
| a `?` in a git pathspec | read as a wildcard | `':(literal)path'` |
| `cmd /C echo {line}>file` | a line ending in a digit makes `1>` a redirection | `(echo {line})>file` |
