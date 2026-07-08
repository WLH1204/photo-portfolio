// API 客户端 - 腾讯云 SCF + COS 版本
// 管理与后端的通信，离线时降级到 localStorage

const AUTH_KEY = 'photo_portfolio_api_auth'

function getAuth() {
  try {
    const data = localStorage.getItem(AUTH_KEY)
    return data ? JSON.parse(data) : null
  } catch {
    return null
  }
}

function saveAuth(data) {
  localStorage.setItem(AUTH_KEY, JSON.stringify(data))
}

function clearAuth() {
  localStorage.removeItem(AUTH_KEY)
}

// API 基础 URL（SCF API 网关地址）
let API_BASE = localStorage.getItem('photo_portfolio_api_url') || ''
let COS_BUCKET_DOMAIN = localStorage.getItem('photo_portfolio_cos_domain') || ''

export function setApiUrl(url) {
  API_BASE = url.replace(/\/+$/, '')
  localStorage.setItem('photo_portfolio_api_url', API_BASE)
}

export function getApiUrl() {
  return API_BASE
}

export function setCosDomain(domain) {
  COS_BUCKET_DOMAIN = domain.replace(/\/+$/, '')
  localStorage.setItem('photo_portfolio_cos_domain', COS_BUCKET_DOMAIN)
}

export function getCosDomain() {
  return COS_BUCKET_DOMAIN
}

export function isConfigured() {
  return !!API_BASE
}

// 通用请求 - 自动处理 API_BASE 可能带或不带 /api 的情况
async function apiRequest(path, options = {}) {
  if (!API_BASE) throw new Error('API 未配置')

  // 确保 path 不会和 API_BASE 重复
  let base = API_BASE
  // 如果 API_BASE 以 /api 结尾，而 path 以 /api 开头，去掉 path 的 /api 前缀
  if (base.endsWith('/api') && path.startsWith('/api/')) {
    path = path.substring(4) // 去掉 /api
  }
  if (base.endsWith('/api/') && path.startsWith('/api/')) {
    path = path.substring(4)
  }

  const headers = { ...options.headers }
  if (options.body && typeof options.body === 'string') {
    headers['Content-Type'] = 'application/json'
  }

  const response = await fetch(`${base}${path}`, { ...options, headers })
  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error || '请求失败')
  }

  return data
}

// ===== 认证 =====

export async function login(password) {
  const data = await apiRequest('/api/auth', {
    method: 'POST',
    body: JSON.stringify({ password }),
  })

  if (data.success) {
    saveAuth({ password })
    return true
  }
  return false
}

export function isLoggedIn() {
  return !!getAuth()?.password
}

export function logout() {
  clearAuth()
}

// ===== 照片操作 =====

export async function getPhotos(cityId) {
  return await apiRequest(`/api/photos/${cityId}`)
}

// 上传照片（Base64 方式，经过 SCF 存到 COS）
export async function uploadPhotos(cityId, filesWithBase64) {
  // filesWithBase64: [{ id, title, desc, params, ratio, dataBase64, ext }]
  return await apiRequest(`/api/photos/${cityId}`, {
    method: 'POST',
    body: JSON.stringify({ files: filesWithBase64 }),
  })
}

export async function deletePhoto(cityId, photoId) {
  return await apiRequest(`/api/photos/${cityId}`, {
    method: 'POST',
    body: JSON.stringify({ action: 'delete', photoId }),
  })
}

// 批量删除照片（一次请求，避免并发竞争导致删除不全）
export async function batchDeletePhotos(cityId, photoIds) {
  return await apiRequest(`/api/photos/${cityId}`, {
    method: 'POST',
    body: JSON.stringify({ action: 'batchDelete', photoIds }),
  })
}

// 更新照片元数据到云端
export async function updatePhotoMetaCloud(cityId, photoId, fields) {
  return await apiRequest(`/api/photos/${cityId}`, {
    method: 'PUT',
    body: JSON.stringify({ photoId, fields }),
  })
}

export async function replacePhoto(cityId, photoId, dataBase64, ext = 'jpg') {
  return await apiRequest(`/api/photos/${cityId}/${photoId}/replace`, {
    method: 'PUT',
    body: JSON.stringify({ dataBase64, ext }),
  })
}

// ===== 设置操作 =====

export async function getSettings(cityId) {
  return await apiRequest(`/api/settings/${cityId}`)
}

export async function updateSettings(cityId, updates) {
  return await apiRequest(`/api/settings/${cityId}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  })
}

export async function setCover(cityId, dataURL) {
  return await updateSettings(cityId, { cover: dataURL })
}

export async function undoCover(cityId) {
  return await updateSettings(cityId, { undoCover: true })
}

export async function getCoverHistoryCount(cityId) {
  const data = await apiRequest(`/api/settings/${cityId}/cover-history`)
  return data.count || 0
}

// ===== 同步管理 =====

// COS 桶公开访问域名（用于显示图片）
const COS_PUBLIC_DOMAIN = 'https://photo-portfolio-1449377287.cos.ap-guangzhou.myqcloud.com'

// 从云端同步到 localStorage
export async function syncFromCloud(cityId) {
  if (!isLoggedIn()) return false

  try {
    const [photos, settings] = await Promise.all([
      getPhotos(cityId),
      getSettings(cityId),
    ])

    // 将云端照片保存到 localStorage
    if (photos !== undefined) {
      const STORAGE_KEY = 'photo_portfolio_uploads'
      const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
      const existing = all[cityId] || []
      const cloudIds = new Set(photos.filter(p => p && p.id).map(p => String(p.id)))
      const localMap = new Map(existing.map(p => [String(p.id), p]))
      const COS_URL = 'https://photo-portfolio-1449377287.cos.ap-guangzhou.myqcloud.com'

      // 1. 更新/添加云端照片
      for (const p of photos) {
        if (!p || !p.id || !p.key) continue
        const key = String(p.id)
        const cloudSrc = p.src || `${COS_URL}/${p.key}`
        const local = localMap.get(key)
        if (local) {
          // 已存在 → 用云端元数据覆盖本地元数据
          local.title = p.title ?? local.title
          local.desc = p.desc ?? local.desc
          local.params = p.params ?? local.params
          local.ratio = p.ratio ?? local.ratio
          local._synced = true
          if (!local.src) local.src = cloudSrc
        } else {
          // 云端独有的新照片 → 添加
          existing.push({ ...p, src: cloudSrc, _synced: true })
        }
      }

      // 2. 删除云端已不存在的本地照片（只删已同步过的，保留本地新上传未同步的）
      const filtered = existing.filter(p => {
        // 本地新上传的（没有 _synced 标记）→ 保留
        if (!p._synced) return true
        // 已同步过的 → 检查云端是否还存在
        return cloudIds.has(String(p.id))
      })

      all[cityId] = filtered
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
    }

    // 同步设置
    if (settings.ratios) {
      const RATIO_KEY = 'photo_portfolio_ratios'
      const ratios = JSON.parse(localStorage.getItem(RATIO_KEY) || '{}')
      ratios[cityId] = { ...ratios[cityId], ...settings.ratios }
      localStorage.setItem(RATIO_KEY, JSON.stringify(ratios))
    }

    if (settings.crops) {
      const CROP_KEY = 'photo_portfolio_crops'
      const crops = JSON.parse(localStorage.getItem(CROP_KEY) || '{}')
      crops[cityId] = { ...crops[cityId], ...settings.crops }
      localStorage.setItem(CROP_KEY, JSON.stringify(crops))
    }

    if (settings.cover) {
      const COVER_KEY = 'photo_portfolio_covers'
      const covers = JSON.parse(localStorage.getItem(COVER_KEY) || '{}')
      covers[cityId] = settings.cover
      localStorage.setItem(COVER_KEY, JSON.stringify(covers))
    }

    return true
  } catch (e) {
    console.warn('从云端同步失败:', e)
    return false
  }
}
