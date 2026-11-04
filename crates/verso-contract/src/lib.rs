// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The contract between the core and the UI (ADR 0026): what crosses the
//! wire, as Rust types, from which the TypeScript side is generated and
//! never written by hand (rule 3; ADR 0038, decided 2026-09-22: specta,
//! with tauri-specta for the commands). Phase 2, item 2.1.
//!
//! Nothing here touches disk, the index or a window: this crate names
//! things. A note is named by its path relative to the open folder (rule
//! 4); the folder itself by its name and an opaque key — its path is a
//! string only at the entry edge, the command line and the native folder
//! picker, both on the host's side. No absolute path, and none with `..`,
//! crosses in either direction. Counts and positions are `u32` because the
//! TypeScript side has no 64-bit integer without `bigint`, and no note
//! has four billion lines.

use serde::{Deserialize, Serialize};
use specta::Type;

pub mod compat;
mod read_links;
pub use read_links::{ReadLinkInfo, ReadLinkMade, ReadLinks};
mod local;
pub use local::{
    LocalAddressChoice, LocalAsked, LocalAudit, LocalDevice, LocalFolder, LocalInvitation,
    LocalInvite, LocalLink, LocalLinkDownload, LocalLinkEnd, LocalLinkState, LocalOwnAddress,
    LocalOwnLogin, LocalPairState, LocalPairing, LocalPhone, LocalPlayer, LocalPlayerReach,
    LocalReset, LocalServerStatus,
};
mod folder_data;
pub use folder_data::{
    FolderDataEntry, FolderDataFile, FolderDataKind, FolderDataList, FolderDataWritten,
    OracleSettings, OracleSparks,
};
mod oracle_draw;
pub use oracle_draw::{CollabOracle, OracleAsk, OracleDraw};
mod maps;
pub use maps::{MapInfo, MapState};
mod access;
pub use access::{
    AccessCap, AccessChange, AccessChanged, AccessException, AccessInfo, AccessLevel, AccessPlayer,
    AccessRow, AccessSeat, AccessSetResult, AccessSetView, AccessWhy, FileAccess, FolderAccess,
    SyncRight, SyncRights,
};
mod campaign;
pub use campaign::{
    CampaignAccess, CampaignAudience, CampaignChanged, CampaignGrant, CampaignInvite, CampaignNote,
    CampaignPerson, CampaignPlayer, CampaignStatus, CampaignTable,
};
mod capabilities;
pub use capabilities::{Can, Capabilities, Host};
mod audio_share;
pub use audio_share::{
    AudioCaptureStarted, AudioShare, AudioShareBehind, AudioShareEnd, AudioShareStart,
    AudioShareStopped, AudioSource, AudioSourceKind, BITRATE_DEFAULT, BITRATE_LEAST, BITRATE_MOST,
    CHANNELS, FRAME_HEADER_LEN, FRAME_MOST, FRAME_MS, FRAMES_PER_SECOND_MOST, FrameError,
    FrameHeader, SAMPLE_RATE, SHARE_ID_FIRST, SOURCE_NAME_MOST, bitrate_ok, is_audio_frame,
    name_ok,
};
mod table;
pub use table::{
    DiceStyle, DiceStyles, PlaybackSource, TableCleared, TableEntry, TableImages, TableJoin,
    TableMember, TablePage, TablePinned, TablePlayback, TablePlayed, TableRemoved, TableRoster,
    TableTime,
};
mod lists;
pub use lists::{BlockKind, FolderBlock, FolderBlocks, Tag, WebNote};
mod sync;
pub use sync::{
    CloudCheck, CloudSettings, CloudStatus, PlaceholderPlan, SyncLogEntry, SyncRefused, SyncStatus,
    SyncVersions,
};
mod picked;
pub use picked::{
    FilesDropped, FilesOver, PickSkip, PickedFile, PickedFiles, RecentFolder, SkippedPick,
};
mod periodic;
pub use periodic::{ObsidianPeriodic, PeriodSettings, PeriodicSettings};
mod loose;
pub use loose::{LooseFileInfo, Opened, ReadOnlyReason, RecentFile};
mod terminal;
pub use terminal::{
    AiCli, AiCliFound, TerminalAt, TerminalId, TerminalOpened, TerminalOutput, TerminalShell,
    TerminalSize, TerminalStart,
};
mod history;
pub use history::{
    AuthorKind, HistoryListing, VersionAuthor, VersionEntry, VersionKind, VersionRestored,
    VersionText,
};

/// The folder that is open, and what indexing it did.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct FolderInfo {
    /// The folder's own name (its last path component), for display.
    pub name: String,
    /// An opaque, stable name for the folder that carries no path — the
    /// stem of its index file's name under the configuration directory:
    /// letters, digits and `-`. What a UI keeps its per-folder state
    /// under, and what `reopen_folder` takes to open the folder again.
    pub key: String,
    pub index: IndexSummary,
    /// The name of the folder's file system when changes made there by
    /// other programs may show late: a volume without the exclusive rename
    /// and with hard links (macOS: some network volumes; ADR 0048, revised
    /// 2026-10-12), where a file Verso creates or moves is named by a
    /// link, whose later removal by another program the system may not
    /// report. Verso's own writes are as safe as anywhere. The UI says it
    /// once per folder, in the user's language (ADR 0035).
    #[serde(default)]
    pub late_outside_changes: Option<String>,
}

/// What changed in the open folder, as the watcher saw it and the index
/// then found it: the payload of the `folder-changed` event the host sends
/// the app's windows after every batch of changes (provisional:
/// `docs/reference/watcher-decision.md`). Notes are named by their path
/// relative to the folder (rule 4). The lists are what this batch's index
/// run found; another run may have found a change first, so a window
/// checks every note it shows against the disk whatever they say — read
/// again when nothing was typed in it, saved at once otherwise, which meets
/// the difference (invariant 11), marked when it is gone.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct FolderChanged {
    /// The folder's key: a window showing another folder has nothing to do.
    pub key: String,
    /// Notes this run found new or different on disk.
    pub changed: Vec<String>,
    /// Notes this run found gone from disk.
    pub removed: Vec<String>,
    /// Entries renamed or moved, when the side knows it moved them: a
    /// device's rename on a server (ADR 0079). A window's tab of `from`
    /// follows it to `to`, as after a rename made in the window. The
    /// watcher never knows a rename, and leaves this empty: the old path
    /// is among `removed`, the new one among `changed`, as here too.
    #[serde(default)]
    pub moved: Vec<Moved>,
    /// Whether which entries there are, or of which kind, changed: a tree
    /// or a folder view is drawn again only then.
    pub listing: bool,
    /// The index run's counts and problems, as `reindex` answers them.
    pub index: IndexSummary,
}

/// What one `index` run did (ADR 0043: placeholders are present, never
/// removed).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct IndexSummary {
    pub indexed: u32,
    pub unchanged: u32,
    pub removed: u32,
    pub placeholders: u32,
    /// Problems the walk met and what the run could not do besides
    /// indexing, one readable line each with paths relative to the
    /// folder, for the UI to show.
    pub problems: Vec<String>,
    /// The folder is not watched for changes made outside the app: the
    /// operating system's reason, as it gives it (no path). The UI says
    /// what that means, in the user's language (ADR 0035).
    pub unwatched: Option<String>,
    /// The folder changed and this index run could not bring the index up
    /// to date: the core's reason. The UI says it in the user's language.
    pub unindexed: Option<String>,
}

/// Any file of the folder as text, with the revision `write_text` takes
/// back (invariant 11): the editor of files that are not notes.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct TextFile {
    pub path: String,
    pub text: String,
    pub revision: String,
    /// What the write could not preserve, one line each; empty after a read.
    pub warnings: Vec<String>,
    /// What the person asking may do with it (ADR 0113 section C); a host
    /// with no server leaves it out: the folder is the person's own.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub access: Option<FileAccess>,
}

/// A named root of the file tree (ADR 0062).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct Focus {
    pub name: String,
    pub paths: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sticker: Option<String>,
}

/// Machine-readable code for the reason `.space/waypoints.json` is read-only (ADR 0062).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum ReadOnlyReasonCode {
    CloudPlaceholder,
    InvalidJson,
    UnknownFormat,
}

/// The result of reading focuses from the open folder (ADR 0062).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct FocusesSummary {
    /// Focuses found in `.space/waypoints.json`, or empty if no file.
    pub focuses: Vec<Focus>,
    /// Whether `.space/waypoints.json` is present in the open folder.
    pub has_file: bool,
    /// Whether `.space/waypoints.json` is in the known format (ADR 0062 D6).
    pub format_known: bool,
    /// Why the file is read-only, if not known format or unreadable.
    pub read_only_reason: Option<String>,
    /// Machine-readable code for read-only reason.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub read_only_code: Option<ReadOnlyReasonCode>,
    /// The revision stamp for optimistic concurrency (Invariants 9 & 11).
    pub stamp: Option<String>,
}

/// The folder's settings that travel with it (ADR 0070 items 1–2), as
/// `.verso/settings.json` holds them, or a change to them: `None` is "not
/// set here". Every path is relative to the folder, joined by `/`.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct FolderSettings {
    pub bookmarks: Option<Vec<String>>,
    /// A plain file name without `.md`; empty: a folder's note is named
    /// after the folder.
    pub folder_note_name: Option<String>,
    /// Leave out the well-known build folders (ADR 0044).
    pub ignore_build_dirs: Option<bool>,
    /// Honour each `.gitignore` (ADR 0044).
    pub respect_gitignore: Option<bool>,
    /// The periodic notes' settings (ADR 0093 item 4).
    pub periodic: Option<PeriodicSettings>,
    /// The oracle's odds and spark words (ADR 0102 item 2).
    pub oracle: Option<OracleSettings>,
    /// The theme the folder suggests (ADR 0100 item 4): the JSON text of
    /// one object, at most 16 KiB; an empty text takes the suggestion away.
    /// The window checks its tokens.
    pub recommended_theme: Option<String>,
}

/// The folder's layer of settings as read now (ADR 0070 items 1–2).
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct FolderLayer {
    /// Whether `.verso/settings.json` stands in the folder. When it does
    /// not, every setting is this machine's until one is first changed.
    pub exists: bool,
    /// Why the folder's layer is not used now: `unavailable` (the file is
    /// a placeholder of on-demand storage, ADR 0043), `invalid` (not a
    /// JSON object) or `share` (a window on a share of a server's folder,
    /// whose settings are the whole folder's, ADR 0081). It is never
    /// written then, and this machine's settings apply.
    pub problem: Option<String>,
    /// What was read, for the next change to hand back (invariant 11);
    /// `None` when there is no file — the next change creates it.
    pub revision: Option<String>,
    pub settings: FolderSettings,
    /// What the write that answered this could not confirm; empty after
    /// a read.
    pub warnings: Vec<String>,
}

/// What one entry of the open folder is.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum FileKind {
    Note,
    File,
    Folder,
    /// Present, content in the cloud (ADR 0043).
    Placeholder,
}

/// Sticker and color of an entry (note or folder), plus its first alias
/// when one exists, and manual order and pinned lists (ADR 0060, S1, S3).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct EntryLabel {
    pub sticker: Option<String>,
    pub color: Option<String>,
    pub alias: Option<String>,
    /// Every alias, the first included (ADR 0089 item 5: the suggestion
    /// while typing matches them).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub aliases: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub order: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pinned: Option<Vec<String>>,
}

/// One entry of the open folder as the last walk saw it: what a folder
/// listing shows and sorts by. `size` and `modified` are `f64` because
/// the TypeScript side has no 64-bit integer without `bigint`: bytes are
/// exact up to 2^53, seconds since the epoch far beyond any date.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct FileEntry {
    pub path: String,
    pub kind: FileKind,
    /// Bytes; 0 for a folder or an unread placeholder.
    pub size: f64,
    /// Seconds since the Unix epoch; 0 when the file system gave none.
    pub modified: f64,
    pub label: Option<EntryLabel>,
    /// What the person asking may do with it (ADR 0113 section C); a host
    /// with no server leaves it out: the folder is the person's own.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub access: Option<FileAccess>,
}

/// A heading of a note, for citing and for the outline.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct Heading {
    pub level: u32,
    pub text: String,
    pub line: u32,
    pub col: u32,
}

/// A `^id` block of a note (ADR 0018: cite this instead of a position).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct Block {
    pub id: String,
    pub line: u32,
    pub col: u32,
    /// The first and last line of the block the id names (spec Q3, Q21):
    /// what a link `[[nota#^id]]` reaches and an embed of it shows.
    pub first_line: u32,
    pub last_line: u32,
}

/// A note's text as it is on disk now, with what the index knows of it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct NoteText {
    pub path: String,
    /// Without line endings; line `n` (1-based) is `lines[n - 1]`.
    pub lines: Vec<String>,
    /// The note rendered as HTML by the core's own parser, for a preview:
    /// wikilinks are `<a class="wikilink" data-target>`, embeds
    /// `<span class="embed" data-target>`; the UI resolves targets
    /// through `links`.
    pub html: String,
    /// The frontmatter as a properties panel shows it: key and one line
    /// of text per value, in the order written.
    pub properties: Vec<Property>,
    /// The whole text as read, line endings included: what the editor
    /// gives back is written as is, no normalization (ADR 0012). A file
    /// whose bytes are not UTF-8 gives no text at all (`not_text`).
    pub text: String,
    /// Opaque: what was read. `write_note` takes it back and refuses a
    /// file that changed meanwhile (invariant 11, `changed`).
    pub revision: String,
    pub headings: Vec<Heading>,
    pub blocks: Vec<Block>,
    /// The file differs from what the index holds: graph answers may be
    /// behind this text.
    pub stale: bool,
    /// The index holds the note only as a last known version: a
    /// placeholder stood where it was (ADR 0043).
    pub unverified: bool,
    /// The note's type, when its `type:` names a schema of the folder
    /// (ADR 0052); null for plain Markdown.
    pub note_type: Option<NoteType>,
    /// The `verso-schema` blocks this note holds: one that types nothing,
    /// or a nested one that is not read, is said in its note (ADR 0052).
    pub schema_blocks: Vec<SchemaNotice>,
    /// What the person asking may do with it (ADR 0113 section C); a host
    /// with no server leaves it out: the folder is the person's own.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub access: Option<FileAccess>,
}

/// A `verso-schema` block of a note.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct SchemaNotice {
    /// The line of the opening fence (1-based).
    pub line: u32,
    pub name: Option<String>,
    /// Inside a list or a quote: not read.
    pub nested: bool,
    /// Why a block at the top level types nothing (`unknown_kind`, …).
    pub error: Option<String>,
}

/// A note's type (ADR 0052): its `type:` as written, and what it reaches.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct NoteType {
    pub written: String,
    pub state: TypeState,
}

/// What a note's `type:` reaches: one schema, read (`typed`); two or more
/// of one name, which type nothing (`conflict`, ADR 0052 point 5); or one
/// that does not parse (`invalid`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum TypeState {
    Typed {
        /// The note that holds the schema.
        schema: String,
        /// The schema's `type`, as written there.
        name: String,
        /// The type's name per interface language.
        labels: Vec<Label>,
        /// The declared properties, in the schema's order.
        properties: Vec<TypedProperty>,
        /// The layout the schema names: `infobox`, the properties as a
        /// card beside the text (ADR 0086 item 2); null, the panel as it
        /// is.
        layout: Option<String>,
    },
    Conflict {
        /// The notes that hold a schema of that name, in path order.
        schemas: Vec<String>,
    },
    Invalid {
        schema: String,
        /// Why, as spec §4.8 names the kinds (`unknown_kind`, `yaml`, …).
        error: String,
    },
}

/// A name in one interface language (`pt-BR`, `en`), as a schema writes it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct Label {
    pub lang: String,
    pub text: String,
}

/// A property a schema declares, as the note holds it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct TypedProperty {
    pub key: String,
    /// `text`, `list`, `number`, `checkbox`, `date`, `datetime`, `link` or
    /// `image` (ADR 0086 item 1).
    pub kind: String,
    pub labels: Vec<Label>,
    /// The note has the key.
    pub present: bool,
    /// Its value fits the kind; false for a key the note lacks.
    pub fits: bool,
}

/// What a write left behind: the note as written — the text that was
/// sent, with the revision of those very bytes, never a re-read — and
/// what the atomic write could not guarantee, one line each (permissions,
/// owner, extended attributes, hard links, network file system,
/// durability). None means the content was lost; all are for the user
/// to see.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct Written {
    pub note: NoteText,
    pub warnings: Vec<String>,
}

/// A note that links to what moved: its text before and after the links
/// are pointed at the new place, with the revision `write_note` takes
/// back. Shown, then applied, one note at a time (ADR 0048).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct LinkRewrite {
    pub path: String,
    pub revision: String,
    pub before: String,
    pub after: String,
}

/// Why a note that links to what moved got no rewrite.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum SkipReason {
    /// A placeholder: present, content not downloaded (ADR 0043).
    Unavailable,
    /// Not UTF-8: no text can be rewritten without loss.
    NotText,
    /// Could not be read; the error is among the warnings.
    Failed,
}

/// A note the plan could not cover: it links to what moved, and its links
/// may now point elsewhere or nowhere, but no rewrite could be made. The
/// UI lists them.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct Skipped {
    pub path: String,
    pub reason: SkipReason,
}

/// What a rename or a move left: the new path, the rewrites it calls for,
/// the notes it could not plan, and what could not be confirmed once the
/// entry had moved (a durability step, the index following, the
/// sidecar), one line each. The move happened whenever this is answered.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct Renamed {
    pub path: String,
    pub rewrites: Vec<LinkRewrite>,
    pub skipped: Vec<Skipped>,
    pub warnings: Vec<String>,
    /// What else moved with the entry, by a rule of its own: a folder's
    /// note taking the folder's new name (ADR 0060). Old path to new.
    pub also: Vec<Moved>,
}

/// What moving several entries at once left — a selection of the tree
/// dropped on a folder (ADR 0048, revised 2026-10-07): those that moved;
/// those the disk refused, each with its error, which stayed where they
/// were; one plan of rewrites over where everything ended; the notes it
/// could not plan; what could not be confirmed; and what moved by a rule
/// of its own (a folder's note). Empty when nothing had to move.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct MovedEntries {
    pub moved: Vec<Moved>,
    pub refused: Vec<RefusedEntry>,
    pub rewrites: Vec<LinkRewrite>,
    pub skipped: Vec<Skipped>,
    pub warnings: Vec<String>,
    pub also: Vec<Moved>,
}

/// An entry a move left where it was, and why.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct RefusedEntry {
    pub path: String,
    pub error: ContractError,
}

/// A file that moved, from one relative path to another.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct Moved {
    pub from: String,
    pub to: String,
}

/// What a deletion left: where the entry went in `.trash/`, and what
/// could not be confirmed once it was there, one line each.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct Trashed {
    pub path: String,
    pub warnings: Vec<String>,
}

/// One entry of the folder's bin (ADR 0080 item 4): a file, or a folder
/// trashed whole, with what is known of its deletion.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct TrashEntry {
    /// Where it is, under `.trash/`: what a restore or a removal names.
    pub path: String,
    /// Where it was, relative to the folder.
    pub original: String,
    /// A folder trashed with what it held.
    pub folder: bool,
    /// The bytes it holds.
    pub size: f64,
    /// When it was deleted, in seconds since the Unix epoch; when that is
    /// not known (`known` false), when it was first seen in the bin.
    pub deleted: f64,
    pub known: bool,
    /// Who deleted it: on a server the account (or, for a version a write
    /// replaced, the device); on the computer the server whose sync
    /// carried the deletion out. None: this computer, or not known.
    pub by: Option<String>,
    /// Sync carried the deletion out on this computer (item 9).
    pub sync: bool,
    /// Not deleted: the version a device's write replaced (item 12).
    pub replaced: bool,
    /// When it is removed for good, in seconds; none when deleted files
    /// are kept for ever.
    pub expires: Option<f64>,
}

/// The folder's bin as its page shows it (ADR 0080 items 3, 4, 7 and 8).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct TrashListing {
    /// Newest first.
    pub entries: Vec<TrashEntry>,
    /// The bytes the bin holds — shown, not counted against the quota.
    pub size: f64,
    /// How many days deleted files are kept; 0: for ever.
    pub days: u32,
    /// The most days this person may choose (a server folder's owner
    /// shortens what the admin set, item 3); none: anything, for ever too.
    pub most: Option<u32>,
    /// Whether this person may change how long deleted files are kept.
    pub can_set: bool,
    /// Whether this person may delete an entry now or empty the bin: the
    /// folder's owner (item 7); on the computer, always.
    pub can_purge: bool,
    /// The folder's quota on its server, in bytes; none without one.
    pub quota: Option<f64>,
    /// The bin alone is larger than the quota: its oldest entries expire
    /// early (item 8).
    pub early: bool,
}

/// Where a restore put an entry of the bin (ADR 0080 item 5).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct Restored {
    pub path: String,
    /// The original path was taken: it went beside it, under a new name.
    pub beside: bool,
    pub warnings: Vec<String>,
}

/// What the running app is: its version (the workspace's, ADR 0051) and the
/// commit it was built from — shown in the settings and the About panel.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct AppInfo {
    pub version: String,
    pub commit: String,
    /// This computer's name, as the copy of a conflict names it (ADR 0079
    /// item 8): the editor's "keep both" names its copy as sync does.
    /// None where the window runs on no computer of its own (a server).
    pub device: Option<String>,
}

/// This computer's name (ADR 0079 item 8, ADR 0074 item 8; decided
/// 2026-10-11): the one the person set in Settings › Servers, or the
/// system's. A conflict's copy carries it, and a server's list of sessions
/// and its change log show it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct DeviceName {
    /// The name in use: the person's when set, the system's otherwise.
    pub name: String,
    /// The system's name, the default.
    pub system: String,
    /// Whether the person set the name.
    pub custom: bool,
}

/// The name set, and the servers this computer is signed in to that could
/// not be told: their list of sessions keeps the old name until the next
/// sign-in there.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct DeviceRenamed {
    pub device: DeviceName,
    /// The addresses of the servers not reached.
    pub unreached: Vec<String>,
}

/// The space a folder takes (ADR 0075 item 4): counted from the walk the
/// index already makes, never by a walk of its own. Bytes, as numbers the
/// window can show.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct FolderSpace {
    /// Every file of the folder, notes and attachments.
    pub total: f64,
    /// The notes (`.md`).
    pub notes: f64,
    /// Everything else: pictures, PDFs, boards, other files.
    pub attachments: f64,
    /// How many files.
    pub files: u32,
    /// The folder's index, kept beside the configuration (not inside the
    /// folder).
    pub index: f64,
}

/// What a room holds (ADR 0082 item 12, decided 2026-10-12): a `text` —
/// a note, or any other text file of the folder — as one Yjs text, or a
/// `board` as its elements, one entry per element and version.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum CollabKind {
    Text,
    Board,
}

/// A file joined for editing by several people at once (ADR 0073 item 7,
/// ADR 0082 item 12): the shared state as a Yjs update (base64) to apply
/// to an empty document, the revision on disk it stands on, and how the
/// file is written — a text's lines in the shared state end in `\n`; a
/// file that mixes them is shown read-only and joins nothing.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct CollabJoin {
    /// A text or a board: the window binds the state to its editor or to
    /// its board by it.
    pub kind: CollabKind,
    pub update: String,
    pub revision: String,
    pub read_only: bool,
    /// Whether the file's lines end in CRLF.
    pub crlf: bool,
    /// The name the others see for this person.
    pub user: String,
    /// Which room this is: a window that comes back after its connection
    /// dropped sends what it typed meanwhile only into the room it left,
    /// never into one made again from the disk.
    pub epoch: String,
    /// The room's last rolls of dice, oldest first, for whoever joins
    /// (ADR 0088 item 4): kept in the server's memory, never stored.
    #[serde(default)]
    pub rolls: Vec<DiceRoll>,
}

/// A roll of dice (ADR 0088): the notation rolled, the table it chose a
/// row of when it was one, what each die showed, and the total. In a room
/// the server rolls and names who asked; alone, the window rolls and
/// `by` is empty. Never written to a file (item 2).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct DiceRoll {
    /// What was rolled, without spaces: `1d20+3`, `4d6kh3`.
    pub notation: String,
    /// The random table rolled, as the note writes it (`[[Tabelas#^id]]`):
    /// the window that hears the roll reads the row from the table itself.
    pub source: Option<String>,
    /// Each term of dice in the notation's order.
    pub terms: Vec<DiceTermRoll>,
    /// The numbers added to the dice, summed.
    pub modifier: i32,
    pub total: i32,
    /// The name of the account that rolled; empty when the window rolled.
    pub by: String,
    /// When, RFC 3339 in UTC.
    pub at: String,
    /// The roller's dice appearance, as the window sent it and the server
    /// checked it (ADR 0107 item 11); none when the window rolled alone or
    /// sent none.
    #[serde(default)]
    pub styles: Option<DiceStyles>,
    /// Which of the note's dice with this code was clicked, from the first
    /// (ADR 0107): a note can hold the same `dice:` code twice, and a
    /// window that hears the roll shows it on that one. For display only;
    /// none when the roll was not made from a die in a note, or by an older
    /// window or server, and then the first such die shows it.
    #[serde(default)]
    pub occurrence: Option<u32>,
}

/// One term of dice in a roll: `-1d4` is `sign` -1 and `sides` 4; a
/// fudge die (`dF`) has three sides, -1, 0 and +1. `kept` count in the
/// total, `dropped` were taken off by keep or drop, each in the order the
/// dice fell.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct DiceTermRoll {
    pub sign: i32,
    pub sides: u32,
    pub fudge: bool,
    pub kept: Vec<i32>,
    pub dropped: Vec<i32>,
}

/// A roll in a room, heard by the others in it (event `collab-roll`).
/// The roll carries no path: the event's is the window's own.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct CollabRoll {
    pub path: String,
    pub roll: DiceRoll,
}

/// An edit or a presence of another person in a note (events
/// `collab-update` and `collab-awareness`): a Yjs update, base64.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct CollabUpdate {
    pub path: String,
    pub update: String,
}

/// What became of a shared note (events `collab-saved`, `collab-conflict`,
/// `collab-closed`): written at `revision`; changed on disk while edits
/// waited, so the people in it see the difference; or no longer shared
/// (renamed, deleted, its line ends mixed), so the window reads it again.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct CollabState {
    pub path: String,
    pub revision: Option<String>,
}

/// A server this app signed in to (ADR 0074 item 8; the maintainer's
/// answer K of 2026-10-09): its address and whose account it is. The
/// device's token stays on this side.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct ServerAccount {
    pub url: String,
    pub email: String,
    pub name: String,
}

/// A UniVerso announced on the local network (ADR 0097): what the
/// announcement says, to show and to click, never to trust. The `url` is
/// the address a click fills in; nothing connects because of it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct FoundServer {
    /// The announced instance name, `UniVerso-ab12cd`.
    pub name: String,
    /// The announced host, `universo-ab12cd.local`.
    pub host: String,
    /// Where a click connects: the public address the server announced, or
    /// `http://address[:port]`; empty when `needs_public_url`.
    pub url: String,
    /// A server that speaks TLS itself and announced no public address: it
    /// is listed, but cannot be offered by IP (a certificate is for a
    /// name); the server's `VERSO_PUBLIC_URL` must be set.
    pub needs_public_url: bool,
    pub https: bool,
    /// The version it announced; empty when it said none.
    pub version: String,
}

/// What a closed table answers a player who tries to open it (ADR 0110 item 3,
/// MC.1 = A). The server says it and the windows know it by this text: a
/// closed table is told to the player as a state to wait out, not a fault.
pub const TABLE_CLOSED: &str = "a mesa está fechada";

/// The window's server, or what it held there, is gone (event
/// `server-gone`, ADR 0084 item 10): said by the desktop app to a window
/// on a server's folder.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct ServerGone {
    /// The server, as signed in to (Settings › Servers).
    pub url: String,
    /// What ended: `session` (the server ended this device's session, or
    /// refused it on reconnecting), `folder` (this account no longer
    /// reaches the folder or the share: `reason` says why), `connection`
    /// (the connection dropped; the app tries again), `unreachable` (a
    /// try found the server out of reach: `address` names it) or `closed`
    /// (the table is closed by its game master: the app tries again and
    /// gets in when it opens).
    pub what: String,
    /// With `folder`, when the server says it: `revoked` by its owner,
    /// `deleted` (the shared folder went), `left` by the person.
    pub reason: Option<String>,
    /// With `unreachable`: the server's address, `host[:port]`, and the
    /// addresses tried, each on a line after it (as `Unreachable`'s
    /// message).
    pub address: Option<String>,
}

/// Where a window reaches the server whose folder it shows (`window_server`):
/// its address as the app is signed in to it, and the folder's id there. What
/// turns a link the server made without knowing its own public name (a path
/// like `/invite/<token>`) into one that opens, and gives a note's address
/// in the server's window. In a browser it is the page's own origin.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct ServerWindow {
    pub url: String,
    pub folder: String,
}

/// The window's server is back after it was gone (event `server-back`,
/// ADR 0084 item 10): the folder was opened again.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct ServerBack {
    pub url: String,
}

/// A folder at 90 % of its quota or more (event `folder-quota`, ADR 0077
/// item 5, ADR 0084 item 7): pushed by the server after a write, to the
/// windows on the server's folder and to a device that syncs a folder of
/// its computer with it, which tells that folder's windows. Bytes, as
/// numbers the window can show.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct FolderQuota {
    /// What the folder takes now.
    pub used: f64,
    /// Its quota.
    pub quota: f64,
}

/// A folder given to this account by another person (event `share-given`,
/// ADR 0084 item 7): a share of a folder inside theirs (ADR 0081), or
/// their whole folder. Pushed by the server to the account's open
/// connections — its browser windows and its devices, never a token's —
/// when the account had no access to it before; a role changed later is
/// not this event.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct ShareGiven {
    /// What opens it: the id of a share, or of the whole folder
    /// (`ServerFolder::id`).
    pub id: String,
    /// The folder's own name: the shared folder's last component, or the
    /// whole folder's name.
    pub name: String,
    /// `editor` (writes) or `reader` (reads only); `owner` for a whole
    /// folder given with that role.
    pub role: String,
    /// The display name of the person who gave it.
    pub by: String,
    /// A share inside someone's folder, not their whole folder.
    pub share: bool,
    /// The server, as signed in to (Settings › Servers): the desktop app
    /// fills it, being signed in to any number of servers; none from the
    /// server itself, whose windows are on it.
    pub server: Option<String>,
}

/// A sign-in under way: the code the server's page shows, to compare, and
/// the page the app opened in the browser.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct ServerSignIn {
    pub code: String,
    pub page: String,
}

/// A folder of a server the account may open, and the role in it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct ServerFolder {
    pub id: String,
    pub name: String,
    pub role: String,
    /// Whose it is, when it is someone else's — a whole folder or a share
    /// (ADR 0081 item 5): it is listed under "Shared with me".
    #[serde(default)]
    pub owner: Option<String>,
    /// A folder inside someone's folder, shared with this account (ADR
    /// 0081 item 2).
    #[serde(default)]
    pub share: bool,
    /// The shared folder is no longer where the share points (item 13).
    #[serde(default)]
    pub missing: bool,
}

/// The folders a server lists for the account, and whether the account may
/// make a new one there (the server's `mayCreate`, ADR 0074 item 6; the
/// maintainer, 2026-10-16: a new server has no folder, and the admin who
/// signs the app in has to be able to make the first).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct ServerFolders {
    pub folders: Vec<ServerFolder>,
    #[serde(default)]
    pub may_create: bool,
}

/// A person who has access to a shared folder, and in which role (ADR
/// 0081 item 7).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct SharePerson {
    pub id: String,
    pub name: String,
    pub email: String,
    /// `owner`, `editor` (writes) or `reader` (reads only).
    pub role: String,
}

/// A folder of the open folder as its owner shares it (ADR 0081 item 7):
/// the path inside the open folder — `""` for the whole folder, whose
/// people are its members — who has access and in which role, and the
/// attachments folder shown with it, read-only (item 11).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct FolderShare {
    pub id: Option<String>,
    pub path: String,
    pub people: Vec<SharePerson>,
    pub attachments: Option<String>,
    /// The share points at a folder that is gone (item 13).
    pub missing: bool,
}

/// Information about an application update.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct UpdateInfo {
    /// The currently running version (e.g. "0.2.0-beta.2").
    pub current_version: String,
    /// The latest version available on GitHub (e.g. "0.2.0-beta.3").
    pub latest_version: String,
    /// Whether an update is available (latest_version > current_version).
    pub has_update: bool,
    /// Release title (e.g. "Verso Beta 0.2.0-beta.3").
    pub release_name: String,
    /// Changelog / release notes in Markdown.
    pub release_notes: String,
    /// Direct asset download URL (or browser download url).
    pub download_url: Option<String>,
    /// GitHub API asset URL (used for authenticated downloads if repo is private).
    pub asset_url: Option<String>,
    /// Name of the download file (e.g. "Verso-Beta-0.2.0-beta.3-macos-arm64.zip").
    pub asset_name: Option<String>,
    /// Size of the asset in bytes.
    pub asset_size: Option<f64>,
    /// ISO 8601 publication timestamp.
    pub published_at: Option<String>,
}

/// Download progress payload emitted during update downloads.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct UpdateProgress {
    pub downloaded_bytes: f64,
    pub total_bytes: Option<f64>,
    pub percent: Option<f64>,
    /// "downloading" | "extracting" | "installing" | "done" | "error"
    pub status: String,
    pub message: Option<String>,
}

/// Progress payload emitted during vault indexing.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct IndexProgress {
    /// "scanning" | "indexing" | "done"
    pub phase: String,
    pub current: u32,
    pub total: u32,
    pub file: Option<String>,
}

/// Result of an in-app update installation.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct InstallResult {
    pub success: bool,
    pub message: String,
    pub app_path: Option<String>,
    pub requires_restart: bool,
}

/// One resolved link of the vault, for the graph.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct Edge {
    pub from: String,
    pub to: String,
}

/// A link of a note that no note answers to, for the graph's option of
/// showing them (spec Q14, decision B): the note it is written in and the
/// name it points at, as written (the smallest spelling in byte order when
/// several notes spell it differently, so every source shows one node).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct MissingLink {
    pub from: String,
    pub target: String,
}

/// A frontmatter value, typed as the YAML gave it, for a properties
/// panel that shows a list as pills and a boolean as a checkbox. A number
/// crosses as its text, so the panel shows what was written.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(tag = "kind", content = "value", rename_all = "lowercase")]
pub enum PropertyValue {
    Text(String),
    Number(String),
    Checkbox(bool),
    /// A list of plain strings; any other list is `Nested`.
    List(Vec<String>),
    /// A mapping, or a list with an item that is not a plain string,
    /// flattened to one line: shown, never edited by the panel — written
    /// back as text it would change type.
    Nested(String),
    /// `key:` with nothing after it (YAML null).
    Empty,
}

/// One frontmatter key and its value.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct Property {
    pub key: String,
    pub value: PropertyValue,
}

/// One search hit.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct Hit {
    pub path: String,
    pub snippet: String,
}

/// A link a note makes.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct Link {
    /// As written in the note.
    pub target: String,
    /// The note it resolves to, or none.
    pub resolved: Option<String>,
    pub embed: bool,
    pub heading: Option<String>,
    pub block: Option<String>,
    pub alias: Option<String>,
    pub line: u32,
    pub col: u32,
    /// Through a share, a link to a note reaches nothing the person sees
    /// (ADR 0081 item 11): a note outside what was shared with them and a
    /// note that does not exist answer alike, so that whether a note of
    /// that name exists outside never crosses. Shown like an unresolved
    /// link, as "not in what was shared with you", and never made into a
    /// note. A file's target (`p.png`) is left to `resolve_attachment`.
    /// Always false outside a share.
    #[serde(default)]
    pub outside: bool,
}

/// A link into a note, from another.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct Backlink {
    pub from: String,
    pub target: String,
    pub embed: bool,
    pub line: u32,
    pub col: u32,
}

/// A note's name written plainly in another note: one unlinked mention
/// (ADR 0089 item 1), the name or one of its aliases as a phrase on word
/// boundaries, case ignored and accents kept, in prose only.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct Mention {
    /// The note that mentions.
    pub path: String,
    /// 1-based line, and 1-based column in Unicode scalar values (spec
    /// §4.4), of the mention's first character.
    pub line: u32,
    pub col: u32,
    /// The mention as written.
    pub text: String,
    /// Up to 60 characters of its line before it and after it.
    pub before: String,
    pub after: String,
    /// The text is one of the note's aliases, not its name: the link
    /// keeps it as the link's text.
    pub alias: bool,
    /// In a table's cell: the link's `|` is written `\|`.
    pub table: bool,
    /// Inside a `> [!secret]` callout (ADR 0087): never in a reader's
    /// answer from a server.
    pub secret: bool,
}

/// A note's unlinked mentions, in path and position order; `more` when
/// there were more than the answer holds.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct Mentions {
    pub mentions: Vec<Mention>,
    pub more: bool,
}

/// Why a command could not answer, by what the UI can do about it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum ErrorKind {
    /// No folder is open yet.
    NoFolder,
    /// The path cannot name a note of the folder (absolute, `..`, hidden,
    /// ignored, empty); a folder key that is not one; a folder switch
    /// from a window that may not, or while a note window is open.
    Refused,
    /// No such file; no folder opened before has this key.
    NotFound,
    /// A placeholder: present, content not downloaded (ADR 0043).
    Unavailable,
    /// A server that could not be reached: no connection made — refused,
    /// no such name, a TLS handshake that failed — or no answer in time.
    /// `message` is the server's address, `host[:port]`, as the window
    /// names it to the person; when the name was resolved to addresses,
    /// each address tried follows on a line of its own (ADR 0097), so a
    /// bad DNS reads as one. Why it could not be reached goes to the
    /// app's log (the maintainer, 2026-10-14: a server down said nothing).
    Unreachable,
    /// The file's bytes are not UTF-8: no text to edit (spec Q25 is
    /// `[OPEN]`; this is the least that keeps the file safe).
    NotText,
    /// The file is not a board: not a `.canvas`, or not JSON (ADR 0057);
    /// the text view is where it gets fixed.
    NotCanvas,
    /// The file on disk is not the one that was read: nothing was
    /// written; read again and show both versions (invariant 11).
    Changed,
    /// Something already stands where a note would be created or moved.
    Exists,
    /// A new name differs only in case from an entry its folder already
    /// lists — `nota.md` beside `Nota.md`: a Mac or Windows keeps the two
    /// as one file, so nothing was made (spec Q8, decided 2026-10-12). An
    /// answer, a name to choose again — not a fault.
    CaseTwin,
    /// The folder's quota on its server would be passed: nothing was
    /// written; a write that shrinks the folder is always allowed (ADR
    /// 0077 item 5).
    Quota,
    /// A server's sensitive action wants a fresh proof that it is the
    /// person (ADR 0083 item 6): the window asks for the password and
    /// sends the action once more.
    ProveFirst,
    /// The core could not answer.
    Failed,
    /// A paired phone asked for a command that acts on the computer it is
    /// paired with, or that is the owner's (ADR 0096 item 12): no phone
    /// runs it, whatever its role.
    NotOnPhone,
    /// A phone that may only read asked for a command that changes
    /// something (ADR 0096 items 6 and 12): the person lets it edit from
    /// the computer.
    PhoneReads,
}

/// An error as the UI receives it. `message` is the core's text, in
/// English: which language it should speak is the UI's `[OPEN]` under
/// ADR 0035, recorded here rather than decided.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct ContractError {
    pub kind: ErrorKind,
    pub message: String,
}

impl std::fmt::Display for ContractError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl std::error::Error for ContractError {}

/// A base to evaluate (ADR 0053): a `.base` file, or the text of a `base`
/// block of a note; the view to show; the window's clock and language.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct BaseQuery {
    /// The `.base` file, relative to the folder, when the base is one.
    pub path: Option<String>,
    /// The base's text, when it is a block of a note: read instead of
    /// `path`.
    pub text: Option<String>,
    /// The file `this` stands for: the note a base is embedded in, or the
    /// `.base` file itself.
    pub this: Option<String>,
    /// The view, by name; the first when absent.
    pub view: Option<String>,
    /// Properties to evaluate besides the view's `order`: what the layout
    /// draws (a card's image, a calendar's date).
    pub extra: Vec<String>,
    /// The window's clock: milliseconds since the Unix epoch.
    pub now: f64,
    /// The window's zone: minutes east of UTC.
    pub offset: i32,
    /// The interface language (`pt-BR`, `en`).
    pub lang: String,
}

/// A base evaluated.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct BaseResult {
    /// Every view of the base, in order.
    pub views: Vec<BaseView>,
    /// The view evaluated, as an index into `views`; `None` when the base
    /// has none and a table of every file was evaluated.
    pub view: Option<u32>,
    pub columns: Vec<BaseColumn>,
    /// The rows; one group when the view is not grouped.
    pub groups: Vec<BaseGroup>,
    /// Files that passed the filters, before the view's `limit`.
    pub total: u32,
    pub problems: Vec<BaseProblem>,
    /// Every note property of the folder, once each: what the view's
    /// menus offer.
    pub properties: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct BaseView {
    pub name: String,
    /// `table`, `cards`, `list`, `kanban`, `calendar`, or one Verso does
    /// not draw.
    pub kind: String,
}

/// A column: the property id as the view writes it (`file.name`,
/// `status`, `formula.x`), and the name the base gives it, if any.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct BaseColumn {
    pub id: String,
    pub name: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct BaseGroup {
    /// The grouping property's value; `None` when the view is not grouped.
    pub key: Option<BaseCell>,
    pub rows: Vec<BaseRow>,
    /// One per column: the summary the view asks for, if any.
    pub summaries: Vec<Option<BaseCell>>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
pub struct BaseRow {
    pub path: String,
    /// A Markdown note: its properties may be changed from the view.
    pub note: bool,
    /// One per column.
    pub cells: Vec<BaseCell>,
}

/// A value as a view shows it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(tag = "kind", content = "value", rename_all = "lowercase")]
pub enum BaseCell {
    Empty,
    Text(String),
    Number(f64),
    Bool(bool),
    /// A wall-clock time in the window's zone, in milliseconds since
    /// 1970-01-01T00:00 of that clock (read it with UTC getters), and
    /// whether it has a time of day.
    Date {
        ms: f64,
        time: bool,
    },
    /// Milliseconds.
    Duration(f64),
    List(Vec<BaseCell>),
    Object(Vec<(String, BaseCell)>),
    /// A link as written, the text to show, and the file it resolves to.
    Link {
        target: String,
        display: Option<String>,
        path: Option<String>,
    },
    File(String),
    /// A path relative to the folder, or a URL.
    Image(String),
    Icon(String),
    Html(String),
    Error {
        kind: BaseErrorKind,
        name: String,
    },
}

/// Why a value could not be computed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum BaseErrorKind {
    Syntax,
    UnknownFunction,
    UnknownMethod,
    Arguments,
    Type,
    /// A regular expression where the method takes a text (`contains`,
    /// `startsWith`); `name` is the method (ADR 0094 item 1).
    Regex,
    /// Not a regular expression, or a flag that is no flag; `name` is the
    /// literal as written.
    RegexInvalid,
    /// What the engine does not have; `name` is `lookahead`,
    /// `lookbehind`, `backreference`, `flag y`, `flag d` or `flag v`
    /// (ADR 0094 items 2 and 4).
    RegexUnsupported,
    /// A pattern past 1,000 characters or its compiled size, or one too
    /// many in a query; `name` is the literal (ADR 0094 item 3).
    RegexTooLarge,
    Cycle,
    Budget,
    TooLarge,
}

/// Something about the base as a whole, shown once above the view;
/// `detail` is what it concerns, as written in the base.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct BaseProblem {
    pub kind: BaseProblemKind,
    pub detail: String,
    /// Why an evaluation failed, as its cells say it (ADR 0094 item 5).
    pub error: Option<BaseError>,
}

/// An evaluation's error: its kind and what it concerns.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct BaseError {
    pub kind: BaseErrorKind,
    pub name: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum BaseProblemKind {
    NotABase,
    TooLong,
    Shape,
    Expression,
    Evaluation,
    UnknownView,
    Budget,
}

/// What stands where the app installs its command line (ADR 0054):
/// `/usr/local/bin/verso`, on the PATH every shell has.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum CliState {
    /// A link to this app's own command line.
    Ours,
    /// Nothing.
    Missing,
    /// Something else: another link, a copy put there by hand.
    Elsewhere,
    /// This build carries no command line to link (a development build
    /// without it).
    Unbundled,
    /// Windows: the command line comes with the app, `verso.exe` beside
    /// it, and nothing is linked onto a PATH (ADR 0069, item 9).
    Bundled,
}

/// How an MCP client's configuration stands with this folder's entry.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum McpClientState {
    /// The client is not installed.
    NoClient,
    /// No entry for this folder.
    Absent,
    /// The entry is there, as the app would write it.
    Same,
    /// An entry by that name starts something else.
    Different,
}

/// The open folder's MCP server as clients name it, and whether Claude
/// Desktop knows it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct McpStatus {
    /// The name of the server in a client's configuration: `verso-<folder>`.
    pub server: String,
    pub claude: McpClientState,
    /// What a client starts for it, as "Add to Claude" would write it: the
    /// linked command line, or on Windows the bundled `verso.exe` by its
    /// path — shown to the person before it is written (ADR 0054).
    pub command: String,
}

/// What adding the folder's server to Claude Desktop did.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct McpAdded {
    pub server: String,
    /// An entry by that name was there and was replaced.
    pub replaced: bool,
    /// The name of the copy of the configuration as it was, beside it.
    pub backup: Option<String>,
    pub warnings: Vec<String>,
}
