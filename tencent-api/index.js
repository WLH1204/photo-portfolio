// 光影行迹 SCF - Node.js + cos-nodejs-sdk-v5
const COS = require('cos-nodejs-sdk-v5')

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
}

function ok(data) {
  return { statusCode: 200, headers: { 'Content-Type': 'application/json', ...CORS }, body: JSON.stringify(data) }
}

function fail(msg, code = 400) {
  return { statusCode: code, headers: { 'Content-Type': 'application/json', ...CORS }, body: JSON.stringify({ error: msg }) }
}

// COS 客户端（回调 Promise 化）
let _cos = null
function cos() {
  if (!_cos) {
    _cos = new COS({
      SecretId: process.env.COS_SECRET_ID,
      SecretKey: process.env.COS_SECRET_KEY,
      Region: process.env.COS_REGION,
    })
  }
  return _cos
}

// 通用参数
function cp() {
  return { Bucket: process.env.COS_BUCKET, Region: process.env.COS_REGION }
}

function cosPut(params) {
  return new Promise((resolve, reject) => {
    cos().putObject({ ...cp(), ...params }, (err, data) => err ? reject(err) : resolve(data))
  })
}

function cosGet(params) {
  return new Promise((resolve, reject) => {
    cos().getObject({ ...cp(), ...params }, (err, data) => err ? reject(err) : resolve(data))
  })
}

// 设置读写
async function getSettings(cid) {
  try {
    const r = await cosGet({ Key: `settings/${cid}.json` })
    return JSON.parse(r.Body.toString())
  } catch { return { ratios: {}, crops: {}, cover: null, coverHistory: [] } }
}
async function saveSettings(cid, s) {
  await cosPut({ Key: `settings/${cid}.json`, Body: JSON.stringify(s), ContentType: 'application/json' })
}

// 照片列表读写
async function getPhotos(cid) {
  try {
    const r = await cosGet({ Key: `photos/${cid}/_index.json` })
    const list = JSON.parse(r.Body.toString())
    return list.filter(p => p && p.id && p.key)
  } catch { return [] }
}
async function savePhotos(cid, p) {
  await cosPut({ Key: `photos/${cid}/_index.json`, Body: JSON.stringify(p), ContentType: 'application/json' })
}

exports.main_handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' }

  const m = event.httpMethod, p = event.path || ''

  try {
    // 认证
    if (p.endsWith('/auth') && m === 'POST') {
      const b = JSON.parse(event.body || '{}')
      if (b.password === process.env.API_PASSWORD) return ok({ success: true })
      return fail('密码错误', 401)
    }

    // 诊断
    if (p.endsWith('/diag')) {
      return ok({
        version: 'v2.2-batchDelete',
        bucket: process.env.COS_BUCKET || '',
        region: process.env.COS_REGION || '',
        sid: (process.env.COS_SECRET_ID || '').substring(0, 10),
        hasKey: !!(process.env.COS_SECRET_KEY || ''),
      })
    }

    // GET 照片列表
    const photoMatch = p.match(/\/api\/photos\/([^/]+)$/)
    if (photoMatch && m === 'GET') return ok(await getPhotos(photoMatch[1]))

    // PUT 更新照片元数据（标题、描述、参数）
    if (photoMatch && m === 'PUT') {
      const body = JSON.parse(event.body || '{}')
      const cid = photoMatch[1]
      const { photoId, fields } = body
      if (!photoId || !fields) return fail('缺少 photoId 或 fields')
      const list = await getPhotos(cid)
      const photo = list.find(p => String(p.id) === String(photoId))
      if (!photo) return fail('照片不存在')
      // 更新字段
      if (fields.title !== undefined) photo.title = fields.title
      if (fields.desc !== undefined) photo.desc = fields.desc
      if (fields.params !== undefined) photo.params = fields.params
      if (fields.ratio !== undefined) photo.ratio = fields.ratio
      await savePhotos(cid, list)
      return ok({ success: true })
    }

    // POST 上传照片 / 清空照片
    if (photoMatch && m === 'POST') {
      const body = JSON.parse(event.body || '{}')
      const cid = photoMatch[1]

      // 清空照片列表
      if (body.action === 'clear') {
        await savePhotos(cid, [])
        return ok({ success: true, count: 0 })
      }

      // 删除单张照片
      if (body.action === 'delete' && body.photoId) {
        const list = await getPhotos(cid)
        const photo = list.find(x => String(x.id) === String(body.photoId))
        if (!photo) return fail('照片不存在', 404)
        const newList = list.filter(x => String(x.id) !== String(body.photoId))
        await savePhotos(cid, newList)
        try {
          await new Promise((resolve, reject) => {
            cos().deleteObject({ ...cp(), Key: photo.key }, (err) => err ? reject(err) : resolve())
          })
        } catch (e) { console.warn('删除COS文件失败:', e.message) }
        return ok({ success: true })
      }

      // 批量删除照片（一次读-改-写，避免并发竞争）
      if (body.action === 'batchDelete' && Array.isArray(body.photoIds)) {
        const ids = body.photoIds.map(String)
        const idSet = new Set(ids)
        const list = await getPhotos(cid)
        const toDelete = list.filter(x => idSet.has(String(x.id)))
        const newList = list.filter(x => !idSet.has(String(x.id)))
        await savePhotos(cid, newList)
        // 并发删除 COS 上的图片文件（失败不影响列表结果）
        const deleteResults = await Promise.allSettled(
          toDelete.map(photo => new Promise((resolve, reject) => {
            cos().deleteObject({ ...cp(), Key: photo.key }, (err) => err ? reject(err) : resolve())
          }))
        )
        const fileDeleted = deleteResults.filter(r => r.status === 'fulfilled').length
        const fileFailed = deleteResults.length - fileDeleted
        if (fileFailed > 0) console.warn(`COS文件删除：${fileDeleted}/${toDelete.length} 成功，${fileFailed} 失败`)
        return ok({ success: true, deleted: toDelete.length, total: ids.length })
      }

      const files = body.files || []
      if (!files.length) return fail('没有文件')
      const list = (await getPhotos(cid)).filter(p => p.id && p.key)
      for (const f of files) {
        const id = f.id || Date.now().toString(36)
        const ext = f.ext || 'jpg'
        const key = `photos/${cid}/${id}.${ext}`
        const raw = Buffer.from(f.dataBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64')
        await cosPut({ Key: key, Body: raw, ContentType: ext === 'jpg' ? 'image/jpeg' : `image/${ext}` })
        list.push({ id, title: f.title || '', desc: f.desc || '', params: f.params || '', ratio: f.ratio || '3:4', key })
      }
      await savePhotos(cid, list)
      return ok({ success: true })
    }

    // POST 删除单张照片
    const deleteMatch = p.match(/\/api\/photos\/([^/]+)\/([^/]+)$/)
    if (deleteMatch && m === 'POST') {
      const body = JSON.parse(event.body || '{}')
      if (body.action === 'delete') {
        const [, cid, pid] = deleteMatch
        const list = await getPhotos(cid)
        const photo = list.find(x => String(x.id) === String(pid))
        if (!photo) return fail('照片不存在', 404)
        // 从列表中移除
        const newList = list.filter(x => String(x.id) !== String(pid))
        await savePhotos(cid, newList)
        // 尝试删除 COS 上的图片文件（失败也不影响）
        try {
          await new Promise((resolve, reject) => {
            cos().deleteObject({ ...cp(), Key: photo.key }, (err) => err ? reject(err) : resolve())
          })
        } catch (e) {
          console.warn('删除COS文件失败:', e.message)
        }
        return ok({ success: true })
      }
    }

    // PUT 替换照片
    const replaceMatch = p.match(/\/api\/photos\/([^/]+)\/([^/]+)\/replace$/)
    if (replaceMatch && m === 'PUT') {
      const body = JSON.parse(event.body || '{}')
      const [, cid, pid] = replaceMatch
      const list = await getPhotos(cid)
      const photo = list.find(x => String(x.id) === String(pid))
      if (!photo) return fail('不存在', 404)
      const ext = body.ext || 'jpg'
      const key = photo.key || `photos/${cid}/${pid}.${ext}`
      const raw = Buffer.from(body.dataBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64')
      await cosPut({ Key: key, Body: raw, ContentType: ext === 'jpg' ? 'image/jpeg' : `image/${ext}` })
      photo.key = key
      await savePhotos(cid, list)
      return ok({ success: true })
    }

    // GET/PUT 设置
    const settingsMatch = p.match(/\/api\/settings\/([^/]+)$/)
    if (settingsMatch && m === 'GET') return ok(await getSettings(settingsMatch[1]))
    if (settingsMatch && m === 'PUT') {
      const body = JSON.parse(event.body || '{}')
      const cid = settingsMatch[1]
      const s = await getSettings(cid)
      if (body.ratios) s.ratios = { ...s.ratios, ...body.ratios }
      if (body.crops) s.crops = { ...s.crops, ...body.crops }
      if ('cover' in body) {
        if (s.cover && body.cover !== s.cover) { s.coverHistory = s.coverHistory || []; s.coverHistory.unshift(s.cover); s.coverHistory = s.coverHistory.slice(0, 5) }
        s.cover = body.cover
      }
      if ('undoCover' in body && s.coverHistory?.length) { const prev = s.coverHistory.shift(); if (s.cover) s.coverHistory.unshift(s.cover); s.cover = prev }
      await saveSettings(cid, s)
      return ok(s)
    }

    // 封面历史数
    const chMatch = p.match(/\/api\/settings\/([^/]+)\/cover-history$/)
    if (chMatch && m === 'GET') { const s = await getSettings(chMatch[1]); return ok({ count: (s.coverHistory || []).length }) }

    return fail('接口不存在', 404)
  } catch (e) {
    console.error(e)
    return fail('服务器错误: ' + e.message, 500)
  }
}
