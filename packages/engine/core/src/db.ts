/**
 * SQLite database (chat feed + preferences + device tokens).
 *
 * Uses Bun's built-in `bun:sqlite`. The schema is a byte-for-byte port of
 * `engine/houston-db/src/{migrations,db}.rs` (the Rust side uses libSQL, which
 * is on-disk SQLite-compatible) so the TS engine reads and writes the SAME
 * `<home>/houston.db` a user's Rust engine created — chat history survives
 * switching engines. The FTS5 table + triggers are recreated so a TS-fresh DB
 * matches a Rust-fresh one.
 */

import { Database as BunSqlite } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface ChatFeedRow {
  feed_type: string;
  data_json: string;
  source: string;
  timestamp: string;
}

export class Db {
  private readonly sqlite: BunSqlite;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.sqlite = new BunSqlite(dbPath);
    this.sqlite.exec("PRAGMA journal_mode = WAL;");
    this.migrate();
  }

  private migrate(): void {
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS chat_feed (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        claude_session_id TEXT NOT NULL,
        feed_type TEXT NOT NULL,
        data_json TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'desktop',
        timestamp TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_chat_feed_session ON chat_feed(claude_session_id);
    `);
    this.sqlite.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS chat_feed_fts USING fts5(
        content,
        tokenize='unicode61 remove_diacritics 2'
      );
      CREATE TRIGGER IF NOT EXISTS chat_feed_fts_insert
      AFTER INSERT ON chat_feed BEGIN
        INSERT INTO chat_feed_fts(rowid, content) VALUES (new.id, new.data_json);
      END;
      CREATE TRIGGER IF NOT EXISTS chat_feed_fts_delete
      AFTER DELETE ON chat_feed BEGIN
        INSERT INTO chat_feed_fts(chat_feed_fts, rowid, content) VALUES('delete', old.id, old.data_json);
      END;
    `);
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS engine_tokens (
        token_hash TEXT PRIMARY KEY,
        device_label TEXT NOT NULL,
        created_at TEXT NOT NULL,
        revoked_at TEXT,
        last_seen_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_engine_tokens_active ON engine_tokens(revoked_at);
    `);
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS preferences (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }

  // -- chat feed (keyed by provider/thread session id) --

  addChatFeedItem(sessionId: string, feedType: string, dataJson: string, source: string): void {
    this.sqlite
      .query(
        `INSERT INTO chat_feed (claude_session_id, feed_type, data_json, source, timestamp)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(sessionId, feedType, dataJson, source, new Date().toISOString());
  }

  listChatFeedBySession(sessionId: string): ChatFeedRow[] {
    return this.sqlite
      .query(
        `SELECT feed_type, data_json, source, timestamp FROM chat_feed
         WHERE claude_session_id = ? ORDER BY id ASC`,
      )
      .all(sessionId) as ChatFeedRow[];
  }

  clearChatFeedBySession(sessionId: string): void {
    this.sqlite.query("DELETE FROM chat_feed WHERE claude_session_id = ?").run(sessionId);
  }

  // -- preferences --

  getPreference(key: string): string | null {
    const row = this.sqlite.query("SELECT value FROM preferences WHERE key = ?").get(key) as
      | { value: string }
      | null;
    return row?.value ?? null;
  }

  setPreference(key: string, value: string): void {
    this.sqlite
      .query("INSERT OR REPLACE INTO preferences (key, value) VALUES (?, ?)")
      .run(key, value);
  }

  close(): void {
    this.sqlite.close();
  }
}
