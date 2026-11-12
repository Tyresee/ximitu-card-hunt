function finiteNumber(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

export function viewportSize(board) {
  const viewBox = Array.isArray(board?.viewBox) ? board.viewBox : [];
  return {
    width: Math.max(1, finiteNumber(viewBox[2], 1)),
    height: Math.max(1, finiteNumber(viewBox[3], 1)),
  };
}

/** A presentation viewport only: never mutate the session's exact board snapshot.
 * Match the actual canvas aspect so SVG meet scaling cannot create letterboxing.
 * Keep the familiar world-unit height, zooming in only for extremely wide screens.
 */
export function fitCameraViewport(board, renderedWidth, renderedHeight) {
  const width = Number(renderedWidth);
  const height = Number(renderedHeight);
  if (!(width > 0) || !(height > 0) || !Number.isFinite(width / height)) return board;
  const base = viewportSize(board);
  const worldWidth = Math.max(1, finiteNumber(board?.worldSize?.width, base.width));
  const worldHeight = Math.max(1, finiteNumber(board?.worldSize?.height, base.height));
  const aspect = width / height;
  const viewHeight = Math.min(base.height, worldHeight, worldWidth / aspect);
  return { ...board, viewBox: [0, 0, viewHeight * aspect, viewHeight] };
}

export function cameraBounds(board) {
  const viewport = viewportSize(board);
  const worldWidth = Math.max(viewport.width, finiteNumber(board?.worldSize?.width, viewport.width));
  const worldHeight = Math.max(viewport.height, finiteNumber(board?.worldSize?.height, viewport.height));
  return {
    minX: 0,
    minY: 0,
    maxX: worldWidth - viewport.width,
    maxY: worldHeight - viewport.height,
  };
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, finiteNumber(value)));
}

export function clampCamera(camera, bounds) {
  return {
    x: clamp(camera?.x, bounds.minX, bounds.maxX),
    y: clamp(camera?.y, bounds.minY, bounds.maxY),
  };
}

function dampAxis(value, minimum, maximum, resistance) {
  const numericValue = finiteNumber(value);
  if (numericValue < minimum) return minimum + ((numericValue - minimum) * resistance);
  if (numericValue > maximum) return maximum + ((numericValue - maximum) * resistance);
  return numericValue;
}

export function dampCamera(camera, bounds, resistance = 0.28) {
  const normalizedResistance = clamp(resistance, 0, 1);
  return {
    x: dampAxis(camera?.x, bounds.minX, bounds.maxX, normalizedResistance),
    y: dampAxis(camera?.y, bounds.minY, bounds.maxY, normalizedResistance),
  };
}

export function centerCameraOnPoint(point, board) {
  const viewport = viewportSize(board);
  return clampCamera({
    x: finiteNumber(point?.x) - (viewport.width / 2),
    y: finiteNumber(point?.y) - (viewport.height / 2),
  }, cameraBounds(board));
}

export function screenDragToCamera({
  startCamera,
  deltaX,
  deltaY,
  renderedWidth,
  renderedHeight,
  board,
}) {
  const viewport = viewportSize(board);
  const width = Math.max(1, finiteNumber(renderedWidth, viewport.width));
  const height = Math.max(1, finiteNumber(renderedHeight, viewport.height));
  const worldUnitsPerPixel = Math.max(viewport.width / width, viewport.height / height);
  return {
    x: finiteNumber(startCamera?.x) - (finiteNumber(deltaX) * worldUnitsPerPixel),
    y: finiteNumber(startCamera?.y) - (finiteNumber(deltaY) * worldUnitsPerPixel),
  };
}

export function isPointVisible(point, camera, board, margin = 140) {
  const viewport = viewportSize(board);
  const safeMargin = Math.max(
    0,
    Math.min(finiteNumber(margin), viewport.width / 2, viewport.height / 2),
  );
  return (
    finiteNumber(point?.x) >= finiteNumber(camera?.x) + safeMargin
    && finiteNumber(point?.x) <= finiteNumber(camera?.x) + viewport.width - safeMargin
    && finiteNumber(point?.y) >= finiteNumber(camera?.y) + safeMargin
    && finiteNumber(point?.y) <= finiteNumber(camera?.y) + viewport.height - safeMargin
  );
}
