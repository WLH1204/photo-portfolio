import { useParams, useNavigate } from 'react-router-dom'
import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { cityData } from '../data/cityData'
import { getCityUploadedPhotos, savePhotos, replacePhoto, deletePhoto, batchDeletePhotos, getReplacements, getPhotoRatios, setPhotoRatio, getCropPosition, getCropXY, setCropPosition, getCropStyle, getCustomCover, setCustomCover, undoCover, getCoverHistoryCount, fileToDataURL, compressImage, syncPhotosToCloud, syncSettingsToCloud, trySync } from '../utils/photoStorage'
import ImmersiveViewer from '../components/ImmersiveViewer'
import CropEditor from '../components/CropEditor'
import ApiSetupPanel from '../components/ApiSetupPanel'

export default function CityPage() {
  const { cityId } = useParams()
  const navigate = useNavigate()
  const [viewerOpen, setViewerOpen] = useState(false)
  const [viewerIndex, setViewerIndex] = useState(0)
  const [refreshKey, setRefreshKey] = useState(0)
  const replaceInputRef = useRef(null)
  const replaceTargetRef = useRef(null)
  const [cropEditorPhoto, setCropEditorPhoto] = useState(null)
  const [coverflowIndex, setCoverflowIndex] = useState(0)
  const [selectedPhotos, setSelectedPhotos] = useState(new Set())
  const [rangeStart, setRangeStart] = useState(0)
  const [rangeEnd, setRangeEnd] = useState(100)
  const [importing, setImporting] = useState(false)
  const [dragSelectMode, setDragSelectMode] = useState(null) // null | 'select' | 'deselect'
  const [showCoverPicker, setShowCoverPicker] = useState(false)
  const [showAlbumCoverPicker, setShowAlbumCoverPicker] = useState(false)
  const dragSelectStartRef = useRef(null)
  const stageRef = useRef(null)
  const importInputRef = useRef(null)
  const coverInputRef = useRef(null)

  const city = cityData[cityId]

  // 自定义封面
  const customCover = useMemo(() => getCustomCover(cityId), [cityId, refreshKey])
  const coverImage = customCover || city?.coverImage
  const coverHistoryCount = useMemo(() => getCoverHistoryCount(cityId), [cityId, refreshKey])

  // 合并静态照片 + 上传照片 + 替换记录 + 比例覆盖 + 裁剪位置
  const allPhotos = useMemo(() => {
    if (!city) return []
    const uploaded = getCityUploadedPhotos(cityId)
    const replacements = getReplacements(cityId)
    const ratios = getPhotoRatios(cityId)
    const base = [...city.photos, ...uploaded]
    return base.map(photo => ({
      ...photo,
      src: replacements[String(photo.id)] || photo.src,
      ratio: ratios[String(photo.id)] || photo.ratio,
      crop: getCropPosition(cityId, photo.id)
    }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, cityId, refreshKey])

  // 滑块筛选后的照片列表
  const filteredPhotos = useMemo(() => {
    if (allPhotos.length <= 1) return allPhotos
    const total = allPhotos.length
    const startIdx = Math.floor((rangeStart / 100) * (total - 1))
    const endIdx = Math.ceil((rangeEnd / 100) * (total - 1))
    return allPhotos.slice(startIdx, endIdx + 1)
  }, [allPhotos, rangeStart, rangeEnd])

  // 替换照片处理
  const handleReplaceClick = useCallback((photoId, e) => {
    e.stopPropagation()
    replaceTargetRef.current = photoId
    replaceInputRef.current?.click()
  }, [])

  const handleReplaceFile = useCallback(async (e) => {
    const file = e.target.files?.[0]
    const photoId = replaceTargetRef.current
    if (!file || !photoId) return

    const dataURL = await fileToDataURL(file)
    const success = replacePhoto(cityId, photoId, dataURL)
    if (success) {
      // 同步替换到云端：直接调用云端 replacePhoto API 上传替换图
      trySync(async () => {
        const { replacePhoto: cloudReplace } = await import('../api/client.js')
        // 压缩大图
        let base64 = dataURL
        if (base64.length > 1000000) {
          base64 = await compressImage(dataURL)
        }
        const cleanBase64 = base64.replace(/^data:image\/\w+;base64,/, '')
        await cloudReplace(cityId, photoId, cleanBase64, 'jpg')
        console.log(`[云端同步] ${cityId}: 照片 ${photoId} 替换完成`)
      })
      setRefreshKey(k => k + 1)
    }
    // 清空 input 允许重复选择同一文件
    e.target.value = ''
  }, [cityId])

  // 删除照片（本地 + 云端同步删除）
  const handleDelete = useCallback((photoId, e) => {
    e.stopPropagation()
    if (!confirm('确定要删除这张照片吗？')) return
    deletePhoto(cityId, photoId)
    setRefreshKey(k => k + 1)
  }, [cityId])

  // 导入照片到当前城市
  const handleImport = useCallback(async (e) => {
    const files = Array.from(e.target.files || []).filter(f => f.type.startsWith('image/'))
    if (files.length === 0) return

    setImporting(true)
    const saved = []
    for (let i = 0; i < files.length; i++) {
      const dataURL = await fileToDataURL(files[i])
      saved.push({
        id: Date.now() + i,
        src: dataURL,
        title: files[i].name.replace(/\.[^.]+$/, ''),
        desc: '',
        params: '',
        ratio: '3:4'
      })
    }
    savePhotos(cityId, saved)
    // 同步到云端
    syncPhotosToCloud(cityId)
    setRefreshKey(k => k + 1)
    setImporting(false)
    e.target.value = ''
  }, [cityId])

  // ===== Coverflow 交互 =====
  const goTo = useCallback((index) => {
    const total = allPhotos.length
    if (total === 0) return
    const clamped = Math.max(0, Math.min(total - 1, index))
    setCoverflowIndex(clamped)
  }, [allPhotos.length])

  const goPrev = useCallback(() => setCoverflowIndex(i => Math.max(0, i - 1)), [])
  const goNext = useCallback(() => setCoverflowIndex(i => Math.min(allPhotos.length - 1, i + 1)), [allPhotos.length])

  const handleStageWheel = useCallback((e) => {
    e.preventDefault()
    const delta = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX
    // 滚一下走一步，无惯性
    if (delta > 0) setCoverflowIndex(i => Math.min(allPhotos.length - 1, i + 1))
    else if (delta < 0) setCoverflowIndex(i => Math.max(0, i - 1))
  }, [allPhotos.length])

  // 拖拽交互
  const dragRef = useRef({ startX: 0, dragging: false })
  const handleDragStart = useCallback((e) => {
    dragRef.current.startX = e.clientX || e.touches?.[0]?.clientX || 0
    dragRef.current.dragging = true
  }, [])
  const handleDragEnd = useCallback((e) => {
    if (!dragRef.current.dragging) return
    dragRef.current.dragging = false
    const endX = e.clientX || e.changedTouches?.[0]?.clientX || 0
    const diff = dragRef.current.startX - endX
    if (Math.abs(diff) > 40) {
      const steps = Math.abs(diff) > 200 ? 3 : Math.abs(diff) > 100 ? 2 : 1
      if (diff > 0) setCoverflowIndex(i => Math.min(allPhotos.length - 1, i + steps))
      else setCoverflowIndex(i => Math.max(0, i - steps))
    }
  }, [allPhotos.length])

  // 滚轮事件绑定
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    stage.addEventListener('wheel', handleStageWheel, { passive: false })
    return () => stage.removeEventListener('wheel', handleStageWheel)
  }, [handleStageWheel])



  const openViewer = useCallback((index = 0) => {
    setViewerIndex(index)
    setViewerOpen(true)
    document.body.style.overflow = 'hidden'
  }, [])

  const closeViewer = useCallback(() => {
    setViewerOpen(false)
    document.body.style.overflow = ''
  }, [])

  // 更换封面
  const handleCoverChange = useCallback(async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const dataURL = await fileToDataURL(file)
    // 第一次换封面时，把原始封面加入历史
    const currentCustom = getCustomCover(cityId)
    if (!currentCustom && city?.coverImage) {
      setCustomCover(cityId, city.coverImage)
    }
    setCustomCover(cityId, dataURL)
    // 同步封面到云端
    syncSettingsToCloud(cityId)
    setRefreshKey(k => k + 1)
    e.target.value = ''
  }, [cityId, city])

  // 撤回封面
  const handleUndoCover = useCallback((e) => {
    e.stopPropagation()
    undoCover(cityId)
    syncSettingsToCloud(cityId)
    setRefreshKey(k => k + 1)
  }, [cityId])

  // 从相册选封面
  const handleSetCoverFromAlbum = useCallback(async (photoId) => {
    const photo = allPhotos.find(p => p.id === photoId)
    if (!photo) return
    const currentCustom = getCustomCover(cityId)
    if (!currentCustom && city?.coverImage) {
      setCustomCover(cityId, city.coverImage)
    }
    setCustomCover(cityId, photo.src)
    syncSettingsToCloud(cityId)
    setShowAlbumCoverPicker(false)
    setShowCoverPicker(false)
    setRefreshKey(k => k + 1)
  }, [cityId, city, allPhotos])

  // 下载照片
  const handleDownloadPhoto = useCallback((photo, e) => {
    e.stopPropagation()
    const link = document.createElement('a')
    link.href = photo.src
    link.download = `${cityId}_${photo.title || photo.id}.jpg`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }, [cityId])

  // ===== 批量删除弹窗 =====
  const [showBatchModal, setShowBatchModal] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteProgress, setDeleteProgress] = useState('')

  const togglePhotoSelect = (photoId) => {
    setSelectedPhotos(prev => {
      const next = new Set(prev)
      if (next.has(photoId)) next.delete(photoId)
      else next.add(photoId)
      return next
    })
  }

  const batchDelete = async () => {
    if (selectedPhotos.size === 0) return
    if (!confirm(`确定删除选中的 ${selectedPhotos.size} 张照片？`)) return

    setDeleting(true)
    setDeleteProgress('正在删除...')

    try {
      const result = await batchDeletePhotos(
        cityId,
        Array.from(selectedPhotos),
        (deleted, total) => {
          setDeleteProgress(`正在同步到云端... ${deleted}/${total}`)
        }
      )
      syncSettingsToCloud(cityId)
      setSelectedPhotos(new Set())
      setShowBatchModal(false)
      setRefreshKey(k => k + 1)

      if (result.cloud && result.cloud.failed > 0) {
        setDeleteProgress(`完成：${result.cloud.deleted} 张已删除，${result.cloud.failed} 张云端同步失败`)
        setTimeout(() => setDeleteProgress(''), 5000)
      } else {
        setDeleteProgress('')
      }
    } catch (e) {
      setDeleteProgress('删除出错，请重试')
      setTimeout(() => setDeleteProgress(''), 3000)
    } finally {
      setDeleting(false)
    }
  }

  // 批量下载
  const batchDownload = () => {
    if (selectedPhotos.size === 0) return
    const photos = allPhotos.filter(p => selectedPhotos.has(p.id))
    photos.forEach((photo, i) => {
      setTimeout(() => {
        const link = document.createElement('a')
        link.href = photo.src
        link.download = `${cityId}_${photo.title || photo.id}.jpg`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
      }, i * 300)
    })
  }

  // ===== 拖选 =====
  const handleDragSelectStart = (photoId) => {
    const isSelected = selectedPhotos.has(photoId)
    setDragSelectMode(isSelected ? 'deselect' : 'select')
    dragSelectStartRef.current = photoId
    setSelectedPhotos(prev => {
      const next = new Set(prev)
      if (isSelected) next.delete(photoId)
      else next.add(photoId)
      return next
    })
  }

  const handleDragSelectEnter = (photoId) => {
    if (!dragSelectMode) return
    setSelectedPhotos(prev => {
      const next = new Set(prev)
      if (dragSelectMode === 'select') next.add(photoId)
      else next.delete(photoId)
      return next
    })
  }

  const handleDragSelectEnd = () => {
    setDragSelectMode(null)
    dragSelectStartRef.current = null
  }

  // 全局 mouseup 监听
  useEffect(() => {
    if (dragSelectMode) {
      const up = () => handleDragSelectEnd()
      window.addEventListener('mouseup', up)
      return () => window.removeEventListener('mouseup', up)
    }
  }, [dragSelectMode])

  // 监听云端同步完成事件，刷新页面数据
  useEffect(() => {
    const handler = () => setRefreshKey(k => k + 1)
    window.addEventListener('cloud-sync-complete', handler)
    window.addEventListener('storage-init-complete', handler)
    return () => {
      window.removeEventListener('cloud-sync-complete', handler)
      window.removeEventListener('storage-init-complete', handler)
    }
  }, [])

  // 点击外部关闭封面选择下拉
  useEffect(() => {
    if (!showCoverPicker) return
    const close = (e) => {
      if (e.target.closest('.cover-change-wrapper')) return
      setShowCoverPicker(false)
    }
    const timer = setTimeout(() => {
      window.addEventListener('mousedown', close)
    }, 0)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('mousedown', close)
    }
  }, [showCoverPicker])

  // 点击外部关闭照片管理下拉
  useEffect(() => {
    if (!showBatchModal || showBatchModal === 'delete') return
    const close = (e) => {
      if (e.target.closest('.cover-batch-wrapper')) return
      setShowBatchModal(false)
    }
    const timer = setTimeout(() => {
      window.addEventListener('mousedown', close)
    }, 0)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('mousedown', close)
    }
  }, [showBatchModal])

  // 瀑布流网格交叉淡入动画
  // 不使用 IntersectionObserver（与 CSS columns 布局不兼容，会导致部分图片永远不显示）
  // 改用双重 requestAnimationFrame 确保所有图片立即可见 + 触发淡入过渡
  useEffect(() => {
    const items = document.querySelectorAll('.gallery-item')
    if (items.length === 0) return

    let raf2
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        items.forEach(item => item.classList.add('visible'))
      })
    })

    return () => {
      cancelAnimationFrame(raf1)
      if (raf2) cancelAnimationFrame(raf2)
    }
  }, [refreshKey, rangeStart, rangeEnd])

  if (!city) {
    return (
      <div className="city-page">
        <button className="back-btn" onClick={() => navigate('/')}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M13 8H3M3 8L7.5 3.5M3 8L7.5 12.5"
              stroke="currentColor" strokeWidth="1.4"
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          返回首页
        </button>
        <div className="city-page-content">
          <p className="placeholder-text">城市数据加载中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="city-page" style={{ '--city-accent': city.accent, '--city-glow': city.accentGlow }}>

      {/* 返回按钮 */}
      <button className="back-btn" onClick={() => navigate('/')}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M13 8H3M3 8L7.5 3.5M3 8L7.5 12.5"
            stroke="currentColor" strokeWidth="1.4"
            strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        返回首页
      </button>

      {/* ===== 第一层：城市封面区 ===== */}
      <section className="city-cover">
        <div className="city-cover-bg">
          <img src={coverImage} alt="" className="city-cover-img" />
          <div className="city-cover-overlay" />
        </div>

        {/* 更换封面按钮 + 下拉菜单 */}
        <div className="cover-change-wrapper">
          <button className="cover-change-btn" onClick={() => setShowCoverPicker(v => !v)}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M11.5 7.5V11C11.5 11.2761 11.2761 11.5 11 11.5H3C2.72386 11.5 2.5 11.2761 2.5 11V3C2.5 2.72386 2.72386 2.5 3 2.5H6.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              <path d="M9 1.5H13V4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M13 2L8.5 6.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
            更换封面
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ marginLeft: 2, opacity: 0.6 }}>
              <path d="M2.5 3.75L5 6.25L7.5 3.75" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          {showCoverPicker && (
            <div className="cover-picker-dropdown">
              <button className="cover-picker-option" onClick={() => { coverInputRef.current?.click(); setShowCoverPicker(false) }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M11.5 7.5V11C11.5 11.2761 11.2761 11.5 11 11.5H3C2.72386 11.5 2.5 11.2761 2.5 11V3C2.5 2.72386 2.72386 2.5 3 2.5H6.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                  <path d="M9 1.5H13V4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M13 2L8.5 6.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
                外部上传
              </button>
              <button className="cover-picker-option" onClick={() => { setShowAlbumCoverPicker(true); setShowCoverPicker(false) }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <rect x="2" y="2.5" width="10" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
                  <circle cx="5" cy="6" r="1.2" stroke="currentColor" strokeWidth="1"/>
                  <path d="M2 9.5L5 7.5L7 9L10 6.5L12 8.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                从相册选择
              </button>
            </div>
          )}
        </div>
        {coverHistoryCount > 0 && (
          <button className="cover-undo-btn" onClick={handleUndoCover} title="撤回上一张封面">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 5H9.5C10.8807 5 12 6.11929 12 7.5C12 8.88071 10.8807 10 9.5 10H7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M5 3L3 5L5 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            撤回
          </button>
        )}
        <div className="cover-change-wrapper cover-batch-wrapper">
          <button className="cover-batch-btn" onClick={() => setShowBatchModal(v => !v)}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 3.5H12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              <path d="M5 3.5V2.5C5 2.22386 5.22386 2 5.5 2H8.5C8.77614 2 9 2.22386 9 2.5V3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              <path d="M3.5 3.5L4 11.5C4 11.7761 4.22386 12 4.5 12H9.5C9.77614 12 10 11.7761 10 11.5L10.5 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
            照片管理
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ marginLeft: 2, opacity: 0.6 }}>
              <path d="M2.5 3.75L5 6.25L7.5 3.75" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          {showBatchModal && (
            <div className="cover-picker-dropdown">
              <button className="cover-picker-option" onClick={() => { importInputRef.current?.click(); setShowBatchModal(false) }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M7 3V11M3 7H11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
                添加照片
              </button>
              <button className="cover-picker-option" onClick={() => { setShowBatchModal('delete') }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2 3.5H12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                  <path d="M5 3.5V2.5C5 2.22386 5.22386 2 5.5 2H8.5C8.77614 2 9 2.22386 9 2.5V3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                  <path d="M3.5 3.5L4 11.5C4 11.7761 4.22386 12 4.5 12H9.5C9.77614 12 10 11.7761 10 11.5L10.5 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
                管理照片
              </button>
            </div>
          )}
        </div>
        <input
          ref={coverInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleCoverChange}
        />

        <div className="city-cover-content">
          <p className="cover-label">PHOTOGRAPHY COLLECTION</p>
          <h1 className="cover-title">{city.name}<span className="cover-suffix">集</span></h1>
          <p className="cover-en">{city.nameEn}</p>
          <div className="cover-meta">
            <span className="cover-meta-item">{city.date}</span>
            <span className="cover-meta-dot" />
            <span className="cover-meta-item">{allPhotos.length} 张作品</span>
          </div>
          <p className="cover-desc">{city.description}</p>
        </div>
        <div className="cover-scroll-hint">
          <span className="cover-scroll-text">SCROLL</span>
          <span className="cover-scroll-line" />
        </div>
      </section>

      {/* 隐藏的替换文件选择器 */}
      <input
        ref={replaceInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleReplaceFile}
      />
      {/* 隐藏的导入文件选择器 */}
      <input
        ref={importInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={handleImport}
      />

      {/* ===== 第二层：背景模糊照片层 ===== */}
      <div className="city-gallery-bg" aria-hidden="true">
        {allPhotos.slice(0, 3).map((photo, i) => (
          <img
            key={`bg-${photo.id}`}
            className="gallery-bg-img"
            src={photo.src}
            alt=""
            loading="lazy"
            style={i === 1 ? { top: '10%', left: '-10%', width: '60%', height: '60%' } : i === 2 ? { top: '40%', right: '-10%', left: 'auto', width: '50%', height: '50%' } : {}}
          />
        ))}
        <div className="city-gallery-bg-overlay" />
      </div>

      {/* ===== 第三层：Coverflow 3D 轮播画廊 ===== */}
      <section className="city-gallery-coverflow">
        <div className="gallery-header">
          <h2 className="gallery-title">作品集</h2>
          <div className="gallery-header-right">
            <span className="gallery-count">{allPhotos.length} photos</span>
            <button className="gallery-add-btn" onClick={() => importInputRef.current?.click()}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 3V11M3 7H11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              添加
            </button>
          </div>
        </div>

        {/* 3D Stage */}
        <div
          className="coverflow-stage"
          ref={stageRef}
          onMouseDown={handleDragStart}
          onMouseUp={handleDragEnd}
          onTouchStart={handleDragStart}
          onTouchEnd={handleDragEnd}
        >
          {allPhotos.map((photo, index) => {
            const offset = index - coverflowIndex
            const absOffset = Math.abs(offset)

            // 虚拟化窗口：超出可见范围不创建 DOM，160+ -> 约 9 张
            const VISIBLE_RANGE = 4
            if (absOffset > VISIBLE_RANGE) return null

            const isCenter = offset === 0
            const isVisible = absOffset <= 2

            // 3D transform parameters
            const rotateY = offset * -50
            const translateX = offset * 260
            const translateZ = isCenter ? 100 : -100
            const scale = isCenter ? 1 : 0.8 - absOffset * 0.06
            const opacity = isVisible ? (isCenter ? 1 : 0.6 - absOffset * 0.1) : 0
            const zIndex = 100 - absOffset

            // 比例转为 CSS aspect-ratio
            const ratioParts = photo.ratio.split(':')
            const cardAspect = `${ratioParts[0]} / ${ratioParts[1]}`

            return (
              <div
                key={photo.id}
                className={`coverflow-card ${isCenter ? 'is-center' : ''}`}
                style={{
                  transform: `translateX(${translateX}px) translateZ(${translateZ}px) rotateY(${rotateY}deg) scale(${scale})`,
                  opacity: Math.max(0, opacity),
                  zIndex,
                  aspectRatio: cardAspect,
                  height: 'auto',
                  willChange: isVisible ? 'transform, opacity' : 'auto',
                  pointerEvents: isVisible ? 'auto' : 'none',
                }}
                onClick={() => {
                  if (isCenter) openViewer(index)
                  else goTo(index)
                }}
              >
                <div className="coverflow-card-inner">
                  <img
                    src={photo.src}
                    alt={photo.title}
                    className="coverflow-card-img"
                    style={{
                      ...getCropStyle(cityId, photo.id),
                      filter: isCenter ? 'none' : isVisible
                        ? `blur(${absOffset * 5}px) brightness(${0.75 - absOffset * 0.1})`
                        : 'none',
                    }}
                    loading="eager"
                    decoding="async"
                  />
                </div>
                <div className="coverflow-card-shade" />
                <div className="coverflow-card-info">
                  <span className="coverflow-card-title">{photo.title}</span>
                  {photo.params && <span className="coverflow-card-params">{photo.params}</span>}
                  {photo.desc && <span className="coverflow-card-desc">{photo.desc}</span>}
                </div>
                {/* 工具按钮 */}
                <div className="coverflow-card-tools">
                  <button
                    className="gallery-download-btn"
                    style={{ position: 'static', opacity: 1, transform: 'none' }}
                    onClick={(e) => handleDownloadPhoto(photo, e)}
                    title="下载图片"
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M7 2V9.5M7 9.5L4 6.5M7 9.5L10 6.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M2 11.5H12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                    </svg>
                  </button>
                  <button
                    className="gallery-replace-btn"
                    style={{ position: 'static', opacity: 1, transform: 'none' }}
                    onClick={(e) => handleReplaceClick(photo.id, e)}
                    title="替换图片"
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M11.5 7.5V11C11.5 11.2761 11.2761 11.5 11 11.5H3C2.72386 11.5 2.5 11.2761 2.5 11V3C2.5 2.72386 2.72386 2.5 3 2.5H6.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                      <path d="M9 1.5H13V4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M13 2L8.5 6.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                    </svg>
                  </button>
                  <button
                    className="gallery-delete-btn"
                    style={{ position: 'static', opacity: 1, transform: 'none', right: 'auto' }}
                    onClick={(e) => handleDelete(photo.id, e)}
                    title="删除图片"
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M2 3.5H12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                      <path d="M5 3.5V2.5C5 2.22386 5.22386 2 5.5 2H8.5C8.77614 2 9 2.22386 9 2.5V3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                      <path d="M3.5 3.5L4 11.5C4 11.7761 4.22386 12 4.5 12H9.5C9.77614 12 10 11.7761 10 11.5L10.5 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                      <path d="M5.5 6V9.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                      <path d="M8.5 6V9.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                    </svg>
                  </button>
                </div>
                {/* 比例 + 裁剪控制栏 */}
                <div className="coverflow-card-controls">
                  <div className="gallery-ratio-group">
                    <span className="gallery-ctrl-label">比例</span>
                    {['3:4', '4:3', '1:1', '4:5', '2.35:1'].map(r => (
                      <button
                        key={r}
                        className={`gallery-ctrl-opt ${photo.ratio === r ? 'active' : ''}`}
                        onClick={(e) => { e.stopPropagation(); setPhotoRatio(cityId, photo.id, r); syncSettingsToCloud(cityId); setRefreshKey(k => k + 1) }}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                  <div className="gallery-crop-group">
                    <span className="gallery-ctrl-label">裁剪</span>
                    {[
                      { key: 'center', icon: '⊞' },
                      { key: 'top', icon: '⊤' },
                      { key: 'bottom', icon: '⊥' },
                      { key: 'left', icon: '⊣' },
                      { key: 'right', icon: '⊢' },
                    ].map(({ key, icon }) => (
                      <button
                        key={key}
                        className={`gallery-ctrl-opt ${photo.crop === key ? 'active' : ''}`}
                        onClick={(e) => { e.stopPropagation(); setCropPosition(cityId, photo.id, key); syncSettingsToCloud(cityId); setRefreshKey(k => k + 1) }}
                        title={{ center: '居中', top: '靠上', bottom: '靠下', left: '靠左', right: '靠右' }[key]}
                      >
                        {icon}
                      </button>
                    ))}
                    <button
                      className={`gallery-ctrl-opt gallery-ctrl-custom ${typeof photo.crop === 'object' ? 'active' : ''}`}
                      onClick={(e) => { e.stopPropagation(); setCropEditorPhoto(photo) }}
                      title="自定义裁剪位置"
                    >
                      ✦
                    </button>
                  </div>
                </div>
              </div>
            )
          })}

          {/* 左右箭头 */}
          <button
            className="coverflow-nav prev"
            onClick={(e) => { e.stopPropagation(); goPrev() }}
            disabled={coverflowIndex === 0}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M12 5L7 10L12 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            className="coverflow-nav next"
            onClick={(e) => { e.stopPropagation(); goNext() }}
            disabled={coverflowIndex === allPhotos.length - 1}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M8 5L13 10L8 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        {/* 圆点指示器 */}
        <div className="coverflow-dots">
          {allPhotos.map((photo, index) => {
            // 只显示当前 ±1 范围内的圆点，最多3个
            if (Math.abs(index - coverflowIndex) > 1) return null
            return (
              <button
                key={photo.id}
                className={`coverflow-dot ${index === coverflowIndex ? 'active' : ''}`}
                onClick={() => goTo(index)}
                aria-label={photo.title}
              />
            )
          })}
        </div>

        {/* 计数器 */}
        <div className="coverflow-counter">
          <span className="coverflow-counter-current">{String(coverflowIndex + 1).padStart(2, '0')}</span>
          {' '}/{' '}{String(allPhotos.length).padStart(2, '0')}
        </div>

        {/* 缩略图网格 — 点击跳转 */}
        <div className="coverflow-thumbs">
          {allPhotos.slice(0, 10).map((photo, index) => (
            <div
              key={`thumb-${photo.id}`}
              className={`coverflow-thumb ${index === coverflowIndex ? 'active' : ''}`}
              onClick={() => goTo(index)}
            >
              <img
                src={photo.src}
                alt={photo.title}
                className="coverflow-thumb-img"
                style={getCropStyle(cityId, photo.id)}
                loading="lazy"
              />
              <div className="coverflow-thumb-overlay">
                <span className="coverflow-thumb-num">{String(index + 1).padStart(2, '0')}</span>
              </div>
            </div>
          ))}
        </div>

        {/* 缩略图下方：照片区间滑块筛选 */}
        {allPhotos.length > 1 && (
          <div className="range-slider-bar">
            <span className="range-slider-label">
              {Math.floor((rangeStart / 100) * (allPhotos.length - 1)) + 1}
            </span>
            <div className="range-slider-track">
              <div
                className="range-slider-fill"
                style={{ left: `${rangeStart}%`, width: `${rangeEnd - rangeStart}%` }}
              />
              <input
                type="range"
                className="range-slider-input range-slider-min"
                min="0"
                max="100"
                value={rangeStart}
                onChange={(e) => {
                  const v = Number(e.target.value)
                  if (v < rangeEnd) setRangeStart(v)
                }}
              />
              <input
                type="range"
                className="range-slider-input range-slider-max"
                min="0"
                max="100"
                value={rangeEnd}
                onChange={(e) => {
                  const v = Number(e.target.value)
                  if (v > rangeStart) setRangeEnd(v)
                }}
              />
            </div>
            <span className="range-slider-label">
              {Math.ceil((rangeEnd / 100) * (allPhotos.length - 1)) + 1}
            </span>
            {(rangeStart > 0 || rangeEnd < 100) && (
              <button
                className="range-slider-reset"
                onClick={() => { setRangeStart(0); setRangeEnd(100) }}
              >
                重置
              </button>
            )}
          </div>
        )}

        {/* 缩略图下方：原版瀑布流网格画廊 */}
        <div className="gallery-grid">
          {filteredPhotos.map((photo, index) => (
            <div
              key={photo.id}
              className={`gallery-item ratio-${photo.ratio.replace(':', '-').replace('.', '-')}`}
              onClick={() => openViewer(index)}
            >
              <img
                src={photo.src}
                alt={photo.title}
                className="gallery-img"
                style={getCropStyle(cityId, photo.id)}
                onError={(e) => {
                  e.target.style.opacity = '0.3'
                  e.target.style.background = '#1a1a2e'
                }}
              />
              <div className="gallery-item-overlay">
                <span className="gallery-item-title">{photo.title}</span>
                <span className="gallery-item-params">{photo.params}</span>
              </div>
              <button
                className="gallery-replace-btn"
                onClick={(e) => handleReplaceClick(photo.id, e)}
                title="替换图片"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M11.5 7.5V11C11.5 11.2761 11.2761 11.5 11 11.5H3C2.72386 11.5 2.5 11.2761 2.5 11V3C2.5 2.72386 2.72386 2.5 3 2.5H6.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                  <path d="M9 1.5H13V4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M13 2L8.5 6.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
                替换
              </button>
              <button
                className="gallery-delete-btn"
                onClick={(e) => handleDelete(photo.id, e)}
                title="删除图片"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2 3.5H12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                  <path d="M5 3.5V2.5C5 2.22386 5.22386 2 5.5 2H8.5C8.77614 2 9 2.22386 9 2.5V3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                  <path d="M3.5 3.5L4 11.5C4 11.7761 4.22386 12 4.5 12H9.5C9.77614 12 10 11.7761 10 11.5L10.5 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                  <path d="M5.5 6V9.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                  <path d="M8.5 6V9.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
                删除
              </button>
              <button
                className="gallery-download-btn"
                onClick={(e) => handleDownloadPhoto(photo, e)}
                title="下载图片"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M7 2V9.5M7 9.5L4 6.5M7 9.5L10 6.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M2 11.5H12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
                下载
              </button>
              <div className="gallery-controls">
                <div className="gallery-ratio-group">
                  <span className="gallery-ctrl-label">比例</span>
                  {['3:4', '4:3', '1:1', '4:5', '2.35:1'].map(r => (
                    <button
                      key={r}
                      className={`gallery-ctrl-opt ${photo.ratio === r ? 'active' : ''}`}
                      onClick={(e) => { e.stopPropagation(); setPhotoRatio(cityId, photo.id, r); syncSettingsToCloud(cityId); setRefreshKey(k => k + 1) }}
                    >
                      {r}
                    </button>
                  ))}
                </div>
                <div className="gallery-crop-group">
                  <span className="gallery-ctrl-label">裁剪</span>
                  {[
                    { key: 'center', icon: '⊞' },
                    { key: 'top', icon: '⊤' },
                    { key: 'bottom', icon: '⊥' },
                    { key: 'left', icon: '⊣' },
                    { key: 'right', icon: '⊢' },
                  ].map(({ key, icon }) => (
                    <button
                      key={key}
                      className={`gallery-ctrl-opt ${photo.crop === key ? 'active' : ''}`}
                      onClick={(e) => { e.stopPropagation(); setCropPosition(cityId, photo.id, key); syncSettingsToCloud(cityId); setRefreshKey(k => k + 1) }}
                      title={{ center: '居中', top: '靠上', bottom: '靠下', left: '靠左', right: '靠右' }[key]}
                    >
                      {icon}
                    </button>
                  ))}
                  <button
                    className={`gallery-ctrl-opt gallery-ctrl-custom ${typeof photo.crop === 'object' ? 'active' : ''}`}
                    onClick={(e) => { e.stopPropagation(); setCropEditorPhoto(photo) }}
                    title="自定义裁剪位置"
                  >
                    ✦
                  </button>
                </div>
              </div>
            </div>
          ))}

          {/* 导入卡片 */}
          <div
            className="gallery-item gallery-import-card"
            style={{ aspectRatio: '3 / 4' }}
            onClick={() => importInputRef.current?.click()}
          >
            {importing ? (
              <div className="gallery-import-inner importing">
                <div className="gallery-import-spinner" />
                <span>导入中…</span>
              </div>
            ) : (
              <div className="gallery-import-inner">
                <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                  <path d="M16 8V24M8 16H24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <span>添加照片</span>
              </div>
            )}
          </div>
        </div>

      </section>

      {/* ===== 从相册选封面弹窗 ===== */}
      {showAlbumCoverPicker && (
        <div className="batch-modal-overlay" onClick={() => setShowAlbumCoverPicker(false)}>
          <div className="batch-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 700 }}>
            <div className="batch-modal-header">
              <h2 className="batch-modal-title">选择封面照片</h2>
              <span className="batch-modal-count">{allPhotos.length} 张可选</span>
              <button className="batch-modal-close" onClick={() => setShowAlbumCoverPicker(false)}>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M4 4L14 14M14 4L4 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
            <div className="batch-modal-grid" style={{ maxHeight: '70vh' }}>
              {allPhotos.map((photo) => (
                <div
                  key={photo.id}
                  className="batch-thumb"
                  style={{ cursor: 'pointer' }}
                  onClick={() => handleSetCoverFromAlbum(photo.id)}
                >
                  <img src={photo.src} alt={photo.title} className="batch-thumb-img" />
                  <div className="batch-thumb-overlay">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                      <path d="M12 4V20M4 12H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ===== 批量删除弹窗 ===== */}
      {showBatchModal === 'delete' && (
        <div className="batch-modal-overlay" onClick={() => { setShowBatchModal(false); setSelectedPhotos(new Set()) }}>
          <div className="batch-modal" onClick={e => e.stopPropagation()}>
            <div className="batch-modal-header">
              <h2 className="batch-modal-title">管理照片</h2>
              <span className="batch-modal-count">{allPhotos.length} 张照片</span>
              <button className="batch-modal-close" onClick={() => { setShowBatchModal(false); setSelectedPhotos(new Set()) }}>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M4 4L14 14M14 4L4 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            <div className="batch-modal-toolbar">
              <button className="batch-select-all" onClick={() => {
                if (selectedPhotos.size === allPhotos.length) setSelectedPhotos(new Set())
                else setSelectedPhotos(new Set(allPhotos.map(p => p.id)))
              }}>
                {selectedPhotos.size === allPhotos.length ? '取消全选' : '全选'}
              </button>
              {selectedPhotos.size > 0 && (
                <span className="batch-selected-count">已选 {selectedPhotos.size} 张</span>
              )}
              {selectedPhotos.size > 0 && !deleting && (
                <button className="batch-download-btn" onClick={batchDownload}>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M7 2V9.5M7 9.5L4 6.5M7 9.5L10 6.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M2 11.5H12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                  </svg>
                  下载选中
                </button>
              )}
              {selectedPhotos.size > 0 && (
                <button className="batch-delete-btn" onClick={batchDelete} disabled={deleting}>
                  {deleting ? (
                    <>
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="spin">
                        <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.2" strokeDasharray="20 10" strokeLinecap="round"/>
                      </svg>
                      删除中...
                    </>
                  ) : (
                    <>
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M2 3.5H12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                        <path d="M5 3.5V2.5C5 2.22386 5.22386 2 5.5 2H8.5C8.77614 2 9 2.22386 9 2.5V3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                        <path d="M3.5 3.5L4 11.5C4 11.7761 4.22386 12 4.5 12H9.5C9.77614 12 10 11.7761 10 11.5L10.5 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                        <path d="M5.5 6V9.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                        <path d="M8.5 6V9.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                      </svg>
                      删除选中
                    </>
                  )}
                </button>
              )}
              {deleteProgress && (
                <span className="batch-delete-progress">{deleteProgress}</span>
              )}
            </div>

            <div className="batch-modal-grid" onMouseLeave={() => dragSelectMode && handleDragSelectEnd()}>
              {allPhotos.map((photo) => (
                <div
                  key={photo.id}
                  className={`batch-thumb ${selectedPhotos.has(photo.id) ? 'selected' : ''}`}
                  onMouseDown={(e) => { e.preventDefault(); handleDragSelectStart(photo.id) }}
                  onMouseEnter={() => handleDragSelectEnter(photo.id)}
                >
                  <img src={photo.src} alt={photo.title} className="batch-thumb-img" />
                  <div className="batch-thumb-check">
                    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                      <circle cx="11" cy="11" r="10" stroke="currentColor" strokeWidth="1.5"
                        fill={selectedPhotos.has(photo.id) ? 'currentColor' : 'rgba(0,0,0,0.4)'} />
                      {selectedPhotos.has(photo.id) && (
                        <path d="M7 11.5L9.5 14L15 8" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      )}
                    </svg>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ===== 第三层：沉浸浏览入口 ===== */}
      <section className="city-immersive-entry" onClick={() => openViewer(0)}>
        <div className="immersive-entry-glass">
          <div className="immersive-entry-content">
            <div className="immersive-entry-preview">
              <div className="entry-preview-card">
                <div className="entry-preview-text">
                  <span className="entry-preview-label">{city.name}集</span>
                  <span className="entry-preview-title">{allPhotos[0].title}</span>
                  <span className="entry-preview-desc">{allPhotos[0].desc}</span>
                </div>
                <div className="entry-preview-img">
                  <img src={allPhotos[0].src} alt="" />
                </div>
              </div>
            </div>
            <div className="immersive-entry-info">
              <h3 className="entry-info-title">沉浸式浏览</h3>
              <p className="entry-info-desc">点击进入全屏图文模式，左右滑动探索每张作品的故事</p>
              <div className="entry-info-cta">
                <span>开始浏览</span>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M4 9H14M14 9L9.5 4.5M14 9L9.5 13.5"
                    stroke="currentColor" strokeWidth="1.4"
                    strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 底部间距 */}
      <div className="city-page-spacer" />

      {/* ===== 全屏沉浸浏览器 ===== */}
      {viewerOpen && (
        <ImmersiveViewer
          city={city}
          photos={allPhotos}
          initialIndex={viewerIndex}
          onClose={closeViewer}
          onPhotoUpdate={() => setRefreshKey(k => k + 1)}
        />
      )}

      {/* ===== 自定义裁剪编辑器 ===== */}
      {cropEditorPhoto && (
        <CropEditor
          src={cropEditorPhoto.src}
          position={typeof cropEditorPhoto.crop === 'object' ? cropEditorPhoto.crop : { x: 50, y: 50 }}
          ratio={cropEditorPhoto.ratio}
          onCropChange={(pos) => {
            setCropPosition(cityId, cropEditorPhoto.id, pos)
            syncSettingsToCloud(cityId)
            setRefreshKey(k => k + 1)
          }}
          onClose={() => setCropEditorPhoto(null)}
        />
      )}

      {/* ===== 云端同步面板 ===== */}
      <ApiSetupPanel onSyncComplete={() => setRefreshKey(k => k + 1)} />
    </div>
  )
}
