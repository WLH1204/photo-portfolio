import { useState, useEffect, useCallback, useRef } from 'react'
import { replacePhoto, deletePhoto, updatePhotoMeta, fileToDataURL, compressImage } from '../utils/photoStorage'

export default function ImmersiveViewer({ city, photos, initialIndex, onClose, onPhotoUpdate }) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [touchStart, setTouchStart] = useState(null)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [editingField, setEditingField] = useState(null) // 'title' | 'desc' | 'params' | null
  const [editValue, setEditValue] = useState('')
  const containerRef = useRef(null)
  const replaceInputRef = useRef(null)
  const replaceTargetRef = useRef(null)
  const editInputRef = useRef(null)
  const [localPhotos, setLocalPhotos] = useState(photos || [])

  // 同步外部 photos 变化
  useEffect(() => {
    setLocalPhotos(photos || [])
  }, [photos])

  const total = localPhotos.length

  const goTo = useCallback((index) => {
    if (isTransitioning) return
    if (index < 0 || index >= total) return
    // 切换前保存编辑
    if (editingField) {
      setEditingField(null)
    }
    setIsTransitioning(true)
    setCurrentIndex(index)
    setTimeout(() => setIsTransitioning(false), 500)
  }, [total, isTransitioning, editingField])

  const goNext = useCallback(() => goTo(currentIndex + 1), [currentIndex, goTo])
  const goPrev = useCallback(() => goTo(currentIndex - 1), [currentIndex, goTo])

  // 键盘导航
  useEffect(() => {
    const handler = (e) => {
      if (editingField) {
        if (e.key === 'Escape') setEditingField(null)
        return
      }
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') goNext()
      if (e.key === 'ArrowLeft') goPrev()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, goNext, goPrev, editingField])

  // 触摸手势
  const handleTouchStart = (e) => {
    setTouchStart(e.touches[0].clientX)
  }

  const handleTouchEnd = (e) => {
    if (touchStart === null) return
    const diff = touchStart - e.changedTouches[0].clientX
    if (Math.abs(diff) > 60) {
      diff > 0 ? goNext() : goPrev()
    }
    setTouchStart(null)
  }

  // 鼠标滚轮
  const wheelRef = useRef(0)
  const handleWheel = useCallback((e) => {
    if (editingField) return
    const now = Date.now()
    if (now - wheelRef.current < 600) return
    wheelRef.current = now
    if (e.deltaY > 30) goNext()
    else if (e.deltaY < -30) goPrev()
  }, [goNext, goPrev, editingField])

  const photo = localPhotos[currentIndex]
  const isOdd = currentIndex % 2 === 0

  // ===== 编辑功能 =====
  const startEdit = useCallback((field, value, e) => {
    e.stopPropagation()
    setEditingField(field)
    setEditValue(value || '')
    // 等 DOM 更新后 focus
    setTimeout(() => editInputRef.current?.focus(), 50)
  }, [])

  const saveEdit = useCallback(async () => {
    if (!editingField || !photo) return
    const trimmed = editValue.trim()
    if (trimmed === (photo[editingField] || '')) {
      setEditingField(null)
      return
    }
    const fields = { [editingField]: trimmed }

    // 更新组件状态
    setLocalPhotos(prev => prev.map(p =>
      p.id === photo.id ? { ...p, [editingField]: trimmed } : p
    ))

    // 更新本地存储（如果已存在就更新，否则新增到存储）
    let ok = updatePhotoMeta(city.id, photo.id, fields)
    if (!ok) {
      // 静态占位图等不在 localStorage 中 → 新增到存储
      const { savePhotos } = await import('../utils/photoStorage')
      savePhotos(city.id, [{ ...photo, [editingField]: trimmed }])
    }

    // 同步到云端
    try {
      const mod = await import('../api/client.js')
      if (mod.isConfigured() && mod.isLoggedIn()) {
        await mod.updatePhotoMetaCloud(city.id, photo.id, fields)
        console.log('[ImmersiveViewer] 元数据已同步到云端:', fields)
      } else {
        console.warn('[ImmersiveViewer] 未配置API或未登录，跳过云端同步')
      }
    } catch (err) {
      console.error('[ImmersiveViewer] 云端同步失败:', err.message)
    }
    setEditingField(null)
    onPhotoUpdate?.()
  }, [editingField, editValue, photo, city.id, onPhotoUpdate])

  const cancelEdit = useCallback(() => {
    setEditingField(null)
  }, [])

  // ===== 删除功能 =====
  const handleDelete = useCallback(async () => {
    if (!photo) return
    if (!confirm('确定要删除这张照片吗？')) return
    const photoId = photo.id
    deletePhoto(city.id, photoId)
    // 同步删除到云端
    try {
      const mod = await import('../api/client.js')
      if (mod.isConfigured() && mod.isLoggedIn()) {
        await mod.deletePhoto(city.id, photoId)
      }
    } catch {}
    onPhotoUpdate?.()
    // 如果删完没有照片了，关闭
    if (total <= 1) {
      onClose()
    } else {
      const newIndex = currentIndex >= total - 1 ? currentIndex - 1 : currentIndex
      setCurrentIndex(newIndex)
    }
  }, [photo, city.id, total, currentIndex, onClose, onPhotoUpdate])

  // ===== 替换功能 =====
  const handleReplaceClick = useCallback(() => {
    replaceTargetRef.current = currentIndex
    replaceInputRef.current?.click()
  }, [currentIndex])

  const handleReplaceFile = useCallback(async (e) => {
    const file = e.target.files?.[0]
    const idx = replaceTargetRef.current
    if (file && idx !== null && idx !== undefined) {
      const dataURL = await fileToDataURL(file)
      replacePhoto(city.id, localPhotos[idx].id, dataURL)
      // 同步替换到云端
      try {
        const { replacePhoto: cloudReplace, isConfigured, isLoggedIn } = await import('../api/client.js')
        if (isConfigured() && isLoggedIn()) {
          let base64 = dataURL
          if (base64.length > 1000000) {
            base64 = await compressImage(dataURL)
          }
          const cleanBase64 = base64.replace(/^data:image\/\w+;base64,/, '')
          await cloudReplace(city.id, localPhotos[idx].id, cleanBase64, 'jpg')
        }
      } catch {}
      onPhotoUpdate?.()
    }
    e.target.value = ''
  }, [city.id, localPhotos, onPhotoUpdate])

  return (
    <div
      className="immersive-viewer"
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onWheel={handleWheel}
    >
      {/* 隐藏的替换文件选择器 */}
      <input
        ref={replaceInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleReplaceFile}
      />

      {/* 顶部导航栏 */}
      <div className="iv-header">
        <button className="iv-close" onClick={onClose}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M15 5L5 15M5 5L15 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
        <div className="iv-header-info">
          <span className="iv-header-city">{city.name}集</span>
          <span className="iv-header-progress">{currentIndex + 1} / {total}</span>
        </div>
        <div className="iv-header-actions">
          <button className="iv-action-btn iv-replace-btn" title="替换图片" onClick={handleReplaceClick}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M13 8.5V12C13 12.5523 12.5523 13 12 13H4C3.44772 13 3 12.5523 3 12V4C3 3.44772 3.44772 3 4 3H7.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              <path d="M10.5 2H13V4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M13 2L8.5 6.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
          </button>
          <button className="iv-action-btn iv-delete-btn" title="删除图片" onClick={handleDelete}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 4H14" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              <path d="M5.5 4V2.5C5.5 2.22386 5.72386 2 6 2H10C10.2761 2 10.5 2.22386 10.5 2.5V4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              <path d="M3.5 4L4.2 13.5C4.2 13.7761 4.42386 14 4.7 14H11.3C11.5761 14 11.8 13.7761 11.8 13.5L12.5 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              <path d="M6.5 7V11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              <path d="M9.5 7V11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
          </button>
          <button className="iv-action-btn" title="上一张" onClick={goPrev} disabled={currentIndex === 0}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M11 4L6 9L11 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button className="iv-action-btn" title="下一张" onClick={goNext} disabled={currentIndex === total - 1}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M7 4L12 9L7 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* 主内容区 - 图文分栏卡片 */}
      <div className="iv-card-wrapper">
        <div
          className={`iv-card ${isOdd ? 'layout-normal' : 'layout-reverse'}`}
          key={`${city.id}-${currentIndex}`}
        >
          {/* 文字区 */}
          <div className="iv-text">
            <span className="iv-label">细节</span>

            {editingField === 'title' ? (
              <input
                ref={editInputRef}
                className="iv-edit-input iv-edit-title"
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onBlur={saveEdit}
                onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit() }}
              />
            ) : (
              <h2
                className="iv-title iv-editable"
                onClick={(e) => startEdit('title', photo.title, e)}
                title="点击编辑标题"
              >{photo.title}</h2>
            )}

            {editingField === 'desc' ? (
              <textarea
                ref={editInputRef}
                className="iv-edit-input iv-edit-desc"
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onBlur={saveEdit}
                onKeyDown={e => { if (e.key === 'Escape') cancelEdit(); if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit() } }}
                rows={3}
              />
            ) : (
              <p
                className="iv-desc iv-editable"
                onClick={(e) => startEdit('desc', photo.desc, e)}
                title="点击编辑描述"
              >{photo.desc || '点击添加描述...'}</p>
            )}

            <div className="iv-meta">
              {editingField === 'params' ? (
                <input
                  ref={editInputRef}
                  className="iv-edit-input iv-edit-params"
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  onBlur={saveEdit}
                  onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit() }}
                  placeholder="如 f/2.8 · 1/500s · ISO 200"
                />
              ) : (
                <span
                  className="iv-meta-params iv-editable"
                  onClick={(e) => startEdit('params', photo.params, e)}
                  title="点击编辑拍摄参数"
                >{photo.params || '点击添加参数...'}</span>
              )}
              <span className="iv-meta-location">{city.name} · {city.nameEn}</span>
            </div>
          </div>
          {/* 图片区 */}
          <div className="iv-image">
            <img
              src={photo.src}
              alt={photo.title}
              className="iv-img"
            />
            <span className="iv-img-caption">{photo.title} · {city.name}</span>
          </div>
        </div>
      </div>

      {/* 底部进度条 */}
      <div className="iv-progress">
        {localPhotos.map((_, index) => (
          <div
            key={index}
            className={`iv-progress-seg ${index === currentIndex ? 'active' : ''} ${index < currentIndex ? 'passed' : ''}`}
            onClick={() => goTo(index)}
          />
        ))}
      </div>
    </div>
  )
}
