import { SCENE_SHAPES } from "./constants.js";

function center(element) {
  return {
    x: element.position.x + element.size.width / 2,
    y: element.position.y + element.size.height / 2
  };
}

function cross(first, second) {
  return first.x * second.y - first.y * second.x;
}

function polygonEdgeDistance(element, unit, vertices) {
  const origin = center(element);
  let closest = Number.POSITIVE_INFINITY;
  for (let index = 0; index < vertices.length; index += 1) {
    const start = vertices[index];
    const end = vertices[(index + 1) % vertices.length];
    const edge = { x: end.x - start.x, y: end.y - start.y };
    const fromOrigin = { x: start.x - origin.x, y: start.y - origin.y };
    const denominator = cross(unit, edge);
    if (Math.abs(denominator) < 0.0001) continue;
    const distance = cross(fromOrigin, edge) / denominator;
    const position = cross(fromOrigin, unit) / denominator;
    if (distance >= 0 && position >= 0 && position <= 1) closest = Math.min(closest, distance);
  }
  return Number.isFinite(closest) ? closest : Math.min(element.size.width, element.size.height) / 2;
}

function edgeDistance(element, unit) {
  const shape = element.sceneShape;
  if (shape === SCENE_SHAPES.DECISION) {
    const origin = center(element);
    const halfWidth = element.size.width / 2;
    const halfHeight = element.size.height / 2;
    return polygonEdgeDistance(element, unit, [
      { x: origin.x, y: origin.y - halfHeight },
      { x: origin.x + halfWidth, y: origin.y },
      { x: origin.x, y: origin.y + halfHeight },
      { x: origin.x - halfWidth, y: origin.y }
    ]);
  }
  if (shape === SCENE_SHAPES.EVENT) {
    const origin = center(element);
    const skew = Math.min(24, Math.max(14, element.size.width * 0.14));
    const halfWidth = element.size.width / 2;
    const halfHeight = element.size.height / 2;
    return polygonEdgeDistance(element, unit, [
      { x: origin.x - halfWidth + skew, y: origin.y - halfHeight },
      { x: origin.x + halfWidth, y: origin.y - halfHeight },
      { x: origin.x + halfWidth - skew, y: origin.y + halfHeight },
      { x: origin.x - halfWidth, y: origin.y + halfHeight }
    ]);
  }
  const horizontal = Math.abs(unit.x) > 0.0001 ? element.size.width / 2 / Math.abs(unit.x) : Number.POSITIVE_INFINITY;
  const vertical = Math.abs(unit.y) > 0.0001 ? element.size.height / 2 / Math.abs(unit.y) : Number.POSITIVE_INFINITY;
  return Math.min(horizontal, vertical);
}

function buildArrowPoints(point, direction, perpendicular, arrowLength = 12) {
  const arrowBase = {
    x: point.x - direction.x * arrowLength,
    y: point.y - direction.y * arrowLength
  };
  const arrowHalfWidth = 5;
  return [
    `${point.x},${point.y}`,
    `${arrowBase.x + perpendicular.x * arrowHalfWidth},${arrowBase.y + perpendicular.y * arrowHalfWidth}`,
    `${arrowBase.x - perpendicular.x * arrowHalfWidth},${arrowBase.y - perpendicular.y * arrowHalfWidth}`
  ].join(" ");
}

export function connectionGeometry(sourceElement, targetElement, { bilateral = false } = {}) {
  const sourceCenter = center(sourceElement);
  const targetCenter = center(targetElement);
  const delta = { x: targetCenter.x - sourceCenter.x, y: targetCenter.y - sourceCenter.y };
  const length = Math.hypot(delta.x, delta.y) || 1;
  const unit = { x: delta.x / length, y: delta.y / length };
  const sourceEdge = edgeDistance(sourceElement, unit);
  const targetEdge = edgeDistance(targetElement, unit);
  const arrowInset = 12;
  const sourceInset = bilateral ? arrowInset : 4;
  const source = {
    x: sourceCenter.x + unit.x * (sourceEdge + sourceInset),
    y: sourceCenter.y + unit.y * (sourceEdge + sourceInset)
  };
  const target = {
    x: targetCenter.x - unit.x * (targetEdge + 12),
    y: targetCenter.y - unit.y * (targetEdge + 12)
  };
  const perpendicular = { x: -unit.y, y: unit.x };
  const arrowPoints = buildArrowPoints(target, unit, perpendicular, arrowInset);
  const reverseArrowPoints = bilateral
    ? buildArrowPoints(source, { x: -unit.x, y: -unit.y }, perpendicular, arrowInset)
    : "";
  return {
    source,
    target,
    arrowPoints,
    reverseArrowPoints,
    label: {
      x: (source.x + target.x) / 2,
      y: (source.y + target.y) / 2 - 8
    }
  };
}
