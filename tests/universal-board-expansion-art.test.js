import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import {
  EXPANSION_WORLD_BOARD_TEMPLATE,
  EXPANSION_WORLD_THEME,
} from "../public/prototypes/universal-board/expansion-world.js";
import {
  BEYOND_CLOUD_WORLD_REF,
  WORLD_PACKS,
  WORLD_REGISTRIES,
} from "../public/prototypes/universal-board/world-packs.js";
import {
  validateWorldPack,
} from "../public/prototypes/universal-board/world-runtime-core.js";

const appSource = readFileSync(
  new URL("../public/prototypes/universal-board/app.js", import.meta.url),
  "utf8",
);
const manifest = JSON.parse(readFileSync(
  new URL(
    "../art-source/beyond-cloud/regions-v1/manifest.json",
    import.meta.url,
  ),
  "utf8",
));

function jpegDimensions(buffer) {
  assert.equal(buffer[0], 0xff);
  assert.equal(buffer[1], 0xd8);
  let offset = 2;
  while (offset + 8 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    const segmentLength = buffer.readUInt16BE(offset);
    if (
      marker >= 0xc0
      && marker <= 0xcf
      && ![0xc4, 0xc8, 0xcc].includes(marker)
    ) {
      return {
        height: buffer.readUInt16BE(offset + 3),
        width: buffer.readUInt16BE(offset + 5),
      };
    }
    offset += segmentLength;
  }
  assert.fail("could not read expansion JPEG dimensions");
}

test("World 02 uses four exact crops from one complete ImageGen master", () => {
  assert.equal(manifest.schemaVersion, "imagegen-board-master.v1");
  assert.equal(manifest.selectedVersion, 2);
  assert.deepEqual(manifest.source.normalizedSize, [2400, 1120]);
  assert.equal(manifest.runtimeCrops.length, 4);
  assert.deepEqual(
    Object.keys(EXPANSION_WORLD_THEME.regionArt).sort(),
    EXPANSION_WORLD_BOARD_TEMPLATE.artRegions.map(({ id }) => id).sort(),
  );

  for (const region of EXPANSION_WORLD_BOARD_TEMPLATE.artRegions) {
    const art = EXPANSION_WORLD_THEME.regionArt[region.id];
    assert.ok(art, `${region.id} needs runtime art`);
    assert.equal(art.layoutContractRef, region.layoutContractRef);
    assert.match(art.assetRef, /^\/assets\/board-themes\/beyond-cloud\/regions\//);
    const fileUrl = new URL(`../public${art.assetRef}`, import.meta.url);
    assert.equal(existsSync(fileUrl), true, `${art.assetRef} must exist`);
    assert.deepEqual(
      jpegDimensions(readFileSync(fileUrl)),
      {
        width: region.artBox.width,
        height: region.artBox.height,
      },
    );
  }
});

test("World 02 art contracts fail closed and app composition preserves asset refs", () => {
  assert.deepEqual(
    validateWorldPack(WORLD_PACKS[BEYOND_CLOUD_WORLD_REF], WORLD_REGISTRIES),
    [],
  );
  const brokenTheme = {
    ...EXPANSION_WORLD_THEME,
    regionArt: {
      ...EXPANSION_WORLD_THEME.regionArt,
      "region-zone-05": {
        ...EXPANSION_WORLD_THEME.regionArt["region-zone-05"],
        layoutContractRef: "board.wrong-layout.v1",
      },
    },
  };
  const brokenRegistries = {
    ...WORLD_REGISTRIES,
    themePacks: {
      ...WORLD_REGISTRIES.themePacks,
      [`${brokenTheme.id}@${brokenTheme.version}`]: brokenTheme,
    },
  };
  assert.match(
    validateWorldPack(
      WORLD_PACKS[BEYOND_CLOUD_WORLD_REF],
      brokenRegistries,
    ).join("; "),
    /must match BoardTemplate layoutContractRef/,
  );
  assert.match(appSource, /const authoredArt = worldTheme\.regionArt\?\.\[region\.id\]/);
  assert.match(appSource, /\.\.\.authoredArt/);
  assert.match(
    appSource,
    /activateWorldComposition\(effect\.toWorldRef,[\s\S]{0,220}applyTheme\(\)/,
  );
});
