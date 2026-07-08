// 照片本地存储管理
// 大容量数据（照片、替换记录）使用 IndexedDB（支持数百 MB）
// 小容量数据（比例、裁剪、封面）使用 localStorage（快速同步读写）
// 离线时自动降级

import { dbGet, dbSet } from './db.js'

const STORAGE_KEY = 'photo_portfolio_uploads'
const REPLACEMENT_KEY = 'photo_portfolio_replacements'

// ===== 内存缓存（所有读操作走缓存，写操作同步到 IndexedDB） =====
let _photoCache = null
let _replacementCache = null
let _migrated = false

// 从 localStorage 迁移到 IndexedDB（仅首次）
async function _migrateIfNeeded() {
  if (_migrated) return
  _migrated = true

  try {
    // 迁移照片数据
    const oldPhotos = localStorage.getItem(STORAGE_KEY)
    if (oldPhotos) {
      const parsed = JSON.parse(oldPhotos)
      // 只有 IndexedDB 还没有数据时才迁移
      const existing = await dbGet(STORAGE_KEY)
      if (!existing || Object.keys(existing).length === 0) {
        await dbSet(STORAGE_KEY, parsed)
      }
      localStorage.removeItem(STORAGE_KEY)
    }

    // 迁移替换记录
    const oldReplacements = localStorage.getItem(REPLACEMENT_KEY)
    if (oldReplacements) {
      const parsed = JSON.parse(oldReplacements)
      const existing = await dbGet(REPLACEMENT_KEY)
      if (!existing || Object.keys(existing).length === 0) {
        await dbSet(REPLACEMENT_KEY, parsed)
      }
      localStorage.removeItem(REPLACEMENT_KEY)
    }
  } catch (e) {
    console.warn('IndexedDB 迁移失败，使用 localStorage 降级:', e)
  }
}

// 初始化缓存（从 IndexedDB 加载到内存）
async function _initCache() {
  if (_photoCache !== null) return

  await _migrateIfNeeded()

  try {
    _photoCache = (await dbGet(STORAGE_KEY)) || {}
  } catch {
    _photoCache = {}
  }

  try {
    _replacementCache = (await dbGet(REPLACEMENT_KEY)) || {}
  } catch {
    _replacementCache = {}
  }
}

// 异步保存照片到 IndexedDB（非阻塞）
function _persistPhotos() {
  dbSet(STORAGE_KEY, _photoCache).catch(e =>
    console.warn('IndexedDB 照片保存失败:', e)
  )
}

// 异步保存替换记录到 IndexedDB（非阻塞）
function _persistReplacements() {
  dbSet(REPLACEMENT_KEY, _replacementCache).catch(e =>
    console.warn('IndexedDB 替换记录保存失败:', e)
  )
}

// ===== 同步读操作（从内存缓存读取，立即返回） =====

// 从缓存读取所有已上传的照片
export function getUploadedPhotos() {
  return _photoCache || {}
}

// 获取指定城市的已上传照片
export function getCityUploadedPhotos(cityId) {
  const all = getUploadedPhotos()
  return all[cityId] || []
}

// ===== 写操作（更新缓存 + 异步写入 IndexedDB） =====

// 保存照片到指定城市
export function savePhotos(cityId, photos) {
  if (!_photoCache) _photoCache = {}
  if (!_photoCache[cityId]) {
    _photoCache[cityId] = []
  }
  _photoCache[cityId] = [..._photoCache[cityId], ...photos]

  try {
    _persistPhotos()
  } catch (e) {
    console.warn('缓存写入异常，尝试本地降级', e)
  }

  return _photoCache[cityId]
}

// 逐张追加照片（上传大量照片时使用，避免内存溢出）
export function appendSinglePhoto(cityId, photo) {
  if (!_photoCache) _photoCache = {}
  if (!_photoCache[cityId]) {
    _photoCache[cityId] = []
  }
  _photoCache[cityId].push(photo)

  // 每 10 张写一次 IndexedDB，减少 IO 开销
  if (_photoCache[cityId].length % 10 === 0) {
    _persistPhotos()
  }

  return _photoCache[cityId].length
}

// 批量写入完成时调用（确保最后一批数据持久化）
export function flushPhotos() {
  _persistPhotos()
}

// 删除指定城市中的某张照片
export function deletePhoto(cityId, photoId) {
  if (!_photoCache) _photoCache = {}
  if (_photoCache[cityId]) {
    _photoCache[cityId] = _photoCache[cityId].filter(p => String(p.id) !== String(photoId))
    _persistPhotos()
  }

  // 同步删除到云端
  trySync(async () => {
    const { deletePhoto: cloudDelete } = await import('../api/client.js')
    await cloudDelete(cityId, photoId)
  })

  return _photoCache[cityId] || []
}

// 批量删除照片（本地立即删除 + 云端一次性批量删除）
// onProgress: 可选回调 (deleted, total) => void
export async function batchDeletePhotos(cityId, photoIds, onProgress) {
  if (!_photoCache) _photoCache = {}
  const idSet = new Set(photoIds.map(String))
  if (_photoCache[cityId]) {
    _photoCache[cityId] = _photoCache[cityId].filter(p => !idSet.has(String(p.id)))
    _persistPhotos()
  }

  const ids = Array.from(photoIds)
  const total = ids.length
  if (onProgress) onProgress(0, total)

  // 云端同步删除：一次请求处理所有ID（避免并发竞争导致删除不全）
  const cloudResult = await trySync(async () => {
    const { batchDeletePhotos: cloudBatchDelete } = await import('../api/client.js')
    try {
      if (onProgress) onProgress(Math.round(total * 0.5), total)
      const res = await cloudBatchDelete(cityId, ids)
      const deleted = res.deleted || total
      if (onProgress) onProgress(deleted, total)
      const failed = total - deleted
      if (failed > 0) console.warn(`云端删除：${deleted}/${total} 成功，${failed} 个失败`)
      return { deleted, failed, total }
    } catch (e) {
      console.warn('云端批量删除失败，尝试逐个删除:', e.message)
      // 回退到逐个删除
      const { deletePhoto: cloudDelete } = await import('../api/client.js')
      let deleted = 0
      // 串行删除，避免并发竞争
      for (let i = 0; i < ids.length; i++) {
        try {
          await cloudDelete(cityId, ids[i])
          deleted++
        } catch (e2) {
          console.warn(`删除 ${ids[i]} 失败:`, e2.message)
        }
        if (onProgress) onProgress(deleted, total)
      }
      const failed = total - deleted
      if (failed > 0) console.warn(`回退逐个删除：${deleted}/${total} 成功，${failed} 个失败`)
      return { deleted, failed, total }
    }
  })

  return { photos: _photoCache[cityId] || [], cloud: cloudResult }
}

// 更新照片元数据（标题、描述、参数）
export function updatePhotoMeta(cityId, photoId, fields) {
  if (!_photoCache) _photoCache = {}
  if (_photoCache[cityId]) {
    const photo = _photoCache[cityId].find(p => String(p.id) === String(photoId))
    if (photo) {
      Object.assign(photo, fields)
      _persistPhotos()
      return true
    }
  }
  return false
}

// 获取所有城市的照片统计
export function getUploadStats() {
  const all = getUploadedPhotos()
  const stats = {}
  for (const [cityId, photos] of Object.entries(all)) {
    stats[cityId] = photos.length
  }
  return stats
}

// ===== 替换照片 =====

export function replacePhoto(cityId, photoId, newDataURL) {
  if (!_replacementCache) _replacementCache = {}
  try {
    if (!_replacementCache[cityId]) _replacementCache[cityId] = {}
    _replacementCache[cityId][String(photoId)] = newDataURL
    _persistReplacements()
    return true
  } catch (e) {
    console.warn('替换照片失败', e)
    return false
  }
}

export function getReplacements(cityId) {
  if (!_replacementCache) _replacementCache = {}
  return _replacementCache[cityId] || {}
}

// ===== 比例存储（localStorage，数据量小） =====
const RATIO_KEY = 'photo_portfolio_ratios'

export function setPhotoRatio(cityId, photoId, ratio) {
  try {
    const data = localStorage.getItem(RATIO_KEY)
    const all = data ? JSON.parse(data) : {}
    if (!all[cityId]) all[cityId] = {}
    all[cityId][String(photoId)] = ratio
    localStorage.setItem(RATIO_KEY, JSON.stringify(all))
    return true
  } catch {
    return false
  }
}

export function getPhotoRatios(cityId) {
  try {
    const data = localStorage.getItem(RATIO_KEY)
    const all = data ? JSON.parse(data) : {}
    return all[cityId] || {}
  } catch {
    return {}
  }
}

// ===== 裁剪位置存储（localStorage，数据量小） =====
const CROP_KEY = 'photo_portfolio_crops'

const CROP_PRESETS = {
  center:   { x: 50, y: 50, label: '居中' },
  top:      { x: 50, y: 0,  label: '上' },
  bottom:   { x: 50, y: 100, label: '下' },
  left:     { x: 0,  y: 50, label: '左' },
  right:    { x: 100, y: 50, label: '右' },
}

export function getCropPosition(cityId, photoId) {
  try {
    const data = localStorage.getItem(CROP_KEY)
    const all = data ? JSON.parse(data) : {}
    return all[cityId]?.[String(photoId)] || 'center'
  } catch {
    return 'center'
  }
}

export function getCropXY(cityId, photoId) {
  const crop = getCropPosition(cityId, photoId)
  if (typeof crop === 'object') return crop
  return CROP_PRESETS[crop] || CROP_PRESETS.center
}

export function setCropPosition(cityId, photoId, position) {
  try {
    const data = localStorage.getItem(CROP_KEY)
    const all = data ? JSON.parse(data) : {}
    if (!all[cityId]) all[cityId] = {}
    all[cityId][String(photoId)] = position
    localStorage.setItem(CROP_KEY, JSON.stringify(all))
    return true
  } catch {
    return false
  }
}

export function getCropStyle(cityId, photoId) {
  const pos = getCropXY(cityId, photoId)
  return { objectPosition: `${pos.x}% ${pos.y}%` }
}

export { CROP_PRESETS }

// ===== 封面图存储（localStorage，数据量小） =====
const COVER_KEY = 'photo_portfolio_covers'
const COVER_HISTORY_KEY = 'photo_portfolio_cover_history'
const MAX_HISTORY = 5

export function getCustomCover(cityId) {
  try {
    const data = localStorage.getItem(COVER_KEY)
    const all = data ? JSON.parse(data) : {}
    return all[cityId] || null
  } catch {
    return null
  }
}

export function setCustomCover(cityId, dataURL) {
  try {
    const coverData = localStorage.getItem(COVER_KEY)
    const covers = coverData ? JSON.parse(coverData) : {}
    const currentCover = covers[cityId]

    if (currentCover) {
      const historyData = localStorage.getItem(COVER_HISTORY_KEY)
      const history = historyData ? JSON.parse(historyData) : {}
      if (!history[cityId]) history[cityId] = []
      history[cityId].unshift(currentCover)
      if (history[cityId].length > MAX_HISTORY) {
        history[cityId] = history[cityId].slice(0, MAX_HISTORY)
      }
      localStorage.setItem(COVER_HISTORY_KEY, JSON.stringify(history))
    }

    covers[cityId] = dataURL
    localStorage.setItem(COVER_KEY, JSON.stringify(covers))
    return true
  } catch {
    return false
  }
}

export function undoCover(cityId) {
  try {
    const coverData = localStorage.getItem(COVER_KEY)
    const covers = coverData ? JSON.parse(coverData) : {}
    const historyData = localStorage.getItem(COVER_HISTORY_KEY)
    const history = historyData ? JSON.parse(historyData) : {}

    const currentCover = covers[cityId]
    const cityHistory = history[cityId] || []

    if (cityHistory.length === 0) return null

    const previousCover = cityHistory.shift()

    if (currentCover) {
      cityHistory.unshift(currentCover)
    }

    history[cityId] = cityHistory
    covers[cityId] = previousCover
    localStorage.setItem(COVER_HISTORY_KEY, JSON.stringify(history))
    localStorage.setItem(COVER_KEY, JSON.stringify(covers))

    return previousCover
  } catch {
    return null
  }
}

export function getCoverHistoryCount(cityId) {
  try {
    const data = localStorage.getItem(COVER_HISTORY_KEY)
    const all = data ? JSON.parse(data) : {}
    return (all[cityId] || []).length
  } catch {
    return 0
  }
}

// ===== 图片压缩 =====

export function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const MAX_SIZE = 800
        let { width, height } = img

        if (width > MAX_SIZE || height > MAX_SIZE) {
          if (width > height) {
            height = Math.round((height / width) * MAX_SIZE)
            width = MAX_SIZE
          } else {
            width = Math.round((width / height) * MAX_SIZE)
            height = MAX_SIZE
          }
        }

        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, width, height)
        const compressed = canvas.toDataURL('image/jpeg', 0.7)
        resolve(compressed)
      }
      img.onerror = reject
      img.src = e.target.result
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// ===== API 云端同步 =====

export async function trySync(fn) {
  try {
    const { isConfigured, isLoggedIn } = await import('../api/client.js')
    if (isConfigured() && isLoggedIn()) {
      return await fn()
    }
  } catch (e) {
    console.debug('API 同步跳过:', e.message)
  }
  return null
}

export function compressImage(dataURL, maxSize = 1920, quality = 0.8) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      let w = img.width, h = img.height
      if (w > maxSize || h > maxSize) {
        if (w > h) { h = Math.round(h * maxSize / w); w = maxSize }
        else { w = Math.round(w * maxSize / h); h = maxSize }
      }
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => resolve(dataURL)
    img.src = dataURL
  })
}

export function syncPhotosToCloud(cityId) {
  trySync(async () => {
    const { uploadPhotos } = await import('../api/client.js')
    const photos = getCityUploadedPhotos(cityId)
    const newPhotos = photos.filter(p => p && p.src && p.id && !p._synced)
    if (newPhotos.length === 0) return

    console.log(`[云端同步] ${cityId}: 开始同步 ${newPhotos.length} 张照片`)

    // 分批上传，每批 5 张，避免请求过大超时
    const BATCH_SIZE = 5
    let synced = 0
    for (let i = 0; i < newPhotos.length; i += BATCH_SIZE) {
      const batch = newPhotos.slice(i, i + BATCH_SIZE)
      const files = []
      for (const p of batch) {
        let data = p.src
        if (p.src.length > 1000000) {
          data = await compressImage(p.src)
        }
        files.push({
          id: p.id,
          title: p.title,
          desc: p.desc,
          params: p.params,
          ratio: p.ratio,
          dataBase64: data,
          ext: 'jpg',
        })
      }
      try {
        await uploadPhotos(cityId, files)
        // 每批成功后标记已同步
        batch.forEach(p => { if (p) p._synced = true })
        synced += batch.length
        // 每批成功后立即持久化 _synced 标记到 IndexedDB，防止中断丢失
        _persistPhotos()
        console.log(`[云端同步] ${cityId}: ${synced}/${newPhotos.length} 完成`)
      } catch (e) {
        console.warn(`[云端同步] ${cityId}: 第 ${i + 1}-${i + batch.length} 张失败:`, e.message)
        // 某批失败不继续，保留未同步标记下次重试
        _persistPhotos()
        break
      }
    }

    if (synced === newPhotos.length) {
      console.log(`[云端同步] ${cityId}: 全部 ${synced} 张同步完成`)
    }
  })
}

export function syncSettingsToCloud(cityId) {
  trySync(async () => {
    const { updateSettings } = await import('../api/client.js')
    await updateSettings(cityId, {
      ratios: getPhotoRatios(cityId),
      crops: (() => {
        try {
          const data = localStorage.getItem(CROP_KEY)
          return data ? JSON.parse(data)[cityId] || {} : {}
        } catch { return {} }
      })(),
      cover: getCustomCover(cityId),
    })
  })
}

export async function syncFromCloud(cityId) {
  return trySync(async () => {
    const { getPhotos, getSettings } = await import('../api/client.js')
    const [photos, settings] = await Promise.all([
      getPhotos(cityId),
      getSettings(cityId),
    ])

    if (photos !== undefined) {
      if (!_photoCache) _photoCache = {}
      const existing = _photoCache[cityId] || []
      const cloudIds = new Set(photos.filter(p => p && p.id).map(p => String(p.id)))
      const localMap = new Map(existing.map(p => [String(p.id), p]))
      const COS_URL = 'https://photo-portfolio-1449377287.cos.ap-guangzhou.myqcloud.com'

      for (const p of photos) {
        if (!p || !p.id || !p.key) continue
        const key = String(p.id)
        const cloudSrc = p.src || `${COS_URL}/${p.key}`
        const local = localMap.get(key)
        if (local) {
          local.title = p.title ?? local.title
          local.desc = p.desc ?? local.desc
          local.params = p.params ?? local.params
          local.ratio = p.ratio ?? local.ratio
          local._synced = true
          if (!local.src) local.src = cloudSrc
        } else {
          existing.push({ ...p, src: cloudSrc, _synced: true })
        }
      }

      const filtered = existing.filter(p => {
        if (!p._synced) return true
        return cloudIds.has(String(p.id))
      })

      _photoCache[cityId] = filtered
      _persistPhotos()
    }

    if (settings.ratios) {
      const ratios = JSON.parse(localStorage.getItem(RATIO_KEY) || '{}')
      ratios[cityId] = { ...ratios[cityId], ...settings.ratios }
      localStorage.setItem(RATIO_KEY, JSON.stringify(ratios))
    }
    if (settings.crops) {
      const crops = JSON.parse(localStorage.getItem(CROP_KEY) || '{}')
      crops[cityId] = { ...crops[cityId], ...settings.crops }
      localStorage.setItem(CROP_KEY, JSON.stringify(crops))
    }
    if (settings.cover) {
      const covers = JSON.parse(localStorage.getItem(COVER_KEY) || '{}')
      covers[cityId] = settings.cover
      localStorage.setItem(COVER_KEY, JSON.stringify(covers))
    }

    return true
  })
}

// ===== 应用启动时调用，预加载缓存 =====
export async function initStorage() {
  await _initCache()
}
