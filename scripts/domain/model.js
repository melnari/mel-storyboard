import { ELEMENT_TYPES, OBJECT_TYPES, STATUS, STORE_SCHEMA_VERSION } from "./constants.js";
import { nextDisplayId, uuid } from "./ids.js";

export function clone(value) {
  return structuredClone(value);
}

function timestamp() {
  return new Date().toISOString();
}

export function createDefaultTemplate() {
  return {
    id: uuid(),
    nameKey: "MEL_STORYBOARD.TEMPLATES.GENERAL.Name",
    name: "",
    scope: "global",
    sourceTemplateId: null,
    targetType: "SCENE",
    version: 1,
    active: true,
    fields: [
      { stableKey: "situation", groupKey: "context", labelKey: "MEL_STORYBOARD.TEMPLATES.GENERAL.Situation", fieldType: "rich-text", required: false, sortOrder: 10 },
      { stableKey: "objective", groupKey: "context", labelKey: "MEL_STORYBOARD.TEMPLATES.GENERAL.Objective", fieldType: "rich-text", required: false, sortOrder: 20 },
      { stableKey: "options", groupKey: "play", labelKey: "MEL_STORYBOARD.TEMPLATES.GENERAL.Options", fieldType: "rich-text", required: false, sortOrder: 30 },
      { stableKey: "success", groupKey: "outcomes", labelKey: "MEL_STORYBOARD.TEMPLATES.GENERAL.Success", fieldType: "rich-text", required: false, sortOrder: 40 },
      { stableKey: "partialSuccess", groupKey: "outcomes", labelKey: "MEL_STORYBOARD.TEMPLATES.GENERAL.PartialSuccess", fieldType: "rich-text", required: false, sortOrder: 50 },
      { stableKey: "failure", groupKey: "outcomes", labelKey: "MEL_STORYBOARD.TEMPLATES.GENERAL.Failure", fieldType: "rich-text", required: false, sortOrder: 60 },
      { stableKey: "notes", groupKey: "notes", labelKey: "MEL_STORYBOARD.TEMPLATES.GENERAL.Notes", fieldType: "rich-text", required: false, sortOrder: 70 }
    ]
  };
}

export function createSceneBoard() {
  const now = timestamp();
  return {
    schemaVersion: STORE_SCHEMA_VERSION,
    id: uuid(),
    createdAt: now,
    updatedAt: now,
    templates: [createDefaultTemplate()],
    scenes: [],
    elements: [],
    connections: [],
    objects: []
  };
}

export function createScene(board, { title = "New scene", description = "" } = {}) {
  const now = timestamp();
  const scene = {
    id: uuid(),
    displayId: nextDisplayId(board.scenes, "S"),
    parentId: null,
    title: title.trim() || "New scene",
    description,
    status: STATUS.OFFEN,
    templateId: board.templates.find(template => template.active)?.id ?? null,
    templateVersion: board.templates.find(template => template.active)?.version ?? 1,
    fieldValues: {},
    actorAssignments: [],
    objectAssignments: [],
    createdAt: now,
    updatedAt: now
  };
  board.scenes.push(scene);
  board.updatedAt = now;
  return scene;
}

export function createSceneElement(board, { sceneId = null, title = "" } = {}) {
  const now = timestamp();
  const element = {
    id: uuid(),
    sceneId,
    elementType: "SCENE",
    title,
    position: { x: 120 + board.elements.length * 24, y: 120 + board.elements.length * 18 },
    size: { width: 180, height: 80 },
    zIndex: board.elements.length,
    visualConfig: {},
    createdAt: now,
    updatedAt: now
  };
  board.elements.push(element);
  board.updatedAt = now;
  return element;
}

export function createBoardObject(board, { objectType = "INFORMATION", title = "New object", description = "", foundryUuid = "", foundryDocumentType = "", image = "" } = {}) {
  if (!OBJECT_TYPES.includes(objectType)) throw new Error(`Unsupported object type: ${objectType}`);
  const actorTypes = new Set(["PLAYER_CHARACTER", "NPC", "GROUP", "FACTION"]);
  if (actorTypes.has(objectType) && !foundryUuid?.trim()) throw new Error("An Actor UUID is required for this object type.");
  const now = timestamp();
  const object = {
    id: uuid(),
    displayId: nextDisplayId(board.objects ?? [], "O"),
    objectType,
    title: title.trim() || "New object",
    description,
    foundryUuid: foundryUuid.trim(),
    foundryDocumentType,
    visualConfig: image ? { image } : {},
    createdAt: now,
    updatedAt: now
  };
  board.objects ??= [];
  board.objects.push(object);
  board.updatedAt = now;
  return object;
}

export function assignObjectToScene(scene, objectId, role = "", notes = "") {
  if (!objectId?.trim()) throw new Error("An object ID is required.");
  scene.objectAssignments ??= [];
  if (scene.objectAssignments.some(assignment => assignment.objectId === objectId)) throw new Error("This object is already assigned to the scene.");
  const now = timestamp();
  const assignment = { id: uuid(), objectId, role: role.trim(), notes, createdAt: now, updatedAt: now };
  scene.objectAssignments.push(assignment);
  scene.updatedAt = now;
  return assignment;
}

export function removeObjectAssignment(scene, assignmentId) {
  const previousLength = scene.objectAssignments?.length ?? 0;
  scene.objectAssignments = (scene.objectAssignments ?? []).filter(assignment => assignment.id !== assignmentId);
  if (scene.objectAssignments.length === previousLength) throw new Error("The scene object assignment does not exist.");
  scene.updatedAt = timestamp();
}

export function updateObjectAssignment(scene, assignmentId, { role = null, notes = null } = {}) {
  const assignment = (scene.objectAssignments ?? []).find(candidate => candidate.id === assignmentId);
  if (!assignment) throw new Error("The scene object assignment does not exist.");
  if (role !== null) assignment.role = role.trim();
  if (notes !== null) assignment.notes = notes;
  assignment.updatedAt = timestamp();
  scene.updatedAt = assignment.updatedAt;
  return assignment;
}

export function createBoardTemplate(board, sourceTemplateId, { name = "" } = {}) {
  const source = board.templates.find(template => template.id === sourceTemplateId);
  if (!source) throw new Error("The source template does not exist.");
  const now = timestamp();
  const template = {
    ...clone(source),
    id: uuid(),
    name: name.trim() || "",
    scope: "board",
    sourceTemplateId: source.id,
    version: 1,
    createdAt: now,
    updatedAt: now
  };
  board.templates.push(template);
  board.updatedAt = now;
  return template;
}

export function createTemplateVersion(board, templateId, { fields = null, name = null } = {}) {
  const source = board.templates.find(template => template.id === templateId);
  if (!source) throw new Error("The source template does not exist.");
  const familyId = source.sourceTemplateId ?? source.id;
  const version = Math.max(...board.templates.filter(template => (template.sourceTemplateId ?? template.id) === familyId).map(template => template.version ?? 1)) + 1;
  const now = timestamp();
  const template = {
    ...clone(source),
    id: uuid(),
    sourceTemplateId: familyId,
    version,
    fields: fields ? clone(fields) : clone(source.fields),
    name: name === null ? source.name ?? "" : name.trim(),
    createdAt: now,
    updatedAt: now
  };
  board.templates.push(template);
  board.updatedAt = now;
  return template;
}

export function previewTemplateMigration(scene, currentTemplate, nextTemplate) {
  const currentFields = new Map((currentTemplate?.fields ?? []).map(field => [field.stableKey, field]));
  const nextFields = new Map((nextTemplate?.fields ?? []).map(field => [field.stableKey, field]));
  return {
    fromVersion: scene.templateVersion ?? currentTemplate?.version ?? 0,
    toVersion: nextTemplate?.version ?? 0,
    added: [...nextFields.keys()].filter(key => !currentFields.has(key)),
    removed: [...currentFields.keys()].filter(key => !nextFields.has(key)),
    retained: [...nextFields.keys()].filter(key => currentFields.has(key)),
    changed: [...nextFields.keys()].filter(key => currentFields.has(key) && JSON.stringify(currentFields.get(key)) !== JSON.stringify(nextFields.get(key)))
  };
}

export function migrateSceneTemplate(board, sceneId, templateId, { confirmed = false } = {}) {
  if (!confirmed) throw new Error("Template migration requires explicit confirmation.");
  const scene = board.scenes.find(candidate => candidate.id === sceneId);
  const nextTemplate = board.templates.find(template => template.id === templateId);
  if (!scene || !nextTemplate) throw new Error("The scene or target template does not exist.");
  const currentTemplate = board.templates.find(template => template.id === scene.templateId);
  const preview = previewTemplateMigration(scene, currentTemplate, nextTemplate);
  scene.templateId = nextTemplate.id;
  scene.templateVersion = nextTemplate.version;
  scene.fieldValues ??= {};
  for (const field of nextTemplate.fields ?? []) scene.fieldValues[field.stableKey] ??= "";
  scene.updatedAt = timestamp();
  board.updatedAt = scene.updatedAt;
  return preview;
}

export function createConnection(board, sourceElementId, targetElementId, connectionType = "FLOW", label = "") {
  if (!board.elements.some(element => element.id === sourceElementId)) throw new Error("The source scene does not exist.");
  if (!board.elements.some(element => element.id === targetElementId)) throw new Error("The target scene does not exist.");
  if (sourceElementId === targetElementId) throw new Error("A scene cannot connect to itself.");
  if (board.connections.some(connection => connection.sourceElementId === sourceElementId && connection.targetElementId === targetElementId)) throw new Error("This scene connection already exists.");
  const now = timestamp();
  const connection = { id: uuid(), sourceElementId, targetElementId, connectionType, label: String(label ?? "").trim(), description: "", visualConfig: {}, createdAt: now, updatedAt: now };
  board.connections.push(connection);
  board.updatedAt = now;
  return connection;
}

export function removeConnection(board, connectionId) {
  const previousLength = board.connections.length;
  board.connections = board.connections.filter(connection => connection.id !== connectionId);
  if (board.connections.length === previousLength) throw new Error("The scene connection does not exist.");
  board.updatedAt = timestamp();
}

export function assignActorToScene(scene, actorUuid, role = "PRESENT", notes = "") {
  if (!actorUuid?.trim()) throw new Error("An Actor UUID is required.");
  const now = timestamp();
  const assignment = { id: uuid(), actorUuid: actorUuid.trim(), role, notes, createdAt: now, updatedAt: now };
  scene.actorAssignments ??= [];
  scene.actorAssignments.push(assignment);
  scene.updatedAt = now;
  return assignment;
}

function duplicateSceneRecord(board, sourceScene) {
  const copiedScene = clone(sourceScene);
  const now = timestamp();
  copiedScene.id = uuid();
  copiedScene.displayId = nextDisplayId(board.scenes, "S");
  copiedScene.createdAt = now;
  copiedScene.updatedAt = now;
  copiedScene.actorAssignments = (copiedScene.actorAssignments ?? []).map(assignment => ({ ...assignment, id: uuid(), createdAt: now, updatedAt: now }));
  copiedScene.objectAssignments = (copiedScene.objectAssignments ?? []).map(assignment => ({ ...assignment, id: uuid(), createdAt: now, updatedAt: now }));
  board.scenes.push(copiedScene);
  return copiedScene;
}

export function duplicateSceneElements(board, elementIds, offset = { x: 32, y: 32 }) {
  const selected = board.elements.filter(element => elementIds.includes(element.id));
  const idMap = new Map();
  const duplicates = selected.map(element => {
    const sourceScene = board.scenes.find(scene => scene.id === element.sceneId);
    const copiedScene = sourceScene ? duplicateSceneRecord(board, sourceScene) : null;
    const duplicate = clone(element);
    duplicate.id = uuid();
    duplicate.sceneId = copiedScene?.id ?? null;
    duplicate.position = { x: element.position.x + offset.x, y: element.position.y + offset.y };
    duplicate.createdAt = timestamp();
    duplicate.updatedAt = duplicate.createdAt;
    duplicate.title = copiedScene?.title ?? element.title;
    idMap.set(element.id, duplicate.id);
    return duplicate;
  });
  const copiedConnections = board.connections.filter(connection => idMap.has(connection.sourceElementId) && idMap.has(connection.targetElementId)).map(connection => ({ ...clone(connection), id: uuid(), sourceElementId: idMap.get(connection.sourceElementId), targetElementId: idMap.get(connection.targetElementId), createdAt: timestamp(), updatedAt: timestamp() }));
  board.elements.push(...duplicates);
  board.connections.push(...copiedConnections);
  board.updatedAt = timestamp();
  return { duplicates, copiedConnections };
}

export function copySceneElements(board, elementIds) {
  const selectedElements = board.elements.filter(element => elementIds.includes(element.id));
  const sceneIds = new Set(selectedElements.map(element => element.sceneId));
  return {
    elements: clone(selectedElements),
    scenes: clone(board.scenes.filter(scene => sceneIds.has(scene.id))),
    connections: clone(board.connections.filter(connection => elementIds.includes(connection.sourceElementId) && elementIds.includes(connection.targetElementId)))
  };
}

export function pasteSceneElements(board, payload, offset = { x: 32, y: 32 }) {
  const sceneIdMap = new Map();
  const copiedScenes = (payload?.scenes ?? []).map(sourceScene => {
    const copied = duplicateSceneRecord(board, sourceScene);
    sceneIdMap.set(sourceScene.id, copied.id);
    return copied;
  });
  const elementIdMap = new Map();
  const duplicates = (payload?.elements ?? []).map(element => {
    const duplicate = clone(element);
    duplicate.id = uuid();
    duplicate.sceneId = sceneIdMap.get(element.sceneId) ?? null;
    duplicate.position = { x: element.position.x + offset.x, y: element.position.y + offset.y };
    duplicate.createdAt = timestamp();
    duplicate.updatedAt = duplicate.createdAt;
    duplicate.title = copiedScenes.find(scene => scene.id === duplicate.sceneId)?.title ?? element.title;
    elementIdMap.set(element.id, duplicate.id);
    return duplicate;
  });
  const copiedConnections = (payload?.connections ?? []).filter(connection => elementIdMap.has(connection.sourceElementId) && elementIdMap.has(connection.targetElementId)).map(connection => ({ ...clone(connection), id: uuid(), sourceElementId: elementIdMap.get(connection.sourceElementId), targetElementId: elementIdMap.get(connection.targetElementId), createdAt: timestamp(), updatedAt: timestamp() }));
  board.elements.push(...duplicates);
  board.connections.push(...copiedConnections);
  board.updatedAt = timestamp();
  return { duplicates, copiedConnections };
}

export function removeSceneElements(board, elementIds) {
  const ids = new Set(elementIds);
  const sceneIds = new Set(board.elements.filter(element => ids.has(element.id)).map(element => element.sceneId));
  board.elements = board.elements.filter(element => !ids.has(element.id));
  board.connections = board.connections.filter(connection => !ids.has(connection.sourceElementId) && !ids.has(connection.targetElementId));
  board.scenes = board.scenes.filter(scene => !sceneIds.has(scene.id));
  board.updatedAt = timestamp();
}
