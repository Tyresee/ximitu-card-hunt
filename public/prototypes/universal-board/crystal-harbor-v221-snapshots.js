// Published 2.2.1 / 1.2.1 snapshots. Keep independent of future live packs.
function deepFreeze(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

export const CRYSTAL_BOARD_TEMPLATE_V221 = deepFreeze({
  "kind": "BoardTemplate",
  "id": "ximitu-card-hunt-board.v1",
  "version": "2.2.1",
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
      "layoutContractRef": "board.ximitu-card-hunt.zone-01-layout.v6",
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
      "layoutContractRef": "board.ximitu-card-hunt.zone-02-layout.v4",
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
      "layoutContractRef": "board.ximitu-card-hunt.zone-03-layout.v2",
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
      "layoutContractRef": "board.ximitu-card-hunt.zone-04-layout.v2",
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
      "x": 110,
      "y": 485,
      "spaceRole": "learning"
    },
    {
      "id": "n02",
      "x": 215,
      "y": 490,
      "spaceRole": "reward"
    },
    {
      "id": "n03",
      "x": 315,
      "y": 450,
      "spaceRole": "item",
      "itemRef": "harbor.mooring-anchor.v1"
    },
    {
      "id": "n04",
      "x": 405,
      "y": 385,
      "spaceRole": "junction"
    },
    {
      "id": "n05a",
      "x": 420,
      "y": 300,
      "spaceRole": "learning"
    },
    {
      "id": "n06a",
      "x": 515,
      "y": 275,
      "spaceRole": "transport",
      "transportProfileRef": "jump.launcher.v1",
      "transportTargetId": "n09",
      "transportCaptureNodeIds": [
        "n08"
      ]
    },
    {
      "id": "n07a",
      "x": 610,
      "y": 280,
      "spaceRole": "reward"
    },
    {
      "id": "n05b",
      "x": 485,
      "y": 355,
      "spaceRole": "map-effect",
      "mapEffectRef": "harbor.foghorn.v1"
    },
    {
      "id": "n06b",
      "x": 585,
      "y": 350,
      "spaceRole": "learning"
    },
    {
      "id": "n07b",
      "x": 680,
      "y": 330,
      "spaceRole": "treasure"
    },
    {
      "id": "n08",
      "x": 750,
      "y": 300,
      "spaceRole": "learning"
    },
    {
      "id": "n09",
      "x": 820,
      "y": 270,
      "spaceRole": "reward"
    },
    {
      "id": "n10",
      "x": 850,
      "y": 210,
      "spaceRole": "junction"
    },
    {
      "id": "n11a",
      "x": 795,
      "y": 175,
      "spaceRole": "learning"
    },
    {
      "id": "n12a",
      "x": 825,
      "y": 120,
      "spaceRole": "treasure"
    },
    {
      "id": "n13a",
      "x": 885,
      "y": 145,
      "spaceRole": "learning"
    },
    {
      "id": "n11b",
      "x": 880,
      "y": 300,
      "spaceRole": "item"
    },
    {
      "id": "n12b",
      "x": 960,
      "y": 300,
      "spaceRole": "map-effect",
      "mapEffectRef": "harbor.cloudfall-gate.v1"
    },
    {
      "id": "n13b",
      "x": 970,
      "y": 245,
      "spaceRole": "learning"
    },
    {
      "id": "n14",
      "x": 925,
      "y": 205,
      "spaceRole": "learning"
    },
    {
      "id": "n15",
      "x": 975,
      "y": 170,
      "spaceRole": "reward"
    },
    {
      "id": "n16",
      "x": 1125,
      "y": 135,
      "spaceRole": "learning"
    },
    {
      "id": "n17",
      "x": 1160,
      "y": 110,
      "spaceRole": "learning"
    },
    {
      "id": "n18",
      "x": 1195,
      "y": 85,
      "spaceRole": "learning"
    },
    {
      "id": "n19",
      "x": 1270,
      "y": 115,
      "spaceRole": "item"
    },
    {
      "id": "n20",
      "x": 1345,
      "y": 145,
      "spaceRole": "reward"
    },
    {
      "id": "n21",
      "x": 1430,
      "y": 185,
      "spaceRole": "junction"
    },
    {
      "id": "n22a",
      "x": 1520,
      "y": 140,
      "spaceRole": "learning"
    },
    {
      "id": "n23a",
      "x": 1640,
      "y": 145,
      "spaceRole": "treasure"
    },
    {
      "id": "n24a",
      "x": 1760,
      "y": 190,
      "spaceRole": "activity"
    },
    {
      "id": "n22b",
      "x": 1515,
      "y": 270,
      "spaceRole": "learning"
    },
    {
      "id": "n23b",
      "x": 1640,
      "y": 295,
      "spaceRole": "learning"
    },
    {
      "id": "n24b",
      "x": 1765,
      "y": 295,
      "spaceRole": "item"
    },
    {
      "id": "n25",
      "x": 1880,
      "y": 300,
      "spaceRole": "learning"
    },
    {
      "id": "n26",
      "x": 1990,
      "y": 355,
      "spaceRole": "reward"
    },
    {
      "id": "n27",
      "x": 2110,
      "y": 410,
      "spaceRole": "learning"
    },
    {
      "id": "n28",
      "x": 2200,
      "y": 485,
      "spaceRole": "treasure"
    },
    {
      "id": "n29",
      "x": 2175,
      "y": 550,
      "spaceRole": "junction"
    },
    {
      "id": "n30a",
      "x": 2040,
      "y": 595,
      "spaceRole": "learning"
    },
    {
      "id": "n31a",
      "x": 1970,
      "y": 675,
      "spaceRole": "activity"
    },
    {
      "id": "n32a",
      "x": 1900,
      "y": 745,
      "spaceRole": "reward"
    },
    {
      "id": "n30b",
      "x": 2140,
      "y": 620,
      "spaceRole": "item"
    },
    {
      "id": "n31b",
      "x": 2100,
      "y": 730,
      "spaceRole": "learning"
    },
    {
      "id": "n32b",
      "x": 2080,
      "y": 800,
      "spaceRole": "treasure"
    },
    {
      "id": "n33",
      "x": 2015,
      "y": 815,
      "spaceRole": "learning"
    },
    {
      "id": "n34",
      "x": 1910,
      "y": 825,
      "spaceRole": "transport",
      "transportProfileRef": "jump.launcher.v1",
      "transportTargetId": "n37"
    },
    {
      "id": "n35",
      "x": 1805,
      "y": 835,
      "spaceRole": "reward"
    },
    {
      "id": "n36",
      "x": 1695,
      "y": 850,
      "spaceRole": "learning"
    },
    {
      "id": "n37",
      "x": 1580,
      "y": 875,
      "spaceRole": "activity"
    },
    {
      "id": "n38",
      "x": 1465,
      "y": 905,
      "spaceRole": "item"
    },
    {
      "id": "n39",
      "x": 1350,
      "y": 925,
      "spaceRole": "learning"
    },
    {
      "id": "n40",
      "x": 1240,
      "y": 930,
      "spaceRole": "treasure"
    },
    {
      "id": "n41",
      "x": 1125,
      "y": 920,
      "spaceRole": "learning"
    },
    {
      "id": "n42",
      "x": 1000,
      "y": 900,
      "spaceRole": "reward"
    },
    {
      "id": "n43",
      "x": 875,
      "y": 915,
      "spaceRole": "learning"
    },
    {
      "id": "n44",
      "x": 750,
      "y": 920,
      "spaceRole": "treasure"
    },
    {
      "id": "n45",
      "x": 625,
      "y": 865,
      "spaceRole": "reward"
    },
    {
      "id": "n46",
      "x": 510,
      "y": 810,
      "spaceRole": "activity"
    },
    {
      "id": "n47",
      "x": 410,
      "y": 765,
      "spaceRole": "learning"
    },
    {
      "id": "n48",
      "x": 325,
      "y": 730,
      "spaceRole": "reward"
    },
    {
      "id": "n49",
      "x": 270,
      "y": 685,
      "spaceRole": "portal"
    }
  ],
  "edges": [
    {
      "id": "e01",
      "from": "n01",
      "to": "n02",
      "pathData": "M 110 485 C 145 472 180 490 215 490"
    },
    {
      "id": "e02",
      "from": "n02",
      "to": "n03",
      "pathData": "M 215 490 C 250 489 282 475 315 450"
    },
    {
      "id": "e03",
      "from": "n03",
      "to": "n04",
      "pathData": "M 315 450 C 350 440 376 410 405 385"
    },
    {
      "id": "e04a",
      "from": "n04",
      "to": "n05a",
      "order": 0,
      "pathData": "M 405 385 C 411 360 414 327 420 300"
    },
    {
      "id": "e04b",
      "from": "n04",
      "to": "n05b",
      "order": 1,
      "pathData": "M 405 385 C 432 381 458 363 485 355"
    },
    {
      "id": "e05a",
      "from": "n05a",
      "to": "n06a",
      "pathData": "M 420 300 C 445 285 480 271 515 275"
    },
    {
      "id": "e06a",
      "from": "n06a",
      "to": "n07a",
      "pathData": "M 515 275 C 547 270 579 272 610 280"
    },
    {
      "id": "e05b",
      "from": "n05b",
      "to": "n06b",
      "pathData": "M 485 355 C 517 347 552 346 585 350"
    },
    {
      "id": "e06b",
      "from": "n06b",
      "to": "n07b",
      "pathData": "M 585 350 C 620 348 650 338 680 330"
    },
    {
      "id": "e07a",
      "from": "n07a",
      "to": "n08",
      "pathData": "M 610 280 C 650 285 706 297 750 300"
    },
    {
      "id": "e07b",
      "from": "n07b",
      "to": "n08",
      "pathData": "M 680 330 C 705 324 728 310 750 300"
    },
    {
      "id": "e08",
      "from": "n08",
      "to": "n09",
      "pathData": "M 750 300 C 774 292 800 283 820 270"
    },
    {
      "id": "e09",
      "from": "n09",
      "to": "n10",
      "pathData": "M 820 270 C 838 256 848 235 850 210"
    },
    {
      "id": "e10a",
      "from": "n10",
      "to": "n11a",
      "order": 0,
      "pathData": "M 850 210 C 832 200 813 184 795 175"
    },
    {
      "id": "e10b",
      "from": "n10",
      "to": "n11b",
      "order": 1,
      "pathData": "M 850 210 C 858 241 866 282 880 300"
    },
    {
      "id": "e11a",
      "from": "n11a",
      "to": "n12a",
      "pathData": "M 795 175 C 800 155 808 133 825 120"
    },
    {
      "id": "e12a",
      "from": "n12a",
      "to": "n13a",
      "pathData": "M 825 120 C 846 120 867 133 885 145"
    },
    {
      "id": "e11b",
      "from": "n11b",
      "to": "n12b",
      "pathData": "M 880 300 C 906 309 935 309 960 300"
    },
    {
      "id": "e12b",
      "from": "n12b",
      "to": "n13b",
      "pathData": "M 960 300 C 973 285 978 262 970 245"
    },
    {
      "id": "e13a",
      "from": "n13a",
      "to": "n14",
      "pathData": "M 885 145 C 904 157 916 183 925 205"
    },
    {
      "id": "e13b",
      "from": "n13b",
      "to": "n14",
      "pathData": "M 970 245 C 958 229 941 213 925 205"
    },
    {
      "id": "e14",
      "from": "n14",
      "to": "n15",
      "order": 0,
      "pathData": "M 925 205 C 941 194 959 180 975 170"
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
      "pathData": "M 925 205 C 1000 228 1205 185 1160 110"
    },
    {
      "id": "e15",
      "from": "n15",
      "to": "n16",
      "pathData": "M 975 170 C 1020 169 1091 152 1125 135"
    },
    {
      "id": "e16",
      "from": "n16",
      "to": "n17",
      "pathData": "M 1125 135 C 1137 128 1149 117 1160 110"
    },
    {
      "id": "e17",
      "from": "n17",
      "to": "n18",
      "pathData": "M 1160 110 C 1171 103 1183 91 1195 85"
    },
    {
      "id": "e18",
      "from": "n18",
      "to": "n19",
      "pathData": "M 1195 85 C 1221 85 1247 102 1270 115"
    },
    {
      "id": "e19",
      "from": "n19",
      "to": "n20",
      "pathData": "M 1270 115 C 1294 126 1320 139 1345 145"
    },
    {
      "id": "e20",
      "from": "n20",
      "to": "n21",
      "pathData": "M 1345 145 C 1373 141 1405 163 1430 185"
    },
    {
      "id": "e21a",
      "from": "n21",
      "to": "n22a",
      "order": 0,
      "pathData": "M 1430 185 C 1458 170 1484 151 1520 140"
    },
    {
      "id": "e21b",
      "from": "n21",
      "to": "n22b",
      "order": 1,
      "pathData": "M 1430 185 C 1450 217 1479 256 1515 270"
    },
    {
      "id": "e22a",
      "from": "n22a",
      "to": "n23a",
      "pathData": "M 1520 140 C 1560 128 1605 133 1640 145"
    },
    {
      "id": "e23a",
      "from": "n23a",
      "to": "n24a",
      "pathData": "M 1640 145 C 1680 151 1725 172 1760 190"
    },
    {
      "id": "e24a",
      "from": "n24a",
      "to": "n25",
      "pathData": "M 1760 190 C 1810 212 1845 271 1880 300"
    },
    {
      "id": "e22b",
      "from": "n22b",
      "to": "n23b",
      "pathData": "M 1515 270 C 1555 289 1597 297 1640 295"
    },
    {
      "id": "e23b",
      "from": "n23b",
      "to": "n24b",
      "pathData": "M 1640 295 C 1683 300 1723 297 1765 295"
    },
    {
      "id": "e24b",
      "from": "n24b",
      "to": "n25",
      "pathData": "M 1765 295 C 1802 294 1847 295 1880 300"
    },
    {
      "id": "e25",
      "from": "n25",
      "to": "n26",
      "pathData": "M 1880 300 C 1915 317 1952 341 1990 355"
    },
    {
      "id": "e26",
      "from": "n26",
      "to": "n27",
      "pathData": "M 1990 355 C 2030 370 2070 395 2110 410"
    },
    {
      "id": "e27",
      "from": "n27",
      "to": "n28",
      "pathData": "M 2110 410 C 2144 429 2185 455 2200 485"
    },
    {
      "id": "e28",
      "from": "n28",
      "to": "n29",
      "pathData": "M 2200 485 C 2207 508 2199 532 2175 550"
    },
    {
      "id": "e29a",
      "from": "n29",
      "to": "n30a",
      "order": 0,
      "pathData": "M 2175 550 C 2134 559 2077 568 2040 595"
    },
    {
      "id": "e29b",
      "from": "n29",
      "to": "n30b",
      "order": 1,
      "pathData": "M 2175 550 C 2165 576 2152 600 2140 620"
    },
    {
      "id": "e30a",
      "from": "n30a",
      "to": "n31a",
      "pathData": "M 2040 595 C 2015 615 1991 645 1970 675"
    },
    {
      "id": "e31a",
      "from": "n31a",
      "to": "n32a",
      "pathData": "M 1970 675 C 1949 699 1926 728 1900 745"
    },
    {
      "id": "e32a",
      "from": "n32a",
      "to": "n33",
      "pathData": "M 1900 745 C 1930 782 1975 814 2015 815"
    },
    {
      "id": "e30b",
      "from": "n30b",
      "to": "n31b",
      "pathData": "M 2140 620 C 2135 658 2117 696 2100 730"
    },
    {
      "id": "e31b",
      "from": "n31b",
      "to": "n32b",
      "pathData": "M 2100 730 C 2101 756 2095 784 2080 800"
    },
    {
      "id": "e32b",
      "from": "n32b",
      "to": "n33",
      "pathData": "M 2080 800 C 2059 810 2037 817 2015 815"
    },
    {
      "id": "e33",
      "from": "n33",
      "to": "n34",
      "pathData": "M 2015 815 C 1980 814 1945 823 1910 825"
    },
    {
      "id": "e34",
      "from": "n34",
      "to": "n35",
      "pathData": "M 1910 825 C 1875 829 1840 832 1805 835"
    },
    {
      "id": "e35",
      "from": "n35",
      "to": "n36",
      "pathData": "M 1805 835 C 1767 838 1733 846 1695 850"
    },
    {
      "id": "e36",
      "from": "n36",
      "to": "n37",
      "pathData": "M 1695 850 C 1657 856 1618 866 1580 875"
    },
    {
      "id": "e37",
      "from": "n37",
      "to": "n38",
      "pathData": "M 1580 875 C 1543 883 1503 899 1465 905"
    },
    {
      "id": "e38",
      "from": "n38",
      "to": "n39",
      "pathData": "M 1465 905 C 1427 914 1388 923 1350 925"
    },
    {
      "id": "e39",
      "from": "n39",
      "to": "n40",
      "pathData": "M 1350 925 C 1313 929 1276 932 1240 930"
    },
    {
      "id": "e40",
      "from": "n40",
      "to": "n41",
      "pathData": "M 1240 930 C 1202 930 1163 925 1125 920"
    },
    {
      "id": "e41",
      "from": "n41",
      "to": "n42",
      "pathData": "M 1125 920 C 1083 914 1042 902 1000 900"
    },
    {
      "id": "e42",
      "from": "n42",
      "to": "n43",
      "pathData": "M 1000 900 C 958 900 917 910 875 915"
    },
    {
      "id": "e43",
      "from": "n43",
      "to": "n44",
      "pathData": "M 875 915 C 833 920 792 927 750 920"
    },
    {
      "id": "e44",
      "from": "n44",
      "to": "n45",
      "pathData": "M 750 920 C 708 913 665 883 625 865"
    },
    {
      "id": "e45",
      "from": "n45",
      "to": "n46",
      "pathData": "M 625 865 C 585 847 548 826 510 810"
    },
    {
      "id": "e46",
      "from": "n46",
      "to": "n47",
      "pathData": "M 510 810 C 475 795 443 777 410 765"
    },
    {
      "id": "e47",
      "from": "n47",
      "to": "n48",
      "pathData": "M 410 765 C 380 754 351 743 325 730"
    },
    {
      "id": "e48",
      "from": "n48",
      "to": "n49",
      "pathData": "M 325 730 C 303 716 280 707 270 685"
    }
  ]
});

export const CRYSTAL_THEME_V221 = deepFreeze({
  "kind": "ThemePack",
  "id": "cloud-harbor",
  "version": "2.2.1",
  "title": "云港探险",
  "scenePresentation": {
    "id": "grounded-crystal.v1",
    "boardRef": "ximitu-card-hunt-board.v1@2.2.1",
    "zoneIds": [
      "zone-01",
      "zone-02",
      "zone-03",
      "zone-04"
    ],
    "timberEdgeIds": [
      "e01",
      "e02",
      "e03"
    ],
    "airCrossingEdgeIds": [
      "e15"
    ],
    "facilityNodeIds": [
      "n03",
      "n05b",
      "n06a",
      "n12b",
      "n18",
      "n34"
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
      "assetRef": "/assets/board-themes/cloud-harbor/regions/zone-01-crystal-v1.jpg",
      "layoutContractRef": "board.ximitu-card-hunt.zone-01-layout.v6",
      "fallbackFill": "#ccefdc"
    },
    "region-zone-02": {
      "assetRef": "/assets/board-themes/cloud-harbor/regions/zone-02-crystal-v1.jpg",
      "layoutContractRef": "board.ximitu-card-hunt.zone-02-layout.v4",
      "fallbackFill": "#dcefc9"
    },
    "region-zone-03": {
      "assetRef": "/assets/board-themes/cloud-harbor/regions/zone-03-crystal-v1.jpg",
      "layoutContractRef": "board.ximitu-card-hunt.zone-03-layout.v2",
      "fallbackFill": "#eadcf6"
    },
    "region-zone-04": {
      "assetRef": "/assets/board-themes/cloud-harbor/regions/zone-04-crystal-v1.jpg",
      "layoutContractRef": "board.ximitu-card-hunt.zone-04-layout.v2",
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

export const CRYSTAL_WORLD_V121 = deepFreeze({
  "kind": "WorldPack",
  "id": "world.ximitu.cloud-harbor",
  "version": "1.2.1",
  "title": "云港远征",
  "boardTemplateRef": "ximitu-card-hunt-board.v1@2.2.1",
  "themePackRef": "cloud-harbor@2.2.1",
  "levelPackRef": "ximitu-card-hunt.level-01@2.0.0",
  "assetBudget": {
    "maxArtRegions": 4
  }
});

export const CRYSTAL_WORLD_ROUTE_V121 = deepFreeze({
  "kind": "WorldRoute",
  "id": "route.ximitu-main",
  "version": "1.2.1",
  "title": "西米兔向前远征",
  "entryWorldRef": "world.ximitu.cloud-harbor@1.2.1",
  "transitions": [
    {
      "fromWorldRef": "world.ximitu.cloud-harbor@1.2.1",
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

export const CRYSTAL_GAME_RELEASE_V221 = deepFreeze({
  "kind": "GameRelease",
  "id": "release.ximitu-card-hunt",
  "version": "2.2.1",
  "worldRouteRef": "route.ximitu-main@1.2.1",
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
