import { useState, useRef, useCallback, useEffect } from 'react'

// 将比例字符串转为 aspect-ratio CSS 值
function parseRatio(ratioStr) {
  if (!ratioStr) return { w: 3, h: 4 }
  const [w, h] = ratioStr.split(':').map(Number)
  return { w: w || 3, h: h || 4 }
}

// 裁剪编辑器：四边自由拖拽裁剪
// 图片放大1.5倍，拖拽改变 object-position 实现四边裁剪
export default function CropEditor({ src, position, ratio, onCropChange, onClose }) {
  const [pos, setPos] = useState(position) // { x, y } 0-100
  const containerRef = useRef(null)
  const draggingRef = useRef(false)
  const startRef = useRef({ mx: 0, my: 0, ox: 0, oy: 0 })

  const { w, h } = parseRatio(ratio)

  const handlePointerDown = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    draggingRef.current = true
    startRef.current = { mx: e.clientX, my: e.clientY, ox: pos.x, oy: pos.y }
    e.currentTarget.setPointerCapture(e.pointerId)
  }, [pos])

  const handlePointerMove = useCallback((e) => {
    if (!draggingRef.current || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const dx = (e.clientX - startRef.current.mx) / rect.width * 100
    const dy = (e.clientY - startRef.current.my) / rect.height * 100
    const newX = Math.max(0, Math.min(100, startRef.current.ox + dx))
    const newY = Math.max(0, Math.min(100, startRef.current.oy + dy))
    setPos({ x: Math.round(newX * 10) / 10, y: Math.round(newY * 10) / 10 })
  }, [])

  const handlePointerUp = useCallback(() => {
    draggingRef.current = false
  }, [])

  // 确认保存
  const handleSave = useCallback((e) => {
    e.stopPropagation()
    onCropChange(pos)
    onClose()
  }, [pos, onCropChange, onClose])

  // 取消
  const handleCancel = useCallback((e) => {
    e.stopPropagation()
    setPos(position)
    onClose()
  }, [position, onClose])

  // 重置为居中
  const handleReset = useCallback((e) => {
    e.stopPropagation()
    setPos({ x: 50, y: 50 })
  }, [])

  // Esc 关闭
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className="crop-editor" onClick={(e) => e.stopPropagation()}>
      <div className="crop-editor-label">拖拽图片调整裁剪位置</div>
      <div
        className="crop-editor-area"
        ref={containerRef}
        style={{ aspectRatio: `${w} / ${h}` }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <img
          src={src}
          alt=""
          className="crop-editor-img"
          style={{ objectPosition: `${pos.x}% ${pos.y}%` }}
          draggable={false}
        />
        {/* 十字准星 */}
        <div
          className="crop-crosshair"
          style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
        >
          <span className="crop-ch-h" />
          <span className="crop-ch-v" />
          <span className="crop-ch-dot" />
        </div>
        {/* 九宫格参考线 */}
        <div className="crop-grid">
          <span className="crop-grid-h1" />
          <span className="crop-grid-h2" />
          <span className="crop-grid-v1" />
          <span className="crop-grid-v2" />
        </div>
        {/* 拖拽提示 */}
        <div className="crop-drag-hint">⇔ ⇕ 自由拖拽</div>
      </div>
      <div className="crop-editor-footer">
        <div className="crop-editor-pos-group">
          <span className="crop-editor-ratio-badge">{ratio || '3:4'}</span>
          <span className="crop-editor-pos">X: {pos.x}  Y: {pos.y}</span>
        </div>
        <div className="crop-editor-btns">
          <button className="crop-btn-reset" onClick={handleReset}>重置</button>
          <button className="crop-btn-cancel" onClick={handleCancel}>取消</button>
          <button className="crop-btn-save" onClick={handleSave}>确认</button>
        </div>
      </div>
    </div>
  )
}
