// Deterministic asset preparation only: preserve the selected bitmap and derive
// one exact-size master plus four same-source artBox crops. No creative edits.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
// Reproduce the already-published bitmap crops against their original layout.
import { CRYSTAL_BOARD_TEMPLATE_V220 as BOARD_TEMPLATE, CRYSTAL_THEME_V220 } from "../public/prototypes/universal-board/crystal-harbor-published-snapshots.js";
const THEME_PACKS = { "cloud-harbor": CRYSTAL_THEME_V220 };

const project = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDirectory = resolve(project, "art-source/cloud-harbor/crystal-v1");
const require = createRequire(import.meta.url);
const sharp = require(process.env.GAME_ART_SHARP_MODULE || "sharp");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sourceFile = "selected-user-source.png";
const masterFile = "world-01-master-crystal-v1.png";
const source = await readFile(resolve(sourceDirectory, sourceFile));
const metadata = await sharp(source).metadata();
const { width, height } = BOARD_TEMPLATE.worldSize;
if (BOARD_TEMPLATE.version !== "2.2.0") throw new Error("Crystal assets require BoardTemplate 2.2.0");
const master = await sharp(source).resize(width, height, {
  fit: "fill", kernel: "lanczos3",
}).png({ compressionLevel: 9 }).toBuffer();
await mkdir(sourceDirectory, { recursive: true });
await writeFile(resolve(sourceDirectory, masterFile), master);

const crops = [];
for (const region of BOARD_TEMPLATE.artRegions) {
  const { x: left, y: top, width: cropWidth, height: cropHeight } = region.artBox;
  const assetRef = THEME_PACKS["cloud-harbor"].regionArt[region.id].assetRef;
  if (!assetRef.endsWith(`${region.zoneId}-crystal-v1.jpg`)) {
    throw new Error(`Unexpected crystal runtime asset for ${region.id}`);
  }
  const destination = resolve(project, `public${assetRef}`);
  const jpeg = await sharp(master).extract({ left, top, width: cropWidth, height: cropHeight })
    .jpeg({ quality: 90, chromaSubsampling: "4:4:4", mozjpeg: false }).toBuffer();
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, jpeg);
  crops.push({
    regionId: region.id, zoneId: region.zoneId, layoutContractRef: region.layoutContractRef,
    assetRef, artBox: region.artBox, width: cropWidth, height: cropHeight,
    sha256: hash(jpeg), bytes: jpeg.length,
  });
}
const record = {
  schemaVersion: "crystal-harbor-asset-preparation.v1",
  generatedAt: "2026-09-23",
  generator: "builtin image_gen; selected by user; no regeneration",
  source: { file: sourceFile, sha256: hash(source), width: metadata.width, height: metadata.height, bytes: source.length },
  master: { file: masterFile, sha256: hash(master), width, height, bytes: master.length },
  processing: {
    library: "sharp", version: sharp.versions.sharp, vipsVersion: sharp.versions.vips,
    resize: { fit: "fill", kernel: "lanczos3", width, height },
    jpeg: { quality: 90, chromaSubsampling: "4:4:4", mozjpeg: false },
    creativeChanges: false,
    note: "1836x857 selected source is resized to the exact 2400x1120 world; aspect adjustment is less than 0.024%. Crops share this one master, including the 60px west-region overlap.",
  },
  crops,
};
await writeFile(resolve(sourceDirectory, "asset-preparation.json"), `${JSON.stringify(record, null, 2)}\n`);
process.stdout.write(`Prepared ${crops.length} crystal crops (${crops.reduce((sum, crop) => sum + crop.bytes, 0)} bytes).\n`);
