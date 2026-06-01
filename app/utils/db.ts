import { openDB, type IDBPDatabase } from 'idb'

const DB_NAME = 'nimeplay'

let dbPromise: Promise<IDBPDatabase> | null = null

export function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(db) {
        for (const store of ['progress', 'jikan', 'prefs', 'animeDetail', 'jikanData', 'skipTimes']) {
          if (!db.objectStoreNames.contains(store)) db.createObjectStore(store)
        }
      },
    })
  }
  return dbPromise
}
