import initSqlJs, { type Database, type QueryExecResult } from 'sql.js';
// sql.js WASM 바이너리 — Vite 가 로컬 자산으로 번들/서빙한다(외부 네트워크 없음).
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import type { AppState, Destination, EmergencyContact, SavedPlace, SavedPlaceKey } from './appStore';

/**
 * 프론트엔드 내장 DB(SQLite, sql.js).
 *
 * 사용자 로컬 데이터(현재 목적지·최근 목적지·자주 가는 장소·긴급 연락처)를 SQLite 테이블로 보관하고,
 * DB 파일(바이트)을 브라우저 IndexedDB 에 영속한다. 이 앱은 로그인/사용자 식별이 없으므로 데이터는 단말에만 둔다.
 *
 * 안심앱의 '저장 실패 정직 고지'(동기 보장, persist.ts)는 appStore 의 localStorage 동기 미러가 계속 담당한다.
 * 이 모듈은 같은 데이터를 구조화된 내장 DB 로 함께 보관/복원하는 역할이며, WASM 초기화가 필요해 init 은 비동기다.
 * IndexedDB 가 없는 환경(테스트 jsdom 등)에서는 [isSupported]=false 로 호출부가 건너뛴다.
 */

const IDB_NAME = 'bueongi-db';
const IDB_STORE = 'sqlite';
const IDB_KEY = 'app.db';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS saved_place (key TEXT PRIMARY KEY, name TEXT, address TEXT, lat REAL, lng REAL);
  CREATE TABLE IF NOT EXISTS recent_destination (seq INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, address TEXT, lat REAL, lng REAL);
  CREATE TABLE IF NOT EXISTS contact (id INTEGER PRIMARY KEY, name TEXT, phone TEXT);
  CREATE TABLE IF NOT EXISTS destination (id INTEGER PRIMARY KEY CHECK (id = 1), name TEXT, address TEXT, lat REAL, lng REAL);
`;

const SAVED_PLACE_KEYS: SavedPlaceKey[] = ['home', 'school', 'work'];

/** 내장 DB(SQLite+IndexedDB) 사용 가능 환경인지. 브라우저에서만 true. */
export function isSupported(): boolean {
  return typeof indexedDB !== 'undefined';
}

// ── IndexedDB: SQLite 파일 바이트 1건을 보관하는 최소 래퍼 ──
function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(): Promise<Uint8Array | null> {
  const idb = await openIdb();
  try {
    return await new Promise<Uint8Array | null>((resolve, reject) => {
      const req = idb.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(IDB_KEY);
      req.onsuccess = () => resolve((req.result as Uint8Array | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  } finally {
    idb.close();
  }
}

async function idbPut(bytes: Uint8Array): Promise<void> {
  const idb = await openIdb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = idb.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(bytes, IDB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    idb.close();
  }
}

// ── SQLite(sql.js): 1회 초기화 후 재사용 ──
let dbPromise: Promise<Database> | null = null;

function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const SQL = await initSqlJs({ locateFile: () => wasmUrl });
      const bytes = await idbGet();
      const db = bytes ? new SQL.Database(bytes) : new SQL.Database();
      db.run(SCHEMA);
      return db;
    })();
  }
  return dbPromise;
}

function rows(result: QueryExecResult[]): Record<string, unknown>[] {
  if (!result.length) return [];
  const { columns, values } = result[0];
  return values.map((value) => Object.fromEntries(columns.map((col, i) => [col, value[i]])));
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}
function emptyPlace(): SavedPlace {
  return { name: null, address: null, lat: null, lng: null };
}

/**
 * 내장 DB 에서 앱 상태를 복원한다. 저장된 의미 있는 데이터가 없으면 null(호출부가 초기/로컬 상태를 유지).
 */
export async function loadStateFromDb(): Promise<AppState | null> {
  const db = await getDb();

  const savedPlaces: AppState['savedPlaces'] = { home: emptyPlace(), school: emptyPlace(), work: emptyPlace() };
  for (const r of rows(db.exec('SELECT key, name, address, lat, lng FROM saved_place'))) {
    const key = r.key as SavedPlaceKey;
    if (SAVED_PLACE_KEYS.includes(key)) {
      savedPlaces[key] = { name: str(r.name), address: str(r.address), lat: num(r.lat), lng: num(r.lng) };
    }
  }

  const recentDestinations: Destination[] = rows(
    db.exec('SELECT name, address, lat, lng FROM recent_destination ORDER BY seq ASC'),
  )
    .map((r) => ({ name: str(r.name) ?? '', address: str(r.address) ?? '', lat: num(r.lat) ?? NaN, lng: num(r.lng) ?? NaN }))
    .filter((d) => Number.isFinite(d.lat) && Number.isFinite(d.lng));

  const contacts: EmergencyContact[] = rows(db.exec('SELECT id, name, phone FROM contact ORDER BY id ASC')).map((r) => ({
    id: Number(r.id),
    name: str(r.name) ?? '',
    phone: str(r.phone) ?? '',
  }));

  const destRows = rows(db.exec('SELECT name, address, lat, lng FROM destination WHERE id = 1'));
  const destination: Destination | null =
    destRows.length && num(destRows[0].lat) != null && num(destRows[0].lng) != null
      ? { name: str(destRows[0].name) ?? '', address: str(destRows[0].address) ?? '', lat: destRows[0].lat as number, lng: destRows[0].lng as number }
      : null;

  const hasData =
    recentDestinations.length > 0 ||
    contacts.length > 0 ||
    destination != null ||
    SAVED_PLACE_KEYS.some((k) => savedPlaces[k].address != null);
  if (!hasData) return null;
  return { destination, recentDestinations, savedPlaces, contacts };
}

/**
 * 앱 상태 전체를 내장 DB 에 반영한다(테이블 교체 후 DB 파일을 IndexedDB 에 영속).
 * 데이터가 작으므로 매 변경마다 단순 전체 재기록 — 동시성/병합 복잡도를 피한다.
 */
export async function saveStateToDb(state: AppState): Promise<void> {
  const db = await getDb();
  db.run('BEGIN TRANSACTION');
  try {
    db.run('DELETE FROM saved_place');
    db.run('DELETE FROM recent_destination');
    db.run('DELETE FROM contact');
    db.run('DELETE FROM destination');

    for (const key of SAVED_PLACE_KEYS) {
      const p = state.savedPlaces[key];
      db.run('INSERT INTO saved_place (key, name, address, lat, lng) VALUES (?, ?, ?, ?, ?)', [key, p.name, p.address, p.lat, p.lng]);
    }
    for (const d of state.recentDestinations) {
      db.run('INSERT INTO recent_destination (name, address, lat, lng) VALUES (?, ?, ?, ?)', [d.name, d.address, d.lat, d.lng]);
    }
    for (const c of state.contacts) {
      db.run('INSERT INTO contact (id, name, phone) VALUES (?, ?, ?)', [c.id, c.name, c.phone]);
    }
    if (state.destination) {
      const d = state.destination;
      db.run('INSERT INTO destination (id, name, address, lat, lng) VALUES (1, ?, ?, ?, ?)', [d.name, d.address, d.lat, d.lng]);
    }
    db.run('COMMIT');
  } catch (e) {
    db.run('ROLLBACK');
    throw e;
  }
  await idbPut(db.export());
}
