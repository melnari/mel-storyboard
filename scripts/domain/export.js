import { connectionGeometry } from "./geometry.js";
import { STATUS_COLOR_CLASSES } from "./constants.js";
import { clone, normalizeConnectionType } from "./model.js";
import { normalizeSceneElementSize } from "./scene-card.js";

function escapeXml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]);
}

function boardBounds(elements) {
  return {
    width: Math.max(800, ...elements.map(element => element.position.x + element.size.width + 80)),
    height: Math.max(600, ...elements.map(element => element.position.y + element.size.height + 80))
  };
}

function svgTextLines(className, x, y, lines, lineHeight, attributes = {}) {
  const extraAttributes = Object.entries(attributes).map(([name, value]) => `${name}="${escapeXml(value)}"`).join(" ");
  const tspans = lines.map((line, index) => `<tspan x="${x}" dy="${index ? lineHeight : 0}">${escapeXml(line)}</tspan>`).join("");
  return `<text class="${className}" x="${x}" y="${y}"${extraAttributes ? ` ${extraAttributes}` : ""}>${tspans}</text>`;
}

export function sceneBoardToSvg(board, labels = {}) {
  const sceneById = new Map(board.scenes.map(scene => [scene.id, scene]));
  const elements = board.elements.map(element => {
    const scene = sceneById.get(element.sceneId);
    const source = {
      ...element,
      size: { ...(element.size ?? {}) },
      visualConfig: { ...(element.visualConfig ?? {}) }
    };
    const presentation = normalizeSceneElementSize(source, scene, {
      fallbackTitle: labels.scene || "Scene",
      statusLabel: labels.status?.(scene?.status) ?? scene?.status ?? ""
    });
    return {
      ...source,
      ...presentation,
      statusColorClass: labels.statusColors ? STATUS_COLOR_CLASSES[scene?.status] ?? STATUS_COLOR_CLASSES.OFFEN : ""
    };
  });
  const { width, height } = boardBounds(elements);
  const elementById = new Map(elements.map(element => [element.id, element]));
  const lines = board.connections.map(connection => {
    const source = elementById.get(connection.sourceElementId);
    const target = elementById.get(connection.targetElementId);
    if (!source || !target) return "";
    const connectionType = normalizeConnectionType(connection.connectionType);
    const isBilateral = connectionType.startsWith("bilateral");
    const isDeactivated = connectionType.endsWith("deactivated");
    const geometry = connectionGeometry(source, target, { bilateral: isBilateral });
    const lineAttributes = isDeactivated ? ' stroke-dasharray="2 7"' : "";
    const label = connection.label?.trim()
      ? `<text class="connection-label" x="${geometry.label.x}" y="${geometry.label.y}">${escapeXml(connection.label)}</text>`
      : "";
    const reverseArrow = geometry.reverseArrowPoints ? `<polygon class="connection-arrow" points="${geometry.reverseArrowPoints}" />` : "";
    return `<line class="connection"${lineAttributes} x1="${geometry.source.x}" y1="${geometry.source.y}" x2="${geometry.target.x}" y2="${geometry.target.y}" /><polygon class="connection-arrow" points="${geometry.arrowPoints}" />${reverseArrow}${label}`;
  }).join("");
  const elementMarkup = elements.map(element => {
    const scene = sceneById.get(element.sceneId);
    const title = svgTextLines("element-title", 14, element.titleY, element.titleLines, 18);
    const description = element.descriptionLines.length
      ? svgTextLines("element-description", 14, element.descriptionY, element.descriptionLines, element.descriptionLineHeight)
      : "";
    const displayId = `<text class="element-id" x="${element.displayIdX}" y="${element.titleY}" text-anchor="end">${escapeXml(element.displayId)}</text>`;
    const status = `<rect class="element-status-badge" x="10" y="${element.statusBadgeY}" width="${element.statusBadgeWidth}" height="18" rx="9" /><text class="element-status" x="18" y="${element.statusY}">${escapeXml(element.statusLabel)}</text>`;
    const statusClass = element.statusColorClass ? ` status-${element.statusColorClass}` : "";
    return `<g class="element${statusClass}" transform="translate(${element.position.x},${element.position.y})"><rect class="element-frame" width="${element.size.width}" height="${element.size.height}" rx="8" />${title}${description}${displayId}${status}</g>`;
  }).join("");
  const chapterNodeMarkup = (board.chapters ?? []).flatMap(chapter => (chapter.nodes ?? []).map(node => {
    const color = node.nodeType === "ENTRY" ? "#6ed6a0" : "#f6c453";
    return `<g class="chapter-node ${node.nodeType.toLowerCase()}" transform="translate(${node.position?.x ?? 0},${node.position?.y ?? 0})"><circle r="18" fill="#313846" stroke="${color}" stroke-width="2" /><text class="chapter-node-title" y="34" text-anchor="middle">${escapeXml(node.title)}</text></g>`;
  })).join("");
  const chapterNodeById = new Map((board.chapters ?? []).flatMap(chapter => (chapter.nodes ?? []).map(node => [node.id, node])));
  const chapterConnectionMarkup = (board.chapterConnections ?? []).map(connection => {
    const source = chapterNodeById.get(connection.sourceNodeId);
    const target = chapterNodeById.get(connection.targetNodeId);
    if (!source || !target) return "";
    const x1 = (source.position?.x ?? 0) + 18;
    const y1 = source.position?.y ?? 0;
    const x2 = (target.position?.x ?? 0) - 18;
    const y2 = target.position?.y ?? 0;
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    const px = -uy;
    const py = ux;
    const arrow = `${x2},${y2} ${x2 - ux * 12 + px * 6},${y2 - uy * 12 + py * 6} ${x2 - ux * 12 - px * 6},${y2 - uy * 12 - py * 6}`;
    const label = connection.label?.trim() ? `<text class="chapter-connection-label" x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 8}">${escapeXml(connection.label)}</text>` : "";
    return `<line class="chapter-connection" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" /><polygon class="chapter-connection-arrow" points="${arrow}" />${label}`;
  }).join("");
  const statusColorStyles = labels.statusColors ? ".element.status-open .element-frame{fill:#313846;stroke:#9aa4b2}.element.status-open text{fill:#f0f3f7}.element.status-open .element-description,.element.status-open .element-id{fill:#d3dae4}.element.status-open .element-status-badge{fill:rgba(246,196,83,.12);stroke:#59687a}.element.status-open .element-status{fill:#f6c453}.element.status-waiting .element-frame{fill:#e2e5ea;stroke:#8a97a6}.element.status-waiting text{fill:#20252d}.element.status-waiting .element-description,.element.status-waiting .element-id{fill:#3f4a57}.element.status-waiting .element-status-badge{fill:rgba(72,84,99,.13);stroke:#6f7d8c}.element.status-waiting .element-status{fill:#485463}.element.status-active .element-frame{fill:#cfe1f4;stroke:#7899b8}.element.status-active text{fill:#1e3044}.element.status-active .element-description,.element.status-active .element-id{fill:#40566c}.element.status-active .element-status-badge{fill:rgba(36,95,157,.13);stroke:#7899b8}.element.status-active .element-status{fill:#245f9d}.element.status-success .element-frame{fill:#d2ead6;stroke:#82ad8b}.element.status-success text{fill:#1e3a25}.element.status-success .element-description,.element.status-success .element-id{fill:#46664d}.element.status-success .element-status-badge{fill:rgba(46,125,70,.13);stroke:#82ad8b}.element.status-success .element-status{fill:#2e7d46}.element.status-partial-success .element-frame{fill:#f6dfbd;stroke:#c69a62}.element.status-partial-success text{fill:#4a2d14}.element.status-partial-success .element-description,.element.status-partial-success .element-id{fill:#705333}.element.status-partial-success .element-status-badge{fill:rgba(164,96,25,.13);stroke:#c69a62}.element.status-partial-success .element-status{fill:#a46019}.element.status-failure .element-frame{fill:#f3cccc;stroke:#c9898e}.element.status-failure text{fill:#4a2023}.element.status-failure .element-description,.element.status-failure .element-id{fill:#71464a}.element.status-failure .element-status-badge{fill:rgba(163,58,66,.13);stroke:#c9898e}.element.status-failure .element-status{fill:#a33a42}.element.status-skipped .element-frame{fill:#e2d3f0;stroke:#aa91bf}.element.status-skipped text{fill:#352342}.element.status-skipped .element-description,.element.status-skipped .element-id{fill:#614c73}.element.status-skipped .element-status-badge{fill:rgba(116,73,162,.13);stroke:#aa91bf}.element.status-skipped .element-status{fill:#7449a2}" : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><style>svg{font-family:Arial,sans-serif;background:#17191f}.connection{stroke:#f6c453;stroke-width:3;fill:none;stroke-linecap:round}.connection-arrow{fill:#f6c453}.connection-label{fill:#f6c453;font-size:12px;font-weight:600;paint-order:stroke;stroke:#17191f;stroke-width:4px;text-anchor:middle}.chapter-connection{stroke:#6ed6a0;stroke-width:2;stroke-dasharray:6 5;fill:none}.chapter-connection-arrow{fill:#6ed6a0}.chapter-connection-label{fill:#6ed6a0;font-size:12px;font-weight:600;paint-order:stroke;stroke:#17191f;stroke-width:4px;text-anchor:middle}.element-frame{fill:#313846;stroke:#c7d2e0;stroke-width:2}.element text{fill:#f0f0f0}.element-title{font-size:15px;font-weight:600}.element-description,.element-id{fill:#d3dae4;font-size:11px}.element-id{font-family:monospace}.element-status-badge{fill:rgba(246,196,83,.12);stroke:#59687a;stroke-width:1}.element-status{fill:#f6c453;font-size:11px;font-weight:600}.chapter-node-title{fill:#edf2f7;font-size:12px}${statusColorStyles}</style>${lines}${chapterConnectionMarkup}${chapterNodeMarkup}${elementMarkup}</svg>`;
}

export function sceneBoardToJson(board) {
  return JSON.stringify(board, null, 2);
}

export function scopeSceneBoard(board, chapterIds = null) {
  const selectedIds = chapterIds ? new Set(chapterIds) : null;
  if (!selectedIds) return clone(board);
  const chapters = (board.chapters ?? []).filter(chapter => selectedIds.has(chapter.id));
  const scenes = (board.scenes ?? []).filter(scene => selectedIds.has(scene.chapterId));
  const sceneIds = new Set(scenes.map(scene => scene.id));
  const elements = (board.elements ?? []).filter(element => sceneIds.has(element.sceneId));
  const elementIds = new Set(elements.map(element => element.id));
  const nodes = new Set(chapters.flatMap(chapter => (chapter.nodes ?? []).map(node => node.id)));
  return {
    ...clone(board),
    chapters: clone(chapters),
    scenes: clone(scenes),
    elements: clone(elements),
    connections: clone((board.connections ?? []).filter(connection => elementIds.has(connection.sourceElementId) && elementIds.has(connection.targetElementId))),
    chapterConnections: clone((board.chapterConnections ?? []).filter(connection => nodes.has(connection.sourceNodeId) && nodes.has(connection.targetNodeId)))
  };
}

export function sceneBoardFromJson(json) {
  const board = typeof json === "string" ? JSON.parse(json) : json;
  if (!board || typeof board !== "object") throw new Error("The imported JSON is not a scene board.");
  return board;
}

function downloadBlob(content, filename, type) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadSceneBoardJson(board) {
  downloadBlob(sceneBoardToJson(board), "mel-storyboard-scenes.json", "application/json");
}

export function downloadSceneBoardSvg(board, labels) {
  downloadBlob(sceneBoardToSvg(board, labels), "mel-storyboard-scenes.svg", "image/svg+xml");
}

export async function downloadSceneBoardPng(board, labels) {
  const svg = sceneBoardToSvg(board, labels);
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
  const png = await new Promise((resolve, reject) => {
    canvas.toBlob(result => result ? resolve(result) : reject(new Error("The PNG export could not be created.")), "image/png");
  });
  downloadBlob(png, "mel-storyboard-scenes.png", "image/png");
}

export function printSceneBoardAsPdf(board, labels) {
  const preview = window.open("", "mel-storyboard-pdf");
  if (!preview) throw new Error("The browser blocked the print preview window.");
  const svgBlob = new Blob([sceneBoardToSvg(board, labels)], { type: "image/svg+xml" });
  const url = URL.createObjectURL(svgBlob);
  preview.document.write(`<title>${escapeXml(labels.title ?? "Scenes")}</title><style>body{font-family:Arial,sans-serif;margin:2rem}img{max-width:100%}</style><h1>${escapeXml(labels.title ?? "Scenes")}</h1><img src="${url}" alt="${escapeXml(labels.title ?? "Scenes")}" />`);
  preview.document.close();
  preview.addEventListener("load", () => preview.print(), { once: true });
}
