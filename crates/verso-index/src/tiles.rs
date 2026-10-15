// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! The tiles of a map's picture (ADR 0090 item 4): a large picture of the
//! folder is cut once into a pyramid of small pictures, kept here — outside
//! the folder (ADR 0011), in a file of their own beside the index, on a
//! server in its data directory — and the window draws the ones in view at
//! the zoom shown. Nothing is ever written beside the picture.
//!
//! A cache, as the index is: deleting the file loses nothing but the time
//! to cut again. A picture is cut again when its stamp (length, time, hash
//! as the caller sees them) is not the one the tiles were cut from. The
//! store keeps at most [`MAPS_KEPT`] pictures, the least recently asked for
//! going first.

use std::path::Path;

use rusqlite::{Connection, OptionalExtension, params};

use crate::IndexError;

/// How many pictures' tiles are kept.
pub const MAPS_KEPT: i64 = 8;

const TABLES: &str = "
CREATE TABLE IF NOT EXISTS maps (
    path    TEXT PRIMARY KEY,
    stamp   TEXT NOT NULL,   -- what the tiles were cut from
    width   INTEGER NOT NULL,
    height  INTEGER NOT NULL,
    tile    INTEGER NOT NULL,
    levels  INTEGER NOT NULL,
    state   INTEGER NOT NULL, -- 0 cutting, 1 ready, 2 failed
    message TEXT NOT NULL DEFAULT '',
    used    INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS tiles (
    path  TEXT NOT NULL,
    level INTEGER NOT NULL,
    x     INTEGER NOT NULL,
    y     INTEGER NOT NULL,
    png   BLOB NOT NULL,
    PRIMARY KEY (path, level, x, y)
) WITHOUT ROWID;
";

/// Where a picture's tiles stand.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum State {
    /// Being cut.
    Cutting,
    /// Ready to be drawn.
    Ready,
    /// The picture could not be cut (`message` says why).
    Failed,
}

/// What the store knows of a picture's tiles.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MapRow {
    pub stamp: String,
    pub width: u32,
    pub height: u32,
    pub tile: u32,
    pub levels: u32,
    pub state: State,
    pub message: String,
}

/// The store of tiles.
#[derive(Debug)]
pub struct TileStore {
    conn: Connection,
}

fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| i64::try_from(d.as_secs()).unwrap_or(i64::MAX))
}

impl TileStore {
    /// Open (and make) the store at `path`, restricted to its owner.
    pub fn open(path: &Path) -> Result<Self, IndexError> {
        if let Some(dir) = path.parent().filter(|d| !d.as_os_str().is_empty()) {
            std::fs::create_dir_all(dir)?;
            crate::restrict(dir, 0o700)?;
        }
        let conn = Connection::open(path)?;
        crate::restrict(path, 0o600)?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "synchronous", "OFF")?;
        conn.busy_timeout(crate::BUSY_TIMEOUT)?;
        conn.execute_batch(TABLES)?;
        Ok(Self { conn })
    }

    /// A store in memory, for tests.
    pub fn memory() -> Result<Self, IndexError> {
        let conn = Connection::open_in_memory()?;
        conn.execute_batch(TABLES)?;
        Ok(Self { conn })
    }

    /// What is known of the tiles of `path`, and the time it was asked for
    /// noted.
    pub fn map(&self, path: &str) -> Result<Option<MapRow>, IndexError> {
        let row = self
            .conn
            .query_row(
                "SELECT stamp, width, height, tile, levels, state, message FROM maps WHERE path = ?1",
                params![path],
                |r| {
                    let state: i64 = r.get(5)?;
                    Ok(MapRow {
                        stamp: r.get(0)?,
                        width: r.get(1)?,
                        height: r.get(2)?,
                        tile: r.get(3)?,
                        levels: r.get(4)?,
                        state: match state {
                            1 => State::Ready,
                            2 => State::Failed,
                            _ => State::Cutting,
                        },
                        message: r.get(6)?,
                    })
                },
            )
            .optional()?;
        if row.is_some() {
            self.conn.execute(
                "UPDATE maps SET used = ?2 WHERE path = ?1",
                params![path, now()],
            )?;
        }
        Ok(row)
    }

    /// Start cutting `path` from `stamp`: what was cut before is gone, the
    /// pictures past [`MAPS_KEPT`] too.
    pub fn begin(
        &mut self,
        path: &str,
        stamp: &str,
        (width, height, tile, levels): (u32, u32, u32, u32),
    ) -> Result<(), IndexError> {
        let tx = self.conn.transaction()?;
        tx.execute("DELETE FROM tiles WHERE path = ?1", params![path])?;
        tx.execute("DELETE FROM maps WHERE path = ?1", params![path])?;
        tx.execute(
            "INSERT INTO maps (path, stamp, width, height, tile, levels, state, used)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, ?7)",
            params![path, stamp, width, height, tile, levels, now()],
        )?;
        let old: Vec<String> = {
            let mut st =
                tx.prepare("SELECT path FROM maps ORDER BY used DESC, path LIMIT -1 OFFSET ?1")?;
            st.query_map(params![MAPS_KEPT], |r| r.get(0))?
                .collect::<Result<_, _>>()?
        };
        for gone in old {
            tx.execute("DELETE FROM tiles WHERE path = ?1", params![gone])?;
            tx.execute("DELETE FROM maps WHERE path = ?1", params![gone])?;
        }
        tx.commit()?;
        Ok(())
    }

    /// Keep the tiles `(level, x, y, png)` of `path`, in one transaction.
    pub fn put(
        &mut self,
        path: &str,
        tiles: &[(u32, u32, u32, Vec<u8>)],
    ) -> Result<(), IndexError> {
        let tx = self.conn.transaction()?;
        {
            let mut ins = tx.prepare(
                "INSERT OR REPLACE INTO tiles (path, level, x, y, png) VALUES (?1, ?2, ?3, ?4, ?5)",
            )?;
            for (level, x, y, png) in tiles {
                ins.execute(params![path, level, x, y, png])?;
            }
        }
        tx.commit()?;
        Ok(())
    }

    /// The picture is cut (`Ok`) or could not be (`Err`, the reason).
    pub fn finish(&mut self, path: &str, outcome: Result<(), &str>) -> Result<(), IndexError> {
        let (state, message) = match outcome {
            Ok(()) => (1, ""),
            Err(why) => (2, why),
        };
        self.conn.execute(
            "UPDATE maps SET state = ?2, message = ?3 WHERE path = ?1",
            params![path, state, message],
        )?;
        Ok(())
    }

    /// One tile of a picture cut from `stamp`; `None` when there is none.
    pub fn tile(
        &self,
        path: &str,
        stamp: &str,
        (level, x, y): (u32, u32, u32),
    ) -> Result<Option<Vec<u8>>, IndexError> {
        Ok(self
            .conn
            .query_row(
                "SELECT t.png FROM tiles t JOIN maps m ON m.path = t.path
                 WHERE t.path = ?1 AND m.stamp = ?2 AND t.level = ?3 AND t.x = ?4 AND t.y = ?5",
                params![path, stamp, level, x, y],
                |r| r.get(0),
            )
            .optional()?)
    }

    /// How many tiles `path` has so far.
    pub fn count(&self, path: &str) -> Result<u64, IndexError> {
        let n: i64 = self.conn.query_row(
            "SELECT count(*) FROM tiles WHERE path = ?1",
            params![path],
            |r| r.get(0),
        )?;
        Ok(u64::try_from(n).unwrap_or(0))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_picture_is_cut_once_and_asked_by_its_stamp() {
        let mut s = TileStore::memory().unwrap();
        assert!(s.map("a.png").unwrap().is_none());
        s.begin("a.png", "v1", (1000, 500, 256, 3)).unwrap();
        s.put("a.png", &[(0, 0, 0, vec![1, 2]), (1, 0, 0, vec![3])])
            .unwrap();
        assert_eq!(s.map("a.png").unwrap().unwrap().state, State::Cutting);
        s.finish("a.png", Ok(())).unwrap();
        assert_eq!(s.map("a.png").unwrap().unwrap().state, State::Ready);
        assert_eq!(s.tile("a.png", "v1", (0, 0, 0)).unwrap(), Some(vec![1, 2]));
        // Cut from another picture, the tile is not this one's.
        assert_eq!(s.tile("a.png", "v2", (0, 0, 0)).unwrap(), None);
        s.begin("a.png", "v2", (10, 10, 256, 1)).unwrap();
        assert_eq!(s.count("a.png").unwrap(), 0);
        s.finish("a.png", Err("too large")).unwrap();
        let row = s.map("a.png").unwrap().unwrap();
        assert_eq!(
            (row.state, row.message.as_str()),
            (State::Failed, "too large")
        );
    }

    #[test]
    fn only_the_latest_pictures_are_kept() {
        let mut s = TileStore::memory().unwrap();
        for i in 0..(MAPS_KEPT + 3) {
            let path = format!("{i}.png");
            s.begin(&path, "v", (10, 10, 256, 1)).unwrap();
            s.put(&path, &[(0, 0, 0, vec![0])]).unwrap();
            // Distinct times of use even within one second.
            s.conn
                .execute(
                    "UPDATE maps SET used = ?2 WHERE path = ?1",
                    params![path, i],
                )
                .unwrap();
        }
        let kept: i64 = s
            .conn
            .query_row("SELECT count(*) FROM maps", [], |r| r.get(0))
            .unwrap();
        assert_eq!(kept, MAPS_KEPT);
        assert!(s.map("0.png").unwrap().is_none());
        assert_eq!(s.count("0.png").unwrap(), 0);
    }
}
