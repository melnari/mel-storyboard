import { ELEMENT_TYPES, STORE_SCHEMA_VERSION } from "./constants.js";

export function validateProject(project) {
  const errors = [];
  if (!project || project.schemaVersion !== STORE_SCHEMA_VERSION) errors.push("Unsupported project schema version.");
  if (!project?.id) errors.push("Project ID is missing.");
  if (!project?.title?.trim()) errors.push("Project title is missing.");
  const sceneIds = new Set();
  for (const scene of project?.scenes ?? []) {
    if (sceneIds.has(scene.id)) errors.push(`Duplicate scene UUID: ${scene.id}`);
    sceneIds.add(scene.id);
  }
  for (const map of project?.maps ?? []) {
    const elementIds = new Set();
    for (const element of map.elements ?? []) {
      if (elementIds.has(element.id)) errors.push(`Duplicate map element UUID: ${element.id}`);
      elementIds.add(element.id);
      if (!ELEMENT_TYPES.includes(element.elementType)) errors.push(`Unsupported element type: ${element.elementType}`);
      if (element.entityId && element.elementType === "SCENE" && !sceneIds.has(element.entityId)) {
        errors.push(`Scene element references missing scene: ${element.entityId}`);
      }
    }
    for (const connection of map.connections ?? []) {
      if (!elementIds.has(connection.sourceElementId)) errors.push(`Connection source is missing: ${connection.sourceElementId}`);
      if (!elementIds.has(connection.targetElementId)) errors.push(`Connection target is missing: ${connection.targetElementId}`);
    }
  }
  return { valid: errors.length === 0, errors };
}

