import { openDB, type IDBPDatabase } from 'idb'

const DB_NAME = 'nimeplay'
const DB_VERSION = 2

let dbPromise: Promise<IDBPDatabase> | null = null

export function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        for (const store of ['progress', 'prefs']) {
          if (!db.objectStoreNames.contains(store)) db.createObjectStore(store)
        }
        if (oldVersion < 2) {
          // Drop API-response caches: IndexedDB only stores resumable progress now.
          for (const store of ['jikan', 'animeDetail', 'jikanData', 'skipTimes']) {
            if (db.objectStoreNames.contains(store)) db.deleteObjectStore(store)
          }
        }
      },
    })
  }
  return dbPromise
}
