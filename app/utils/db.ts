import { openDB, type IDBPDatabase } from 'idb'

const DB_NAME = 'nimeplay'
const DB_VERSION = 3

let dbPromise: Promise<IDBPDatabase> | null = null

export function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore('progress')
          db.createObjectStore('jikan')
          db.createObjectStore('prefs')
        }
        if (oldVersion < 2) {
          db.createObjectStore('api')
        }
        if (oldVersion < 3) {
          db.createObjectStore('animeDetail')
          db.createObjectStore('jikanData')
          db.createObjectStore('skipTimes')
        }
      },
    })
  }
  return dbPromise
}
