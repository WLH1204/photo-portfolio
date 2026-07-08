// IndexedDB 封装 - 用于存储大量照片数据
// localStorage 限制 5-10MB，IndexedDB 可用数百 MB

const DB_NAME = 'photo_portfolio_db'
const DB_VERSION = 1

let db = null

// 初始化数据库
function openDB() {
  return new Promise((resolve, reject) => {
    if (db) return resolve(db)
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      db = request.result
      resolve(db)
    }
    request.onupgradeneeded = (e) => {
      const database = e.target.result
      // 创建 object store（key-value）
      if (!database.objectStoreNames.contains('data')) {
        database.createObjectStore('data')
      }
    }
  })
}

// 获取数据
export async function dbGet(key) {
  try {
    const database = await openDB()
    return new Promise((resolve, reject) => {
      const tx = database.transaction('data', 'readonly')
      const store = tx.objectStore('data')
      const req = store.get(key)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  } catch {
    return undefined
  }
}

// 保存数据
export async function dbSet(key, value) {
  try {
    const database = await openDB()
    return new Promise((resolve, reject) => {
      const tx = database.transaction('data', 'readwrite')
      const store = tx.objectStore('data')
      const req = store.put(value, key)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  } catch (e) {
    console.warn('IndexedDB 写入失败:', e)
  }
}

// 删除数据
export async function dbDelete(key) {
  try {
    const database = await openDB()
    return new Promise((resolve, reject) => {
      const tx = database.transaction('data', 'readwrite')
      const store = tx.objectStore('data')
      const req = store.delete(key)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  } catch {}
}
