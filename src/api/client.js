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
