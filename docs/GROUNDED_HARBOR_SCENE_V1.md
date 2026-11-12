# 启航海湾贴地场景 v1

- 用户决定：2026-09-23，先完成第一区的地图视觉样板。
- 场景标识：`grounded-harbor.v1`。
- 状态：样板实现与本地验收基线；线上版本以游戏 `/health` 和独立发布记录为准。
- 所有权：ThemePack 与渲染器的纯视觉更新，不新增地图规则或 ImageGen 资产。

## 精确范围

[`packs.js`](../public/prototypes/universal-board/packs.js) 的云港主题
`cloud-harbor@2.1.0` 声明 `scenePresentation`，只匹配
`ximitu-card-hunt-board.v1@2.1.0`，并只选择 `zone-01`。该区共 24 个节点：

```text
n01 n02 n03 n04
n05a n06a n07a n05b n06b n07b
n08 n09 n10
n11a n12a n13a n11b n12b n13b
n14 n15 n16 n17 n18
```

节点所属区域沿用既有节点展示数据，不以新坐标或独立节点表重新判定游戏位置。
其他三个区域、第二世界以及没有该场景声明的主题继续使用原渲染。
历史 `LEGACY_CLOUD_HARBOR_THEME_V2`（`cloud-harbor@2.0.0`）显式去除
`scenePresentation`，不继承后来加入的场景配置。

## 视觉内容

- 普通节点改为低矮的暖灰石板，包含接触阴影和轻微厚度；不增加奖励物或提示。
- 特殊节点沿用当前语义：金币、晶石等以小型物件呈现，其余类型使用石板刻纹；
  设施节点保留对应设施展示，底座与设施更贴近地面。
- 第一区内部道路改为低对比、沙米与绿灰配色的草地石径，保留完整连续路面、
  轻踏石和材料纹理；指定码头边改为木栈道。
- 木路精确映射为 `e01`、`e02`、`e03`、`e04b`、`e05b`。
  这只是材质选择，不新增边、不改变可达性或步数。
- 设施展示节点为 `n03`、`n05b`、`n06a`、`n12b`、`n18`。`n03` 吊机仍只作
  装饰，不恢复已取消的停靠锚，也不补发任何奖励。
- 减少常驻效果徽章：当前特殊节点、路线预览、岔路、已提交移动路线及布局编辑
  选中状态显示必要提示；键盘聚焦和支持鼠标悬停的设备仍可查看节点说明。
- 第一区原有大块区域牌和装饰地标牌隐藏，保留背景中的地点景观和实际设施。

现有分区背景、设施素材和角色素材继续使用，不重画背景、不生成新的 ImageGen 图片。

## 几何与交互边界

道路仍调用同一个 `edgePath(edge)`，两种材质都仅拼接已解析的权威 `d` 字符串。
每种材质使用固定五层 compound path，石径和木路表面宽 29、边沿宽 32，
接触阴影宽 36；纹理使用带独立前缀的 `userSpaceOnUse` 矢量 pattern。
当前路线流光、分岔选择、移动路线和运输预览仍由原渲染器绘制。

只有两端都属于样板区的普通道路进入新材质层。跨区连接保留原表现，云阶条件道路
继续使用原专属渲染及开启条件。布局编辑器调整视觉草稿时，两种材质按照原 edge ID
重新读取同一条路线，不另造路径。

节点交互父组继续使用 `translate(space.x, space.y)`，无障碍名称、交互所有权、
布局编辑命中区与键盘状态仍归原父组。石板和物件只绘制在节点局部原点；新增装饰
均为 `pointer-events="none"`。设施贴地仅调整相对该节点的美术摆放，不改节点坐标、
运输起终点或动画使用的正式移动位置。

完整 `BOARD_TEMPLATE` 拓扑摘要保持为：

```text
a848499f0c3c90a8d6b155115ea6a496b96b7e914351fca0bfce824732a76352
```

节点、边、道路几何、区域范围、布局契约版本及运输目标均未修改，不需要新布局版本。
本次也不修改语音评分、骰面快照、随机概率、奖励、回合顺序或存档结算。

## 实现入口

| 文件 | 作用 |
|---|---|
| [`packs.js`](../public/prototypes/universal-board/packs.js) | 精确棋盘、区域、木路和设施的视觉配置；历史主题隔离 |
| [`app.js`](../public/prototypes/universal-board/app.js) | 区域选择、原路径分组、节点与设施接入、布局编辑同步 |
| [`grounded-route-visuals.js`](../public/prototypes/universal-board/grounded-route-visuals.js) | 石径与木路的矢量纹理及固定道路层 |
| [`grounded-routes.css`](../public/prototypes/universal-board/grounded-routes.css) | 道路材料配色，无新增路线动画 |
| [`grounded-node-visuals.js`](../public/prototypes/universal-board/grounded-node-visuals.js) | 节点局部石板、物件、刻纹 |
| [`grounded-scene.css`](../public/prototypes/universal-board/grounded-scene.css) | 石板与物件样式 |
| [`grounded-scene-integration.css`](../public/prototypes/universal-board/grounded-scene-integration.css) | 常驻提示、区域牌、设施与状态样式 |

## 验证记录

2026-09-23，`npm run verify` 489/489 通过，包括新增 4 项场景测试；既有
断言未放宽。独立审查的道路、节点、布局、编辑器、旧主题与设施回退 47 项通过。
完整拓扑摘要与上述基线一致。

本地真实 Chrome 浏览器仅使用 127.0.0.1:19422 的虚拟学生：

- 正常地图：1、2、8 人；默认桌面、1440×900、1024×768、375×812 检查。
- 完整掷骰、逐格前进、上下分岔、路线高亮、雾笛落点正常；路过信号炮不触发，
  实际骰出 5 步并选择上路后，信号炮运输至前方落点并完成唯一结算。
- 将全部 `board-themes` 图片请求强制返回 404：无美术显示下，分区底色、道路、
  61 个节点及设施 SVG 回退仍可读；继续掷骰、分岔与移动正常。恢复图片后正常显示。
- Chrome DevTools 模拟 `prefers-reduced-motion: reduce`，使用非 `qaFast` 页面
  实测掷骰和分岔；提示过渡的计算时长降为 `0.00001s`。验收后恢复媒体模拟与视口。
- 单人棋盘方向键平移有效，Tab 焦点继续进入原导航；正常资源恢复后无控制台错误。
- 其他主题与旧棋盘的展示隔离由自动化测试覆盖。现有开局逻辑会将无 `nodeSkins`
  的轨道实验站主题回退到云港，因此无图片浏览器验收使用上述完整 404 场景，
  不将主题选择框的选值当作实际无美术主题证据。

本地 fixture 新增的 `LOCAL_GAME_QA=1` 与 `LOCAL_GAME_MISSING_ART=1` 仅供验收，
不进入 `dist/`；模拟结算只接收 fixture 学生 ID，不向正式平台转发写入。
这些检查不构成真人语音评分验证。发布须沿用独立部署脚本及线上健康检查，不能以
本地截图代替线上效果。
