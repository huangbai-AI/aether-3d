# AETHER — 星际远航局 · Interstellar Voyage Division

**在线体验 → https://huangbai-ai.github.io/aether-3d/**

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
- **双向实时投影**：星环在行星表面的投影（射线-平面求交）、
  行星在星环上的本影（射线-球体遮挡），全部解析计算
- **星环**：环形几何体 + 径向条带噪声，含卡西尼缝
- **小行星带**：620 块实例化岩石（顶点噪声位移），环绕星环面进动
- **彗星**：Line2 拖尾 + 发光头部，随机周期划过
- **跃迁**：滚动速度驱动的径向 zoom blur，快滚时星辰拉成光线
- **星野**：7500 颗点的自定义点精灵着色器，逐星尺寸/相位/色温/闪烁
- **氛围**：星云穹顶 + 彩色辉光团 + 太阳水平眩光条纹
- **锁定框**：HUD 实时将行星世界坐标投影到屏幕空间，目标计算机风味
- **后期**：UnrealBloom → ACES 色调映射 → 跃迁模糊 → 自定义调色 pass
  （边缘色散、暗角、胶片颗粒）；MSAA ×4 + HalfFloat
- **动效**：GSAP ScrollTrigger（字符拆分 reveal、scrub 滑移）、
  磁吸按钮、3D 倾斜卡片、计数器、双语跑马灯、自定义光标
- **排版**：全无衬线体系 — Unbounded / Inter / Space Grotesk / Space Mono

## 调试参数

- `?p=0.5` — 锁定滚动进度（0~1），跳过加载屏，用于截图
- `&noui` — 隐藏 DOM 界面，只看 3D 场景
- `&smoke` — 立即跑一遍真实入场动画路径（冒烟测试）
- `&warp=0.06` — 强制跃迁模糊强度
- `&comet=2` — 立即生成常驻彗星

## 部署

静态文件托管于 GitHub Pages（main 分支根目录）：

```bash
gh repo create aether-3d --public --source=. --push
gh api repos/<owner>/aether-3d/pages -X POST \
  -f "source[branch]=main" -f "source[path]=/"
```

## 文件

```
index.html   结构与文案
styles.css   设计系统（HUD、排版、卡片、加载屏）
main.js      WebGL 场景 + 滚动镜头 + UI 交互
```
