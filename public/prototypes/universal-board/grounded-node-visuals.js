const SVG_NS = "http://www.w3.org/2000/svg";

const KIND_ALIASES = Object.freeze({
  activity: "event",
  goal: "portal",
  "map-effect": "foghorn",
  reward: "coin",
  treasure: "gem",
});

const VISUAL_KINDS = new Set([
  "learning", "coin", "gem", "star", "event", "mooring", "foghorn",
  "cloud-gate", "anchor", "key", "home", "portal", "junction", "item", "transport",
]);

// These shapes only draw a surface around the caller's node origin.
const STONE_TOP = "M -20 -2 Q -20 -6 -15 -8 L -3 -12 Q 0 -13 4 -12 L 16 -7 Q 20 -5 20 -1 L 19 4 Q 18 7 14 8 L 3 11 Q 0 12 -4 11 L -16 7 Q -20 5 -20 2 Z";
const STONE_FRONT = "M -20 0 L -20 4 Q -20 8 -16 10 L -4 14 Q 0 15 4 14 L 15 11 Q 20 9 20 5 L 20 -1 L 19 4 Q 18 7 14 8 L 3 11 Q 0 12 -4 11 L -16 7 Q -20 5 -20 2 Z";

function decoration(documentRef, name, attributes = {}) {
  const element = documentRef.createElementNS(SVG_NS, name);
  Object.entries({ "pointer-events": "none", ...attributes })
    .forEach(([key, value]) => element.setAttribute(key, String(value)));
  return element;
}

function addPath(parent, documentRef, className, d, attributes = {}) {
  const path = decoration(documentRef, "path", { class: className, d, ...attributes });
  parent.append(path);
  return path;
}

function appendStone(parent, documentRef, ordinary) {
  const stone = decoration(documentRef, "g", {
    class: "grounded-node-stone",
    transform: ordinary ? "scale(1)" : "scale(1.1)",
  });
  stone.append(decoration(documentRef, "ellipse", {
    class: "grounded-node-contact-shadow", cx: 1.5, cy: 9, rx: 21, ry: 6,
  }));
  addPath(stone, documentRef, "grounded-node-front", STONE_FRONT);
  addPath(stone, documentRef, "grounded-node-top", STONE_TOP);
  addPath(stone, documentRef, "grounded-node-light-edge", "M -18 -3 Q -17 -5 -14 -6 L -3 -10 Q 0 -11 4 -10");
  addPath(stone, documentRef, "grounded-node-stone-grain", "M 10 5 L 13 4 M -14 2 L -12 3");
  parent.append(stone);
}

function appendCoin(parent, documentRef) {
  const coin = decoration(documentRef, "g", { class: "grounded-node-object grounded-node-coin" });
  coin.append(
    decoration(documentRef, "ellipse", {
      class: "grounded-node-object-shadow", cx: 1, cy: 6, rx: 11, ry: 3,
    }),
    decoration(documentRef, "ellipse", {
      class: "grounded-node-coin-edge", cx: 2, cy: -6, rx: 10, ry: 12,
    }),
    decoration(documentRef, "ellipse", {
      class: "grounded-node-coin-face", cx: -0.5, cy: -7, rx: 10, ry: 12,
    }),
    decoration(documentRef, "ellipse", {
      class: "grounded-node-coin-inset", cx: -0.5, cy: -7, rx: 6.5, ry: 8.4,
    }),
  );
  addPath(coin, documentRef, "grounded-node-coin-stamp", "M -3 -7 L -.5 -11 L 2 -7 L -.5 -3 Z");
  addPath(coin, documentRef, "grounded-node-object-glint", "M -6 -12 Q -4 -16 -1 -16");
  parent.append(coin);
}

function appendGem(parent, documentRef) {
  const gem = decoration(documentRef, "g", { class: "grounded-node-object grounded-node-gem" });
  gem.append(decoration(documentRef, "ellipse", {
    class: "grounded-node-object-shadow", cx: 1, cy: 6, rx: 11, ry: 3,
  }));
  addPath(gem, documentRef, "grounded-node-gem-body", "M -11 -7 L -5 -15 L 5 -15 L 11 -7 L 0 7 Z");
  addPath(gem, documentRef, "grounded-node-gem-light", "M -11 -7 L -5 -15 L 0 -7 Z M -11 -7 L 0 -7 L 0 7 Z");
  addPath(gem, documentRef, "grounded-node-gem-facet", "M -5 -15 L 0 -7 L 5 -15 M -11 -7 H 11 M 0 -7 L 0 7");
  addPath(gem, documentRef, "grounded-node-object-glint", "M -7 -8 L -4 -12");
  parent.append(gem);
}

function appendInscription(parent, documentRef, kind, facility, glyph) {
  const mark = decoration(documentRef, "g", {
    class: `grounded-node-mark${facility ? " is-facility-mark" : ""}`,
    transform: facility ? "translate(0 1) scale(.7 .58)" : "translate(0 -1) scale(1 .78)",
  });
  const line = (d, extra = {}) => addPath(mark, documentRef, "grounded-node-engraving", d, extra);
  switch (kind) {
    case "junction":
      line("M 0 9 V 1 L -9 -7 M 0 1 L 9 -7 M -9 -1 V -7 H -3 M 3 -7 H 9 V -1");
      break;
    case "foghorn":
      line("M -10 3 H -6 L 0 8 V -8 L -6 -3 H -10 Z M 5 -5 Q 10 0 5 5 M 9 -9 Q 17 0 9 9");
      break;
    case "cloud-gate":
      line("M -11 -6 H 11 M -7 -9 V -3 M 7 -9 V -3 M -11 3 Q -7 -1 -3 3 T 5 3 T 13 3 M -11 9 Q -7 5 -3 9 T 5 9 T 13 9");
      break;
    case "transport":
      line("M -9 7 L 0 -2 L 9 7 M -7 -2 L 0 -9 L 7 -2");
      break;
    case "mooring":
      line("M -10 -4 H 10 M -6 -4 L -4 5 H 4 L 6 -4 M -10 7 H 10");
      break;
    case "home":
      line("M -12 -1 L 0 -11 L 12 -1 M -9 -3 V 9 H 9 V -3 M -3 9 V 2 H 3 V 9");
      break;
    case "portal":
      line("M -10 10 V -2 Q -10 -13 0 -13 Q 10 -13 10 -2 V 10 M -13 10 H 13 M -2 -1 L 3 3 L -2 7 M -5 3 H 3");
      break;
    case "key":
      mark.append(decoration(documentRef, "circle", {
        class: "grounded-node-engraving", cx: -5, cy: -5, r: 5,
      }));
      line("M -1 -1 L 9 9 M 5 5 L 9 1 M 8 8 L 12 4");
      break;
    case "item":
      line("M -10 -6 H 10 V 9 H -10 Z M -10 -1 H 10 M -3 -6 V -9 H 3 V -6 M 0 -1 V 3");
      break;
    case "star":
      addPath(mark, documentRef, "grounded-node-star", "M 0 -13 L 4 -5 L 13 -4 L 6 3 L 8 12 L 0 8 L -8 12 L -6 3 L -13 -4 L -4 -5 Z");
      break;
    case "anchor":
    case "learning":
      mark.append(
        decoration(documentRef, "ellipse", {
          class: "grounded-node-footstep", cx: -5, cy: 3, rx: 3, ry: 5, transform: "rotate(-20 -5 3)",
        }),
        decoration(documentRef, "ellipse", {
          class: "grounded-node-footstep", cx: 5, cy: -4, rx: 3, ry: 5, transform: "rotate(20 5 -4)",
        }),
      );
      break;
    default: {
      const text = decoration(documentRef, "text", {
        class: "grounded-node-glyph", x: 0, y: 5, "text-anchor": "middle",
      });
      text.textContent = glyph || "!";
      mark.append(text);
    }
  }
  parent.append(mark);
}

/**
 * Append display-only stonework at an existing node's local (0, 0).
 * The caller retains position, accessible name, focus, hit ownership and state.
 * `ordinary` and `facility` are presentation flags resolved by the caller.
 */
export function appendGroundedNodeVisual(parent, {
  kind = "learning",
  ordinary = false,
  facility = false,
  glyph = "",
} = {}) {
  const documentRef = parent?.ownerDocument;
  if (!documentRef?.createElementNS || typeof parent?.append !== "function") {
    throw new TypeError("Grounded node visuals require an SVG parent");
  }
  const aliasedKind = KIND_ALIASES[kind] || kind;
  const visualKind = VISUAL_KINDS.has(aliasedKind) ? aliasedKind : "event";
  const token = decoration(documentRef, "g", {
    class: `node-visual-token grounded-node grounded-node-${visualKind}${ordinary ? " is-ordinary" : " is-special"}${facility ? " is-facility" : ""}`,
    "data-node-visual-kind": visualKind,
    "data-node-renderer": "grounded-stone.v1",
    "aria-hidden": "true",
  });

  // The replaced complete artwork occupies this exact box. Keep its geometry
  // without creating a new hit target or enlarging the parent's bounding box.
  token.append(decoration(documentRef, "rect", {
    class: "grounded-node-footprint", x: -31, y: -31, width: 62, height: 62,
    fill: "none", opacity: 0,
  }));
  appendStone(token, documentRef, ordinary);
  if (!ordinary) {
    if (visualKind === "coin" && !facility) appendCoin(token, documentRef);
    else if (visualKind === "gem" && !facility) appendGem(token, documentRef);
    else appendInscription(token, documentRef, visualKind, facility, glyph);
  }
  parent.append(token);
  return token;
}
