import { ELEMENT_TYPES, STORE_SCHEMA_VERSION } from "./constants.js";

export function validateSceneBoard(board) {
  const errors = [];
  if (!board || board.schemaVersion !== STORE_SCHEMA_VERSION) errors.push("Unsupported scene board schema version.");
  if (!board?.id) errors.push("Scene board ID is missing.");
  const sceneIds = new Set();
  for (const scene of board?.scenes ?? []) {
    if (!scene.id) errors.push("Scene UUID is missing.");
    if (sceneIds.has(scene.id)) errors.push(`Duplicate scene UUID: ${scene.id}`);
    sceneIds.add(scene.id);
  }
  const elementIds = new Set();
  for (const element of board?.elements ?? []) {
    if (elementIds.has(element.id)) errors.push(`Duplicate scene element UUID: ${element.id}`);
    elementIds.add(element.id);
    if (!ELEMENT_TYPES.includes(element.elementType)) errors.push(`Unsupported scene element type: ${element.elementType}`);
    if (!sceneIds.has(element.sceneId)) errors.push(`Scene element references missing scene: ${element.sceneId}`);
  }
  for (const connection of board?.connections ?? []) {
    if (!elementIds.has(connection.sourceElementId)) errors.push(`Connection source is missing: ${connection.sourceElementId}`);
    if (!elementIds.has(connection.targetElementId)) errors.push(`Connection target is missing: ${connection.targetElementId}`);
  }
  return { valid: errors.length === 0, errors };
}
