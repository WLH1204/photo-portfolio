// 城市数据 - 占位照片使用 picsum.photos
// 每张照片带有标题、描述、拍摄参数、比例等元数据

// 动态获取 base 路径，适配 GitHub Pages 子路径部署
const BASE = import.meta.env.BASE_URL.replace(/\/$/, '')

export const cityData = {
  zhanjiang: {
    id: 'zhanjiang',
    name: '湛江',
    nameEn: 'Zhanjiang',
    subtitle: '碧海蓝天 · 南国港城',
    date: '2026.03',
    description: '中国大陆最南端的海滨之城，海风与礁石的低语。在这座半岛上，阳光、海水、沙滩构成了一幅流动的画卷，每一帧都带着南国独有的温度。',
    coverImage: `${BASE}/images/hero-bg.jpg`,
    accent: '#22d3ee',
    accentGlow: 'rgba(34, 211, 238, 0.12)',
    gradient: 'linear-gradient(135deg, #0c4a6e 0%, #0e7490 50%, #06b6d4 100%)',
    auroraColors: ['#06b6d4', '#7cff67', '#0e7490'],
    auroraBlend: 0.5,
    auroraAmplitude: 0.8,
    auroraSpeed: 0.6,
    photos: [
      { id: 1, src: 'https://picsum.photos/seed/zj1/800/1200', title: '潮汐之间', desc: '退潮后的礁石群，海藻在阳光下闪烁', params: 'f/8 · 1/250s · ISO 100', ratio: '3:4' },
      { id: 2, src: 'https://picsum.photos/seed/zj2/800/600', title: '渔港晨光', desc: '清晨六点，渔船归港的剪影', params: 'f/5.6 · 1/500s · ISO 200', ratio: '4:3' },
      { id: 3, src: 'https://picsum.photos/seed/zj3/800/800', title: '椰林小道', desc: '热带植物掩映的乡间公路', params: 'f/4 · 1/125s · ISO 400', ratio: '1:1' },
      { id: 4, src: 'https://picsum.photos/seed/zj4/800/1000', title: '南海之眼', desc: '灯塔矗立在海角的最前端', params: 'f/11 · 1/60s · ISO 100', ratio: '4:5' },
      { id: 5, src: 'https://picsum.photos/seed/zj5/800/600', title: '赶海人家', desc: '渔民在浅滩收获的日常', params: 'f/2.8 · 1/1000s · ISO 200', ratio: '4:3' },
      { id: 6, src: 'https://picsum.photos/seed/zj6/800/1200', title: '红树林秘境', desc: '潮间带的红树林根系纠缠', params: 'f/8 · 1/125s · ISO 320', ratio: '3:4' },
      { id: 7, src: 'https://picsum.photos/seed/zj7/800/800', title: '日落金沙湾', desc: '夕阳将整个海湾染成琥珀色', params: 'f/16 · 1/30s · ISO 100', ratio: '1:1' },
      { id: 8, src: 'https://picsum.photos/seed/zj8/800/600', title: '古渡口', desc: '百年老码头的石阶与青苔', params: 'f/5.6 · 1/250s · ISO 200', ratio: '4:3' },
    ]
  },

  kunming: {
    id: 'kunming',
    name: '昆明',
    nameEn: 'Kunming',
    subtitle: '春城花都 · 四季如诗',
    date: '2026.04',
    description: '云贵高原上的永恒春天，花开不败的城市。滇池畔的风带着花香，石林间的光影诉说着亿万年的故事。',
    coverImage: 'https://picsum.photos/seed/kmcover/1920/800',
    accent: '#a3e635',
    accentGlow: 'rgba(163, 230, 53, 0.12)',
    gradient: 'linear-gradient(135deg, #14532d 0%, #15803d 50%, #84cc16 100%)',
    auroraColors: ['#15803d', '#a3e635', '#065f46'],
    auroraBlend: 0.45,
    auroraAmplitude: 0.9,
    auroraSpeed: 0.7,
    photos: [
      { id: 1, src: 'https://picsum.photos/seed/km1/800/1200', title: '滇池鸥影', desc: '冬季红嘴鸥在滇池上空盘旋', params: 'f/4 · 1/2000s · ISO 200', ratio: '3:4' },
      { id: 2, src: 'https://picsum.photos/seed/km2/800/600', title: '翠湖春晓', desc: '翠湖公园的春日午后', params: 'f/5.6 · 1/500s · ISO 100', ratio: '4:3' },
      { id: 3, src: 'https://picsum.photos/seed/km3/800/800', title: '石林迷宫', desc: '喀斯特地貌的鬼斧神工', params: 'f/11 · 1/125s · ISO 100', ratio: '1:1' },
      { id: 4, src: 'https://picsum.photos/seed/km4/800/1000', title: '花市黄昏', desc: '斗南花市的鲜花海洋', params: 'f/2.8 · 1/60s · ISO 800', ratio: '4:5' },
      { id: 5, src: 'https://picsum.photos/seed/km5/800/600', title: '西山龙门', desc: '俯瞰滇池的悬崖石窟', params: 'f/8 · 1/250s · ISO 100', ratio: '4:3' },
      { id: 6, src: 'https://picsum.photos/seed/km6/800/1200', title: '蓝花楹大道', desc: '教场中路的紫色花海', params: 'f/4 · 1/320s · ISO 200', ratio: '3:4' },
    ]
  },

  guiyang: {
    id: 'guiyang',
    name: '贵阳',
    nameEn: 'Guiyang',
    subtitle: '林城山水 · 黔地秘境',
    date: '2026.05',
    description: '山中有城，城中有山，雾霭流转的林城。贵阳的美藏在层叠的绿意里，藏在雨后湿润的空气中。',
    coverImage: 'https://picsum.photos/seed/gycover/1920/800',
    accent: '#cbd5e1',
    accentGlow: 'rgba(203, 213, 225, 0.10)',
    gradient: 'linear-gradient(135deg, #1e293b 0%, #334155 50%, #64748b 100%)',
    auroraColors: ['#475569', '#cbd5e1', '#1e293b'],
    auroraBlend: 0.55,
    auroraAmplitude: 0.7,
    auroraSpeed: 0.5,
    photos: [
      { id: 1, src: 'https://picsum.photos/seed/gy1/800/1200', title: '黔灵晨雾', desc: '黔灵山清晨的薄雾弥漫', params: 'f/5.6 · 1/60s · ISO 400', ratio: '3:4' },
      { id: 2, src: 'https://picsum.photos/seed/gy2/800/600', title: '甲秀楼夜色', desc: '南明河畔的古楼灯火', params: 'f/2.8 · 1/30s · ISO 1600', ratio: '4:3' },
      { id: 3, src: 'https://picsum.photos/seed/gy3/800/800', title: '青岩古巷', desc: '六百年古镇的石板路', params: 'f/4 · 1/125s · ISO 320', ratio: '1:1' },
      { id: 4, src: 'https://picsum.photos/seed/gy4/800/1000', title: '天眼仰望', desc: 'FAST射电望远镜的壮阔', params: 'f/16 · 1/60s · ISO 100', ratio: '4:5' },
      { id: 5, src: 'https://picsum.photos/seed/gy5/800/600', title: '花溪河畔', desc: '大学城旁的溪流与梧桐', params: 'f/2.8 · 1/250s · ISO 200', ratio: '4:3' },
      { id: 6, src: 'https://picsum.photos/seed/gy6/800/1200', title: '梯田之镜', desc: '雨季灌水后的层层梯田', params: 'f/8 · 1/125s · ISO 100', ratio: '3:4' },
      { id: 7, src: 'https://picsum.photos/seed/gy7/800/800', title: '溶洞星河', desc: '地下溶洞的钟乳石奇观', params: 'f/4 · 2s · ISO 800', ratio: '1:1' },
    ]
  },

  liuzhou: {
    id: 'liuzhou',
    name: '柳州',
    nameEn: 'Liuzhou',
    subtitle: '壶城水韵 · 工业记忆',
    date: '2026.06',
    description: '柳江环抱的山水之城，工业与自然的交响。钢铁与柔水在这里找到平衡，螺蛳粉的香气飘散在百里柳江两岸。',
    coverImage: 'https://picsum.photos/seed/lzcover/1920/800',
    accent: '#fbbf24',
    accentGlow: 'rgba(251, 191, 36, 0.12)',
    gradient: 'linear-gradient(135deg, #451a03 0%, #78350f 50%, #d97706 100%)',
    auroraColors: ['#d97706', '#fbbf24', '#78350f'],
    auroraBlend: 0.45,
    auroraAmplitude: 0.85,
    auroraSpeed: 0.65,
    photos: [
      { id: 1, src: 'https://picsum.photos/seed/lz1/800/1200', title: '柳江U弯', desc: '百里柳江的大转弯全景', params: 'f/11 · 1/250s · ISO 100', ratio: '3:4' },
      { id: 2, src: 'https://picsum.photos/seed/lz2/800/600', title: '工业剪影', desc: '柳钢厂区的烟囱与管道', params: 'f/8 · 1/500s · ISO 200', ratio: '4:3' },
      { id: 3, src: 'https://picsum.photos/seed/lz3/800/800', title: '紫荆花海', desc: '春天满城的粉色紫荆', params: 'f/4 · 1/125s · ISO 320', ratio: '1:1' },
      { id: 4, src: 'https://picsum.photos/seed/lz4/800/1000', title: '程阳风雨桥', desc: '侗族木构建筑的精妙', params: 'f/5.6 · 1/60s · ISO 400', ratio: '4:5' },
      { id: 5, src: 'https://picsum.photos/seed/lz5/800/600', title: '窑埠夜市', desc: '螺蛳粉香气弥漫的老街', params: 'f/2.8 · 1/40s · ISO 1600', ratio: '4:3' },
    ]
  }
}
