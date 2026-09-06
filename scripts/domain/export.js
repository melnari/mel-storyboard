import { connectionGeometry } from "./geometry.js";
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
    return { ...source, ...presentation };
  });
  const { width, height } = boardBounds(elements);
  const elementById = new Map(elements.map(element => [element.id, element]));
  const lines = board.connections.map(connection => {
    const source = elementById.get(connection.sourceElementId);
    const target = elementById.get(connection.targetElementId);
    if (!source || !target) return "";
    const geometry = connectionGeometry(source, target);
    const label = connection.label?.trim()
      ? `<text class="connection-label" x="${geometry.label.x}" y="${geometry.label.y}">${escapeXml(connection.label)}</text>`
      : "";
    return `<line class="connection" x1="${geometry.source.x}" y1="${geometry.source.y}" x2="${geometry.target.x}" y2="${geometry.target.y}" /><polygon class="connection-arrow" points="${geometry.arrowPoints}" />${label}`;
  }).join("");
  const elementMarkup = elements.map(element => {
    const scene = sceneById.get(element.sceneId);
    const title = svgTextLines("element-title", 14, element.titleY, element.titleLines, 18);
    const description = element.descriptionLines.length
      ? svgTextLines("element-description", 14, element.descriptionY, element.descriptionLines, element.descriptionLineHeight)
      : "";
    const displayId = `<text class="element-id" x="${element.displayIdX}" y="${element.titleY}" text-anchor="end">${escapeXml(element.displayId)}</text>`;
    const status = `<rect class="element-status-badge" x="10" y="${element.statusBadgeY}" width="${element.statusBadgeWidth}" height="18" rx="9" /><text class="element-status" x="18" y="${element.statusY}">${escapeXml(element.statusLabel)}</text>`;
    return `<g class="element" transform="translate(${element.position.x},${element.position.y})"><rect class="element-frame" width="${element.size.width}" height="${element.size.height}" rx="8" />${title}${description}${displayId}${status}</g>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><style>svg{font-family:Arial,sans-serif;background:#17191f}.connection{stroke:#f6c453;stroke-width:3;fill:none;stroke-linecap:round}.connection-arrow{fill:#f6c453}.connection-label{fill:#f6c453;font-size:12px;font-weight:600;paint-order:stroke;stroke:#17191f;stroke-width:4px;text-anchor:middle}.element-frame{fill:#313846;stroke:#c7d2e0;stroke-width:2}.element text{fill:#f0f0f0}.element-title{font-size:15px;font-weight:600}.element-description,.element-id{fill:#d3dae4;font-size:11px}.element-id{font-family:monospace}.element-status-badge{fill:rgba(246,196,83,.12);stroke:#59687a;stroke-width:1}.element-status{fill:#f6c453;font-size:11px;font-weight:600}</style>${lines}${elementMarkup}</svg>`;
}

export function sceneBoardToJson(board) {
  return JSON.stringify(board, null, 2);
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
  canvas.toBlob(result => downloadBlob(result, "mel-storyboard-scenes.png", "image/png"));
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
