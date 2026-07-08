import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import CityCard from '../components/CityCard'
import { getCityUploadedPhotos } from '../utils/photoStorage'
import { cityData } from '../data/cityData'

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '')

const CITY_IDS = Object.keys(cityData)

const cities = [
  {
    id: 'zhanjiang',
    name: '湛江',
    nameEn: 'Zhanjiang',
    subtitle: '碧海蓝天 · 南国港城',
    index: '01',
    gradient: 'linear-gradient(135deg, #0c4a6e 0%, #0e7490 50%, #06b6d4 100%)',
    accent: '#22d3ee',
    accentGlow: 'rgba(34, 211, 238, 0.15)'
  },
  {
    id: 'kunming',
    name: '昆明',
    nameEn: 'Kunming',
    subtitle: '春城花都 · 四季如诗',
    index: '02',
    gradient: 'linear-gradient(135deg, #14532d 0%, #15803d 50%, #84cc16 100%)',
    accent: '#a3e635',
    accentGlow: 'rgba(163, 230, 53, 0.15)'
  },
  {
    id: 'guiyang',
    name: '贵阳',
    nameEn: 'Guiyang',
    subtitle: '林城山水 · 黔地秘境',
    index: '03',
    gradient: 'linear-gradient(135deg, #1e293b 0%, #334155 50%, #64748b 100%)',
    accent: '#cbd5e1',
    accentGlow: 'rgba(203, 213, 225, 0.12)'
  },
  {
    id: 'liuzhou',
    name: '柳州',
    nameEn: 'Liuzhou',
    subtitle: '壶城水韵 · 工业记忆',
    index: '04',
    gradient: 'linear-gradient(135deg, #451a03 0%, #78350f 50%, #d97706 100%)',
    accent: '#fbbf24',
    accentGlow: 'rgba(251, 191, 36, 0.15)'
  }
]

// Orbit parameters
const ORBIT_RADIUS_X = 290
const ORBIT_RADIUS_Z = 150
const ORBIT_RADIUS_Y = 14
const CARD_GAP = Math.PI / 2
const ROTATION_SPEED = 0.0060

function getCardTransform(rotation, index) {
  const angle = rotation + index * CARD_GAP
  const sinA = Math.sin(angle)
  const cosA = Math.cos(angle)

  const x = sinA * ORBIT_RADIUS_X
  const y = -sinA * ORBIT_RADIUS_Y
  const z = cosA * ORBIT_RADIUS_Z
  const depth = (cosA + 1) / 2

  const scale = 0.4 + 0.6 * depth
  const opacity = 0.35 + 0.65 * depth
  const blur = (1 - depth) * 2
  const rotateY = -sinA * 35
  const zIndex = Math.round(depth * 100)
  const isFront = depth > 0.75

  return { x, y, z, scale, opacity, blur, rotateY, zIndex, isFront }
}

const TRANSITION_DURATION = 800 // ms

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3)
}

export default function HomePage() {
  const [rotation, setRotation] = useState(Math.PI / 4)
  const [paused, setPaused] = useState(false)
  const [syncTick, setSyncTick] = useState(0)
  const rafRef = useRef(null)
  const rotationRef = useRef(Math.PI / 4)
  const pausedRef = useRef(false)
  const transitionRef = useRef(null) // { startVal, endVal, startTime }

  // 动态计算各城市照片数量（静态数据 + 用户上传）
  const cityCounts = useMemo(() => {
    const counts = {}
    for (const cityId of CITY_IDS) {
      const staticCount = (cityData[cityId]?.photos || []).length
      const uploadedCount = (getCityUploadedPhotos(cityId) || []).length
      counts[cityId] = staticCount + uploadedCount
    }
    return counts
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncTick])

  useEffect(() => {
    pausedRef.current = paused
  }, [paused])

  // 监听云端同步完成，强制刷新
  useEffect(() => {
    const handler = () => setSyncTick(t => t + 1)
    window.addEventListener('cloud-sync-complete', handler)
    window.addEventListener('storage-init-complete', handler)
    return () => {
      window.removeEventListener('cloud-sync-complete', handler)
      window.removeEventListener('storage-init-complete', handler)
    }
  }, [])

  useEffect(() => {
    const animate = () => {
      const trans = transitionRef.current
      if (trans) {
        const elapsed = performance.now() - trans.startTime
        const t = Math.min(elapsed / TRANSITION_DURATION, 1)
        const eased = easeOutCubic(t)
        rotationRef.current = trans.startVal + (trans.endVal - trans.startVal) * eased
        setRotation(rotationRef.current)
        if (t >= 1) {
          transitionRef.current = null
        }
      } else if (!pausedRef.current) {
        rotationRef.current += ROTATION_SPEED
        setRotation(rotationRef.current)
      }
      rafRef.current = requestAnimationFrame(animate)
    }
    rafRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  const handleDotClick = useCallback((index) => {
    const target = -index * CARD_GAP
    const current = rotationRef.current
    const twoPi = Math.PI * 2
    // Normalize current to find shortest path
    let diff = target - (current % twoPi)
    if (diff > Math.PI) diff -= twoPi
    if (diff < -Math.PI) diff += twoPi
    const endVal = current + diff
    transitionRef.current = {
      startVal: current,
      endVal,
      startTime: performance.now()
    }
  }, [])

  // Find which card is currently in front
  const frontIndex = Math.round(-rotation / CARD_GAP) % cities.length
  const activeDot = ((frontIndex % cities.length) + cities.length) % cities.length

  return (
    <div className="home-page">
      {/* Background layers */}
      <div className="bg-layer">
        <img src={`${BASE}/images/hero-bg.jpg`} className="bg-img" alt="" />
        <div className="bg-overlay" />
        <div className="bg-noise" />
      </div>

      {/* Header */}
      <header className="site-header">
        <div className="logo">
          <span className="logo-mark" />
          <span className="logo-text">光影行迹</span>
        </div>
        <nav className="site-nav">
          <a href="#" className="nav-link">作品</a>
          <a href="#" className="nav-link">关于</a>
          <Link to="/upload" className="nav-link">管理</Link>
        </nav>
      </header>

      {/* Hero + Orbital Carousel */}
      <main className="hero">
        <div className="hero-text">
          <p className="hero-label">PHOTOGRAPHY PORTFOLIO</p>
          <h1 className="hero-title">光影行迹</h1>
          <div className="hero-line" />
          <p className="hero-subtitle">用镜头记录城市的光影与温度</p>
        </div>

        {/* Orbital Carousel */}
        <div
          className="orbit-stage"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          {/* Central sun glow */}
          <div className="orbit-sun" />

          {/* Orbital arc path */}
          <svg className="orbit-arc" viewBox="0 0 800 300" preserveAspectRatio="xMidYMid meet">
            <ellipse
              cx="400" cy="150"
              rx={ORBIT_RADIUS_X * 0.92} ry="20"
              fill="none"
              stroke="rgba(255,255,255,0.14)"
              strokeWidth="1.2"
              strokeDasharray="4 10"
            />
          </svg>

          {/* Cards */}
          <div className="orbit-track">
            {cities.map((city, index) => {
              const t = getCardTransform(rotation, index)
              return (
                <CityCard
                  key={city.id}
                  city={{ ...city, count: cityCounts[city.id] || 0 }}
                  transform={t}
                  onRotateToFront={() => handleDotClick(index)}
                />
              )
            })}
          </div>
        </div>

        {/* Navigation dots */}
        <div className="orbit-nav">
          {cities.map((city, index) => (
            <button
              key={city.id}
              className={`orbit-dot ${index === activeDot ? 'active' : ''}`}
              onClick={() => handleDotClick(index)}
              aria-label={city.name}
            >
              <span className="orbit-dot-label">{city.name}</span>
            </button>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="site-footer">
        <span className="footer-text">© 2026 光影行迹 · Personal Photography</span>
        <span className="footer-hint">悬停暂停 · 点击进入</span>
      </footer>
    </div>
  )
}
