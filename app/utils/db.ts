import { openDB, type IDBPDatabase } from 'idb'

const DB_NAME = 'nimeplay'
const DB_VERSION = 3

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
        if (oldVersion < 3) {
          // Progress keys moved from source slugs to malId:episodeNumber.
          // Old entries cannot be remapped reliably, so start fresh.
          if (db.objectStoreNames.contains('progress')) db.deleteObjectStore('progress')
          db.createObjectStore('progress')
        }
      },
    })
  }
  return dbPromise
}
