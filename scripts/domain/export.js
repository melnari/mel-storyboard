import { connectionGeometry } from "./geometry.js";

function escapeXml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]);
}

function boardBounds(board) {
  return {
    width: Math.max(800, ...board.elements.map(element => element.position.x + element.size.width + 80)),
    height: Math.max(600, ...board.elements.map(element => element.position.y + element.size.height + 80))
  };
}

export function sceneBoardToSvg(board, labels = {}) {
  const { width, height } = boardBounds(board);
  const sceneById = new Map(board.scenes.map(scene => [scene.id, scene]));
  const elementById = new Map(board.elements.map(element => [element.id, element]));
  const lines = board.connections.map(connection => {
    const source = elementById.get(connection.sourceElementId);
    const target = elementById.get(connection.targetElementId);
    if (!source || !target) return "";
    const geometry = connectionGeometry(source, target);
    const label = connection.label?.trim() ? `<text class="connection-label" x="${geometry.label.x}" y="${geometry.label.y}">${escapeXml(connection.label)}</text>` : "";
    return `<line class="connection" x1="${geometry.source.x}" y1="${geometry.source.y}" x2="${geometry.target.x}" y2="${geometry.target.y}" marker-end="url(#arrow)" />${label}`;
  }).join("");
  const elements = board.elements.map(element => {
    const scene = sceneById.get(element.sceneId);
    const title = scene?.title || element.title || labels.scene || "Scene";
    const status = labels.status?.(scene?.status) ?? scene?.status ?? "";
    return `<g class="element" transform="translate(${element.position.x},${element.position.y})"><rect width="${element.size.width}" height="${element.size.height}" rx="8" /><text x="12" y="28">${escapeXml(title)}</text><text class="type" x="12" y="50">${escapeXml(scene?.displayId ?? "")}</text><text class="status" x="12" y="68">${escapeXml(status)}</text></g>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><style>svg{font-family:Arial,sans-serif;background:#17191f}.connection{stroke:#f6c453;stroke-width:3;fill:none;marker-end:url(#arrow)}.connection-label{fill:#f6c453;font-size:13px;font-weight:600;paint-order:stroke;stroke:#17191f;stroke-width:5px;stroke-linejoin:round}.element rect{fill:#313846;stroke:#c7d2e0;stroke-width:2}.element text{fill:#f0f0f0;font-size:16px}.element text.type,.element text.status{fill:#aeb8c5;font-size:11px}</style><defs><marker id="arrow" markerWidth="12" markerHeight="12" refX="10" refY="4" orient="auto"><path d="M0,0 L0,8 L11,4 z" fill="#f6c453" /></marker></defs>${lines}${elements}</svg>`;
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
