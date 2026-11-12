// Small light anchors for the cloud-harbor departure beacon and historical
// reveal/route celebrations. No tower, gate, horn or extra hit target.
const SVG_NS = "http://www.w3.org/2000/svg";

function svg(documentRef, tag, attrs = {}) {
  const element = documentRef.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, String(value));
  return element;
}

function layer(documentRef, parent, className) {
  const group = svg(documentRef, "g", { class: className, "pointer-events": "none", "aria-hidden": "true" });
  parent.append(group);
  return group;
}

export function appendHarborLightHost(host, { kind = "route", active = false, label = "航道微光" } = {}) {
  const doc = host.ownerDocument || globalThis.document;
  const group = svg(doc, "g", { class: "harbor-facility harbor-light-host", "data-facility-phase": "idle", "pointer-events": "none", "aria-hidden": "true" });
  const title = svg(doc, "title"); title.textContent = label;
  group.append(title);
  const glow = svg(doc, "ellipse", { cx: 0, cy: 2, rx: 27, ry: 10, fill: "#c8f7f2", opacity: active ? .42 : 0, class: "harbor-terrain-glow" });
  group.append(glow);
  if (kind === "departure") {
    const lights = layer(doc, group, "harbor-departure-lights");
    for (const [x, y, r] of [[-22,-7,2],[16,-11,2.6],[29,3,1.8],[-8,-17,1.4]]) {
      lights.append(svg(doc, "circle", { cx: x, cy: y, r, fill: "#fff6bf" }));
    }
    lights.setAttribute("opacity", "0");
  }
  host.append(group);
  return group;
}
