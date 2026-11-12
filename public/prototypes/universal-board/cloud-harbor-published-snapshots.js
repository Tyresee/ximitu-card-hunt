// Immutable published snapshots captured from ab86b091500351c89a8ee7df93bd405872c89798.
// Do not derive historical geometry or presentation from the current release.
function freezeSnapshot(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freezeSnapshot);
    Object.freeze(value);
  }
  return value;
}

export const LEGACY_BOARD_TEMPLATE_V2 = freezeSnapshot({
  "kind": "BoardTemplate",
  "id": "ximitu-card-hunt-board.v1",
  "version": "2.0.0",
  "title": "云港卡片大搜寻",
  "viewBox": [
    0,
    0,
    1200,
    620
  ],
  "worldSize": {
    "width": 2400,
    "height": 1120
  },
  "zones": [
    {
      "id": "zone-01",
      "bounds": {
        "x": 0,
        "y": 0,
        "width": 1200,
        "height": 620
      }
    },
    {
      "id": "zone-02",
      "bounds": {
        "x": 1200,
        "y": 0,
        "width": 1200,
        "height": 560
      }
    },
    {
      "id": "zone-03",
      "bounds": {
        "x": 1200,
        "y": 560,
        "width": 1200,
        "height": 560
      }
    },
    {
      "id": "zone-04",
      "bounds": {
        "x": 0,
        "y": 560,
        "width": 1200,
        "height": 560
      }
    }
  ],
  "artRegions": [
    {
      "id": "region-zone-01",
      "zoneId": "zone-01",
      "layoutContractRef": "board.ximitu-card-hunt.zone-01-layout.v2",
      "artBox": {
        "x": 0,
        "y": 0,
        "width": 1200,
        "height": 620
      },
      "clipPath": "M 8 44 Q 8 8 44 8 H 1156 Q 1192 8 1192 44 V 576 Q 1192 612 1156 612 H 44 Q 8 612 8 576 Z",
      "transitionPaths": [
        "M 1162 0 H 1240 V 640 H 1160 C 1198 592 1138 548 1168 500 C 1204 454 1138 408 1168 360 C 1202 312 1142 268 1170 220 C 1202 174 1148 126 1174 80 C 1194 46 1158 24 1162 0 Z",
        "M 0 566 C 92 540 174 592 270 564 C 366 536 448 598 550 568 C 648 540 732 594 834 566 C 936 538 1032 592 1200 558 V 650 H 0 Z"
      ]
    },
    {
      "id": "region-zone-02",
      "zoneId": "zone-02",
      "artBox": {
        "x": 1200,
        "y": 0,
        "width": 1200,
        "height": 560
      },
      "clipPath": "M 1208 44 Q 1208 8 1244 8 H 2356 Q 2392 8 2392 44 V 516 Q 2392 552 2356 552 H 1244 Q 1208 552 1208 516 Z"
    },
    {
      "id": "region-zone-03",
      "zoneId": "zone-03",
      "artBox": {
        "x": 1200,
        "y": 560,
        "width": 1200,
        "height": 560
      },
      "clipPath": "M 1208 604 Q 1208 568 1244 568 H 2356 Q 2392 568 2392 604 V 1076 Q 2392 1112 2356 1112 H 1244 Q 1208 1112 1208 1076 Z"
    },
    {
      "id": "region-zone-04",
      "zoneId": "zone-04",
      "artBox": {
        "x": 0,
        "y": 560,
        "width": 1200,
        "height": 560
      },
      "clipPath": "M 8 604 Q 8 568 44 568 H 1156 Q 1192 568 1192 604 V 1076 Q 1192 1112 1156 1112 H 44 Q 8 1112 8 1076 Z"
    }
  ],
  "entry": {
    "id": "main",
    "nodeId": "n01"
  },
  "exits": [
    {
      "id": "forward",
      "nodeId": "n49",
      "transitionProfileRef": "world.portal.forward.v1"
    }
  ],
  "startNodeId": "n01",
  "nodes": [
    {
      "id": "n01",
      "x": 80,
      "y": 520,
      "spaceRole": "learning"
    },
    {
      "id": "n02",
      "x": 160,
      "y": 525,
      "spaceRole": "reward"
    },
    {
      "id": "n03",
      "x": 240,
      "y": 490,
      "spaceRole": "item",
      "itemRef": "harbor.mooring-anchor.v1"
    },
    {
      "id": "n04",
      "x": 315,
      "y": 435,
      "spaceRole": "junction"
    },
    {
      "id": "n05a",
      "x": 380,
      "y": 350,
      "spaceRole": "learning"
    },
    {
      "id": "n06a",
      "x": 465,
      "y": 300,
      "spaceRole": "transport",
      "transportProfileRef": "jump.launcher.v1",
      "transportTargetId": "n09",
      "transportCaptureNodeIds": [
        "n08"
      ]
    },
    {
      "id": "n07a",
      "x": 550,
      "y": 335,
      "spaceRole": "reward"
    },
    {
      "id": "n05b",
      "x": 375,
      "y": 505,
      "spaceRole": "map-effect",
      "mapEffectRef": "harbor.foghorn.v1"
    },
    {
      "id": "n06b",
      "x": 465,
      "y": 540,
      "spaceRole": "learning"
    },
    {
      "id": "n07b",
      "x": 555,
      "y": 500,
      "spaceRole": "treasure"
    },
    {
      "id": "n08",
      "x": 635,
      "y": 410,
      "spaceRole": "learning"
    },
    {
      "id": "n09",
      "x": 705,
      "y": 345,
      "spaceRole": "reward"
    },
    {
      "id": "n10",
      "x": 770,
      "y": 280,
      "spaceRole": "junction"
    },
    {
      "id": "n11a",
      "x": 835,
      "y": 205,
      "spaceRole": "learning"
    },
    {
      "id": "n12a",
      "x": 920,
      "y": 165,
      "spaceRole": "treasure"
    },
    {
      "id": "n13a",
      "x": 1000,
      "y": 210,
      "spaceRole": "learning"
    },
    {
      "id": "n11b",
      "x": 845,
      "y": 340,
      "spaceRole": "item"
    },
    {
      "id": "n12b",
      "x": 930,
      "y": 390,
      "spaceRole": "map-effect",
      "mapEffectRef": "harbor.cloudfall-gate.v1"
    },
    {
      "id": "n13b",
      "x": 1010,
      "y": 350,
      "spaceRole": "learning"
    },
    {
      "id": "n14",
      "x": 1070,
      "y": 285,
      "spaceRole": "learning"
    },
    {
      "id": "n15",
      "x": 1120,
      "y": 225,
      "spaceRole": "reward"
    },
    {
      "id": "n16",
      "x": 1140,
      "y": 165,
      "spaceRole": "learning"
    },
    {
      "id": "n17",
      "x": 1080,
      "y": 115,
      "spaceRole": "learning"
    },
    {
      "id": "n18",
      "x": 1135,
      "y": 65,
      "spaceRole": "learning"
    },
    {
      "id": "n19",
      "x": 1240,
      "y": 90,
      "spaceRole": "item"
    },
    {
      "id": "n20",
      "x": 1340,
      "y": 125,
      "spaceRole": "reward"
    },
    {
      "id": "n21",
      "x": 1450,
      "y": 175,
      "spaceRole": "junction"
    },
    {
      "id": "n22a",
      "x": 1550,
      "y": 115,
      "spaceRole": "learning"
    },
    {
      "id": "n23a",
      "x": 1665,
      "y": 100,
      "spaceRole": "treasure"
    },
    {
      "id": "n24a",
      "x": 1775,
      "y": 150,
      "spaceRole": "activity"
    },
    {
      "id": "n22b",
      "x": 1535,
      "y": 235,
      "spaceRole": "learning"
    },
    {
      "id": "n23b",
      "x": 1645,
      "y": 275,
      "spaceRole": "learning"
    },
    {
      "id": "n24b",
      "x": 1770,
      "y": 245,
      "spaceRole": "item"
    },
    {
      "id": "n25",
      "x": 1875,
      "y": 195,
      "spaceRole": "learning"
    },
    {
      "id": "n26",
      "x": 1980,
      "y": 250,
      "spaceRole": "reward"
    },
    {
      "id": "n27",
      "x": 2075,
      "y": 325,
      "spaceRole": "learning"
    },
    {
      "id": "n28",
      "x": 2150,
      "y": 410,
      "spaceRole": "treasure"
    },
    {
      "id": "n29",
      "x": 2175,
      "y": 510,
      "spaceRole": "junction"
    },
    {
      "id": "n30a",
      "x": 2070,
      "y": 565,
      "spaceRole": "learning"
    },
    {
      "id": "n31a",
      "x": 1980,
      "y": 630,
      "spaceRole": "activity"
    },
    {
      "id": "n32a",
      "x": 1910,
      "y": 710,
      "spaceRole": "reward"
    },
    {
      "id": "n30b",
      "x": 2250,
      "y": 610,
      "spaceRole": "item"
    },
    {
      "id": "n31b",
      "x": 2280,
      "y": 710,
      "spaceRole": "learning"
    },
    {
      "id": "n32b",
      "x": 2200,
      "y": 785,
      "spaceRole": "treasure"
    },
    {
      "id": "n33",
      "x": 2070,
      "y": 810,
      "spaceRole": "learning"
    },
    {
      "id": "n34",
      "x": 1950,
      "y": 860,
      "spaceRole": "transport",
      "transportProfileRef": "jump.launcher.v1",
      "transportTargetId": "n37"
    },
    {
      "id": "n35",
      "x": 1835,
      "y": 825,
      "spaceRole": "reward"
    },
    {
      "id": "n36",
      "x": 1720,
      "y": 800,
      "spaceRole": "learning"
    },
    {
      "id": "n37",
      "x": 1605,
      "y": 825,
      "spaceRole": "activity"
    },
    {
      "id": "n38",
      "x": 1500,
      "y": 865,
      "spaceRole": "item"
    },
    {
      "id": "n39",
      "x": 1385,
      "y": 910,
      "spaceRole": "learning"
    },
    {
      "id": "n40",
      "x": 1260,
      "y": 945,
      "spaceRole": "treasure"
    },
    {
      "id": "n41",
      "x": 1125,
      "y": 925,
      "spaceRole": "learning"
    },
    {
      "id": "n42",
      "x": 985,
      "y": 890,
      "spaceRole": "reward"
    },
    {
      "id": "n43",
      "x": 840,
      "y": 905,
      "spaceRole": "learning"
    },
    {
      "id": "n44",
      "x": 700,
      "y": 940,
      "spaceRole": "treasure"
    },
    {
      "id": "n45",
      "x": 560,
      "y": 915,
      "spaceRole": "reward"
    },
    {
      "id": "n46",
      "x": 430,
      "y": 865,
      "spaceRole": "activity"
    },
    {
      "id": "n47",
      "x": 310,
      "y": 800,
      "spaceRole": "learning"
    },
    {
      "id": "n48",
      "x": 200,
      "y": 710,
      "spaceRole": "reward"
    },
    {
      "id": "n49",
      "x": 115,
      "y": 620,
      "spaceRole": "portal"
    }
  ],
  "edges": [
    {
      "id": "e01",
      "from": "n01",
      "to": "n02"
    },
    {
      "id": "e02",
      "from": "n02",
      "to": "n03"
    },
    {
      "id": "e03",
      "from": "n03",
      "to": "n04"
    },
    {
      "id": "e04a",
      "from": "n04",
      "to": "n05a",
      "order": 0
    },
    {
      "id": "e04b",
      "from": "n04",
      "to": "n05b",
      "order": 1
    },
    {
      "id": "e05a",
      "from": "n05a",
      "to": "n06a"
    },
    {
      "id": "e06a",
      "from": "n06a",
      "to": "n07a"
    },
    {
      "id": "e05b",
      "from": "n05b",
      "to": "n06b"
    },
    {
      "id": "e06b",
      "from": "n06b",
      "to": "n07b"
    },
    {
      "id": "e07a",
      "from": "n07a",
      "to": "n08"
    },
    {
      "id": "e07b",
      "from": "n07b",
      "to": "n08"
    },
    {
      "id": "e08",
      "from": "n08",
      "to": "n09"
    },
    {
      "id": "e09",
      "from": "n09",
      "to": "n10"
    },
    {
      "id": "e10a",
      "from": "n10",
      "to": "n11a",
      "order": 0
    },
    {
      "id": "e10b",
      "from": "n10",
      "to": "n11b",
      "order": 1
    },
    {
      "id": "e11a",
      "from": "n11a",
      "to": "n12a"
    },
    {
      "id": "e12a",
      "from": "n12a",
      "to": "n13a"
    },
    {
      "id": "e11b",
      "from": "n11b",
      "to": "n12b"
    },
    {
      "id": "e12b",
      "from": "n12b",
      "to": "n13b"
    },
    {
      "id": "e13a",
      "from": "n13a",
      "to": "n14"
    },
    {
      "id": "e13b",
      "from": "n13b",
      "to": "n14"
    },
    {
      "id": "e14",
      "from": "n14",
      "to": "n15",
      "order": 0
    },
    {
      "id": "e14c",
      "from": "n14",
      "to": "n17",
      "order": 1,
      "terrainType": "cloud-stair",
      "availableWhen": {
        "stateKey": "cloudRouteOpen",
        "equals": true
      },
      "pathData": "M 1070 285 C 1125 250 1122 214 1091 191 C 1059 168 1058 137 1080 115"
    },
    {
      "id": "e15",
      "from": "n15",
      "to": "n16"
    },
    {
      "id": "e16",
      "from": "n16",
      "to": "n17"
    },
    {
      "id": "e17",
      "from": "n17",
      "to": "n18"
    },
    {
      "id": "e18",
      "from": "n18",
      "to": "n19"
    },
    {
      "id": "e19",
      "from": "n19",
      "to": "n20"
    },
    {
      "id": "e20",
      "from": "n20",
      "to": "n21"
    },
    {
      "id": "e21a",
      "from": "n21",
      "to": "n22a",
      "order": 0
    },
    {
      "id": "e21b",
      "from": "n21",
      "to": "n22b",
      "order": 1
    },
    {
      "id": "e22a",
      "from": "n22a",
      "to": "n23a"
    },
    {
      "id": "e23a",
      "from": "n23a",
      "to": "n24a"
    },
    {
      "id": "e24a",
      "from": "n24a",
      "to": "n25"
    },
    {
      "id": "e22b",
      "from": "n22b",
      "to": "n23b"
    },
    {
      "id": "e23b",
      "from": "n23b",
      "to": "n24b"
    },
    {
      "id": "e24b",
      "from": "n24b",
      "to": "n25"
    },
    {
      "id": "e25",
      "from": "n25",
      "to": "n26"
    },
    {
      "id": "e26",
      "from": "n26",
      "to": "n27"
    },
    {
      "id": "e27",
      "from": "n27",
      "to": "n28"
    },
    {
      "id": "e28",
      "from": "n28",
      "to": "n29"
    },
    {
      "id": "e29a",
      "from": "n29",
      "to": "n30a",
      "order": 0
    },
    {
      "id": "e29b",
      "from": "n29",
      "to": "n30b",
      "order": 1
    },
    {
      "id": "e30a",
      "from": "n30a",
      "to": "n31a"
    },
    {
      "id": "e31a",
      "from": "n31a",
      "to": "n32a"
    },
    {
      "id": "e32a",
      "from": "n32a",
      "to": "n33"
    },
    {
      "id": "e30b",
      "from": "n30b",
      "to": "n31b"
    },
    {
      "id": "e31b",
      "from": "n31b",
      "to": "n32b"
    },
    {
      "id": "e32b",
      "from": "n32b",
      "to": "n33"
    },
    {
      "id": "e33",
      "from": "n33",
      "to": "n34"
    },
    {
      "id": "e34",
      "from": "n34",
      "to": "n35"
    },
    {
      "id": "e35",
      "from": "n35",
      "to": "n36"
    },
    {
      "id": "e36",
      "from": "n36",
      "to": "n37"
    },
    {
      "id": "e37",
      "from": "n37",
      "to": "n38"
    },
    {
      "id": "e38",
      "from": "n38",
      "to": "n39"
    },
    {
      "id": "e39",
      "from": "n39",
      "to": "n40"
    },
    {
      "id": "e40",
      "from": "n40",
      "to": "n41"
    },
    {
      "id": "e41",
      "from": "n41",
      "to": "n42"
    },
    {
      "id": "e42",
      "from": "n42",
      "to": "n43"
    },
    {
      "id": "e43",
      "from": "n43",
      "to": "n44"
    },
    {
      "id": "e44",
      "from": "n44",
      "to": "n45"
    },
    {
      "id": "e45",
      "from": "n45",
      "to": "n46"
    },
    {
      "id": "e46",
      "from": "n46",
      "to": "n47"
    },
    {
      "id": "e47",
      "from": "n47",
      "to": "n48"
    },
    {
      "id": "e48",
      "from": "n48",
      "to": "n49"
    }
  ]
});

export const LEGACY_CLOUD_HARBOR_THEME_V2 = freezeSnapshot({
  "kind": "ThemePack",
  "id": "cloud-harbor",
  "version": "2.0.0",
  "title": "云港探险",
  "palette": {
    "page": "#e8f8ef",
    "terrain": "#fff8dc",
    "route": "#d8e9df",
    "ink": "#0d2857",
    "primary": "#ffd84a",
    "secondary": "#69d6a3",
    "accent": "#8b75ff"
  },
  "zoneNames": {
    "zone-01": "启航海湾",
    "zone-02": "风帆高地",
    "zone-03": "彩虹峡谷",
    "zone-04": "星光归港"
  },
  "regionArt": {
    "region-zone-01": {
      "assetRef": "/assets/board-themes/cloud-harbor/regions/zone-01-v1.jpg",
      "layoutContractRef": "board.ximitu-card-hunt.zone-01-layout.v2",
      "fallbackFill": "#ccefdc",
      "transitionFill": "#f4fbff",
      "transitionStyle": "mist"
    }
  },
  "nodeSkins": {
    "learning": {
      "assetRef": "/assets/board-themes/cloud-harbor/nodes-v3/learning-v3.png",
      "artMode": "complete",
      "fallbackGlyph": "?",
      "rimColor": "#236fae"
    },
    "coin": {
      "assetRef": "/assets/board-themes/cloud-harbor/nodes-v3/coin-v3.png",
      "artMode": "complete",
      "fallbackGlyph": "1",
      "rimColor": "#d28a00"
    },
    "gem": {
      "assetRef": "/assets/board-themes/cloud-harbor/nodes-v3/gem-v3.png",
      "artMode": "complete",
      "fallbackGlyph": "◆",
      "rimColor": "#268bb7"
    },
    "event": {
      "assetRef": "/assets/board-themes/cloud-harbor/nodes-v3/event-v3.png",
      "artMode": "complete",
      "fallbackGlyph": "!",
      "rimColor": "#c94e48"
    },
    "mooring": {
      "assetRef": "/assets/board-themes/cloud-harbor/nodes-v3/mooring-v3.png",
      "artMode": "complete",
      "fallbackGlyph": "⚓",
      "rimColor": "#15866f"
    },
    "foghorn": {
      "assetRef": "/assets/board-themes/cloud-harbor/nodes-v3/foghorn-v3.png",
      "artMode": "complete",
      "fallbackGlyph": "鸣",
      "rimColor": "#1687a8"
    },
    "cloud-gate": {
      "assetRef": "/assets/board-themes/cloud-harbor/nodes-v3/cloud-gate-v3.png",
      "artMode": "complete",
      "fallbackGlyph": "闸",
      "rimColor": "#207ca8"
    },
    "anchor": {
      "assetRef": "/assets/board-themes/cloud-harbor/nodes-v3/anchor-v3.png",
      "artMode": "complete",
      "fallbackGlyph": "✦",
      "rimColor": "#7b5bc7"
    },
    "key": {
      "assetRef": "/assets/board-themes/cloud-harbor/nodes-v3/key-v3.png",
      "artMode": "complete",
      "fallbackGlyph": "钥",
      "rimColor": "#c47a10"
    },
    "home": {
      "assetRef": "/assets/board-themes/cloud-harbor/nodes-v3/home-v3.png",
      "artMode": "complete",
      "fallbackGlyph": "屋",
      "rimColor": "#b47811"
    },
    "portal": {
      "assetRef": "/assets/board-themes/cloud-harbor/nodes-v3/portal-v3.png",
      "artMode": "complete",
      "fallbackGlyph": "∞",
      "rimColor": "#7257d8"
    },
    "junction": {
      "assetRef": "/assets/board-themes/cloud-harbor/nodes-v3/junction-v3.png",
      "artMode": "complete",
      "fallbackGlyph": "↗",
      "rimColor": "#8a7444"
    },
    "item": {
      "assetRef": "/assets/board-themes/cloud-harbor/nodes-v3/item-v3.png",
      "artMode": "complete",
      "fallbackGlyph": "✦",
      "rimColor": "#197c9a"
    },
    "transport": {
      "assetRef": "/assets/board-themes/cloud-harbor/nodes-v3/transport-v3.png",
      "artMode": "complete",
      "fallbackGlyph": "↟",
      "rimColor": "#5e4ed7"
    }
  },
  "facilitySkins": {
    "mooring-crane": {
      "baseAssetRef": "/assets/board-themes/cloud-harbor/facilities-v1/mooring-crane-base-v1.png",
      "upperAssetRef": "/assets/board-themes/cloud-harbor/facilities-v1/mooring-crane-upper-v1.png",
      "crateAssetRef": "/assets/board-themes/cloud-harbor/facilities-v1/mooring-anchor-crate-v1.png"
    },
    "signal-cannon": {
      "baseAssetRef": "/assets/board-themes/cloud-harbor/facilities-v1/signal-cannon-base-v1.png",
      "barrelAssetRef": "/assets/board-themes/cloud-harbor/facilities-v1/signal-cannon-barrel-v1.png"
    },
    "harbor-foghorn": {
      "bodyAssetRef": "/assets/board-themes/cloud-harbor/facilities-v1/harbor-foghorn-body-v1.png",
      "lampAssetRef": "/assets/board-themes/cloud-harbor/facilities-v1/harbor-foghorn-lamp-v1.png"
    },
    "cloudfall-gate": {
      "baseAssetRef": "/assets/board-themes/cloud-harbor/facilities-v1/cloudfall-gate-base-v1.png",
      "wheelAssetRef": "/assets/board-themes/cloud-harbor/facilities-v1/cloudfall-gate-wheel-v1.png"
    },
    "departure-beacon": {
      "lensAssetRef": "/assets/board-themes/cloud-harbor/facilities-v1/departure-beacon-lens-v1.png"
    }
  },
  "routeSkin": {
    "textureAssetRef": "/assets/board-themes/cloud-harbor/routes/cloud-stone-texture-v1.jpg",
    "baseColor": "#efe4c8",
    "outlineColor": "#7aa99d",
    "highlightColor": "#fffdf4",
    "shadowColor": "#0d2857",
    "activeColor": "#35c8e8",
    "patternSize": 116
  },
  "landmarks": [
    {
      "x": 160,
      "y": 405,
      "icon": "⚓",
      "label": "起航站"
    },
    {
      "x": 570,
      "y": 225,
      "icon": "☁",
      "label": "云桥"
    },
    {
      "x": 900,
      "y": 500,
      "icon": "🧭",
      "label": "探索营地"
    },
    {
      "x": 1390,
      "y": 55,
      "icon": "⛵",
      "label": "风帆高地"
    },
    {
      "x": 1840,
      "y": 355,
      "icon": "☂",
      "label": "浮云集市"
    },
    {
      "x": 2280,
      "y": 455,
      "icon": "⚡",
      "label": "风暴塔"
    },
    {
      "x": 2070,
      "y": 1015,
      "icon": "🌈",
      "label": "彩虹峡谷"
    },
    {
      "x": 1320,
      "y": 1040,
      "icon": "✧",
      "label": "星光码头"
    },
    {
      "x": 700,
      "y": 880,
      "icon": "🏰",
      "label": "归港城堡"
    }
  ],
  "transportSkins": {
    "jump.launcher.v1": {
      "label": "云霄信号炮",
      "announcement": "信号炮轰开云礁！",
      "deviceVariant": "cannon"
    }
  },
  "mapEffectSkins": {
    "harbor.foghorn.v1": {
      "label": "港口雾笛",
      "announcement": "航道目标已锁定！",
      "resultCopy": "卡卡精灵本轮不会移动",
      "deviceVariant": "harbor-foghorn"
    },
    "harbor.cloudfall-gate.v1": {
      "label": "云瀑水门",
      "announcement": "云瀑航道已经开启！",
      "resultCopy": "全班可在 n14 选择云阶捷径",
      "deviceVariant": "cloudfall-gate"
    }
  },
  "itemSkins": {
    "harbor.mooring-anchor.v1": {
      "label": "系泊锚",
      "announcement": "获得一次精准停靠机会",
      "deviceVariant": "mooring-anchor"
    }
  },
  "regionEffectSkins": {
    "harbor.departure-beacon.v1": {
      "label": "远航灯塔",
      "announcement": "启航海湾已通航",
      "deviceVariant": "departure-beacon"
    }
  }
});

export const PREVIOUS_BOARD_TEMPLATE_V21 = freezeSnapshot({
  "kind": "BoardTemplate",
  "id": "ximitu-card-hunt-board.v1",
  "version": "2.1.0",
  "title": "云港卡片大搜寻",
  "viewBox": [
    0,
    0,
    1200,
    620
  ],
  "worldSize": {
    "width": 2400,
    "height": 1120
  },
  "zones": [
    {
      "id": "zone-01",
      "bounds": {
        "x": 0,
        "y": 0,
        "width": 1200,
        "height": 620
      }
    },
    {
      "id": "zone-02",
      "bounds": {
        "x": 1200,
        "y": 0,
        "width": 1200,
        "height": 560
      }
    },
    {
      "id": "zone-03",
      "bounds": {
        "x": 1200,
        "y": 560,
        "width": 1200,
        "height": 560
      }
    },
    {
      "id": "zone-04",
      "bounds": {
        "x": 0,
        "y": 560,
        "width": 1200,
        "height": 560
      }
    }
  ],
  "artRegions": [
    {
      "id": "region-zone-01",
      "zoneId": "zone-01",
      "layoutContractRef": "board.ximitu-card-hunt.zone-01-layout.v4",
      "artBox": {
        "x": 0,
        "y": 0,
        "width": 1200,
        "height": 620
      },
      "clipPath": "M 0 0 H 1200 V 620 H 0 Z"
    },
    {
      "id": "region-zone-02",
      "zoneId": "zone-02",
      "layoutContractRef": "board.ximitu-card-hunt.zone-02-layout.v2",
      "artBox": {
        "x": 1200,
        "y": 0,
        "width": 1200,
        "height": 560
      },
      "clipPath": "M 1200 0 H 2400 V 560 H 1200 Z"
    },
    {
      "id": "region-zone-03",
      "zoneId": "zone-03",
      "layoutContractRef": "board.ximitu-card-hunt.zone-03-layout.v1",
      "artBox": {
        "x": 1200,
        "y": 560,
        "width": 1200,
        "height": 560
      },
      "clipPath": "M 1200 560 H 2400 V 1120 H 1200 Z"
    },
    {
      "id": "region-zone-04",
      "zoneId": "zone-04",
      "layoutContractRef": "board.ximitu-card-hunt.zone-04-layout.v1",
      "artBox": {
        "x": 0,
        "y": 560,
        "width": 1200,
        "height": 560
      },
      "clipPath": "M 0 560 H 1200 V 1120 H 0 Z"
    }
  ],
  "entry": {
    "id": "main",
    "nodeId": "n01"
  },
  "exits": [
    {
      "id": "forward",
      "nodeId": "n49",
      "transitionProfileRef": "world.portal.forward.v1"
    }
  ],
  "startNodeId": "n01",
  "nodes": [
    {
      "id": "n01",
      "x": 80,
      "y": 520,
      "spaceRole": "learning"
    },
    {
      "id": "n02",
      "x": 160,
      "y": 525,
      "spaceRole": "reward"
    },
    {
      "id": "n03",
      "x": 240,
      "y": 490,
      "spaceRole": "item",
      "itemRef": "harbor.mooring-anchor.v1"
    },
    {
      "id": "n04",
      "x": 315,
      "y": 435,
      "spaceRole": "junction"
    },
    {
      "id": "n05a",
      "x": 380,
      "y": 350,
      "spaceRole": "learning"
    },
    {
      "id": "n06a",
      "x": 465,
      "y": 300,
      "spaceRole": "transport",
      "transportProfileRef": "jump.launcher.v1",
      "transportTargetId": "n09",
      "transportCaptureNodeIds": [
        "n08"
      ]
    },
    {
      "id": "n07a",
      "x": 550,
      "y": 335,
      "spaceRole": "reward"
    },
    {
      "id": "n05b",
      "x": 375,
      "y": 505,
      "spaceRole": "map-effect",
      "mapEffectRef": "harbor.foghorn.v1"
    },
    {
      "id": "n06b",
      "x": 465,
      "y": 540,
      "spaceRole": "learning"
    },
    {
      "id": "n07b",
      "x": 555,
      "y": 500,
      "spaceRole": "treasure"
    },
    {
      "id": "n08",
      "x": 635,
      "y": 410,
      "spaceRole": "learning"
    },
    {
      "id": "n09",
      "x": 705,
      "y": 345,
      "spaceRole": "reward"
    },
    {
      "id": "n10",
      "x": 770,
      "y": 280,
      "spaceRole": "junction"
    },
    {
      "id": "n11a",
      "x": 835,
      "y": 225,
      "spaceRole": "learning"
    },
    {
      "id": "n12a",
      "x": 920,
      "y": 195,
      "spaceRole": "treasure"
    },
    {
      "id": "n13a",
      "x": 995,
      "y": 225,
      "spaceRole": "learning"
    },
    {
      "id": "n11b",
      "x": 845,
      "y": 325,
      "spaceRole": "item"
    },
    {
      "id": "n12b",
      "x": 925,
      "y": 340,
      "spaceRole": "map-effect",
      "mapEffectRef": "harbor.cloudfall-gate.v1"
    },
    {
      "id": "n13b",
      "x": 990,
      "y": 340,
      "spaceRole": "learning"
    },
    {
      "id": "n14",
      "x": 1045,
      "y": 290,
      "spaceRole": "learning"
    },
    {
      "id": "n15",
      "x": 1110,
      "y": 255,
      "spaceRole": "reward"
    },
    {
      "id": "n16",
      "x": 1120,
      "y": 185,
      "spaceRole": "learning"
    },
    {
      "id": "n17",
      "x": 1070,
      "y": 145,
      "spaceRole": "learning"
    },
    {
      "id": "n18",
      "x": 1190,
      "y": 170,
      "spaceRole": "learning"
    },
    {
      "id": "n19",
      "x": 1270,
      "y": 175,
      "spaceRole": "item"
    },
    {
      "id": "n20",
      "x": 1340,
      "y": 125,
      "spaceRole": "reward"
    },
    {
      "id": "n21",
      "x": 1450,
      "y": 175,
      "spaceRole": "junction"
    },
    {
      "id": "n22a",
      "x": 1540,
      "y": 180,
      "spaceRole": "learning"
    },
    {
      "id": "n23a",
      "x": 1640,
      "y": 175,
      "spaceRole": "treasure"
    },
    {
      "id": "n24a",
      "x": 1735,
      "y": 200,
      "spaceRole": "activity"
    },
    {
      "id": "n22b",
      "x": 1580,
      "y": 300,
      "spaceRole": "learning"
    },
    {
      "id": "n23b",
      "x": 1680,
      "y": 305,
      "spaceRole": "learning"
    },
    {
      "id": "n24b",
      "x": 1810,
      "y": 300,
      "spaceRole": "item"
    },
    {
      "id": "n25",
      "x": 1880,
      "y": 285,
      "spaceRole": "learning"
    },
    {
      "id": "n26",
      "x": 1970,
      "y": 315,
      "spaceRole": "reward"
    },
    {
      "id": "n27",
      "x": 2045,
      "y": 370,
      "spaceRole": "learning"
    },
    {
      "id": "n28",
      "x": 2100,
      "y": 440,
      "spaceRole": "treasure"
    },
    {
      "id": "n29",
      "x": 2175,
      "y": 510,
      "spaceRole": "junction"
    },
    {
      "id": "n30a",
      "x": 2070,
      "y": 565,
      "spaceRole": "learning"
    },
    {
      "id": "n31a",
      "x": 1980,
      "y": 630,
      "spaceRole": "activity"
    },
    {
      "id": "n32a",
      "x": 1910,
      "y": 710,
      "spaceRole": "reward"
    },
    {
      "id": "n30b",
      "x": 2250,
      "y": 610,
      "spaceRole": "item"
    },
    {
      "id": "n31b",
      "x": 2280,
      "y": 710,
      "spaceRole": "learning"
    },
    {
      "id": "n32b",
      "x": 2200,
      "y": 785,
      "spaceRole": "treasure"
    },
    {
      "id": "n33",
      "x": 2070,
      "y": 810,
      "spaceRole": "learning"
    },
    {
      "id": "n34",
      "x": 1950,
      "y": 860,
      "spaceRole": "transport",
      "transportProfileRef": "jump.launcher.v1",
      "transportTargetId": "n37"
    },
    {
      "id": "n35",
      "x": 1835,
      "y": 825,
      "spaceRole": "reward"
    },
    {
      "id": "n36",
      "x": 1720,
      "y": 800,
      "spaceRole": "learning"
    },
    {
      "id": "n37",
      "x": 1605,
      "y": 825,
      "spaceRole": "activity"
    },
    {
      "id": "n38",
      "x": 1500,
      "y": 865,
      "spaceRole": "item"
    },
    {
      "id": "n39",
      "x": 1385,
      "y": 910,
      "spaceRole": "learning"
    },
    {
      "id": "n40",
      "x": 1260,
      "y": 945,
      "spaceRole": "treasure"
    },
    {
      "id": "n41",
      "x": 1125,
      "y": 925,
      "spaceRole": "learning"
    },
    {
      "id": "n42",
      "x": 985,
      "y": 890,
      "spaceRole": "reward"
    },
    {
      "id": "n43",
      "x": 840,
      "y": 905,
      "spaceRole": "learning"
    },
    {
      "id": "n44",
      "x": 700,
      "y": 940,
      "spaceRole": "treasure"
    },
    {
      "id": "n45",
      "x": 560,
      "y": 915,
      "spaceRole": "reward"
    },
    {
      "id": "n46",
      "x": 430,
      "y": 865,
      "spaceRole": "activity"
    },
    {
      "id": "n47",
      "x": 310,
      "y": 800,
      "spaceRole": "learning"
    },
    {
      "id": "n48",
      "x": 200,
      "y": 710,
      "spaceRole": "reward"
    },
    {
      "id": "n49",
      "x": 115,
      "y": 620,
      "spaceRole": "portal"
    }
  ],
  "edges": [
    {
      "id": "e01",
      "from": "n01",
      "to": "n02"
    },
    {
      "id": "e02",
      "from": "n02",
      "to": "n03"
    },
    {
      "id": "e03",
      "from": "n03",
      "to": "n04"
    },
    {
      "id": "e04a",
      "from": "n04",
      "to": "n05a",
      "order": 0
    },
    {
      "id": "e04b",
      "from": "n04",
      "to": "n05b",
      "order": 1
    },
    {
      "id": "e05a",
      "from": "n05a",
      "to": "n06a"
    },
    {
      "id": "e06a",
      "from": "n06a",
      "to": "n07a"
    },
    {
      "id": "e05b",
      "from": "n05b",
      "to": "n06b"
    },
    {
      "id": "e06b",
      "from": "n06b",
      "to": "n07b"
    },
    {
      "id": "e07a",
      "from": "n07a",
      "to": "n08"
    },
    {
      "id": "e07b",
      "from": "n07b",
      "to": "n08"
    },
    {
      "id": "e08",
      "from": "n08",
      "to": "n09"
    },
    {
      "id": "e09",
      "from": "n09",
      "to": "n10"
    },
    {
      "id": "e10a",
      "from": "n10",
      "to": "n11a",
      "order": 0
    },
    {
      "id": "e10b",
      "from": "n10",
      "to": "n11b",
      "order": 1
    },
    {
      "id": "e11a",
      "from": "n11a",
      "to": "n12a"
    },
    {
      "id": "e12a",
      "from": "n12a",
      "to": "n13a"
    },
    {
      "id": "e11b",
      "from": "n11b",
      "to": "n12b"
    },
    {
      "id": "e12b",
      "from": "n12b",
      "to": "n13b"
    },
    {
      "id": "e13a",
      "from": "n13a",
      "to": "n14"
    },
    {
      "id": "e13b",
      "from": "n13b",
      "to": "n14"
    },
    {
      "id": "e14",
      "from": "n14",
      "to": "n15",
      "order": 0
    },
    {
      "id": "e14c",
      "from": "n14",
      "to": "n17",
      "order": 1,
      "terrainType": "cloud-stair",
      "availableWhen": {
        "stateKey": "cloudRouteOpen",
        "equals": true
      },
      "pathData": "M 1045 290 C 1095 270 1110 235 1088 215 C 1065 194 1055 167 1070 145"
    },
    {
      "id": "e15",
      "from": "n15",
      "to": "n16"
    },
    {
      "id": "e16",
      "from": "n16",
      "to": "n17"
    },
    {
      "id": "e17",
      "from": "n17",
      "to": "n18",
      "pathData": "M 1070 145 C 1105 125 1145 145 1190 170"
    },
    {
      "id": "e18",
      "from": "n18",
      "to": "n19",
      "pathData": "M 1190 170 Q 1230 175 1270 175"
    },
    {
      "id": "e19",
      "from": "n19",
      "to": "n20"
    },
    {
      "id": "e20",
      "from": "n20",
      "to": "n21"
    },
    {
      "id": "e21a",
      "from": "n21",
      "to": "n22a",
      "order": 0,
      "pathData": "M 1450 175 Q 1495 165 1540 180"
    },
    {
      "id": "e21b",
      "from": "n21",
      "to": "n22b",
      "order": 1,
      "pathData": "M 1450 175 Q 1510 265 1580 300"
    },
    {
      "id": "e22a",
      "from": "n22a",
      "to": "n23a",
      "pathData": "M 1540 180 Q 1590 170 1640 175"
    },
    {
      "id": "e23a",
      "from": "n23a",
      "to": "n24a",
      "pathData": "M 1640 175 Q 1690 178 1735 200"
    },
    {
      "id": "e24a",
      "from": "n24a",
      "to": "n25",
      "pathData": "M 1735 200 C 1780 215 1825 270 1880 285"
    },
    {
      "id": "e22b",
      "from": "n22b",
      "to": "n23b",
      "pathData": "M 1580 300 Q 1630 308 1680 305"
    },
    {
      "id": "e23b",
      "from": "n23b",
      "to": "n24b",
      "pathData": "M 1680 305 Q 1745 315 1810 300"
    },
    {
      "id": "e24b",
      "from": "n24b",
      "to": "n25",
      "pathData": "M 1810 300 Q 1845 292 1880 285"
    },
    {
      "id": "e25",
      "from": "n25",
      "to": "n26",
      "pathData": "M 1880 285 Q 1925 290 1970 315"
    },
    {
      "id": "e26",
      "from": "n26",
      "to": "n27",
      "pathData": "M 1970 315 Q 2008 335 2045 370"
    },
    {
      "id": "e27",
      "from": "n27",
      "to": "n28",
      "pathData": "M 2045 370 Q 2075 405 2100 440"
    },
    {
      "id": "e28",
      "from": "n28",
      "to": "n29"
    },
    {
      "id": "e29a",
      "from": "n29",
      "to": "n30a",
      "order": 0
    },
    {
      "id": "e29b",
      "from": "n29",
      "to": "n30b",
      "order": 1
    },
    {
      "id": "e30a",
      "from": "n30a",
      "to": "n31a"
    },
    {
      "id": "e31a",
      "from": "n31a",
      "to": "n32a"
    },
    {
      "id": "e32a",
      "from": "n32a",
      "to": "n33"
    },
    {
      "id": "e30b",
      "from": "n30b",
      "to": "n31b"
    },
    {
      "id": "e31b",
      "from": "n31b",
      "to": "n32b"
    },
    {
      "id": "e32b",
      "from": "n32b",
      "to": "n33"
    },
    {
      "id": "e33",
      "from": "n33",
      "to": "n34"
    },
    {
      "id": "e34",
      "from": "n34",
      "to": "n35"
    },
    {
      "id": "e35",
      "from": "n35",
      "to": "n36"
    },
    {
      "id": "e36",
      "from": "n36",
      "to": "n37"
    },
    {
      "id": "e37",
      "from": "n37",
      "to": "n38"
    },
    {
      "id": "e38",
      "from": "n38",
      "to": "n39"
    },
    {
      "id": "e39",
      "from": "n39",
      "to": "n40"
    },
    {
      "id": "e40",
      "from": "n40",
      "to": "n41"
    },
    {
      "id": "e41",
      "from": "n41",
      "to": "n42"
    },
    {
      "id": "e42",
      "from": "n42",
      "to": "n43"
    },
    {
      "id": "e43",
      "from": "n43",
      "to": "n44"
    },
    {
      "id": "e44",
      "from": "n44",
      "to": "n45"
    },
    {
      "id": "e45",
      "from": "n45",
      "to": "n46"
    },
    {
      "id": "e46",
      "from": "n46",
      "to": "n47"
    },
    {
      "id": "e47",
      "from": "n47",
      "to": "n48"
    },
    {
      "id": "e48",
      "from": "n48",
      "to": "n49"
    }
  ]
});

export const PREVIOUS_CLOUD_HARBOR_THEME_V21 = freezeSnapshot({
  "kind": "ThemePack",
  "id": "cloud-harbor",
  "version": "2.1.0",
  "title": "云港探险",
  "scenePresentation": {
    "id": "grounded-harbor.v1",
    "boardRef": "ximitu-card-hunt-board.v1@2.1.0",
    "zoneIds": [
      "zone-01"
    ],
    "timberEdgeIds": [
      "e01",
      "e02",
      "e03",
      "e04b",
      "e05b"
    ],
    "facilityNodeIds": [
      "n03",
      "n05b",
      "n06a",
      "n12b",
      "n18"
    ]
  },
  "palette": {
    "page": "#e8f8ef",
    "terrain": "#fff8dc",
    "route": "#d8e9df",
    "ink": "#0d2857",
    "primary": "#ffd84a",
    "secondary": "#69d6a3",
    "accent": "#8b75ff"
  },
  "zoneNames": {
    "zone-01": "启航海湾",
    "zone-02": "风帆高地",
    "zone-03": "彩虹峡谷",
    "zone-04": "星门前哨"
  },
  "regionArt": {
    "region-zone-01": {
      "assetRef": "/assets/board-themes/cloud-harbor/regions/zone-01-v3.jpg",
      "layoutContractRef": "board.ximitu-card-hunt.zone-01-layout.v4",
      "fallbackFill": "#ccefdc"
    },
    "region-zone-02": {
      "assetRef": "/assets/board-themes/cloud-harbor/regions/zone-02-v3.jpg",
      "layoutContractRef": "board.ximitu-card-hunt.zone-02-layout.v2",
      "fallbackFill": "#dcefc9"
    },
    "region-zone-03": {
      "assetRef": "/assets/board-themes/cloud-harbor/regions/zone-03-v3.jpg",
      "layoutContractRef": "board.ximitu-card-hunt.zone-03-layout.v1",
      "fallbackFill": "#eadcf6"
    },
    "region-zone-04": {
      "assetRef": "/assets/board-themes/cloud-harbor/regions/zone-04-v3.jpg",
      "layoutContractRef": "board.ximitu-card-hunt.zone-04-layout.v1",
      "fallbackFill": "#d9daf8"
    }
  },
  "nodeSkins": {
    "learning": {
      "assetRef": "/assets/board-themes/cloud-harbor/nodes-v3/learning-v3.png",
      "artMode": "complete",
      "fallbackGlyph": "步",
      "rimColor": "#236fae"
    },
    "coin": {
      "assetRef": "/assets/board-themes/cloud-harbor/nodes-v3/coin-v3.png",
      "artMode": "complete",
      "fallbackGlyph": "1",
      "rimColor": "#d28a00"
    },
    "gem": {
      "assetRef": "/assets/board-themes/cloud-harbor/nodes-v3/gem-v3.png",
      "artMode": "complete",
      "fallbackGlyph": "◆",
      "rimColor": "#268bb7"
    },
    "event": {
      "assetRef": "/assets/board-themes/cloud-harbor/nodes-v3/event-v3.png",
      "artMode": "complete",
      "fallbackGlyph": "!",
      "rimColor": "#c94e48"
    },
    "mooring": {
      "assetRef": "/assets/board-themes/cloud-harbor/nodes-v3/mooring-v3.png",
      "artMode": "complete",
      "fallbackGlyph": "⚓",
      "rimColor": "#15866f"
    },
    "foghorn": {
      "assetRef": "/assets/board-themes/cloud-harbor/nodes-v3/foghorn-v3.png",
      "artMode": "complete",
      "fallbackGlyph": "鸣",
      "rimColor": "#1687a8"
    },
    "cloud-gate": {
      "assetRef": "/assets/board-themes/cloud-harbor/nodes-v3/cloud-gate-v3.png",
      "artMode": "complete",
      "fallbackGlyph": "闸",
      "rimColor": "#207ca8"
    },
    "anchor": {
      "assetRef": "",
      "artMode": "complete",
      "fallbackGlyph": "踪",
      "rimColor": "#7b5bc7"
    },
    "key": {
      "assetRef": "/assets/board-themes/cloud-harbor/nodes-v3/key-v3.png",
      "artMode": "complete",
      "fallbackGlyph": "钥",
      "rimColor": "#c47a10"
    },
    "home": {
      "assetRef": "/assets/board-themes/cloud-harbor/nodes-v3/home-v3.png",
      "artMode": "complete",
      "fallbackGlyph": "屋",
      "rimColor": "#b47811"
    },
    "portal": {
      "assetRef": "/assets/board-themes/cloud-harbor/nodes-v3/portal-v3.png",
      "artMode": "complete",
      "fallbackGlyph": "∞",
      "rimColor": "#7257d8"
    },
    "junction": {
      "assetRef": "/assets/board-themes/cloud-harbor/nodes-v3/junction-v3.png",
      "artMode": "complete",
      "fallbackGlyph": "↗",
      "rimColor": "#8a7444"
    },
    "item": {
      "assetRef": "/assets/board-themes/cloud-harbor/nodes-v3/item-v3.png",
      "artMode": "complete",
      "fallbackGlyph": "✦",
      "rimColor": "#197c9a"
    },
    "transport": {
      "assetRef": "/assets/board-themes/cloud-harbor/nodes-v3/transport-v3.png",
      "artMode": "complete",
      "fallbackGlyph": "↟",
      "rimColor": "#5e4ed7"
    }
  },
  "facilitySkins": {
    "mooring-crane": {
      "baseAssetRef": "/assets/board-themes/cloud-harbor/facilities-v1/mooring-crane-base-v1.png",
      "upperAssetRef": "/assets/board-themes/cloud-harbor/facilities-v1/mooring-crane-upper-v1.png",
      "crateAssetRef": "/assets/board-themes/cloud-harbor/facilities-v1/mooring-anchor-crate-v1.png"
    },
    "signal-cannon": {
      "baseAssetRef": "/assets/board-themes/cloud-harbor/facilities-v1/signal-cannon-base-v1.png",
      "barrelAssetRef": "/assets/board-themes/cloud-harbor/facilities-v1/signal-cannon-barrel-v1.png"
    },
    "harbor-foghorn": {
      "bodyAssetRef": "/assets/board-themes/cloud-harbor/facilities-v1/harbor-foghorn-body-v1.png",
      "lampAssetRef": "/assets/board-themes/cloud-harbor/facilities-v1/harbor-foghorn-lamp-v1.png"
    },
    "cloudfall-gate": {
      "baseAssetRef": "/assets/board-themes/cloud-harbor/facilities-v1/cloudfall-gate-base-v1.png",
      "wheelAssetRef": "/assets/board-themes/cloud-harbor/facilities-v1/cloudfall-gate-wheel-v1.png"
    },
    "departure-beacon": {
      "lensAssetRef": "/assets/board-themes/cloud-harbor/facilities-v1/departure-beacon-lens-v1.png"
    }
  },
  "routeSkin": {
    "textureAssetRef": "/assets/board-themes/cloud-harbor/routes/cloudway-texture-v2.jpg",
    "presentation": "floating-cloudway",
    "baseColor": "#edf9f4",
    "bankColor": "#d6f3f1",
    "outlineColor": "#82b7bd",
    "highlightColor": "#fffdf4",
    "shadowColor": "#17375b",
    "activeColor": "#35c8e8",
    "patternSize": 192,
    "groundingWidth": 48,
    "shadowWidth": 38,
    "bankWidth": 34,
    "outlineWidth": 26,
    "baseWidth": 21,
    "textureWidth": 18,
    "shadowOffsetY": 5,
    "groundingOpacity": 0.22,
    "shadowOpacity": 0.08,
    "bankOpacity": 0.42,
    "outlineOpacity": 0.36,
    "baseOpacity": 0.58,
    "textureOpacity": 0.22,
    "highlightOpacity": 0.62
  },
  "landmarks": [
    {
      "x": 160,
      "y": 405,
      "icon": "⚓",
      "label": "起航站"
    },
    {
      "x": 570,
      "y": 225,
      "icon": "☁",
      "label": "云桥"
    },
    {
      "x": 900,
      "y": 500,
      "icon": "🧭",
      "label": "探索营地"
    },
    {
      "x": 1390,
      "y": 55,
      "icon": "⛵",
      "label": "风帆高地"
    },
    {
      "x": 1840,
      "y": 355,
      "icon": "☂",
      "label": "浮云集市"
    },
    {
      "x": 2280,
      "y": 455,
      "icon": "⚡",
      "label": "风暴塔"
    },
    {
      "x": 2070,
      "y": 1015,
      "icon": "🌈",
      "label": "彩虹峡谷"
    },
    {
      "x": 1320,
      "y": 1040,
      "icon": "✧",
      "label": "星光码头"
    },
    {
      "x": 700,
      "y": 880,
      "icon": "✦",
      "label": "星门观测站"
    }
  ],
  "transportSkins": {
    "jump.launcher.v1": {
      "label": "云霄信号炮",
      "announcement": "信号炮轰开云礁！",
      "deviceVariant": "cannon"
    }
  },
  "mapEffectSkins": {
    "harbor.foghorn.v1": {
      "label": "港口雾笛",
      "announcement": "航道目标已锁定！",
      "resultCopy": "卡卡精灵本轮不会移动",
      "deviceVariant": "harbor-foghorn"
    },
    "harbor.cloudfall-gate.v1": {
      "label": "云瀑水门",
      "announcement": "云瀑航道已经开启！",
      "resultCopy": "全班可在 n14 选择云阶捷径",
      "deviceVariant": "cloudfall-gate"
    }
  },
  "itemSkins": {
    "harbor.mooring-anchor.v1": {
      "label": "停靠锚",
      "announcement": "获得一次改选沿途落点的机会",
      "deviceVariant": "mooring-anchor"
    }
  },
  "regionEffectSkins": {
    "harbor.departure-beacon.v1": {
      "label": "远航灯塔",
      "announcement": "启航海湾已通航",
      "deviceVariant": "departure-beacon"
    }
  }
});

export const PREVIOUS_CLOUD_HARBOR_WORLD_V11 = freezeSnapshot({
  "kind": "WorldPack",
  "id": "world.ximitu.cloud-harbor",
  "version": "1.1.0",
  "title": "云港远征",
  "boardTemplateRef": "ximitu-card-hunt-board.v1@2.1.0",
  "themePackRef": "cloud-harbor@2.1.0",
  "levelPackRef": "ximitu-card-hunt.level-01@2.0.0",
  "assetBudget": {
    "maxArtRegions": 4
  }
});

export const PREVIOUS_XIMITU_WORLD_ROUTE = freezeSnapshot({
  "kind": "WorldRoute",
  "id": "route.ximitu-main",
  "version": "1.1.0",
  "title": "西米兔向前远征",
  "entryWorldRef": "world.ximitu.cloud-harbor@1.1.0",
  "transitions": [
    {
      "fromWorldRef": "world.ximitu.cloud-harbor@1.1.0",
      "exitId": "forward",
      "toWorldRef": "world.ximitu.beyond-cloud@1.0.0"
    }
  ],
  "repeatableTail": {
    "worldRef": "world.ximitu.beyond-cloud@1.0.0",
    "exitId": "forward",
    "instancePolicy": "append-new-instance-v1"
  }
});

export const PREVIOUS_XIMITU_GAME_RELEASE = freezeSnapshot({
  "kind": "GameRelease",
  "id": "release.ximitu-card-hunt",
  "version": "2.1.0",
  "worldRouteRef": "route.ximitu-main@1.1.0",
  "rewardDefinitionRefs": [
    "reward.ordinary.none.v1",
    "reward.curiosity.card-peek.v1",
    "reward.curiosity.route-scout.v1",
    "reward.curiosity.world-peek.v1",
    "reward.choice.route.v1",
    "reward.choice.next-card.v1",
    "reward.collect.coin-1.v1",
    "reward.collect.card-case-1.v1",
    "reward.collect.star-1.v1",
    "reward.collect.key-1.v1",
    "reward.exchange.coin-card-case.v1",
    "reward.collect.progress-unit.v1",
    "reward.collect.fairy-anchor.v1",
    "reward.combine.workshop.v1",
    "reward.display.album-spotlight.v1",
    "reward.display.region-change.v1",
    "reward.display.retired-fairy-signal.v1",
    "reward.event.coin-rain.v1",
    "reward.event.fairy-signal.v1",
    "item.harbor.mooring-anchor.v1",
    "map.harbor.foghorn.v1",
    "map.harbor.cloudfall-gate.v1",
    "transport.harbor.signal-cannon.v1",
    "transport.rainbow-launcher.v1",
    "region.harbor.departure-beacon.v1",
    "world.portal.forward.v1",
    "world2.ordinary.v1",
    "world2.quiet-task.v1",
    "world2.arrival-vista.v1",
    "world2.zone-vista.star-gate.v1",
    "world2.zone-vista.cloud-whale.v1",
    "world2.zone-vista.crystal-grove.v1",
    "world2.coin-cache.v1",
    "world2.star-bloom.v1",
    "world2.key-forge.v1",
    "world2.junction-choice.v1",
    "world2.aurora-bridge-choice.v1",
    "world2.discovery.star-gate.v1",
    "world2.discovery.cloud-whale.v1",
    "world2.discovery.crystal-grove.v1",
    "world2.discovery.moon-ruins.v1",
    "world2.transport.comet-lift.v1",
    "world2.transport.bubble-geyser.v1",
    "world2.map.echo-observatory.v1",
    "world2.map.constellation-lens.v1",
    "world2.map.cloud-whale-beacon.v1",
    "world2.map.cloud-whale-pool.v1",
    "world2.map.prism-telescope.v1",
    "world2.map.prism-tree.v1",
    "world2.map.aurora-projector.v1",
    "world2.map.moon-dial.v1",
    "world2.world-gallery.v1",
    "world2.forward-portal.v1"
  ]
});
