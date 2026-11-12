import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL(
  "../public/prototypes/universal-board/app.js",
  import.meta.url,
), "utf8");
const htmlSource = readFileSync(new URL(
  "../public/prototypes/universal-board/index.html",
  import.meta.url,
), "utf8");

function topLevelFunctionSource(functionName) {
  const declaration = new RegExp(
    `^(?:async\\s+)?function\\s+${functionName}\\s*\\(`,
    "m",
  );
  const match = declaration.exec(appSource);
  assert.ok(match, `expected app.js to declare ${functionName}()`);
  const remainder = appSource.slice(match.index);
  const nextLine = remainder.indexOf("\n") + 1;
  const nextDeclaration = remainder.slice(nextLine).search(
    /^(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/m,
  );
  return nextDeclaration < 0
    ? remainder
    : remainder.slice(0, nextLine + nextDeclaration);
}

function cardCatalogSectionSource() {
  const start = htmlSource.indexOf('id="layout-editor-card-section"');
  const end = htmlSource.indexOf('id="layout-editor-event-section"', start);
  assert.ok(start >= 0 && end > start, "expected the card catalog editor section");
  return htmlSource.slice(start, end);
}

function openingTagForId(id) {
  const idIndex = htmlSource.indexOf(`id="${id}"`);
  assert.ok(idIndex >= 0, `expected #${id}`);
  const start = htmlSource.lastIndexOf("<", idIndex);
  const end = htmlSource.indexOf(">", idIndex);
  assert.ok(start >= 0 && end > idIndex, `expected opening tag for #${id}`);
  return htmlSource.slice(start, end + 1);
}

test("the retired Card Catalog editor stays hidden and preserves historical compatibility", () => {
  const tab = openingTagForId("layout-editor-card-tab");
  assert.match(tab, /\shidden(?:\s|>)/);

  const section = cardCatalogSectionSource();
  assert.match(section, /目录初始为空/);
  assert.match(section, /只有你新增的内容才是正式卡片/);
  assert.match(section, /不会预先锁死卡片总数/);
  assert.doesNotMatch(section, /(?:rarity|稀有度|100\s*(?:张|种))/i);

  assert.match(
    appSource,
    /let publishedCardCatalogPublication = \{[\s\S]*?cards: \[\],[\s\S]*?\};/,
  );
  const render = topLevelFunctionSource("renderCardCatalogEditor");
  assert.match(render, /尚未添加卡片。请先新增卡片/);
  assert.match(render, /card-catalog-empty/);
  assert.doesNotMatch(render, /(?:rarity|稀有度|100\s*(?:张|种))/i);

  const normalize = topLevelFunctionSource("normalizeCardCatalogCard");
  assert.match(normalize, /origin !== "owner"/);
  assert.doesNotMatch(normalize, /rarity/i);
});

test("owner card creation uses the shared persistent registry and optimistic revision", () => {
  const load = topLevelFunctionSource("loadPublishedCardCatalog");
  assert.match(load, /fetch\("\/api\/card-catalog\/v1", \{ cache: "no-store" \}\)/);
  assert.match(load, /applyCardCatalogRegistryPayload/);

  const create = topLevelFunctionSource("createCardCatalogCard");
  assert.match(create, /fetch\("\/api\/admin\/card-catalog\/v1\/cards", \{/);
  assert.match(create, /method: "POST"/);
  assert.match(create, /expectedUserId: layoutEditorOwnerUserId/);
  assert.match(create, /expectedRevision: publishedCardCatalogPublication\.revision/);
  assert.match(create, /card: \{ name, story \}/);
  assert.match(create, /applyCardCatalogRegistryPayload\(payload\)/);
  assert.doesNotMatch(create, /localStorage|XIMITU_CARD_CATALOG|rarity/i);
});

test("each owner-added card offers PNG, JPEG, or WebP upload and explicit replacement", () => {
  const render = topLevelFunctionSource("renderCardCatalogEditor");
  assert.match(render, /fileInput\.accept = "image\/png,image\/jpeg,image\/webp"/);
  assert.match(render, /card\.image \? "替换图片" : "上传卡片图片"/);
  assert.match(render, /frame\.append\(textElement\("span", "", "尚未上传"\)\)/);

  const upload = topLevelFunctionSource("uploadCardCatalogImage");
  assert.match(upload, /\["image\/png", "image\/jpeg", "image\/webp"\]\.includes\(file\.type\)/);
  assert.match(upload, /不接受 SVG/);
  assert.match(upload, /file\.size > CARD_CATALOG_IMAGE_MAX_BYTES/);
  assert.match(
    upload,
    /`\/api\/admin\/card-catalog\/v1\/cards\/\$\{encodeURIComponent\(cardId\)\}\/image`/,
  );
  assert.match(upload, /method: "PUT"/);
  assert.match(upload, /expectedRevision: publishedCardCatalogPublication\.revision/);
  assert.match(upload, /contentType: file\.type/);
  assert.match(upload, /dataUrl/);
  assert.doesNotMatch(upload, /rarity|generated|fallback/i);
});
