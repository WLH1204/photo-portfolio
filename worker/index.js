// Cloudflare Worker 后端 API
// 处理照片上传、存储、设置管理
// 绑定：R2 Bucket (PHOTOS_BUCKET), KV Namespace (SETTINGS_KV)

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

function error(msg, status = 400) {
  return json({ error: msg }, status)
}

// 鉴权检查
function checkAuth(request, env) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  return token === env.API_TOKEN
}

// 生成唯一 ID
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

// ===== 路由处理 =====

// 认证 - 验证密码返回 token
async function handleAuth(request, env) {
  const { password } = await request.json()
  if (password === env.API_PASSWORD) {
    return json({ token: env.API_TOKEN, success: true })
  }
  return error('密码错误', 401)
}

// 获取照片列表
async function handleGetPhotos(cityId, env) {
  const data = await env.SETTINGS_KV.get(`photos:${cityId}`, { type: 'json' })
  return json(data || [])
}

// 上传照片
async function handleUploadPhotos(cityId, request, env) {
  const formData = await request.formData()
  const files = []
  const metadata = []

  // 收集所有文件和元数据
  for (const [key, value] of formData.entries()) {
    if (value instanceof File) {
      files.push({ key, file: value })
    } else {
      try {
        metadata.push(JSON.parse(value))
      } catch {
        metadata.push({ key, value })
      }
    }
  }

  // 获取现有照片列表
  const existing = await env.SETTINGS_KV.get(`photos:${cityId}`, { type: 'json' }) || []

  // 上传每个文件到 R2
  for (let i = 0; i < files.length; i++) {
    const { file } = files[i]
    const photoId = generateId()
    const ext = file.name.split('.').pop() || 'jpg'
    const r2Key = `photos/${cityId}/${photoId}.${ext}`

    // 上传到 R2
    await env.PHOTOS_BUCKET.put(r2Key, file, {
      httpMetadata: { contentType: file.type || 'image/jpeg' },
    })

    // 构建照片对象
    const photoMeta = metadata[i] || {}
    existing.push({
      id: photoId,
      title: photoMeta.title || file.name.replace(/\.[^.]+$/, ''),
      desc: photoMeta.desc || '',
      params: photoMeta.params || '',
      ratio: photoMeta.ratio || '3:4',
      r2Key,
    })
  }

  // 保存到 KV
  await env.SETTINGS_KV.put(`photos:${cityId}`, JSON.stringify(existing))

  return json({ success: true, count: files.length })
}

// 删除照片
async function handleDeletePhoto(cityId, photoId, env) {
  const existing = await env.SETTINGS_KV.get(`photos:${cityId}`, { type: 'json' }) || []
  const photo = existing.find(p => String(p.id) === String(photoId))

  if (photo?.r2Key) {
    await env.PHOTOS_BUCKET.delete(photo.r2Key)
  }

  const updated = existing.filter(p => String(p.id) !== String(photoId))
  await env.SETTINGS_KV.put(`photos:${cityId}`, JSON.stringify(updated))

  return json({ success: true })
}

// 替换照片
async function handleReplacePhoto(cityId, photoId, request, env) {
  const formData = await request.formData()
  const file = formData.get('file')

  if (!file || !(file instanceof File)) {
    return error('没有提供文件')
  }

  // 获取现有照片列表
  const existing = await env.SETTINGS_KV.get(`photos:${cityId}`, { type: 'json' }) || []
  const index = existing.findIndex(p => String(p.id) === String(photoId))

  if (index === -1) {
    return error('照片不存在', 404)
  }

  // 删除旧文件
  const oldKey = existing[index].r2Key
  if (oldKey) {
    await env.PHOTOS_BUCKET.delete(oldKey)
  }

  // 上传新文件
  const ext = file.name.split('.').pop() || 'jpg'
  const r2Key = `photos/${cityId}/${photoId}.${ext}`

  await env.PHOTOS_BUCKET.put(r2Key, file, {
    httpMetadata: { contentType: file.type || 'image/jpeg' },
  })

  existing[index].r2Key = r2Key
  await env.SETTINGS_KV.put(`photos:${cityId}`, JSON.stringify(existing))

  return json({ success: true, r2Key })
}

// 替换照片（通过 Data URL）
async function handleReplacePhotoDataURL(cityId, photoId, request, env) {
  const { dataURL } = await request.json()

  if (!dataURL) {
    return error('没有提供图片数据')
  }

  // 获取现有照片列表
  const existing = await env.SETTINGS_KV.get(`photos:${cityId}`, { type: 'json' }) || []
  const index = existing.findIndex(p => String(p.id) === String(photoId))

  if (index === -1) {
    return error('照片不存在', 404)
  }

  // 删除旧文件
  const oldKey = existing[index].r2Key
  if (oldKey) {
    await env.PHOTOS_BUCKET.delete(oldKey)
  }

  // 将 Data URL 转为 ArrayBuffer 并上传
  const base64 = dataURL.split(',')[1]
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }

  const ext = 'jpg'
  const r2Key = `photos/${cityId}/${photoId}.${ext}`

  await env.PHOTOS_BUCKET.put(r2Key, bytes, {
    httpMetadata: { contentType: 'image/jpeg' },
  })

  existing[index].r2Key = r2Key
  await env.SETTINGS_KV.put(`photos:${cityId}`, JSON.stringify(existing))

  return json({ success: true, r2Key })
}

// 获取设置（比例、裁剪、封面）
async function handleGetSettings(cityId, env) {
  const data = await env.SETTINGS_KV.get(`settings:${cityId}`, { type: 'json' })
  return json(data || { ratios: {}, crops: {}, cover: null })
}

// 更新设置
async function handleUpdateSettings(cityId, request, env) {
  const updates = await request.json()
  const existing = await env.SETTINGS_KV.get(`settings:${cityId}`, { type: 'json' }) || {
    ratios: {}, crops: {}, cover: null, coverHistory: []
  }

  // 合并更新
  if (updates.ratios) {
    existing.ratios = { ...existing.ratios, ...updates.ratios }
  }
  if (updates.crops) {
    existing.crops = { ...existing.crops, ...updates.crops }
  }
  if (updates.hasOwnProperty('cover')) {
    // 封面历史
    if (existing.cover && updates.cover !== existing.cover) {
      if (!existing.coverHistory) existing.coverHistory = []
      existing.coverHistory.unshift(existing.cover)
      if (existing.coverHistory.length > 5) {
        existing.coverHistory = existing.coverHistory.slice(0, 5)
      }
    }
    existing.cover = updates.cover
  }
  if (updates.hasOwnProperty('undoCover')) {
    if (existing.coverHistory && existing.coverHistory.length > 0) {
      const prev = existing.coverHistory.shift()
      if (existing.cover) {
        existing.coverHistory.unshift(existing.cover)
      }
      existing.cover = prev
    }
  }
  if (updates.hasOwnProperty('coverHistoryCount')) {
    return json({ count: (existing.coverHistory || []).length })
  }

  await env.SETTINGS_KV.put(`settings:${cityId}`, JSON.stringify(existing))
  return json(existing)
}

// 获取所有城市的统计
async function handleGetStats(env) {
  const list = await env.SETTINGS_KV.list({ prefix: 'photos:' })
  const stats = {}

  for (const key of list.keys) {
    const cityId = key.name.replace('photos:', '')
    const photos = await env.SETTINGS_KV.get(key.name, { type: 'json' })
    stats[cityId] = photos?.length || 0
  }

  return json(stats)
}

// ===== 主入口 =====
export default {
  async fetch(request, env) {
    // CORS 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS })
    }

    const url = new URL(request.url)
    const path = url.pathname

    try {
      // 认证接口不需要鉴权
      if (path === '/api/auth' && request.method === 'POST') {
        return await handleAuth(request, env)
      }

      // 统计接口（可选鉴权）
      if (path === '/api/stats' && request.method === 'GET') {
        return await handleGetStats(env)
      }

      // 其他接口需要鉴权
      if (!checkAuth(request, env)) {
        return error('未授权，请先登录', 401)
      }

      // 照片列表
      const photoListMatch = path.match(/^\/api\/photos\/([^/]+)$/)
      if (photoListMatch && request.method === 'GET') {
        return await handleGetPhotos(photoListMatch[1], env)
      }

      // 上传照片
      if (photoListMatch && request.method === 'POST') {
        return await handleUploadPhotos(photoListMatch[1], request, env)
      }

      // 替换照片（Data URL 方式）
      const photoDataURLMatch = path.match(/^\/api\/photos\/([^/]+)\/([^/]+)\/replace-dataurl$/)
      if (photoDataURLMatch && request.method === 'PUT') {
        return await handleReplacePhotoDataURL(photoDataURLMatch[1], photoDataURLMatch[2], request, env)
      }

      // 替换照片（文件方式）
      const photoReplaceMatch = path.match(/^\/api\/photos\/([^/]+)\/([^/]+)\/replace$/)
      if (photoReplaceMatch && request.method === 'PUT') {
        return await handleReplacePhoto(photoReplaceMatch[1], photoReplaceMatch[2], request, env)
      }

      // 删除照片
      const photoDeleteMatch = path.match(/^\/api\/photos\/([^/]+)\/([^/]+)$/)
      if (photoDeleteMatch && request.method === 'DELETE') {
        return await handleDeletePhoto(photoDeleteMatch[1], photoDeleteMatch[2], env)
      }

      // 设置
      const settingsMatch = path.match(/^\/api\/settings\/([^/]+)$/)
      if (settingsMatch && request.method === 'GET') {
        return await handleGetSettings(settingsMatch[1], env)
      }
      if (settingsMatch && request.method === 'PUT') {
        return await handleUpdateSettings(settingsMatch[1], request, env)
      }

      return error('接口不存在', 404)
    } catch (e) {
      console.error('Worker error:', e)
      return error('服务器错误: ' + e.message, 500)
    }
  },
}
