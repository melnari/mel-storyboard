import { CHAPTER_NODE_TYPES, ELEMENT_TYPES, OBJECT_TYPES, STORE_SCHEMA_VERSION } from "./constants.js";

export function validateSceneBoard(board) {
  const errors = [];
  if (!board || board.schemaVersion !== STORE_SCHEMA_VERSION) errors.push("Unsupported scene board schema version.");
  if (!board?.id) errors.push("Scene board ID is missing.");
  const templateIds = new Set();
  for (const template of board?.templates ?? []) {
    if (!template.id) errors.push("Template UUID is missing.");
    if (templateIds.has(template.id)) errors.push(`Duplicate template UUID: ${template.id}`);
    templateIds.add(template.id);
    if (!Number.isInteger(template.version) || template.version < 1) errors.push(`Invalid template version: ${template.id}`);
    for (const field of template.fields ?? []) if (!field.stableKey) errors.push(`Template field key is missing: ${template.id}`);
  }
  const objectIds = new Set();
  for (const object of board?.objects ?? []) {
    if (!object.id) errors.push("Object UUID is missing.");
    if (objectIds.has(object.id)) errors.push(`Duplicate object UUID: ${object.id}`);
    objectIds.add(object.id);
    if (!OBJECT_TYPES.includes(object.objectType)) errors.push(`Unsupported object type: ${object.objectType}`);
  }
  const chapterIds = new Set();
  const nodeIds = new Set();
  for (const chapter of board?.chapters ?? []) {
    if (!chapter.id) errors.push("Chapter UUID is missing.");
    if (chapterIds.has(chapter.id)) errors.push(`Duplicate chapter UUID: ${chapter.id}`);
    chapterIds.add(chapter.id);
    for (const node of chapter.nodes ?? []) {
      if (!node.id) errors.push("Chapter node UUID is missing.");
      if (nodeIds.has(node.id)) errors.push(`Duplicate chapter node UUID: ${node.id}`);
      nodeIds.add(node.id);
      if (!CHAPTER_NODE_TYPES.includes(node.nodeType)) errors.push(`Unsupported chapter node type: ${node.nodeType}`);
    }
  }
  const sceneIds = new Set();
  for (const scene of board?.scenes ?? []) {
    if (!scene.id) errors.push("Scene UUID is missing.");
    if (sceneIds.has(scene.id)) errors.push(`Duplicate scene UUID: ${scene.id}`);
    sceneIds.add(scene.id);
    if (!chapterIds.has(scene.chapterId)) errors.push(`Scene references missing chapter: ${scene.chapterId}`);
    if (scene.templateId && !templateIds.has(scene.templateId)) errors.push(`Scene references missing template: ${scene.templateId}`);
    for (const assignment of scene.objectAssignments ?? []) if (!objectIds.has(assignment.objectId)) errors.push(`Scene object assignment references missing object: ${assignment.objectId}`);
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
    for (const assignment of connection.objectAssignments ?? []) if (!objectIds.has(assignment.objectId)) errors.push(`Connection object assignment references missing object: ${assignment.objectId}`);
    const sourceChapter = board.scenes.find(scene => scene.id === board.elements.find(element => element.id === connection.sourceElementId)?.sceneId)?.chapterId;
    const targetChapter = board.scenes.find(scene => scene.id === board.elements.find(element => element.id === connection.targetElementId)?.sceneId)?.chapterId;
    if (sourceChapter !== targetChapter) errors.push(`Scene connection crosses chapter boundary: ${connection.id}`);
  }
  for (const connection of board?.chapterConnections ?? []) {
    if (!nodeIds.has(connection.sourceNodeId)) errors.push(`Chapter connection source is missing: ${connection.sourceNodeId}`);
    if (!nodeIds.has(connection.targetNodeId)) errors.push(`Chapter connection target is missing: ${connection.targetNodeId}`);
    const source = (board.chapters ?? []).flatMap(chapter => chapter.nodes ?? []).find(node => node.id === connection.sourceNodeId);
    const target = (board.chapters ?? []).flatMap(chapter => chapter.nodes ?? []).find(node => node.id === connection.targetNodeId);
    const sourceChapter = (board.chapters ?? []).find(chapter => (chapter.nodes ?? []).some(node => node.id === connection.sourceNodeId));
    const targetChapter = (board.chapters ?? []).find(chapter => (chapter.nodes ?? []).some(node => node.id === connection.targetNodeId));
    if (source?.nodeType !== "EXIT" || target?.nodeType !== "ENTRY" || sourceChapter?.id === targetChapter?.id) errors.push(`Invalid chapter connection: ${connection.id}`);
  }
  return { valid: errors.length === 0, errors };
}
