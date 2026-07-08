import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useEffect } from 'react'
import HomePage from './pages/HomePage'
import CityPage from './pages/CityPage'
import UploadPage from './pages/UploadPage'
import ApiSetupPanel from './components/ApiSetupPanel'
import { isConfigured, isLoggedIn } from './api/client.js'
import { syncFromCloud, syncPhotosToCloud, initStorage } from './utils/photoStorage'
import { cityData } from './data/cityData'

// 所有城市 ID 自动从 cityData 中提取，新增城市无需手动维护
const ALL_CITY_IDS = Object.keys(cityData)

function App() {
  // 网站加载时自动同步云端数据
  useEffect(() => {
    const autoSync = async () => {
      // 初始化 IndexedDB 存储（从 localStorage 迁移 + 加载缓存）
      await initStorage()
      // 等 1 秒让页面加载完
      await new Promise(r => setTimeout(r, 1000))
      if (isConfigured() && isLoggedIn()) {
        for (const cityId of ALL_CITY_IDS) {
          await syncFromCloud(cityId)
        }
        // 同步完刷新页面数据
        window.dispatchEvent(new Event('cloud-sync-complete'))

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
