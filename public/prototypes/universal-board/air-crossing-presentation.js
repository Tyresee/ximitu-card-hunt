// A normal board edge can have an airborne presentation. This module cannot
// change the route, consume dice, settle rewards or advance a turn.
export function isAirCrossingEdge(scene, edgeId) {
  return Boolean(edgeId && scene?.airCrossingEdgeIds?.includes(edgeId));
}

export function airCrossingFrames(points, fractions, { reducedMotion = false } = {}) {
  const centered = "translate(-50%, -50%)";
  if (reducedMotion) return [
    { opacity: .25, transform: `${centered} scale(.98)` },
    { opacity: 1, transform: `${centered} scale(1)` },
  ];
  const from = points[0];
  const to = points.at(-1);
  // The board projection already rises towards the far bank. A modest extra
  // lift makes the leap readable without flying through the rock above it.
  const liftHeight = Math.min(45, Math.max(22, Math.hypot(to.x - from.x, to.y - from.y) * .18));
  return points.map((point, index) => {
    const progress = fractions[index];
    const lift = Math.sin(progress * Math.PI) * liftHeight;
    const tilt = Math.sin(progress * Math.PI * 2) * -8;
    const scale = 1 + Math.sin(progress * Math.PI) * .1;
    return {
      offset: progress,
      transform: `${centered} translate3d(${point.x - from.x}px, ${point.y - from.y - lift}px, 0) rotate(${tilt}deg) scale(${scale})`,
    };
  });
}
