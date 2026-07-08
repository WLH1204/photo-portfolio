# Coverflow 3D 轮播性能优化方案

## 概述

用户上传 160+ 张照片后，滑动 coverflow 轮播卡片掉帧卡顿。核心原因是全量渲染所有照片为 DOM 节点 + CSS blur filter 和 will-change 对所有卡片生效。通过虚拟化窗口（只渲染可见卡片）+ 条件化 GPU 属性来解决。

## 当前问题分析

`D:\zhaopian\src\pages\CityPage.jsx` 第 583 行 `allPhotos.map()` 渲染所有 160+ 张照片为 `.coverflow-card`，但只有 `absOffset <= 2` 的 5 张卡片可见（opacity > 0）。

| 问题 | 位置 | 影响 |
|------|------|------|
| 全量渲染 DOM | CityPage.jsx:583 | 160+ 绝对定位节点 + 160+ `<img>` 全部在 DOM |
| blur filter 全开 | CityPage.jsx:623 | 不可见卡片仍计算 `blur()`，GPU 光栅化开销巨大 |
| will-change 全开 | styles.css:3118 | 160+ 卡片各占独立合成层，显存爆炸 |
| transition 0.7s | styles.css:3115 | 切换时 160+ 卡片同时动画 0.7s，掉帧 |
| loading="lazy" | CityPage.jsx:625 | transform 偏移到视口外的图片懒加载不触发，滑动时图片空白 |

## 修改方案

### 修改 1: CityPage.jsx — 虚拟化窗口 + 条件 blur + eager 加载

**文件**: `D:\zhaopian\src\pages\CityPage.jsx` 第 583-627 行

**原理**: 只渲染 `absOffset <= 4` 的卡片（约 9 张），超出返回 `null` 不创建 DOM。可见区 `absOffset <= 2`，缓冲区 `absOffset 3-4` 用于平滑进出动画。只对可见非中心卡片应用 blur filter，窗口内图片 `loading="eager"`。

**修改内容**:

在 `allPhotos.map` 回调开头增加虚拟化过滤:
```jsx
const VISIBLE_RANGE = 4

{allPhotos.map((photo, index) => {
  const offset = index - coverflowIndex
  const absOffset = Math.abs(offset)

  // 虚拟化：超出窗口不创建 DOM
  if (absOffset > VISIBLE_RANGE) return null

  const isCenter = offset === 0
  const isVisible = absOffset <= 2

  // ... transform 计算不变 ...

  // card style 增加:
  willChange: isVisible ? 'transform, opacity' : 'auto',
  pointerEvents: isVisible ? 'auto' : 'none',

  // img filter 条件化:
  filter: isCenter ? 'none' : isVisible
    ? `blur(${absOffset * 5}px) brightness(${0.75 - absOffset * 0.1})`
    : 'none',

  // img loading 改为:
  loading="eager"
  decoding="async"
```

### 修改 2: styles.css — 缩短 transition + 移除全局 will-change + contain

**文件**: `D:\zhaopian\src\styles.css` 第 3109-3121 行 `.coverflow-card`

**修改内容**:
```css
.coverflow-card {
  /* ... 其他属性不变 ... */
  /* 0.7s -> 0.45s，减少并发动画帧 */
  transition: transform 0.45s var(--ease),
              opacity 0.45s var(--ease),
              z-index 0s;
  /* 移除 will-change，改由 JS 内联控制 */
  /* will-change: transform, opacity; */
  /* 隔离布局/样式计算范围 */
  contain: layout style;
}
```

## 假设与决策

1. **VISIBLE_RANGE = 4 而非 2**: 多出 2 张缓冲区卡片确保滑动时卡片从屏幕外滑入而非闪现
2. **保留可见区 blur**: 维持景深感，但只对 absOffset 1-2 的 2 张卡片应用，GPU 开销可忽略
3. **不用 React.memo**: 每张卡片 transform 依赖 coverflowIndex，memo 无法跳过重渲染，虚拟化已把范围从 160+ 缩到 9
4. **transition 0.45s**: 平衡顺滑度和跟手性，`--ease` 是强 ease-out，0.45s 体感足够

## 预期效果

| 指标 | 优化前 | 优化后 |
|------|--------|--------|
| coverflow DOM 节点 | 160+ 卡片 + img | ~9 卡片 + img |
| GPU 合成层 | 160+ | ~5 |
| blur 光栅化卡片 | 160+（含不可见） | 最多 2 |
| 单次滑动并发动画 | 160+ × 0.7s | ~9 × 0.45s |
| 滑动时图片空白 | 有 | 无 |

## 验证步骤

1. `npm run build` 确认编译通过
2. `git push` 部署到 GitHub Pages
3. 在网站上传 160+ 张照片到某个城市
4. 快速滚轮/拖拽滑动 coverflow，确认:
   - 无掉帧，滑动流畅
   - 卡片从屏幕外滑入有过渡，不闪现
   - 图片立即可见，无空白
   - 呼吸动画正常
