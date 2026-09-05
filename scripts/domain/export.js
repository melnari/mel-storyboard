function escapeXml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]);
}

function mapBounds(map) {
  const right = Math.max(800, ...map.elements.map(element => element.position.x + element.size.width + 80));
  const bottom = Math.max(600, ...map.elements.map(element => element.position.y + element.size.height + 80));
  return { width: right, height: bottom };
}

function mapSvg(map, project, offsetY = 0) {
  const { width, height } = mapBounds(map);
  const sceneById = new Map(project.scenes.map(scene => [scene.id, scene]));
  const lines = map.connections.map(connection => {
    const source = map.elements.find(element => element.id === connection.sourceElementId);
    const target = map.elements.find(element => element.id === connection.targetElementId);
    if (!source || !target) return "";
    const x1 = source.position.x + source.size.width / 2;
    const y1 = source.position.y + source.size.height / 2 + offsetY;
    const x2 = target.position.x + target.size.width / 2;
    const y2 = target.position.y + target.size.height / 2 + offsetY;
    return `<line class="connection" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" />`;
  }).join("");
  const elements = map.elements.map(element => {
    const scene = sceneById.get(element.entityId);
    const title = scene?.title || element.title || element.elementType;
    return `<g class="element" transform="translate(${element.position.x},${element.position.y + offsetY})"><rect width="${element.size.width}" height="${element.size.height}" rx="8" /><text x="12" y="28">${escapeXml(title)}</text><text class="type" x="12" y="50">${escapeXml(element.elementType)}</text></g>`;
  }).join("");
  return { width, height, content: `<text class="map-title" x="24" y="${offsetY + 32}">${escapeXml(map.title)}</text>${lines}${elements}` };
}

export function projectToSvg(project, labels = {}) {
  const panelHeight = 760;
  const sceneSectionY = Math.max(panelHeight, project.maps.length * panelHeight) + 24;
  const sceneHeight = Math.max(220, project.scenes.length * 48 + 100);
  const height = sceneSectionY + sceneHeight;
  const sections = project.maps.map((map, index) => mapSvg(map, project, index * panelHeight + 48).content).join("");
  const scenes = project.scenes.map((scene, index) => `<text class="scene-row" x="32" y="${sceneSectionY + 58 + index * 48}">${escapeXml(scene.displayId)} — ${escapeXml(scene.title)} — ${escapeXml(labels.status?.(scene.status) ?? scene.status)}</text>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="${height}" viewBox="0 0 1200 ${height}"><style>svg{font-family:Arial,sans-serif;background:#17191f}.map-title{font-size:24px;font-weight:700;fill:#f0f0f0}.connection{stroke:#9aa4b2;stroke-width:3;marker-end:url(#arrow)}.element rect{fill:#313846;stroke:#c7d2e0;stroke-width:2}.element text{fill:#f0f0f0;font-size:16px}.element text.type{fill:#aeb8c5;font-size:11px}.scene-heading{font-size:22px;font-weight:700;fill:#f0f0f0}.scene-row{font-size:16px;fill:#d7dee8}</style><defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#9aa4b2" /></marker></defs>${sections}<text class="scene-heading" x="24" y="${sceneSectionY + 32}">${escapeXml(labels.sceneHeading ?? "Story scenes")}</text>${scenes}</svg>`;
}

export function projectToJson(project) {
  return JSON.stringify(project, null, 2);
}

export function projectFromJson(json) {
  const project = typeof json === "string" ? JSON.parse(json) : json;
  if (!project || typeof project !== "object") throw new Error("The imported JSON is not a project object.");
  return project;
}

function downloadBlob(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadProjectJson(project) {
  downloadBlob(projectToJson(project), `${project.title}.json`, "application/json");
}

export function downloadProjectSvg(project, labels) {
  downloadBlob(projectToSvg(project, labels), `${project.title}.svg`, "image/svg+xml");
}

export async function downloadProjectPng(project, labels) {
  const svg = projectToSvg(project, labels);
  const blob = new Blob([svg], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.src = url;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  canvas.getContext("2d").drawImage(image, 0, 0);
  URL.revokeObjectURL(url);
  canvas.toBlob(result => downloadBlob(result, `${project.title}.png`, "image/png"));
}

export function printProjectAsPdf(project, labels) {
  const preview = window.open("", "mel-storyboard-pdf");
  if (!preview) throw new Error("The browser blocked the print preview window.");
  preview.document.write(`<title>${escapeXml(project.title)}</title><style>body{font-family:Arial,sans-serif;margin:2rem}img{max-width:100%}</style><h1>${escapeXml(project.title)}</h1><p>${escapeXml(project.description)}</p><div>${project.maps.map(map => `<h2>${escapeXml(map.title)}</h2>`).join("")}</div>`);
  const svgBlob = new Blob([projectToSvg(project, labels)], { type: "image/svg+xml" });
  const url = URL.createObjectURL(svgBlob);
  preview.document.write(`<img src="${url}" alt="${escapeXml(project.title)}" />`);
  preview.document.close();
  preview.addEventListener("load", () => preview.print(), { once: true });
}
