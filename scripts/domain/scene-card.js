export const SCENE_ELEMENT_MIN_WIDTH = 120;
export const SCENE_ELEMENT_MIN_HEIGHT = 96;
export const SCENE_ELEMENT_HORIZONTAL_PADDING = 28;

function measureTextWidth(text, fontSize = 15) {
  return Math.ceil([...String(text ?? "")].length * fontSize * 0.56);
}

function estimateTextWidth(text, fontSize = 15) {
  return measureTextWidth(text, fontSize) + SCENE_ELEMENT_HORIZONTAL_PADDING;
}

function wrapText(text, maxCharacters) {
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
      if (word.length > maxCharacters) {
        if (line) {
          lines.push(line);
          line = "";
        }
        for (let index = 0; index < word.length; index += maxCharacters) lines.push(word.slice(index, index + maxCharacters));
        continue;
      }
      const candidate = line ? `${line} ${word}` : word;
      if (candidate.length > maxCharacters && line) {
        lines.push(line);
        line = word;
      } else line = candidate;
    }
    if (line) lines.push(line);
  }
  return lines;
}

/**
 * Build the shared visual model for a scene card.
 *
 * The same model is used by the live board and SVG-based exports so that
 * PNG and PDF output do not fall back to the old card layout.
 */
export function sceneElementPresentation(element, scene, { fallbackTitle = "Scene", statusLabel = "" } = {}) {
  const title = String(scene?.title ?? element.title ?? fallbackTitle).replace(/\s+/g, " ").trim();
  const description = String(scene?.description ?? "").trim();
  const displayId = scene?.displayId ?? "";
  const statusBadgeWidth = Math.max(40, measureTextWidth(statusLabel, 11) + 16);
  const titleAndIdWidth = measureTextWidth(title, 15) + measureTextWidth(displayId, 11) + 36;
  const contentWidth = Math.max(
    SCENE_ELEMENT_MIN_WIDTH,
    estimateTextWidth(title),
    titleAndIdWidth,
    statusBadgeWidth + 20
  );
  const width = Math.max(Number(element.size?.width) || SCENE_ELEMENT_MIN_WIDTH, contentWidth);
  const descriptionCharacters = Math.max(12, Math.floor((width - SCENE_ELEMENT_HORIZONTAL_PADDING) / 7));
  const descriptionLines = wrapText(description, descriptionCharacters);
  const titleY = 25;
  const descriptionY = titleY + 19;
  const descriptionLineHeight = 15;
  const displayIdY = descriptionY + Math.max(descriptionLines.length, 1) * descriptionLineHeight + 7;
  const statusY = displayIdY + 17;
  const minimumHeight = Math.max(SCENE_ELEMENT_MIN_HEIGHT, statusY + 19);
  const height = Math.max(Number(element.size?.height) || SCENE_ELEMENT_MIN_HEIGHT, minimumHeight);
  return {
    title,
    titleLines: [title],
    descriptionLines,
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
    resizeHandleX: width - 14,
    resizeHandleY: height - 14
  };
}

export function normalizeSceneElementSize(element, scene, options = {}) {
  const presentation = sceneElementPresentation(element, scene, options);
  const isLegacyDefaultWidth = Number(element.size?.width) === 180 && !element.visualConfig?.sizeLocked;
  if (isLegacyDefaultWidth && presentation.contentWidth < element.size.width) {
    element.size.width = presentation.contentWidth;
    return sceneElementPresentation(element, scene, options);
  }
  return presentation;
}
