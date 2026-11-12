# 水晶云港北部云瀑修正

用户要求修复石柱上方拱形木桥，并指定经过断口自动跳跃或飞行。

本目录只保存 Board/Theme 2.2.1 的新布局证据。原始选图、2400×1120 母版与四张运行时 JPEG 沿用 `../crystal-v1/` 的原始字节，没有重新生成背景。原版指南与 manifest 不覆盖。

`n15 → n16` 的 e15 是普通一步的视觉飞跃，移除实体木桥与石径；逻辑节点、连接、骰点、最终落点结算和条件云阶保持原规则。飞跃配置属于 Theme，动画跟随 Board 的同一条边，不建立第二套移动路线。

导出：设置 `GAME_ART_SHARP_MODULE` 为已安装 sharp 包路径后运行 `node scripts/export-crystal-harbor-verification.mjs`。图中飞跃线与普通道路应区别显示；最终验收见 manifest。
