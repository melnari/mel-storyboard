import { SCENE_SHAPES } from "./constants.js";

export const SCENE_ELEMENT_MIN_WIDTH = 120;
export const SCENE_ELEMENT_MIN_HEIGHT = 96;
export const SCENE_ELEMENT_HORIZONTAL_PADDING = 28;
export const SCENE_DESCRIPTION_MAX_LINES = 10;

export function normalizeSceneShape(value) {
  return Object.values(SCENE_SHAPES).includes(value) ? value : SCENE_SHAPES.STANDARD;
}

export function sceneShapeFrame(shape, width, height) {
  const sceneShape = normalizeSceneShape(shape);
  const safeWidth = Math.max(Number(width) || 0, 1);
  const safeHeight = Math.max(Number(height) || 0, 1);
  if (sceneShape === SCENE_SHAPES.DECISION) {
    return {
      kind: "path",
      path: `M ${safeWidth / 2} 0 L ${safeWidth} ${safeHeight / 2} L ${safeWidth / 2} ${safeHeight} L 0 ${safeHeight / 2} Z`
    };
  }
  if (sceneShape === SCENE_SHAPES.EVENT) {
    const skew = Math.min(24, Math.max(14, safeWidth * 0.14));
    return {
      kind: "path",
      path: `M ${skew} 0 H ${safeWidth} L ${safeWidth - skew} ${safeHeight} H 0 Z`
    };
  }
  if (sceneShape === SCENE_SHAPES.CHALLENGE) {
    return {
      kind: "double-rect",
      radius: 10,
      inner: { x: 6, y: 6, width: Math.max(1, safeWidth - 12), height: Math.max(1, safeHeight - 12), radius: 6 }
    };
  }
  return { kind: "rect", radius: 10 };
}

let textMeasurementContext;

function measureTextWidth(text, fontSize = 15, fontWeight = 400) {
  const value = String(text ?? "");
  if (globalThis.document?.createElement) {
    if (textMeasurementContext === undefined) {
      const canvas = globalThis.document.createElement("canvas");
      textMeasurementContext = canvas.getContext?.("2d") ?? null;
    }
    if (textMeasurementContext) {
      const fontFamily = globalThis.getComputedStyle?.(globalThis.document.body)?.fontFamily || "Arial, sans-serif";
      textMeasurementContext.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
      return Math.ceil(textMeasurementContext.measureText(value).width);
    }
  }
  return Math.ceil([...value].length * fontSize * 0.56);
}

const HTML_BLOCK_END_TAG = /<\/(?:address|article|blockquote|dd|div|dl|dt|h[1-6]|li|ol|p|pre|section|table|tr|ul)>/gi;
const HTML_ENTITY = Object.freeze({
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"'
});

function decodeHtmlEntities(text) {
  return text
    .replace(/&([a-z]+);/gi, (match, name) => HTML_ENTITY[name.toLowerCase()] ?? match)
    .replace(/&#(x[\da-f]+|\d+);/gi, (match, value) => {
      const codePoint = value[0].toLowerCase() === "x" ? Number.parseInt(value.slice(1), 16) : Number.parseInt(value, 10);
      return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : match;
    });
}

/** Convert Foundry rich-text HTML to text suitable for compact scene cards. */
export function plainTextFromHtml(value) {
  const source = String(value ?? "");
  if (!source) return "";
  return decodeHtmlEntities(source
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(HTML_BLOCK_END_TAG, "\n")
    .replace(/<[^>]*>/g, ""))
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function wrapText(text, maxWidth, fontSize, fontWeight = 400) {
  const paragraphs = String(text ?? "").split(/\r?\n/);
  const lines = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (!words.length) {
      if (paragraphs.length > 1) lines.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      if (measureTextWidth(word, fontSize, fontWeight) > maxWidth) {
        if (line) {
          lines.push(line);
          line = "";
        }
        let chunk = "";
        for (const character of word) {
          const candidate = `${chunk}${character}`;
          if (chunk && measureTextWidth(candidate, fontSize, fontWeight) > maxWidth) {
            lines.push(chunk);
            chunk = character;
          } else chunk = candidate;
        }
        if (chunk) lines.push(chunk);
        continue;
      }
      const candidate = line ? `${line} ${word}` : word;
      if (measureTextWidth(candidate, fontSize, fontWeight) > maxWidth && line) {
        lines.push(line);
        line = word;
      } else line = candidate;
    }
    if (line) lines.push(line);
  }
  return lines;
}

function limitDescriptionLines(lines, maxWidth, fontSize, maxLines = SCENE_DESCRIPTION_MAX_LINES) {
  if (lines.length <= maxLines) return lines;
  const limited = lines.slice(0, maxLines);
  const suffix = "...";
  let lastLine = limited[maxLines - 1].trimEnd();
  while (lastLine && measureTextWidth(`${lastLine}${suffix}`, fontSize) > maxWidth) lastLine = lastLine.slice(0, -1).trimEnd();
  limited[maxLines - 1] = `${lastLine}${suffix}`;
  return limited;
}

/**
 * Build the shared visual model for a scene card.
 *
 * The same model is used by the live board and SVG-based exports so that
 * PNG and PDF output do not fall back to the old card layout.
 */
export function sceneElementPresentation(element, scene, { fallbackTitle = "Scene", statusLabel = "", playerCharacterCount = 0, iconPath = "", iconColorClass = "icon-default" } = {}) {
  const title = String(scene?.title ?? element.title ?? fallbackTitle).replace(/\s+/g, " ").trim();
  const description = plainTextFromHtml(scene?.description ?? "");
  const displayId = scene?.displayId ?? "";
  const sceneShape = normalizeSceneShape(scene?.sceneShape);
  const centeredShape = sceneShape === SCENE_SHAPES.DECISION;
  const shapeHorizontalPadding = centeredShape ? 42 : sceneShape === SCENE_SHAPES.EVENT ? 46 : SCENE_ELEMENT_HORIZONTAL_PADDING;
  const statusBadgeWidth = Math.max(40, measureTextWidth(statusLabel, 11, 600) + 16);
  const textContentWidth = Math.max(
    SCENE_ELEMENT_MIN_WIDTH,
    statusBadgeWidth + 20
  );
  const initialWidth = Math.max(Number(element.size?.width) || SCENE_ELEMENT_MIN_WIDTH, textContentWidth);
  const playerCharacterTokenSize = Math.max(18, Math.min(30, Math.floor(initialWidth * .1)));
  const playerCharacterRowWidth = playerCharacterCount
    ? playerCharacterCount * playerCharacterTokenSize + Math.max(0, playerCharacterCount - 1) * 4 + 20
    : 0;
  const contentWidth = Math.max(textContentWidth, playerCharacterRowWidth);
  const width = Math.max(Number(element.size?.width) || SCENE_ELEMENT_MIN_WIDTH, contentWidth);
  const displayIdWidth = displayId ? measureTextWidth(displayId, 11) : 0;
  const titleWidth = Math.max(30, width - shapeHorizontalPadding - displayIdWidth - 12);
  const descriptionWidth = Math.max(30, width - shapeHorizontalPadding);
  const titleLines = wrapText(title, titleWidth, 15, 600);
  const allDescriptionLines = limitDescriptionLines(wrapText(description, descriptionWidth, 11), descriptionWidth, 11);
  const titleY = 25;
  const titleLineHeight = 18;
  const descriptionY = titleY + titleLines.length * titleLineHeight + 1;
  const descriptionLineHeight = 15;
  const playerCharacterRowHeight = playerCharacterCount ? playerCharacterTokenSize + 17 : 0;
  const bottomReservedHeight = 19 + playerCharacterRowHeight;
  const minimumHeight = Math.max(SCENE_ELEMENT_MIN_HEIGHT, descriptionY + descriptionLineHeight + 10 + bottomReservedHeight);
  const height = Math.max(Number(element.size?.height) || SCENE_ELEMENT_MIN_HEIGHT, minimumHeight);
  const statusY = height - bottomReservedHeight;
  const visibleDescriptionLines = Math.max(1, Math.floor((statusY - descriptionY - 10) / descriptionLineHeight));
  const descriptionLines = limitDescriptionLines(allDescriptionLines, descriptionWidth, 11, Math.min(SCENE_DESCRIPTION_MAX_LINES, visibleDescriptionLines));
  const displayIdY = descriptionY + Math.max(descriptionLines.length, 1) * descriptionLineHeight + 7;
  const frame = sceneShapeFrame(sceneShape, width, height);
  const textX = centeredShape ? width / 2 : sceneShape === SCENE_SHAPES.EVENT ? 24 : 14;
  return {
    title,
    titleLines,
    descriptionLines,
    sceneShape,
    isDecisionShape: sceneShape === SCENE_SHAPES.DECISION,
    isEventShape: sceneShape === SCENE_SHAPES.EVENT,
    isChallengeShape: sceneShape === SCENE_SHAPES.CHALLENGE,
    framePath: frame.path ?? "",
    frameRadius: frame.radius ?? 0,
    frameInner: frame.inner ?? null,
    textX,
    textAnchor: centeredShape ? "middle" : "start",
    displayId,
    statusLabel,
    contentWidth,
    size: { width, height },
    titleY,
    descriptionY,
    descriptionLineHeight,
    displayIdY,
    displayIdX: width - 14,
    statusY,
    statusBadgeY: statusY - 14,
    statusBadgeWidth,
    playerCharacterTokenSize,
    playerCharacterTokenY: height - playerCharacterTokenSize - 17,
    iconPath,
    iconColorClass,
    iconSize: iconPath ? 24 : 0,
    iconX: iconPath ? width - 42 : 0,
    iconY: iconPath ? height - 42 : 0,
    resizeHandleX: width - 14,
    resizeHandleY: height - 14
  };
}

export function normalizeSceneElementSize(element, scene, options = {}) {
  return sceneElementPresentation(element, scene, options);
}
