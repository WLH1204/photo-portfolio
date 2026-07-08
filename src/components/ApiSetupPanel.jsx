import { useState, useCallback } from 'react'
import {
  setApiUrl, getApiUrl, isConfigured, isLoggedIn,
  login, logout
} from '../api/client.js'
import { syncFromCloud } from '../utils/photoStorage'
import { cityData } from '../data/cityData'

const ALL_CITY_IDS = Object.keys(cityData)

// API 设置面板：配置服务器地址 + 登录 + 同步
export default function ApiSetupPanel({ onSyncComplete }) {
  const [url, setUrl] = useState(getApiUrl() || '')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState(
    isLoggedIn() ? 'logged_in' :
    isConfigured() ? 'configured' :
    'unconfigured'
  )
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPanel, setShowPanel] = useState(false)

  // 保存 API 地址
  const handleSaveUrl = useCallback(async () => {
    if (!url.trim()) {
      setMessage('请输入 API 地址')
      return
    }
    setApiUrl(url.trim())
    setStatus('configured')
    setMessage('API 地址已保存')
    setTimeout(() => setMessage(''), 2000)
  }, [url])

  // 同步
  const handleSync = useCallback(async () => {
    setLoading(true)
    setMessage('正在同步…')
    let syncedCount = 0
    let skippedCount = 0
    try {
      for (const cityId of ALL_CITY_IDS) {
        const result = await syncFromCloud(cityId)
        if (result === true) syncedCount++
        else skippedCount++
      }
      if (syncedCount > 0) {
        setMessage(`同步完成（${syncedCount} 个城市）`)
      } else if (skippedCount > 0) {
        setMessage('同步失败，请检查网络连接或 API 配置')
      }
      onSyncComplete?.()
      window.dispatchEvent(new CustomEvent('cloud-sync-complete'))
    } catch (e) {
      setMessage('同步失败: ' + e.message)
    }
    setLoading(false)
  }, [onSyncComplete])

  // 登录
  const handleLogin = useCallback(async () => {
    if (!password.trim()) {
      setMessage('请输入密码')
      return
    }
    setLoading(true)
    setMessage('')
    try {
      const success = await login(password.trim())
      if (success) {
        setStatus('logged_in')
        setMessage('登录成功')
        setPassword('')
        // 自动同步一次
        handleSync()
      } else {
        setMessage('密码错误')
      }
    } catch (e) {
      setMessage('连接失败: ' + e.message)
    }
    setLoading(false)
  }, [password, handleSync])

  // 登出
  const handleLogout = useCallback(() => {
    logout()
    setStatus('configured')
    setMessage('已登出')
  }, [])

  // 如果没有展开按钮，显示一个小齿轮
  if (!showPanel) {
    return (
      <button className="api-trigger-btn" onClick={() => setShowPanel(true)} title="云端同步设置">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M8 10C9.10457 10 10 9.10457 10 8C10 6.89543 9.10457 6 8 6C6.89543 6 6 6.89543 6 8C6 9.10457 6.89543 10 8 10Z" stroke="currentColor" strokeWidth="1.2"/>
          <path d="M13.3 8C13.3 7.7 13.1 7.4 12.8 7.3L11.5 6.8L11.8 5.2C11.8 4.9 11.7 4.7 11.5 4.5L10.5 3.5C10.3 3.3 10.1 3.2 9.8 3.2L8.2 3.5L7.7 2.2C7.6 1.9 7.3 1.7 7 1.7H5C4.7 1.7 4.4 1.9 4.3 2.2L3.8 3.5L2.2 3.2C1.9 3.2 1.7 3.3 1.5 3.5L0.5 4.5C0.3 4.7 0.2 4.9 0.2 5.2L0.5 6.8L-0.8 7.3C-1.1 7.4 -1.3 7.7 -1.3 8C-1.3 8.3 -1.1 8.6 -0.8 8.7L0.5 9.2L0.2 10.8C0.2 11.1 0.3 11.3 0.5 11.5L1.5 12.5C1.7 12.7 1.9 12.8 2.2 12.8L3.8 12.5L4.3 13.8C4.4 14.1 4.7 14.3 5 14.3H7C7.3 14.3 7.6 14.1 7.7 13.8L8.2 12.5L9.8 12.8C10.1 12.8 10.3 12.7 10.5 12.5L11.5 11.5C11.7 11.3 11.8 11.1 11.8 10.8L11.5 9.2L12.8 8.7C13.1 8.6 13.3 8.3 13.3 8Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        {isLoggedIn() && <span className="api-sync-dot" />}
      </button>
    )
  }

  return (
    <div className="api-setup-panel">
      <div className="api-setup-header">
        <span className="api-setup-title">云端同步</span>
        <button className="api-setup-close" onClick={() => setShowPanel(false)}>✕</button>
      </div>

      {/* API 地址 */}
      <div className="api-setup-field">
        <label>服务器地址</label>
        <div className="api-setup-row">
          <input
            type="text"
            className="api-setup-input"
            placeholder="https://xxx.workers.dev"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={isLoggedIn()}
          />
          {!isLoggedIn() && (
            <button className="api-setup-btn-sm" onClick={handleSaveUrl}>保存</button>
          )}
        </div>
      </div>

      {/* 密码登录 */}
      {isConfigured() && !isLoggedIn() && (
        <div className="api-setup-field">
          <label>访问密码</label>
          <div className="api-setup-row">
            <input
              type="password"
              className="api-setup-input"
              placeholder="输入密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            />
            <button
              className="api-setup-btn-sm primary"
              onClick={handleLogin}
              disabled={loading}
            >
              {loading ? '…' : '登录'}
            </button>
          </div>
        </div>
      )}

      {/* 已登录状态 */}
      {isLoggedIn() && (
        <div className="api-setup-actions">
          <button
            className="api-setup-btn full"
            onClick={handleSync}
            disabled={loading}
          >
            {loading ? '同步中…' : '立即同步'}
          </button>
          <button className="api-setup-btn-text" onClick={handleLogout}>
            退出登录
          </button>
        </div>
      )}

      {/* 状态消息 */}
      {message && (
        <div className={`api-setup-msg ${message.includes('失败') || message.includes('错误') ? 'error' : ''}`}>
          {message}
        </div>
      )}
    </div>
  )
}
