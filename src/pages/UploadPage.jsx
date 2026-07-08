import { useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { cityData } from '../data/cityData'
import { appendSinglePhoto, flushPhotos, fileToDataURL, syncPhotosToCloud } from '../utils/photoStorage'

const CITIES = Object.values(cityData).map(c => ({
  id: c.id,
  name: c.name,
  nameEn: c.nameEn,
  accent: c.accent
}))

export default function UploadPage() {
  const navigate = useNavigate()
  const fileInputRef = useRef(null)
  const [files, setFiles] = useState([])
  const [selectedCity, setSelectedCity] = useState('zhanjiang')
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploaded, setUploaded] = useState(false)
  const [uploadError, setUploadError] = useState('')

  // 拖拽处理
  const handleDragOver = useCallback((e) => {
    e.preventDefault()
    setDragging(true)
  }, [])

  const handleDragLeave = useCallback((e) => {
    e.preventDefault()
    setDragging(false)
  }, [])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragging(false)
    const droppedFiles = Array.from(e.dataTransfer.files).filter(f =>
      f.type.startsWith('image/')
    )
    if (droppedFiles.length > 0) {
      addFiles(droppedFiles)
    }
  }, [files])

  // 文件选择处理
  const handleFileSelect = useCallback((e) => {
    const selectedFiles = Array.from(e.target.files)
    if (selectedFiles.length > 0) {
      addFiles(selectedFiles)
    }
    e.target.value = ''
  }, [files])

  const addFiles = (newFiles) => {
    const fileItems = newFiles.map(file => ({
      id: Date.now() + Math.random(),
      file,
      preview: URL.createObjectURL(file),
      title: file.name.replace(/\.[^.]+$/, ''),
      desc: '',
      params: '',
      ratio: '3:4'
    }))
    setFiles(prev => [...prev, ...fileItems])
  }

  const removeFile = (id) => {
    setFiles(prev => {
      const file = prev.find(f => f.id === id)
      if (file) URL.revokeObjectURL(file.preview)
      return prev.filter(f => f.id !== id)
    })
  }

  const updateFileField = (id, field, value) => {
    setFiles(prev => prev.map(f =>
      f.id === id ? { ...f, [field]: value } : f
    ))
  }

  // 上传照片（逐张压缩 + 逐张存入 IndexedDB，避免内存溢出）
  const handleUpload = async () => {
    if (files.length === 0) return

    setUploading(true)
    setUploadProgress(0)
    setUploadError('')

    try {
      for (let i = 0; i < files.length; i++) {
        const fileItem = files[i]

        // 压缩单张照片
        const dataURL = await fileToDataURL(fileItem.file)

        const photoData = {
          id: Date.now() + i,
          src: dataURL,
          title: fileItem.title,
          desc: fileItem.desc,
          params: fileItem.params,
          ratio: fileItem.ratio
        }

        // 立即追加到 IndexedDB，释放内存引用
        appendSinglePhoto(selectedCity, photoData)
        setUploadProgress(Math.round(((i + 1) / files.length) * 100))

        // 让浏览器有时间垃圾回收（特别是前几张）
        if (i % 20 === 0) {
          await new Promise(resolve => setTimeout(resolve, 100))
        }
      }

      // 确保最后一批数据写入 IndexedDB
      flushPhotos()

      // 同步到云端
      syncPhotosToCloud(selectedCity)

      setUploading(false)
      setUploaded(true)
      console.log(`✅ 已保存 ${files.length} 张照片到「${CITIES.find(c => c.id === selectedCity)?.name}」`)
    } catch (e) {
      setUploading(false)
      setUploadError('上传失败，请重试或清理浏览器缓存后再试')
      setTimeout(() => setUploadError(''), 3000)
      console.error('上传出错:', e)
    }

    setTimeout(() => {
      setUploaded(false)
      setFiles([])
    }, 2500)
  }

  return (
    <div className="upload-page">
      {/* 顶部导航 */}
      <header className="upload-header">
        <button className="back-btn" onClick={() => navigate('/')}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M13 8H3M3 8L7.5 3.5M3 8L7.5 12.5"
              stroke="currentColor" strokeWidth="1.4"
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          返回首页
        </button>
        <h1 className="upload-page-title">上传照片</h1>
        <span className="upload-page-badge">管理后台</span>

        {files.length > 0 && (
          <button
            className="upload-header-submit"
            onClick={handleUpload}
            disabled={uploading}
          >
            {uploading ? `上传中 ${uploadProgress}%` : `上传 ${files.length} 张照片`}
          </button>
        )}
      </header>

      <main className="upload-main">
        {/* 城市选择 */}
        <div className="upload-section">
          <label className="upload-label">选择城市</label>
          <div className="upload-city-selector">
            {CITIES.map(city => (
              <button
                key={city.id}
                className={`upload-city-btn ${selectedCity === city.id ? 'active' : ''}`}
                onClick={() => setSelectedCity(city.id)}
                style={{ '--btn-accent': city.accent }}
              >
                <span className="upload-city-name">{city.name}</span>
                <span className="upload-city-en">{city.nameEn}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 拖拽上传区 */}
        <div
          className={`upload-dropzone ${dragging ? 'dragging' : ''} ${files.length > 0 ? 'has-files' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
          <div className="upload-dropzone-icon">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <path d="M24 32V16M24 16L18 22M24 16L30 22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <rect x="8" y="8" width="32" height="32" rx="4" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 4" />
            </svg>
          </div>
          <p className="upload-dropzone-text">拖拽照片到这里，或点击选择文件</p>
          <p className="upload-dropzone-hint">支持 JPG / PNG / WebP，可多选</p>
        </div>

        {/* 已选照片列表 */}
        {files.length > 0 && (
          <div className="upload-section">
            <div className="upload-list-header">
              <label className="upload-label">已选照片 ({files.length} 张)</label>
              <button className="upload-clear-btn" onClick={() => {
                files.forEach(f => URL.revokeObjectURL(f.preview))
                setFiles([])
              }}>
                清空全部
              </button>
            </div>

            <div className="upload-file-list">
              {files.map((item) => (
                <div key={item.id} className="upload-file-card">
                  <div className="upload-file-preview">
                    <img src={item.preview} alt={item.title} />
                  </div>
                  <div className="upload-file-fields">
                    <input
                      className="upload-input"
                      type="text"
                      placeholder="作品标题"
                      value={item.title}
                      onChange={(e) => updateFileField(item.id, 'title', e.target.value)}
                    />
                    <input
                      className="upload-input"
                      type="text"
                      placeholder="描述（可选）"
                      value={item.desc}
                      onChange={(e) => updateFileField(item.id, 'desc', e.target.value)}
                    />
                    <div className="upload-file-row">
                      <input
                        className="upload-input"
                        type="text"
                        placeholder="拍摄参数（如 f/2.8 · 1/125s · ISO 400）"
                        value={item.params}
                        onChange={(e) => updateFileField(item.id, 'params', e.target.value)}
                      />
                      <select
                        className="upload-select"
                        value={item.ratio}
                        onChange={(e) => updateFileField(item.id, 'ratio', e.target.value)}
                      >
                        <option value="3:4">竖版 3:4</option>
                        <option value="4:3">横版 4:3</option>
                        <option value="1:1">方形 1:1</option>
                        <option value="4:5">竖版 4:5</option>
                        <option value="2.35:1">电影 2.35:1</option>
                      </select>
                    </div>
                    <span className="upload-file-size">
                      {item.file.name} · {(item.file.size / 1024 / 1024).toFixed(2)} MB
                    </span>
                  </div>
                  <button className="upload-file-remove" onClick={() => removeFile(item.id)}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>

            {/* 上传按钮 */}
            <div className="upload-actions">
              {uploadError ? (
                <div className="upload-error">
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <circle cx="9" cy="9" r="8" stroke="#ef4444" strokeWidth="1.2"/>
                    <path d="M9 5.5V10M9 12.5V12" stroke="#ef4444" strokeWidth="1.4" strokeLinecap="round"/>
                  </svg>
                  {uploadError}
                </div>
              ) : uploaded ? (
                <div className="upload-success">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M16 5L7.5 14L4 10.5" stroke="#a3e635" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  上传成功
                </div>
              ) : uploading ? (
                <div className="upload-progress-wrapper">
                  <div className="upload-progress-bar">
                    <div className="upload-progress-fill" style={{ width: `${uploadProgress}%` }} />
                  </div>
                  <span className="upload-progress-text">{uploadProgress}%</span>
                </div>
              ) : (
                <button className="upload-submit-btn" onClick={handleUpload}>
                  上传 {files.length} 张照片到 {CITIES.find(c => c.id === selectedCity)?.name}
                </button>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
