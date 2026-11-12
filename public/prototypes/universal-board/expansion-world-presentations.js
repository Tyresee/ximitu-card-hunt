import {
  EXPANSION_WORLD_BOARD_TEMPLATE,
  EXPANSION_WORLD_LANDING_PROFILES,
  EXPANSION_WORLD_LEVEL_PACK,
} from "./expansion-world.js";

export const EXPANSION_WORLD_ZONE_NAMES = Object.freeze({
  "zone-05": "星门浮岛",
  "zone-06": "云鲸航道",
  "zone-07": "极光晶林",
  "zone-08": "月轮遗迹",
});

const presentationDrafts = {
  // Zone 05 · 星门浮岛.
  w2n01: {
    zoneId: "zone-05",
    label: "星门浮岛迎光台",
    teaser: "身后的星门慢慢合拢，前方浮岛却一座接一座亮起。",
    firstCopy: "远征队穿过星门，在云外世界的第一座浮岛安全会合。",
    repeatCopy: "迎光台再次泛起柔光，远征路线仍朝浮岛深处延伸。",
    badge: "云外初抵达",
    visualKind: "star-island-arrival-light-dais",
  },
  w2n02: {
    zoneId: "zone-05",
    label: "流星脚印坡",
    teaser: "银色小脚印沿着坡面升高，最后一枚竟悬在半空。",
    firstCopy: "流星脚印连成一小段星路，指向浮岛上的神秘残图。",
    repeatCopy: "脚印重新闪烁，最后那枚仍在催促大家继续向前。",
    badge: "追随星脚印",
    visualKind: "star-island-meteor-footprint-slope",
  },
  w2n03: {
    zoneId: "zone-05",
    label: "星门残图观测盒",
    teaser: "玻璃盒里漂着一角地图，上面画着从未见过的星门纹章。",
    firstCopy: "星门残图被收入世界图鉴，浮岛的第一项秘密有了名字。",
    repeatCopy: "已收录的星门残图再次投影，纹章边缘仍藏着未解细节。",
    badge: "星门图鉴发现",
    visualKind: "star-island-gate-map-discovery-case",
  },
  w2n04: {
    zoneId: "zone-05",
    label: "双轨星罗盘",
    teaser: "金针指向彗星升降舱，蓝针却追着回声观测塔旋转。",
    firstCopy: "双轨星罗盘展开两条航线：搭彗星快行，或去追远方回声。",
    repeatCopy: "两枚罗盘针再次分开，这次的浮岛路线仍由你决定。",
    badge: "彗星或回声",
    visualKind: "star-island-dual-track-compass",
  },
  w2n05a: {
    zoneId: "zone-05",
    label: "彗尾云币巢",
    teaser: "一枚拖着短短光尾的金币，正在软云窝里绕圈。",
    firstCopy: "彗尾金币停止旋转，轻轻落进了你的探险袋。",
    repeatCopy: "软云窝又孵出一枚彗尾金币，光尾比刚才更亮。",
    badge: "彗尾金币",
    visualKind: "star-island-comet-tail-coin-nest",
  },
  w2n06a: {
    zoneId: "zone-05",
    label: "彗星升降舱",
    teaser: "透明舱门内飘着星屑，顶部轨环正锁定前方落点。",
    firstCopy: "彗星轨环点亮，升降舱载着棋子越过浮岛裂隙稳稳落下。",
    repeatCopy: "熟悉的轨环快速充能，升降舱沿彗尾航线再次前行。",
    badge: "彗轨升空",
    visualKind: "star-island-comet-lift-capsule",
  },
  w2n05b: {
    zoneId: "zone-05",
    label: "回声观测塔",
    teaser: "塔顶的金属耳朵转向远方，接住一串看不见的星际回声。",
    firstCopy: "观测塔把远方回声画成波纹，世界图鉴多了一条声波线索。",
    repeatCopy: "金属耳朵再次转动，熟悉的回声波纹被清楚标亮。",
    badge: "捕捉远方回声",
    visualKind: "star-island-echo-observatory-tower",
  },
  w2n06b: {
    zoneId: "zone-05",
    label: "星芽浮灯",
    teaser: "小浮灯的叶片一开一合，灯芯里藏着一颗刚发芽的星。",
    firstCopy: "星芽完全绽开，一颗新星星从浮灯中升起。",
    repeatCopy: "浮灯再次舒展叶片，又托出一颗温暖的星星。",
    badge: "星芽绽放",
    visualKind: "star-island-starbud-floating-lantern",
  },
  w2n07: {
    zoneId: "zone-05",
    label: "漂移星砂坡",
    teaser: "坡上的星砂逆着风向上流，像在追赶某座移动的岛。",
    firstCopy: "逆风星砂显出浮岛移动的方向，前方道路变得清晰。",
    repeatCopy: "星砂又一次向上漂移，悄悄指向更高处的星环。",
    badge: "逆风星砂",
    visualKind: "star-island-drifting-stardust-slope",
  },
  w2n08: {
    zoneId: "zone-05",
    label: "星环铆钉币",
    teaser: "旧星环缺口里卡着一枚齿边金币，像一颗金色铆钉。",
    firstCopy: "齿边金币从星环中弹出，带着清脆一响进入探险袋。",
    repeatCopy: "星环轻转半圈，另一个缺口又露出一枚铆钉金币。",
    badge: "星环铆钉",
    visualKind: "star-island-ring-rivet-coin",
  },
  w2n09: {
    zoneId: "zone-05",
    label: "彗星软着陆台",
    teaser: "圆形云垫上留着一道新鲜彗尾，边缘还在噗噗冒泡。",
    firstCopy: "云垫接住远征队，彗尾在下一段星路方向停住。",
    repeatCopy: "软着陆台再次弹起，发光彗尾仍指向前方。",
    badge: "彗尾安全落地",
    visualKind: "star-island-comet-soft-landing-pad",
  },
  w2n10: {
    zoneId: "zone-05",
    label: "星座棱镜",
    teaser: "看似空白的天空里，几颗星正等待最后一束折射光。",
    firstCopy: "棱镜转到正确角度，隐藏星线一段段出现在前方。",
    repeatCopy: "棱镜快速对焦，已经发现的星路再次明亮显形。",
    badge: "照亮隐藏星线",
    visualKind: "star-island-constellation-prism",
  },
  w2n11: {
    zoneId: "zone-05",
    label: "倒悬岛影窗",
    teaser: "圆窗里有一座头朝下的浮岛，岛底似乎长着会动的树。",
    firstCopy: "岛影窗调整角度，倒悬树冠露出了一小片神秘轮廓。",
    repeatCopy: "圆窗再次掠过倒悬岛，树影里又闪过一点微光。",
    badge: "倒悬岛一瞥",
    visualKind: "star-island-inverted-isle-view-window",
  },
  w2n12: {
    zoneId: "zone-05",
    label: "双子星蕊",
    teaser: "两片花瓣轮流发亮，中心的星蕊正慢慢变成完整星形。",
    firstCopy: "双子花瓣同时展开，一颗完整星星从花心升起。",
    repeatCopy: "两片花瓣再次合拍，又一颗星星在光中成熟。",
    badge: "双子星花",
    visualKind: "star-island-twin-star-bloom",
  },
  w2n13: {
    zoneId: "zone-05",
    label: "星门锁光阶",
    teaser: "每一级石阶都刻着半枚锁纹，越往上越接近完整图案。",
    firstCopy: "脚下锁纹依次点亮，最高处出现通往云鲸航道的轮廓。",
    repeatCopy: "锁光阶再次逐级发亮，远方鲸影在云后轻轻游动。",
    badge: "云鲸轮廓初现",
    visualKind: "star-island-gate-lock-light-steps",
  },
  w2n14: {
    zoneId: "zone-05",
    label: "云鲸航道远眺台",
    teaser: "浮岛边缘掠过巨大尾鳍，整片云海被划出一道弧线。",
    firstCopy: "远眺台打开视野，下一片云鲸航道完整出现在前方。",
    repeatCopy: "巨大尾鳍再次掠过，航道入口仍在云浪间闪光。",
    badge: "远望云鲸航道",
    visualKind: "star-island-cloud-whale-route-overlook",
  },

  // Zone 06 · 云鲸航道.
  w2n15: {
    zoneId: "zone-06",
    label: "云鲸迎风鳍台",
    teaser: "半透明风鳍随着鲸歌摆动，像在欢迎新来的远征队。",
    firstCopy: "迎风鳍为大家分开云浪，云鲸航道正式展开。",
    repeatCopy: "风鳍再次摆动，柔和鲸歌陪着队伍继续前进。",
    badge: "进入云鲸航道",
    visualKind: "cloud-whale-wind-fin-arrival-dais",
  },
  w2n16: {
    zoneId: "zone-06",
    label: "鲸歌泡泡币",
    teaser: "一枚金币被鲸歌吹进大泡泡，正随着旋律上下跳动。",
    firstCopy: "泡泡啪地打开，鲸歌金币落进了你的探险袋。",
    repeatCopy: "下一段鲸歌又吹来一枚金币，泡泡在掌心轻轻破开。",
    badge: "鲸歌金币",
    visualKind: "cloud-whale-song-bubble-coin",
  },
  w2n17: {
    zoneId: "zone-06",
    label: "云鲸歌谱图鉴台",
    teaser: "石台上的波纹会自己游动，组合成一只小云鲸的轮廓。",
    firstCopy: "一段云鲸歌谱被收入世界图鉴，鲸群的问候有了记录。",
    repeatCopy: "已收录的鲸歌波纹再次游动，尾音里仍藏着远方回应。",
    badge: "鲸歌图鉴发现",
    visualKind: "cloud-whale-song-atlas-dais",
  },
  w2n18: {
    zoneId: "zone-06",
    label: "双潮航向舵",
    teaser: "上层气泡潮通往喷泉，下层鲸歌潮通往发光信标。",
    firstCopy: "双潮航向舵展开两条路线：乘泡泡升空，或回应云鲸信号。",
    repeatCopy: "两股潮流再次分开，新的航向选择已经准备好。",
    badge: "喷泉或信标",
    visualKind: "cloud-whale-dual-tide-route-rudder",
  },
  w2n19a: {
    zoneId: "zone-06",
    label: "喷泉泡轨",
    teaser: "一串泡泡沿着看不见的轨道排队，最大的那颗正在招手。",
    firstCopy: "泡轨依次亮起，前方喷泉的升空节奏清楚显现。",
    repeatCopy: "泡泡重新排好队，最大的那颗再次指向喷泉。",
    badge: "追踪升空泡轨",
    visualKind: "cloud-whale-geyser-bubble-rail",
  },
  w2n20a: {
    zoneId: "zone-06",
    label: "云鲸泡泡喷泉",
    teaser: "巨型泡泡在喷泉口越吹越圆，里面铺着软绵绵的云座。",
    firstCopy: "泡泡喷泉托起棋子，越过鲸背航道后在前方轻轻落下。",
    repeatCopy: "喷泉吐出新的云座泡泡，熟悉的升空航线再次开启。",
    badge: "泡泡越鲸背",
    visualKind: "cloud-whale-bubble-geyser-transport",
  },
  w2n21a: {
    zoneId: "zone-06",
    label: "破浪云币",
    teaser: "鲸背掀起的云浪中央，一枚金币像小冲浪板一样滑行。",
    firstCopy: "破浪金币滑到岸边，带着一圈云花进入探险袋。",
    repeatCopy: "下一道鲸背云浪又送来一枚闪亮的冲浪金币。",
    badge: "鲸背破浪币",
    visualKind: "cloud-whale-wave-rider-coin",
  },
  w2n19b: {
    zoneId: "zone-06",
    label: "云鲸信标",
    teaser: "信标顶端闪着三短一长的光，远处鲸影正准备回应。",
    firstCopy: "远征信号穿过云海，云鲸用发光尾鳍留下新的图鉴印记。",
    repeatCopy: "信标再次发出熟悉节奏，鲸影回以一束温柔尾光。",
    badge: "收到云鲸回应",
    visualKind: "cloud-whale-response-beacon",
  },
  w2n20b: {
    zoneId: "zone-06",
    label: "鲸息星泡",
    teaser: "云鲸呼出的泡泡里卷着星光，每转一圈就更接近星形。",
    firstCopy: "鲸息泡泡轻轻打开，一颗星星从旋涡中心浮出。",
    repeatCopy: "又一枚鲸息泡泡旋转成形，新的星星跃上水面。",
    badge: "鲸息星光",
    visualKind: "cloud-whale-breath-star-bubble",
  },
  w2n21b: {
    zoneId: "zone-06",
    label: "背鳍风洞",
    teaser: "风从两片巨大背鳍之间穿过，吹出像口哨一样的秘密音节。",
    firstCopy: "风洞的音节与鲸歌接在一起，前方云层露出一道窄缝。",
    repeatCopy: "背鳍间再次响起口哨声，云缝随旋律短暂打开。",
    badge: "听见背鳍密语",
    visualKind: "cloud-whale-dorsal-fin-wind-tunnel",
  },
  w2n22: {
    zoneId: "zone-06",
    label: "泡泡穿行窗",
    teaser: "圆形观察窗里，升空泡泡会从鲸影旁一颗颗掠过。",
    firstCopy: "穿行窗记录了泡泡经过的完整弧线和那道巨大鲸影。",
    repeatCopy: "观察窗再次起雾，泡泡航线仍在玻璃上留下亮痕。",
    badge: "看清泡泡航线",
    visualKind: "cloud-whale-bubble-passage-window",
  },
  w2n23: {
    zoneId: "zone-06",
    label: "喷泉落舱币",
    teaser: "落舱云垫中心嵌着一枚泡泡纹金币，边缘还沾着水珠。",
    firstCopy: "泡泡纹金币从云垫弹起，为这次安全落舱留下纪念。",
    repeatCopy: "云垫噗地鼓起，又弹出一枚带水珠的落舱金币。",
    badge: "喷泉落舱纪念",
    visualKind: "cloud-whale-geyser-landing-coin",
  },
  w2n24: {
    zoneId: "zone-06",
    label: "鲸尾云旋梯",
    teaser: "旋梯每转一圈，云层里就会露出一截不同颜色的鲸尾。",
    firstCopy: "云旋梯带大家看见鲸群远去的方向和前方潮汐池。",
    repeatCopy: "旋梯再次转高，新的鲸尾颜色从云层后闪过。",
    badge: "追随鲸尾方向",
    visualKind: "cloud-whale-tail-cloud-spiral-stair",
  },
  w2n25: {
    zoneId: "zone-06",
    label: "云鲸潮汐池",
    teaser: "池中的星潮逆时针旋转，水底似乎藏着一条发光航迹。",
    firstCopy: "星潮旋开云水，通往航道深处的发光轨迹完整显现。",
    repeatCopy: "潮汐池再次转动，已经发现的航迹重新浮到水面。",
    badge: "显出星潮航迹",
    visualKind: "cloud-whale-starlight-tide-pool",
  },
  w2n26: {
    zoneId: "zone-06",
    label: "潮池星涡",
    teaser: "小星星被池边旋涡卷得团团转，却怎么也不会沉下去。",
    firstCopy: "旋涡放慢速度，一颗星星轻盈地跳到了岸边。",
    repeatCopy: "潮池又送来一颗转圈星星，在岸边稳稳停住。",
    badge: "星涡捞取",
    visualKind: "cloud-whale-tidepool-star-vortex",
  },
  w2n27: {
    zoneId: "zone-06",
    label: "远鲸尾迹桥",
    teaser: "前方没有桥栏，只有一条由鲸尾余光铺成的弯弯光带。",
    firstCopy: "尾迹光带稳稳托住道路，尽头出现一片会折射彩光的森林。",
    repeatCopy: "远鲸尾光再次铺开，晶林的颜色比上次更清楚。",
    badge: "鲸尾铺光桥",
    visualKind: "cloud-whale-distant-tailglow-bridge",
  },
  w2n28: {
    zoneId: "zone-06",
    label: "极光晶林寻光台",
    teaser: "云层下方冒出成片晶树尖，树冠把夜色折成七种光。",
    firstCopy: "寻光台标出极光晶林入口，下一片区域在彩光中打开。",
    repeatCopy: "晶树尖再次点亮，通往极光晶林的方向依旧明晰。",
    badge: "远望极光晶林",
    visualKind: "cloud-whale-aurora-grove-lightfinder",
  },

  // Zone 07 · 极光晶林.
  w2n29: {
    zoneId: "zone-07",
    label: "晶林折光门台",
    teaser: "两排晶枝向两侧弯开，每片叶子都映着不同颜色的远征队。",
    firstCopy: "折光门台分开晶枝，大家进入了会随脚步变色的森林。",
    repeatCopy: "晶枝再次让路，熟悉的七色倒影陪队伍深入林间。",
    badge: "踏入极光晶林",
    visualKind: "aurora-grove-refraction-entry-dais",
  },
  w2n30: {
    zoneId: "zone-07",
    label: "七彩种壳币",
    teaser: "透明种壳里包着一枚金币，外圈颜色正一层层轮换。",
    firstCopy: "七彩种壳啪地裂开，晶亮金币滚进探险袋。",
    repeatCopy: "另一枚种壳完成变色，又送出一枚折光金币。",
    badge: "七彩种壳",
    visualKind: "aurora-grove-rainbow-seedcase-coin",
  },
  w2n31: {
    zoneId: "zone-07",
    label: "极光光谱图鉴枝",
    teaser: "一根晶枝把白光拆成七段，每段都藏着不同的林中纹样。",
    firstCopy: "极光光谱被收入世界图鉴，晶林的颜色秘密有了记录。",
    repeatCopy: "已收录的光谱再次展开，最暗那一段仍藏着细小纹样。",
    badge: "晶林图鉴发现",
    visualKind: "aurora-grove-spectrum-atlas-branch",
  },
  w2n32: {
    zoneId: "zone-07",
    label: "棱光双径镜",
    teaser: "镜面一半映出高处望远镜，另一半映出会呼吸的棱晶树。",
    firstCopy: "双径镜分出两条晶林路线：向上观星，或向下寻找光桥树。",
    repeatCopy: "两半镜面再次错开，这一回仍由你选择追哪束光。",
    badge: "观星或寻树",
    visualKind: "aurora-grove-prismatic-dual-path-mirror",
  },
  w2n33a: {
    zoneId: "zone-07",
    label: "棱光望远镜",
    teaser: "镜筒里不是天空，而是一条深入晶林、不断变色的光缝。",
    firstCopy: "望远镜锁定极光深处，一片从未看清的晶林远景显现。",
    repeatCopy: "镜筒重新校准，熟悉远景中又亮起一簇小晶花。",
    badge: "锁定晶林深处",
    visualKind: "aurora-grove-prism-telescope",
  },
  w2n34a: {
    zoneId: "zone-07",
    label: "紫光萤径",
    teaser: "一群紫色光萤只在棋子靠近时出现，排成弯弯的小路。",
    firstCopy: "光萤排成前进箭头，把大家引向望远镜脚架旁。",
    repeatCopy: "紫光萤再次聚拢，这次还画出了一颗小小月牙。",
    badge: "光萤引路",
    visualKind: "aurora-grove-violet-firefly-path",
  },
  w2n35a: {
    zoneId: "zone-07",
    label: "望远镜脚架币",
    teaser: "三脚架最短的那只脚下面，压着一枚棱面金币。",
    firstCopy: "棱面金币从脚架下滑出，把七色光点带进探险袋。",
    repeatCopy: "脚架轻轻换位，另一枚棱面金币从晶苔上露出。",
    badge: "棱面观星币",
    visualKind: "aurora-grove-telescope-tripod-coin",
  },
  w2n33b: {
    zoneId: "zone-07",
    label: "晶根悄声径",
    teaser: "脚下晶根发出很轻的叮咚声，像在互相传递一条秘密。",
    firstCopy: "叮咚声沿晶根传向林底，远处一棵大树随之回应。",
    repeatCopy: "晶根再次低声传讯，大树方向亮起一串微小光点。",
    badge: "聆听晶根密语",
    visualKind: "aurora-grove-whispering-crystal-root-path",
  },
  w2n34b: {
    zoneId: "zone-07",
    label: "棱叶星苞",
    teaser: "六片透明叶子围着一颗星苞，颜色正在叶尖轮流集合。",
    firstCopy: "六片棱叶同时张开，一颗七彩星星从中央升起。",
    repeatCopy: "星苞再次积满颜色，又一颗折光星星成熟了。",
    badge: "棱叶星苞",
    visualKind: "aurora-grove-prism-leaf-starbud",
  },
  w2n35b: {
    zoneId: "zone-07",
    label: "极光棱晶树",
    teaser: "巨大晶树的树心闪着桥形脉络，仿佛正等待一束唤醒光。",
    firstCopy: "棱晶树把极光送入树心，全班共享的极光桥随之苏醒。",
    repeatCopy: "树心再次明亮，已经开启的极光桥被整齐点亮。",
    badge: "唤醒共享光桥",
    visualKind: "aurora-grove-bridge-awakening-prism-tree",
  },
  w2n36: {
    zoneId: "zone-07",
    label: "极光桥岔光台",
    teaser: "常规晶径稳稳向前，旁边的极光桥要在苏醒后才会凝实。",
    firstCopy: "岔光台辨认当前桥光，让可用的前进路线清楚展开。",
    repeatCopy: "桥光状态再次显现，可走的路线仍等待你的选择。",
    badge: "晶径或极光桥",
    visualKind: "aurora-grove-conditional-lightbridge-junction",
  },
  w2n37: {
    zoneId: "zone-07",
    label: "桥头折光币",
    teaser: "桥头水晶把一枚金币映成七枚，只有其中一枚是真的。",
    firstCopy: "你找到了会投下影子的真金币，把它收入探险袋。",
    repeatCopy: "七道金币影子再次旋转，新的真币在彩光里现身。",
    badge: "找到真光币",
    visualKind: "aurora-grove-bridgehead-refraction-coin",
  },
  w2n38: {
    zoneId: "zone-07",
    label: "流光苔阶",
    teaser: "晶苔上的光点会躲开脚步，却在身后拼成月牙形状。",
    firstCopy: "身后的流光拼出完整月牙，下一片遗迹正在前方等待。",
    repeatCopy: "晶苔光点再次汇成月牙，月轮方向变得更亮。",
    badge: "月牙光迹",
    visualKind: "aurora-grove-flowlight-moss-steps",
  },
  w2n39: {
    zoneId: "zone-07",
    label: "极光投影仪",
    teaser: "三片晶镜正在空中对准，中央只差最后一道极光。",
    firstCopy: "极光穿过晶镜，天空投出月轮遗迹的入口和前进航线。",
    repeatCopy: "投影仪再次合光，遗迹入口的标记清楚悬在夜空。",
    badge: "投出遗迹航线",
    visualKind: "aurora-grove-route-aurora-projector",
  },
  w2n40: {
    zoneId: "zone-07",
    label: "北冠星果",
    teaser: "晶枝最高处结着一颗戴光冠的果实，里面有星星在转。",
    firstCopy: "北冠星果轻轻打开，一颗带极光边缘的星星落下。",
    repeatCopy: "高处又成熟一枚星果，新的星星从光冠中跃出。",
    badge: "北冠星果",
    visualKind: "aurora-grove-north-crown-starfruit",
  },
  w2n41: {
    zoneId: "zone-07",
    label: "月轮遗迹夜望台",
    teaser: "森林尽头立着半圈巨大月轮，缺口中有古老光点缓慢转动。",
    firstCopy: "夜望台拨开最后一片晶枝，月轮遗迹完整显现在前方。",
    repeatCopy: "半圈月轮再次升起，遗迹入口仍沿前进方向发光。",
    badge: "远望月轮遗迹",
    visualKind: "aurora-grove-moon-ruins-night-overlook",
  },

  // Zone 08 · 月轮遗迹.
  w2n42: {
    zoneId: "zone-08",
    label: "月轮遗迹入夜台",
    teaser: "脚下月纹会随呼吸明暗，像是遗迹正在确认来访者。",
    firstCopy: "月纹依次亮起，远征队进入古老月轮守护的遗迹。",
    repeatCopy: "入夜台再次点亮，月纹为继续前行打开柔和光路。",
    badge: "进入月轮遗迹",
    visualKind: "moon-ruins-nightfall-entry-dais",
  },
  w2n43: {
    zoneId: "zone-08",
    label: "月纹齿轮币",
    teaser: "石缝里的月牙齿轮每转一格，就露出一点金币边缘。",
    firstCopy: "月牙齿轮转到正确位置，一枚古老金币完整弹出。",
    repeatCopy: "齿轮机关再次咔哒对齐，又推出一枚月纹金币。",
    badge: "月纹齿轮币",
    visualKind: "moon-ruins-crescent-gear-coin",
  },
  w2n44: {
    zoneId: "zone-08",
    label: "月轮碑文图鉴页",
    teaser: "残碑上的符号会在月光下换位置，拼成一扇向前的门。",
    firstCopy: "月轮碑文被收入世界图鉴，古老门符有了完整记录。",
    repeatCopy: "已收录的碑文再次排列，门符后方仍有一笔未解光痕。",
    badge: "遗迹图鉴发现",
    visualKind: "moon-ruins-glyph-atlas-slab",
  },
  w2n45: {
    zoneId: "zone-08",
    label: "月影双刻盘",
    teaser: "日刻指向月钥锻造炉，夜刻指向装满星光的古老石盏。",
    firstCopy: "双刻盘展开两条遗迹路线：锻造月钥，或寻找月桂星盏。",
    repeatCopy: "日夜刻度再次分开，前进路线仍由你亲手选择。",
    badge: "月钥或星盏",
    visualKind: "moon-ruins-daynight-route-dial",
  },
  w2n46a: {
    zoneId: "zone-08",
    label: "月钥锻造炉",
    teaser: "炉膛里没有火，只有一弯月光正把金属慢慢塑成钥匙。",
    firstCopy: "月光锻打完成，一把新钥匙从冷焰中清亮升起。",
    repeatCopy: "锻造炉再次聚拢月光，又一把钥匙在银辉中成形。",
    badge: "月光锻钥",
    visualKind: "moon-ruins-moonkey-forge",
  },
  w2n47a: {
    zoneId: "zone-08",
    label: "银砂回廊",
    teaser: "回廊里的银砂不往下落，反而沿墙壁缓慢爬向前门。",
    firstCopy: "逆行银砂汇成前进箭头，把下一段遗迹道路标亮。",
    repeatCopy: "银砂再次爬上墙面，箭头末端多出一圈门形光环。",
    badge: "银砂向前流",
    visualKind: "moon-ruins-upflow-silver-sand-gallery",
  },
  w2n46b: {
    zoneId: "zone-08",
    label: "月桂星盏",
    teaser: "月桂叶围住的石盏里，一颗星星正像烛火一样摇曳。",
    firstCopy: "月桂叶舒展开来，盏中的星星轻轻飞入材料栏。",
    repeatCopy: "古老石盏再次燃起星光，又一颗星星从叶间升起。",
    badge: "月桂星火",
    visualKind: "moon-ruins-laurel-star-cup",
  },
  w2n47b: {
    zoneId: "zone-08",
    label: "月轮星盘",
    teaser: "缺了一角的星盘仍在转动，每圈都会闪过不同的远方坐标。",
    firstCopy: "古老星盘重新对齐，月轮坐标被清楚收入世界图鉴。",
    repeatCopy: "星盘再次划过银光，已经发现的月轮坐标重新显现。",
    badge: "校准月轮坐标",
    visualKind: "moon-ruins-coordinate-moon-dial",
  },
  w2n48: {
    zoneId: "zone-08",
    label: "缺月拱门",
    teaser: "拱门上缺失的一块月石，会用远处的星光暂时补成完整圆环。",
    firstCopy: "借来的星光补全拱门，前方长廊显出连续的脚印。",
    repeatCopy: "月石缺口再次被星光填满，向前脚印重新出现。",
    badge: "借星补月门",
    visualKind: "moon-ruins-missing-moonstone-arch",
  },
  w2n49: {
    zoneId: "zone-08",
    label: "遗迹巡夜币",
    teaser: "戴着小月帽的守夜石像，掌心托着一枚发暖光的金币。",
    firstCopy: "守夜石像点头致意，把月帽金币交给了远征队。",
    repeatCopy: "石像换了一只手，又托出一枚暖光巡夜金币。",
    badge: "月帽巡夜币",
    visualKind: "moon-ruins-nightwatch-statue-coin",
  },
  w2n50: {
    zoneId: "zone-08",
    label: "前门月尘阶",
    teaser: "每踏上一级，月尘就飞向前方，把一扇更大的门描亮一点。",
    firstCopy: "月尘沿石阶升起，世界前门的完整轮廓终于出现。",
    repeatCopy: "石阶再次扬起月尘，门后的远方光色仍在变化。",
    badge: "世界前门显形",
    visualKind: "moon-ruins-forward-gate-moondust-steps",
  },
  w2n51: {
    zoneId: "zone-08",
    label: "云外世界展廊",
    teaser: "四面展窗分别亮着星门、云鲸、晶林和月轮的发现剪影。",
    firstCopy: "展廊把本世界的图鉴发现依次点亮，远征故事完整亮相。",
    repeatCopy: "四面展窗再次轮播，已发现的世界印记仍熠熠发光。",
    badge: "云外图鉴亮相",
    visualKind: "moon-ruins-beyond-cloud-world-gallery",
  },
  w2n52: {
    zoneId: "zone-08",
    label: "前进月门",
    teaser: "门后浮现的是一片从未到过的天空，道路仍朝更远处延伸。",
    firstCopy: "前进月门开启，远征队穿越到下一片可扩展世界继续旅程。",
    repeatCopy: "月门再次接通远方，新世界的道路继续向前展开。",
    badge: "穿越下一世界",
    visualKind: "moon-ruins-forward-world-portal",
  },
};

const REQUIRED_PRESENTATION_FIELDS = Object.freeze([
  "zoneId",
  "label",
  "teaser",
  "firstCopy",
  "repeatCopy",
  "badge",
  "visualKind",
]);

const WORLD_TWO_NODE_BY_ID = new Map(
  EXPANSION_WORLD_BOARD_TEMPLATE.nodes.map((node) => [node.id, node]),
);

function frozenPresentation(nodeId, draft) {
  const node = WORLD_TWO_NODE_BY_ID.get(nodeId);
  if (!node) throw new Error(`presentation has no expansion-world node: ${nodeId}`);

  const binding = EXPANSION_WORLD_LEVEL_PACK.nodeBindings[nodeId];
  if (!binding) throw new Error(`presentation has no expansion-world binding: ${nodeId}`);

  const profile = EXPANSION_WORLD_LANDING_PROFILES[binding.rewardRef];
  if (!profile) {
    throw new Error(`presentation references an unknown landing profile: ${binding.rewardRef}`);
  }

  for (const field of REQUIRED_PRESENTATION_FIELDS) {
    if (typeof draft?.[field] !== "string" || !draft[field].trim()) {
      throw new Error(`${nodeId}.${field} must be a non-empty string`);
    }
  }
  if (draft.zoneId !== node.zoneId) {
    throw new Error(`${nodeId} presentation must stay in ${node.zoneId}`);
  }

  const zoneName = EXPANSION_WORLD_ZONE_NAMES[draft.zoneId];
  if (!zoneName) throw new Error(`${nodeId} has an unknown zoneId: ${draft.zoneId}`);

  return Object.freeze({
    nodeId,
    zoneId: draft.zoneId,
    zoneName,
    rewardRef: binding.rewardRef,
    semanticType: profile.kind,
    label: draft.label,
    teaser: draft.teaser,
    firstCopy: draft.firstCopy,
    repeatCopy: draft.repeatCopy,
    badge: draft.badge,
    visualKind: draft.visualKind,
  });
}

const boardNodeIds = EXPANSION_WORLD_BOARD_TEMPLATE.nodes
  .map(({ id }) => id)
  .sort();
const presentationNodeIds = Object.keys(presentationDrafts).sort();
if (
  boardNodeIds.length !== presentationNodeIds.length
  || boardNodeIds.some((nodeId, index) => nodeId !== presentationNodeIds[index])
) {
  throw new Error("expansion-world presentations must cover every board node exactly once");
}

export const EXPANSION_WORLD_NODE_PRESENTATIONS = Object.freeze(
  Object.fromEntries(
    Object.entries(presentationDrafts).map(([nodeId, draft]) => [
      nodeId,
      frozenPresentation(nodeId, draft),
    ]),
  ),
);

export function presentationForExpansionNode(nodeId, fallback = null) {
  return EXPANSION_WORLD_NODE_PRESENTATIONS[String(nodeId || "")] || fallback;
}
