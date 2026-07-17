# AETHER — 星际远航局 · Interstellar Voyage Division

一个完全程序化生成的沉浸式 3D 深空网站。没有任何外部美术资源——
行星、大气、星环、卫星、星云、星野全部由 GLSL 着色器实时生成。

![stack](https://img.shields.io/badge/three.js-0.160-black) ![type](https://img.shields.io/badge/type-single--page-blue)

## 运行

需要通过 HTTP 访问（ES Module 限制，不能直接双击 html）：

```bash
cd aether
python3 -m http.server 8797
# 或 npx serve .
```

打开 <http://localhost:8797>

## 体验路线

| 章节 | 镜头 |
|---|---|
| 01 原点 ORIGIN | 远景建立镜头，标题压在行星上 |
| 02 宣言 MANIFESTO | 推近至行星晨昏线 |
| 03 目的地 DESTINATIONS | 绕行至远侧，玻璃航线卡 |
| 04 遥测 TELEMETRY | 升至星环平面上方俯视 |
| 05 启程 DEPARTURE | 大幅拉远，行星归于星海 |

滚动驱动摄像机沿 Catmull-Rom 样条飞行；鼠标视差 + 手持微晃。

## 技术要点

- **行星**：fbm 域扭曲噪声生成大陆/海洋/云层，晨昏线琥珀色带、
  夜面城市光点、青色 fresnel 边缘光、极冠
- **大气**：背面壳层 + 视角 fresnel，仅在地平线处发光
- **星环**：环形几何体 + 径向条带噪声，含卡西尼缝
- **星野**：7500 颗点的自定义点精灵着色器，逐星尺寸/相位/色温/闪烁
- **后期**：UnrealBloom → ACES 色调映射 → 自定义调色 pass
  （边缘色散、暗角、胶片颗粒）；MSAA ×4 + HalfFloat
- **动效**：GSAP ScrollTrigger（字符拆分 reveal、scrub 滑移）、
  磁吸按钮、3D 倾斜卡片、计数器、双语跑马灯、自定义光标
- **排版**：Unbounded / Cormorant Garamond / Space Grotesk / Space Mono

## 调试参数

- `?p=0.5` — 锁定滚动进度（0~1），跳过加载屏，用于截图
- `&noui` — 隐藏 DOM 界面，只看 3D 场景
- `&smoke` — 立即跑一遍真实入场动画路径（冒烟测试）

## 文件

```
index.html   结构与文案
styles.css   设计系统（HUD、排版、卡片、加载屏）
main.js      WebGL 场景 + 滚动镜头 + UI 交互
```
