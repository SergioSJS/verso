// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

// The Music tab of the right panel (ADR 0116 as amended 2026-10-31: "crie
// uma aba nova so para musica, ai vai poder ter playlists ou listas de
// pastas com as musicas"): what plays now — its name, the list it came
// from, the position, and for the game master previous, play/pause, next,
// stop, loop and the table's volume; everyone's own volume, mute and
// "Follow the table" — then a filter, the queue (the list the track came
// from), the folders that hold sound files (a list each, nothing to set
// up) and the notes that link sound files (playlists, a scene per heading).
// Only the game master plays; a player sees what plays and their own
// controls, and a track they do not see is named as one, with why.

import { commands } from "../../bindings";
import { rightShown, toggleRight } from "../../chrome";
import { h } from "../../dom";
import { allFiles, currentFolder, folderName } from "../../folder";
import { icon } from "../../icons";
import { layout } from "../../layout/spaces";
import { panel } from "../../main";
import { resolveFileByName } from "../../resolve";
import { askUnheard } from "./ask";
import { iconButton, labeled, range, relabel, said } from "./controls";
import { mine as sharing } from "./mine";
import { liveShare } from "./share";
import { ShareCard, shareButton } from "./shareCard";
import { ss } from "./shareWords";
import { asScene, filterLists, folderLists, listLabel, noteLists, type List } from "./library";
import { askUnheardWith, control, currentScene, cycleLoop, hearTable, loopMode, nameOf, neighbour, onSound, ownSound, playTrack, playerState, setOwn, sound, soundOn, step, takePendingSay } from "./run";
import { isAudio, trackName } from "./scene";
import { st } from "./strings";
import { clockText, expectedMs } from "./sync";

/** Bring the Music tab on screen (the status item's and the mini-player's way there). */
export function showMusic(): void {
  if (!soundOn()) return;
  if (!rightShown()) toggleRight();
  panel.current = "music";
  panel.refresh();
}

/** The playlists of the folder: the notes that link its sound files, read
 *  once per set of files (the backlinks of each sound file, then the note). */
let lists: { key: string; notes: List[] | null; busy: Promise<void> | null } = { key: "", notes: null, busy: null };
const MOST_FILES = 300;
const MOST_NOTES = 100;

async function readPlaylists(audio: string[]): Promise<List[]> {
  const notes = new Set<string>();
  for (const f of audio.slice(0, MOST_FILES)) {
    const r = await commands.backlinks(f).catch(() => null);
    if (r?.status === "ok") for (const b of r.data) notes.add(b.from);
    if (notes.size >= MOST_NOTES) break;
  }
  // The note open now counts, even before the index has its links.
  const open = layout().activeLeaf?.path;
  if (open?.toLowerCase().endsWith(".md")) notes.add(open);
  const out: List[] = [];
  for (const note of [...notes].sort((a, b) => a.localeCompare(b))) {
    const r = await commands.readNote(note).catch(() => null);
    if (r?.status !== "ok") continue;
    out.push(...noteLists(note, r.data.lines.join("\n"), (t) => resolveFileByName(t, note)));
  }
  return out;
}

class MusicView {
  readonly el = h("section", "music-view");
  // Now playing.
  private readonly now = h("div", "music-now");
  private readonly title = h("div", "music-title");
  private readonly from = h("div", "music-from");
  private readonly why = h("p", "music-why");
  private readonly empty = h("p", "music-empty");
  private readonly headShare = shareButton("music-share-head");
  private readonly shared = new ShareCard();
  private readonly timeRow = h("div", "music-time-row");
  private readonly bar = range("music-bar", st.position, 1000);
  private readonly time = h("span", "music-time");
  private readonly buttons = h("div", "music-buttons");
  private readonly prev = iconButton("music-prev", st.previous, "skipBack");
  private readonly toggle = iconButton("music-toggle", st.pause, "pause");
  private readonly next = iconButton("music-next", st.next, "skipForward");
  private readonly stop = iconButton("music-stop", st.stop, "stop");
  private readonly loop = iconButton("music-loop", st.loopOff, "repeat");
  private readonly pick = labeled("ghost music-pick", st.playFile, "music");
  private readonly volumes = h("div", "music-volumes");
  private readonly masterRow = h("label", "music-volume-row");
  private readonly master = range("music-master", st.masterVolume);
  private readonly mine = range("music-own", st.ownVolume);
  private readonly mute = iconButton("music-mute", st.mute, "volume");
  private readonly follow = h("input", "music-follow");
  private readonly notes = h("div", "music-notes");
  private readonly hear = labeled("music-hear", st.hear, "volume");
  private readonly live = h("div", "sr-only music-said table-sound-said");
  // The library.
  private readonly filter = h("input", "music-filter");
  private readonly hint = h("p", "music-hint", st.onlyMasterHint);
  private readonly queue = h("section", "music-section music-queue");
  private readonly folders = h("section", "music-section music-folders");
  private readonly playlists = h("section", "music-section music-playlists");
  private readonly none = h("p", "music-empty");
  private seeking = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private libraryKey = "";
  private open = new Map<string, boolean>();

  constructor() {
    this.el.setAttribute("aria-label", st.tab);
    this.now.setAttribute("role", "group");
    this.now.setAttribute("aria-label", st.nowPlaying);
    this.live.setAttribute("role", "status");
    this.live.setAttribute("aria-live", "polite");
    this.why.textContent = st.hiddenWhy;
    this.hear.title = st.hearDesc;
    this.pick.title = st.playFileDesc;
    this.follow.type = "checkbox";
    this.follow.id = "music-follow";
    const followLabel = h("label", "music-follow-label", st.follow);
    followLabel.htmlFor = this.follow.id;
    followLabel.title = st.followDesc;
    const followBox = h("span", "music-follow-box");
    followBox.append(this.follow, followLabel);
    this.masterRow.append(h("span", "music-label", st.masterVolume), this.master);
    const ownRow = h("div", "music-volume-row");
    ownRow.append(h("span", "music-label", st.ownVolume), this.mute, this.mine);
    this.volumes.append(this.masterRow, ownRow, followBox);
    this.timeRow.append(this.bar, this.time);
    this.buttons.append(this.prev, this.toggle, this.next, this.stop, this.loop);
    const head = h("h3", "panel-sub music-head", st.nowPlaying);
    const headRow = h("div", "music-head-row");
    headRow.append(head, this.headShare);
    this.now.append(headRow, this.empty, this.shared.el, this.title, this.from, this.why, this.timeRow, this.buttons, this.volumes, this.notes, this.live);
    this.filter.type = "search";
    this.filter.placeholder = st.filter;
    this.filter.setAttribute("aria-label", st.filter);
    this.el.append(this.now, this.pick, this.hint, this.filter, this.none, this.queue, this.folders, this.playlists);
    // The game master's controls.
    this.toggle.addEventListener("click", () => {
      const m = sound().music();
      if (m) void control(m.state === "playing" ? "pause" : "resume").then(said);
    });
    this.stop.addEventListener("click", () => void control("stop").then(said));
    this.prev.addEventListener("click", () => void step(-1, askUnheard).then(said));
    this.next.addEventListener("click", () => void step(1, askUnheard).then(said));
    this.loop.addEventListener("click", () => void cycleLoop().then(said));
    this.pick.addEventListener("click", () => {
      void import("./ask").then(({ pickTrack }) => pickTrack(allFiles.filter(isAudio))).then((p) => (p ? playTrack(p, null, askUnheard).then(said) : undefined));
    });
    this.bar.addEventListener("input", () => {
      this.seeking = true;
      const m = sound().music();
      if (m?.durationMs) this.time.textContent = st.positionText(clockText((Number(this.bar.value) / 1000) * m.durationMs), clockText(m.durationMs));
    });
    this.bar.addEventListener("change", () => {
      this.seeking = false;
      const m = sound().music();
      if (m?.durationMs) void control("seek", (Number(this.bar.value) / 1000) * m.durationMs).then(said);
    });
    this.master.addEventListener("change", () => void control("master", Number(this.master.value)).then(said));
    this.master.addEventListener("input", () => this.master.setAttribute("aria-valuetext", st.volumeText(Number(this.master.value))));
    // The person's own.
    this.mine.addEventListener("input", () => setOwn({ volume: Number(this.mine.value), muted: false }));
    this.mute.addEventListener("click", () => setOwn({ muted: !ownSound().muted }));
    this.follow.addEventListener("change", () => setOwn({ follow: this.follow.checked }));
    this.hear.addEventListener("click", () => hearTable());
    this.filter.addEventListener("input", () => this.paintLibrary(true));
    // Space toggles while the card has the focus and no field takes the key (item 26).
    this.now.tabIndex = -1;
    this.now.addEventListener("keydown", (e) => {
      const tag = (e.target as HTMLElement).tagName;
      if (e.key !== " " || tag === "INPUT" || tag === "BUTTON" || !sound().controls()) return;
      e.preventDefault();
      this.toggle.click();
    });
    askUnheardWith(askUnheard);
    onSound(() => {
      if (this.el.isConnected) this.render();
    });
    // Another folder, or its files changed: the library is read again when shown.
    for (const ev of ["verso:folder-shown", "verso:files-listed"]) addEventListener(ev, () => this.el.isConnected && this.paintLibrary(false));
  }

  mount(body: HTMLElement): void {
    if (this.el.parentElement !== body) body.replaceChildren(this.el);
    this.render();
    const late = takePendingSay();
    if (late) this.live.textContent = late;
    this.paintLibrary(false);
  }

  render(): void {
    const src = sound();
    const m = src.music();
    const master = src.controls();
    const playing = !!m && m.state !== "stopped";
    const { blocked, failed, cannotHere, shareWaiting, shareDeaf } = playerState();
    // A live share is something playing too (item 16): the card says whose, the person's own controls stay.
    const live = liveShare();
    const hearsShare = !!live && !sharing();
    const idle = !playing && !live;
    this.empty.hidden = !idle;
    this.empty.textContent = master ? st.nothingMaster : st.nothing;
    for (const el of [this.title, this.from, this.timeRow]) el.hidden = !playing;
    this.volumes.hidden = !playing && !hearsShare;
    this.buttons.hidden = !playing || !master;
    this.masterRow.hidden = !master || !playing;
    this.pick.hidden = !master;
    this.hint.hidden = master;
    this.why.hidden = !playing || !m?.unseen;
    if (playing && m) {
      this.title.textContent = nameOf(m);
      this.title.classList.toggle("unseen", m.unseen);
      const scene = currentScene();
      this.from.textContent = scene ? st.from(scene.name) : m.path ? st.from(m.path.includes("/") ? m.path.slice(0, m.path.lastIndexOf("/")) : folderName || st.folderRoot) : "";
      this.from.hidden = !this.from.textContent;
      const isPlaying = m.state === "playing";
      relabel(this.toggle, isPlaying ? st.pause : st.resume, isPlaying ? "pause" : "play");
      this.prev.disabled = neighbour(-1) === null;
      this.next.disabled = neighbour(1) === null;
      const mode = loopMode();
      relabel(this.loop, mode === "track" ? st.loopTrack : mode === "scene" ? st.loopScene : st.loopOff, mode === "track" ? "repeatOne" : "repeat");
      this.loop.setAttribute("aria-pressed", mode === "off" ? "false" : "true");
      this.master.value = String(m.master);
      this.master.setAttribute("aria-valuetext", st.volumeText(m.master));
      this.bar.disabled = !master || !m.durationMs;
    }
    if ((playing && m) || hearsShare) {
      const mine = ownSound();
      this.mine.value = String(mine.volume);
      this.mine.setAttribute("aria-valuetext", st.volumeText(mine.volume));
      relabel(this.mute, mine.muted ? st.unmute : st.mute, mine.muted ? "volumeOff" : "volume");
      this.mute.setAttribute("aria-pressed", mine.muted ? "true" : "false");
      this.follow.checked = mine.follow;
    }
    const lines: Node[] = [];
    // A live share waiting for a gesture asks for the same one (ADR 0116 item 25).
    if ((playing && blocked && m?.path) || shareWaiting) lines.push(this.hear);
    if (shareDeaf) lines.push(h("p", "music-note", ss.deaf));
    if (playing && cannotHere) lines.push(h("p", "music-note", st.cannotHere));
    else if (playing && failed) lines.push(h("p", "music-note", st.missing));
    if (playing && master && m && m.unheard.length > 0) lines.push(h("p", "music-note", st.notHearing(m.unheard.join(", "))));
    if (playing && master && m && m.cannot.length > 0) lines.push(h("p", "music-note", st.cannot(m.cannot.join(", "))));
    if (!src.shared && master) lines.push(h("p", "music-note quiet", st.alone));
    // The same nodes stay put: a re-render does not take the button out from under a click.
    const same = lines.length === this.notes.childNodes.length && lines.every((n, i) => n === this.notes.childNodes[i] || (n instanceof HTMLElement && (this.notes.childNodes[i] as HTMLElement | undefined)?.outerHTML === n.outerHTML));
    if (!same) this.notes.replaceChildren(...lines);
    this.notes.hidden = lines.length === 0;
    this.tick(playing && m?.state === "playing");
    this.paintTime();
    this.paintQueue();
    this.markPlaying();
  }

  private tick(on: boolean): void {
    if (on && !this.timer) this.timer = setInterval(() => this.paintTime(), 500);
    else if (!on && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private paintTime(): void {
    const m = sound().music();
    if (!m || this.seeking || !this.el.isConnected) return;
    const at = expectedMs(m, sound().serverNow());
    this.time.textContent = st.positionText(clockText(at), m.durationMs ? clockText(m.durationMs) : "");
    if (m.durationMs) {
      this.bar.value = String(Math.round((at / m.durationMs) * 1000));
      this.bar.setAttribute("aria-valuetext", st.positionText(clockText(at), clockText(m.durationMs)));
    } else {
      // The length not known yet: the bar at its start, not a range's middle.
      this.bar.value = "0";
      this.bar.setAttribute("aria-valuetext", clockText(at));
    }
  }

  /** A track's row: for the game master a button that plays it from `list`. */
  private trackRow(path: string, list: List | null): HTMLLIElement {
    const li = h("li", "music-track");
    li.dataset["path"] = path;
    const label = trackName(path);
    if (sound().controls()) {
      const b = h("button", "row music-track-play");
      b.type = "button";
      b.append(icon("play", ""), h("span", "row-name", label));
      b.setAttribute("aria-label", st.play(label));
      b.title = path;
      b.addEventListener("click", () => void playTrack(path, list ? asScene(list, folderName || st.folderRoot) : null, askUnheard).then(said));
      li.append(b);
    } else {
      const span = h("span", "row music-track-name");
      span.append(icon("music", ""), h("span", "row-name", label));
      span.title = path;
      li.append(span);
    }
    return li;
  }

  /** The track that plays now, marked wherever it is listed. */
  private markPlaying(): void {
    const m = sound().music();
    for (const li of this.el.querySelectorAll<HTMLElement>("li.music-track")) {
      const on = !!m?.path && m.state !== "stopped" && li.dataset["path"] === m.path;
      li.classList.toggle("playing", on);
      if (on) li.setAttribute("aria-current", "true");
      else li.removeAttribute("aria-current");
    }
  }

  private paintQueue(): void {
    const scene = currentScene();
    const m = sound().music();
    if (!scene || !m?.path || m.state === "stopped") {
      this.queue.hidden = true;
      return;
    }
    const key = `${scene.name}\u0000${scene.tracks.join("\u0000")}`;
    this.queue.hidden = false;
    if (this.queue.dataset["key"] === key) return;
    this.queue.dataset["key"] = key;
    const ul = h("ul", "panel-list music-list");
    ul.setAttribute("aria-label", st.queue);
    const list: List = { kind: "folder", source: scene.name, scene: "", tracks: scene.tracks };
    for (const t of scene.tracks) ul.append(this.trackRow(t, list));
    this.queue.replaceChildren(h("h3", "panel-sub", `${st.queue} · ${scene.name}`), ul);
  }

  /** A section of lists (folders or playlists), each a disclosure that remembers being open. */
  private section(el: HTMLElement, title: string, all: List[], query: string): void {
    const root = folderName || st.folderRoot;
    const shown = filterLists(all, query, root);
    el.hidden = shown.length === 0;
    const head = h("h3", "panel-sub", title);
    const body: Node[] = [head];
    for (const l of shown) {
      const id = `${l.kind}:${l.source}:${l.scene}`;
      const d = h("details", "music-list-box");
      // Open while the lists are few (or a filter is typed); what the person opened or closed stays so.
      d.open = query !== "" || (this.open.get(id) ?? shown.length <= 4);
      d.addEventListener("toggle", () => this.open.set(id, d.open));
      const sum = h("summary", "music-list-head");
      sum.append(icon(l.kind === "folder" ? "folder" : "note", ""), h("span", "music-list-name", listLabel(l, root)), h("span", "path", st.tracks(l.tracks.length)));
      d.append(sum);
      const ul = h("ul", "panel-list music-list");
      for (const t of l.tracks) ul.append(this.trackRow(t, l));
      d.append(ul);
      body.push(d);
    }
    el.replaceChildren(...body);
  }

  /** The library: drawn again when the files, the filter or the person's seat change. */
  paintLibrary(force: boolean): void {
    const audio = allFiles.filter(isAudio);
    const query = this.filter.value.trim();
    const key = `${currentFolder}\u0000${sound().controls()}\u0000${audio.join("\u0000")}`;
    if (!force && key === this.libraryKey) return;
    this.libraryKey = key;
    this.none.hidden = audio.length > 0;
    this.none.textContent = st.emptyFolder;
    this.filter.hidden = audio.length === 0;
    this.section(this.folders, st.folders, folderLists(audio), query);
    const filesKey = `${currentFolder}\u0000${audio.join("\u0000")}`;
    if (lists.key !== filesKey) lists = { key: filesKey, notes: null, busy: null };
    if (lists.notes) this.section(this.playlists, st.playlists, lists.notes, query);
    else if (audio.length > 0) {
      this.playlists.hidden = false;
      this.playlists.replaceChildren(h("h3", "panel-sub", st.playlists), h("p", "music-note", st.searchingLists));
      lists.busy ??= readPlaylists(audio).then((found) => {
        if (lists.key !== filesKey) return;
        lists.notes = found;
        this.section(this.playlists, st.playlists, found, this.filter.value.trim());
        this.markPlaying();
      });
    } else this.playlists.hidden = true;
    const none = query !== "" && this.folders.hidden && this.playlists.hidden;
    if (none) {
      this.none.hidden = false;
      this.none.textContent = st.filterNone(query);
    }
    this.markPlaying();
  }
}

let view: MusicView | null = null;

/** The Music tab, drawn into the panel's body. */
export function paintMusic(body: HTMLElement): void {
  view ??= new MusicView();
  view.mount(body);
}
