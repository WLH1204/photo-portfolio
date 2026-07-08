import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useEffect, useRef } from 'react'
import HomePage from './pages/HomePage'
import CityPage from './pages/CityPage'
import UploadPage from './pages/UploadPage'
import ApiSetupPanel from './components/ApiSetupPanel'
import { isConfigured, isLoggedIn } from './api/client.js'
import { syncFromCloud, syncPhotosToCloud, initStorage } from './utils/photoStorage'
import { cityData } from './data/cityData'

// 所有城市 ID 自动从 cityData 中提取，新增城市无需手动维护
const ALL_CITY_IDS = Object.keys(cityData)

// 同步所有城市：拉取云端数据
async function pullAllCities() {
  if (!isConfigured() || !isLoggedIn()) return
  for (const cityId of ALL_CITY_IDS) {
    await syncFromCloud(cityId)
  }
  window.dispatchEvent(new Event('cloud-sync-complete'))
}

function App() {
  const lastSyncRef = useRef(0)

  // 网站加载时自动同步云端数据
  useEffect(() => {
    const autoSync = async () => {
      // 初始化 IndexedDB 存储（从 localStorage 迁移 + 加载缓存）
      await initStorage()
      window.dispatchEvent(new Event('storage-init-complete'))
      // 等 1 秒让页面加载完
      await new Promise(r => setTimeout(r, 1000))
      if (isConfigured() && isLoggedIn()) {
        await pullAllCities()

        // 后台自动补传未同步的照片（之前上传但云端同步失败/中断的）
        // 等 2 秒后执行，不阻塞页面交互
        setTimeout(() => {
          for (const cityId of ALL_CITY_IDS) {
            syncPhotosToCloud(cityId)
          }
        }, 2000)
      }
    }
    autoSync()
  }, [])

  // 页面从后台切回时自动同步（如从其他设备上传后切回浏览器）
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return
      if (!isConfigured() || !isLoggedIn()) return
      // 距离上次同步至少 30 秒，避免频繁请求
      const now = Date.now()
      if (now - lastSyncRef.current < 30000) return
      lastSyncRef.current = now
      pullAllCities()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/upload" element={<UploadPage />} />
        <Route path="/:cityId" element={<CityPage />} />
      </Routes>
      {/* 全局云端同步面板 - 所有页面都显示 */}
      <ApiSetupPanel />
    </BrowserRouter>
  )
}

export default App
