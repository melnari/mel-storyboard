import { SCENE_SHAPES } from "./constants.js";

export const SCENE_ELEMENT_MIN_WIDTH = 120;
export const SCENE_ELEMENT_MIN_HEIGHT = 96;
export const SCENE_ELEMENT_HORIZONTAL_PADDING = 28;
export const SCENE_DESCRIPTION_MAX_LINES = 10;
export const SCENE_COMPACT_MIN_HEIGHT = 84;
export const SCENE_COMPACT_DECISION_MIN_WIDTH = 220;
export const SCENE_COMPACT_DECISION_MIN_HEIGHT = 132;
export const SCENE_COMPACT_DECISION_MAX_TITLE_LINES = 2;
export const SCENE_COMPACT_DECISION_TITLE_INSET = 22;

export function normalizeSceneShape(value) {
  return Object.values(SCENE_SHAPES).includes(value) ? value : SCENE_SHAPES.STANDARD;
}

export function sceneShapeFrame(shape, width, height, { compact = false } = {}) {
  const sceneShape = normalizeSceneShape(shape);
  const safeWidth = Math.max(Number(width) || 0, 1);
  const safeHeight = Math.max(Number(height) || 0, 1);
  if (sceneShape === SCENE_SHAPES.DECISION) {
    if (compact) {
      return {
        kind: "diamond",
        path: `M ${safeWidth / 2} 0 L ${safeWidth} ${safeHeight / 2} L ${safeWidth / 2} ${safeHeight} L 0 ${safeHeight / 2} Z`
      };
    }
    return {
      kind: "decision-rect",
      radius: 10,
      markerPath: "M 24 15 L 33 24 L 24 33 L 15 24 Z"
    };
  }
  if (sceneShape === SCENE_SHAPES.EVENT) {
    const skew = Math.min(32, Math.max(18, safeWidth * 0.18));
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

function limitTextLines(lines, maxWidth, fontSize, fontWeight, maxLines) {
  if (lines.length <= maxLines) return lines;
  const limited = lines.slice(0, maxLines);
  const suffix = "...";
  let lastLine = limited[maxLines - 1].trimEnd();
  while (lastLine && measureTextWidth(`${lastLine}${suffix}`, fontSize, fontWeight) > maxWidth) lastLine = lastLine.slice(0, -1).trimEnd();
  limited[maxLines - 1] = `${lastLine}${suffix}`;
  return limited;
}

function diamondInnerWidth(width, height, y, inset = 12) {
  const safeHeight = Math.max(Number(height) || 1, 1);
  const centerY = safeHeight / 2;
  const halfHeight = safeHeight / 2;
  const crossSection = Math.max(0, 1 - Math.abs(y - centerY) / halfHeight);
  return Math.max(30, Math.floor(width * crossSection - inset * 2));
}

/**
 * Build the shared visual model for a scene card.
 *
 * The same model is used by the live board and SVG-based exports so that
 * PNG and PDF output do not fall back to the old card layout.
 */
export function sceneElementPresentation(element, scene, { fallbackTitle = "Scene", statusLabel = "", playerCharacterCount = 0, iconPath = "", iconColorClass = "icon-default", compact = false } = {}) {
  const title = String(scene?.title ?? element.title ?? fallbackTitle).replace(/\s+/g, " ").trim();
  const isCompact = Boolean(compact);
  const description = isCompact ? "" : plainTextFromHtml(scene?.description ?? "");
  const displayId = scene?.displayId ?? "";
  const sceneShape = normalizeSceneShape(scene?.sceneShape);
  const decisionShape = sceneShape === SCENE_SHAPES.DECISION;
  const compactDecisionShape = isCompact && decisionShape;
  const minimumWidth = compactDecisionShape ? SCENE_COMPACT_DECISION_MIN_WIDTH : SCENE_ELEMENT_MIN_WIDTH;
  const shapeHorizontalPadding = compactDecisionShape ? 56 : decisionShape ? 56 : sceneShape === SCENE_SHAPES.EVENT ? 64 : SCENE_ELEMENT_HORIZONTAL_PADDING;
  const statusBadgeWidth = Math.max(40, measureTextWidth(statusLabel, 11, 600) + 16);
  const textContentWidth = Math.max(
    minimumWidth,
    statusBadgeWidth + 20
  );
  const initialWidth = Math.max(Number(element.size?.width) || minimumWidth, textContentWidth);
  const playerCharacterTokenSize = Math.max(18, Math.min(30, Math.floor(initialWidth * .1)));
  const playerCharacterRowWidth = playerCharacterCount
    ? playerCharacterCount * playerCharacterTokenSize + Math.max(0, playerCharacterCount - 1) * 4 + 20
    : 0;
  const contentWidth = Math.max(textContentWidth, playerCharacterRowWidth);
  const width = Math.max(Number(element.size?.width) || minimumWidth, contentWidth);
  // A compact decision card has a narrow upper tip. Put the ID above the
  // title and move the centered title into the wider middle of the diamond.
  const titleY = compactDecisionShape ? 44 : 25;
  const titleLineHeight = 18;
  const playerCharacterRowHeight = playerCharacterCount ? playerCharacterTokenSize + 17 : 0;
  const bottomReservedHeight = 19 + playerCharacterRowHeight;
  // Keep the scene icon centered at the bottom. If player-character tokens are
  // present as well, reserve a little more vertical space so their row can sit
  // above the icon instead of competing for the same bottom position.
  const statusReservedHeight = compactDecisionShape
    ? Math.max(bottomReservedHeight, iconPath && playerCharacterCount ? 75 : 55)
    : bottomReservedHeight;
  const persistedHeight = Number(element.size?.height);
  const estimatedDecisionHeight = compactDecisionShape
    ? Math.max(
      SCENE_COMPACT_DECISION_MIN_HEIGHT,
      titleY + 2 * titleLineHeight + statusReservedHeight + 18,
      Boolean(element.visualConfig?.sizeLocked) && Number.isFinite(persistedHeight) ? persistedHeight : 0
    )
    : 0;
  const displayIdWidth = displayId ? measureTextWidth(displayId, 11) : 0;
  const titleWidth = Math.max(30, compactDecisionShape
    ? Math.min(
      diamondInnerWidth(width, estimatedDecisionHeight, titleY, SCENE_COMPACT_DECISION_TITLE_INSET),
      diamondInnerWidth(width, estimatedDecisionHeight, titleY + titleLineHeight, SCENE_COMPACT_DECISION_TITLE_INSET)
    )
    : width - shapeHorizontalPadding - displayIdWidth - 12);
  const descriptionWidth = Math.max(30, width - shapeHorizontalPadding);
  const titleLines = compactDecisionShape
    ? limitTextLines(wrapText(title, titleWidth, 15, 600), titleWidth, 15, 600, SCENE_COMPACT_DECISION_MAX_TITLE_LINES)
    : wrapText(title, titleWidth, 15, 600);
  const allDescriptionLines = isCompact ? [] : limitDescriptionLines(wrapText(description, descriptionWidth, 11), descriptionWidth, 11);
  const descriptionY = titleY + titleLines.length * titleLineHeight + 1;
  const descriptionLineHeight = 15;
  const compactDecisionMinimumHeight = titleY + titleLines.length * titleLineHeight + statusReservedHeight + 18;
  const minimumHeight = Math.max(
    compactDecisionShape ? SCENE_COMPACT_DECISION_MIN_HEIGHT : isCompact ? SCENE_COMPACT_MIN_HEIGHT : SCENE_ELEMENT_MIN_HEIGHT,
    compactDecisionShape ? compactDecisionMinimumHeight : descriptionY + (isCompact ? 0 : descriptionLineHeight) + 10 + statusReservedHeight
  );
  const keepPersistedHeight = !isCompact || Boolean(element.visualConfig?.sizeLocked);
  const height = Math.max(keepPersistedHeight && Number.isFinite(persistedHeight) ? persistedHeight : 0, minimumHeight);
  const statusY = height - statusReservedHeight;
  const visibleDescriptionLines = isCompact ? 0 : Math.max(1, Math.floor((statusY - descriptionY - 10) / descriptionLineHeight));
  const descriptionLines = isCompact ? [] : limitDescriptionLines(allDescriptionLines, descriptionWidth, 11, Math.min(SCENE_DESCRIPTION_MAX_LINES, visibleDescriptionLines));
  const displayIdY = compactDecisionShape ? 24 : titleY;
  const frame = sceneShapeFrame(sceneShape, width, height, { compact: isCompact });
  const eventSkew = sceneShape === SCENE_SHAPES.EVENT ? Math.min(32, Math.max(18, width * 0.18)) : 0;
  const textX = compactDecisionShape ? width / 2 : decisionShape ? 42 : sceneShape === SCENE_SHAPES.EVENT ? eventSkew + 8 : 14;
  const textAnchor = compactDecisionShape ? "middle" : "start";
  const statusBadgeX = compactDecisionShape ? Math.max(10, (width - statusBadgeWidth) / 2) : 10;
  const iconRightInset = compactDecisionShape || sceneShape === SCENE_SHAPES.EVENT ? 60 : 42;
  const displayIdX = compactDecisionShape ? width / 2 : width - 14;
  const playerCharacterTokenStartX = compactDecisionShape
    ? Math.max(10, (width - playerCharacterRowWidth - (iconPath ? 36 : 0)) / 2)
    : 10;
  const iconSize = iconPath ? 24 : 0;
  const iconX = iconPath
    ? compactDecisionShape ? (width - iconSize) / 2 : width - iconRightInset
    : 0;
  return {
    title,
    titleLines,
    descriptionLines,
    sceneShape,
    isDecisionShape: sceneShape === SCENE_SHAPES.DECISION,
    isCompact,
    isCompactDecisionShape: compactDecisionShape,
    isEventShape: sceneShape === SCENE_SHAPES.EVENT,
    isChallengeShape: sceneShape === SCENE_SHAPES.CHALLENGE,
    framePath: frame.path ?? "",
    frameMarkerPath: frame.markerPath ?? "",
    frameRadius: frame.radius ?? 0,
    frameInner: frame.inner ?? null,
    textX,
    textAnchor,
    displayId,
    statusLabel,
    contentWidth,
    size: { width, height },
    titleY,
    descriptionY,
    descriptionLineHeight,
    displayIdY,
    displayIdX,
    displayIdAnchor: compactDecisionShape ? "middle" : "end",
    statusY,
    statusBadgeX,
    statusTextX: statusBadgeX + 8,
    statusBadgeY: statusY - 14,
    statusBadgeWidth,
    playerCharacterTokenSize,
    playerCharacterTokenStartX,
    playerCharacterTokenY: compactDecisionShape && iconPath && playerCharacterCount
      ? height - playerCharacterTokenSize - 48
      : height - playerCharacterTokenSize - 17,
    iconPath,
    iconColorClass,
    iconSize,
    iconX,
    iconY: iconPath ? height - 42 : 0,
    resizeHandleX: compactDecisionShape ? width - 22 : width - 14,
    resizeHandleY: compactDecisionShape ? Math.max(4, height / 2 - 5) : height - 14
  };
}

export function normalizeSceneElementSize(element, scene, options = {}) {
  return sceneElementPresentation(element, scene, options);
}
