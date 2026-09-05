function center(element) {
  return {
    x: element.position.x + element.size.width / 2,
    y: element.position.y + element.size.height / 2
  };
}

function edgeDistance(element, unit) {
  const horizontal = Math.abs(unit.x) > 0.0001 ? element.size.width / 2 / Math.abs(unit.x) : Number.POSITIVE_INFINITY;
  const vertical = Math.abs(unit.y) > 0.0001 ? element.size.height / 2 / Math.abs(unit.y) : Number.POSITIVE_INFINITY;
  return Math.min(horizontal, vertical);
}

export function connectionGeometry(sourceElement, targetElement) {
  const sourceCenter = center(sourceElement);
  const targetCenter = center(targetElement);
  const delta = { x: targetCenter.x - sourceCenter.x, y: targetCenter.y - sourceCenter.y };
  const length = Math.hypot(delta.x, delta.y) || 1;
  const unit = { x: delta.x / length, y: delta.y / length };
  const sourceEdge = edgeDistance(sourceElement, unit);
  const targetEdge = edgeDistance(targetElement, unit);
  const source = {
    x: sourceCenter.x + unit.x * (sourceEdge + 4),
    y: sourceCenter.y + unit.y * (sourceEdge + 4)
  };
  const target = {
    x: targetCenter.x - unit.x * (targetEdge + 12),
    y: targetCenter.y - unit.y * (targetEdge + 12)
  };
  const arrowBase = {
    x: target.x - unit.x * 12,
    y: target.y - unit.y * 12
  };
  const perpendicular = { x: -unit.y, y: unit.x };
  const arrowHalfWidth = 5;
  const arrowPoints = [
    `${target.x},${target.y}`,
    `${arrowBase.x + perpendicular.x * arrowHalfWidth},${arrowBase.y + perpendicular.y * arrowHalfWidth}`,
    `${arrowBase.x - perpendicular.x * arrowHalfWidth},${arrowBase.y - perpendicular.y * arrowHalfWidth}`
  ].join(" ");
  return {
    source,
    target,
    arrowPoints,
    label: {
      x: (source.x + target.x) / 2,
      y: (source.y + target.y) / 2 - 8
    }
  };
}
