import test from "node:test";
import assert from "node:assert/strict";

import {
  cameraBounds,
  centerCameraOnPoint,
  clampCamera,
  dampCamera,
  fitCameraViewport,
  isPointVisible,
  screenDragToCamera,
  viewportSize,
} from "../public/prototypes/universal-board/camera-core.js";

const LARGE_BOARD = {
  viewBox: [0, 0, 1200, 620],
  worldSize: { width: 2400, height: 1120 },
};

test("viewportSize reads the visible board dimensions and keeps malformed values safe", () => {
  assert.deepEqual(viewportSize(LARGE_BOARD), { width: 1200, height: 620 });
  assert.deepEqual(
    viewportSize({ viewBox: [0, 0, 0, -20] }),
    { width: 1, height: 1 },
  );
  assert.deepEqual(viewportSize(), { width: 1, height: 1 });
});

test("cameraBounds exposes only the world area outside the viewport", () => {
  assert.deepEqual(cameraBounds(LARGE_BOARD), {
    minX: 0,
    minY: 0,
    maxX: 1200,
    maxY: 500,
  });
  assert.deepEqual(cameraBounds({
    viewBox: [0, 0, 1200, 620],
    worldSize: { width: 800, height: 400 },
  }), {
    minX: 0,
    minY: 0,
    maxX: 0,
    maxY: 0,
  });
});

test("clampCamera snaps overscroll back to every world boundary", () => {
  const bounds = cameraBounds(LARGE_BOARD);
  assert.deepEqual(clampCamera({ x: -100, y: 650 }, bounds), { x: 0, y: 500 });
  assert.deepEqual(clampCamera({ x: 1400, y: -80 }, bounds), { x: 1200, y: 0 });
  assert.deepEqual(clampCamera({ x: 600, y: 250 }, bounds), { x: 600, y: 250 });
});

test("dampCamera resists overscroll without changing in-bounds coordinates", () => {
  const bounds = cameraBounds(LARGE_BOARD);
  assert.deepEqual(
    dampCamera({ x: -100, y: 600 }, bounds, 0.25),
    { x: -25, y: 525 },
  );
  assert.deepEqual(
    dampCamera({ x: 600, y: 250 }, bounds, 0.25),
    { x: 600, y: 250 },
  );
  assert.deepEqual(
    dampCamera({ x: -100, y: 600 }, bounds, -1),
    { x: 0, y: 500 },
  );
  assert.deepEqual(
    dampCamera({ x: -100, y: 600 }, bounds, 2),
    { x: -100, y: 600 },
  );
});

test("screenDragToCamera converts rendered pointer movement into world coordinates", () => {
  assert.deepEqual(screenDragToCamera({
    startCamera: { x: 500, y: 250 },
    deltaX: 120,
    deltaY: -62,
    renderedWidth: 600,
    renderedHeight: 310,
    board: LARGE_BOARD,
  }), {
    x: 260,
    y: 374,
  });

  assert.deepEqual(screenDragToCamera({
    startCamera: { x: 100, y: 100 },
    deltaX: 120,
    deltaY: 62,
    renderedWidth: 1200,
    renderedHeight: 620,
    board: LARGE_BOARD,
  }), {
    x: -20,
    y: 38,
  });

  assert.deepEqual(screenDragToCamera({
    startCamera: { x: 100, y: 100 },
    deltaX: 0,
    deltaY: 100,
    renderedWidth: 1200,
    renderedHeight: 800,
    board: LARGE_BOARD,
  }), {
    x: 100,
    y: 0,
  });
});

test("centerCameraOnPoint centers ordinary points and clamps points near world edges", () => {
  assert.deepEqual(
    centerCameraOnPoint({ x: 1200, y: 560 }, LARGE_BOARD),
    { x: 600, y: 250 },
  );
  assert.deepEqual(
    centerCameraOnPoint({ x: 20, y: 20 }, LARGE_BOARD),
    { x: 0, y: 0 },
  );
  assert.deepEqual(
    centerCameraOnPoint({ x: 2380, y: 1100 }, LARGE_BOARD),
    { x: 1200, y: 500 },
  );
});

test("isPointVisible includes safe-area edges and excludes points outside them", () => {
  const camera = { x: 600, y: 250 };

  assert.equal(isPointVisible({ x: 740, y: 390 }, camera, LARGE_BOARD), true);
  assert.equal(isPointVisible({ x: 1660, y: 730 }, camera, LARGE_BOARD), true);
  assert.equal(isPointVisible({ x: 739, y: 390 }, camera, LARGE_BOARD), false);
  assert.equal(isPointVisible({ x: 1660, y: 731 }, camera, LARGE_BOARD), false);

  assert.equal(isPointVisible({ x: 1200, y: 560 }, camera, LARGE_BOARD, 999), true);
  assert.equal(isPointVisible({ x: 1200, y: 559 }, camera, LARGE_BOARD, 999), false);
});


test("responsive camera fills wide, desktop and portrait canvases without mutating the exact snapshot", () => {
  const frozen = Object.freeze({ ...LARGE_BOARD, viewBox: Object.freeze([...LARGE_BOARD.viewBox]) });
  for (const [width, height] of [[3418, 1772], [1920, 1080], [1280, 720], [390, 844], [8000, 600]]) {
    const board = fitCameraViewport(frozen, width, height);
    const viewport = viewportSize(board);
    assert.ok(Math.abs(viewport.width / viewport.height - width / height) < 1e-10);
    assert.ok(viewport.width <= LARGE_BOARD.worldSize.width && viewport.height <= LARGE_BOARD.worldSize.height);
    const point = { x: 1200, y: 560 };
    const camera = centerCameraOnPoint(point, board);
    assert.equal(isPointVisible(point, camera, board, 60), true);
    const moved = screenDragToCamera({ startCamera: camera, deltaX: 80, deltaY: 30, renderedWidth: width, renderedHeight: height, board });
    assert.ok(Math.abs((camera.x - moved.x) * width / viewport.width - 80) < 1e-8);
    assert.ok(Math.abs((camera.y - moved.y) * height / viewport.height - 30) < 1e-8);
    assert.equal(board.nodes, frozen.nodes);
    assert.equal(board.worldSize, frozen.worldSize);
  }
  assert.deepEqual(frozen.viewBox, [0, 0, 1200, 620]);
  assert.equal(fitCameraViewport(frozen, 0, 0), frozen);
});
