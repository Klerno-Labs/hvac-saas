export type FieldWrite =
  | { type: 'job_status'; jobId: string; status: string }
  | {
      type: 'job_notes'
      jobId: string
      workSummary: string
      materialsUsed?: string
      completionNotes?: string
      technicianName?: string
    }

const DB_NAME = 'fieldclose-queue'
const STORE_NAME = 'writes'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME, { autoIncrement: true })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function enqueueWrite(write: FieldWrite): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).add(write)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function dequeueAll(): Promise<Array<{ key: IDBValidKey; write: FieldWrite }>> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const result: Array<{ key: IDBValidKey; write: FieldWrite }> = []
    const tx = db.transaction(STORE_NAME, 'readonly')
    const storeReq = tx.objectStore(STORE_NAME).openCursor()
    storeReq.onsuccess = () => {
      const cursor = storeReq.result
      if (cursor) {
        result.push({ key: cursor.key, write: cursor.value as FieldWrite })
        cursor.continue()
      }
    }
    tx.oncomplete = () => resolve(result)
    tx.onerror = () => reject(tx.error)
  })
}

export async function removeWrite(key: IDBValidKey): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}
