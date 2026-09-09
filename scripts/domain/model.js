import { CHAPTER_NODE_TYPES, CONNECTION_DISPLAY_TYPES, ELEMENT_TYPES, OBJECT_TYPES, STATUS, STORE_SCHEMA_VERSION } from "./constants.js";
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
  const board = {
    schemaVersion: STORE_SCHEMA_VERSION,
    id: uuid(),
    createdAt: now,
    updatedAt: now,
    templates: [createDefaultTemplate()],
    chapters: [],
    scenes: [],
    elements: [],
    connections: [],
    chapterConnections: [],
    objects: []
  };
  createChapter(board, { title: "Chapter 1" });
  return board;
}

export function createChapter(board, { title = "New chapter", description = "", status = STATUS.OFFEN } = {}) {
  const now = timestamp();
  const chapter = {
    id: uuid(),
    displayId: nextDisplayId(board.chapters ?? [], "C"),
    title: title.trim() || "New chapter",
    description,
    status,
    nodes: [],
    createdAt: now,
    updatedAt: now
  };
  board.chapters ??= [];
  board.chapters.push(chapter);
  board.updatedAt = now;
  return chapter;
}

export function createScene(board, { title = "New scene", description = "", chapterId = null } = {}) {
  const now = timestamp();
  const chapter = board.chapters?.find(candidate => candidate.id === chapterId) ?? board.chapters?.[0] ?? createChapter(board, { title: "Chapter 1" });
  const scene = {
    id: uuid(),
    displayId: nextDisplayId(board.scenes, "S"),
    chapterId: chapter.id,
    parentId: null,
    title: title.trim() || "New scene",
    description,
    notes: "",
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

export function moveObjectAssignment(board, objectId, sourceSceneId, targetSceneId) {
  if (sourceSceneId === targetSceneId) throw new Error("The object is already assigned to this scene.");
  const object = (board.objects ?? []).find(candidate => candidate.id === objectId);
  const sourceScene = board.scenes.find(scene => scene.id === sourceSceneId);
  const targetScene = board.scenes.find(scene => scene.id === targetSceneId);
  if (!object || object.objectType !== "PLAYER_CHARACTER") throw new Error("Only player character objects can be moved this way.");
  if (!sourceScene || !targetScene) throw new Error("The source or target scene does not exist.");
  const sourceAssignments = sourceScene.objectAssignments ?? [];
  const assignmentIndex = sourceAssignments.findIndex(assignment => assignment.objectId === objectId);
  if (assignmentIndex < 0) throw new Error("The player character is not assigned to the source scene.");
  targetScene.objectAssignments ??= [];
  const existingTargetAssignment = targetScene.objectAssignments.find(assignment => assignment.objectId === objectId);
  const [assignment] = sourceAssignments.splice(assignmentIndex, 1);
  const now = timestamp();
  if (existingTargetAssignment) {
    sourceScene.updatedAt = now;
    board.updatedAt = now;
    return existingTargetAssignment;
  }
  assignment.updatedAt = now;
  targetScene.objectAssignments.push(assignment);
  sourceScene.updatedAt = now;
  targetScene.updatedAt = now;
  board.updatedAt = now;
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

export function normalizeConnectionType(connectionType) {
  return CONNECTION_DISPLAY_TYPES.includes(connectionType) ? connectionType : CONNECTION_DISPLAY_TYPES[0];
}

function chapterNodeRecord(board, nodeId) {
  for (const chapter of board.chapters ?? []) {
    const node = (chapter.nodes ?? []).find(candidate => candidate.id === nodeId);
    if (node) return { ...node, chapterId: chapter.id };
  }
  return null;
}

function connectionEndpoint(board, id, type = null) {
  if (type !== "CHAPTER_NODE") {
    const element = board.elements.find(candidate => candidate.id === id);
    if (element) {
      const scene = board.scenes.find(candidate => candidate.id === element.sceneId);
      return { id, type: "SCENE", chapterId: scene?.chapterId ?? null, element, scene };
    }
  }
  if (type !== "SCENE") {
    const node = chapterNodeRecord(board, id);
    if (node) return { id, type: "CHAPTER_NODE", chapterId: node.chapterId, node };
  }
  return null;
}

function connectionIsAllowed(source, target) {
  if (!source || !target || source.chapterId !== target.chapterId) return false;
  if (source.type === "SCENE" && target.type === "SCENE") return true;
  return source.type === "CHAPTER_NODE" && source.node.nodeType === "ENTRY" && target.type === "SCENE"
    || source.type === "SCENE" && target.type === "CHAPTER_NODE" && target.node.nodeType === "EXIT";
}

export function createConnection(board, sourceId, targetId, connectionType = "unilateral", label = "", sourceType = null, targetType = null) {
  const source = connectionEndpoint(board, sourceId, sourceType);
  const target = connectionEndpoint(board, targetId, targetType);
  if (!source) throw new Error("The source scene or chapter node does not exist.");
  if (!target) throw new Error("The target scene or chapter node does not exist.");
  if (sourceId === targetId && source.type === target.type) throw new Error("An endpoint cannot connect to itself.");
  if (!connectionIsAllowed(source, target)) throw new Error("Connections must stay within one chapter and use Entry → Scene, Scene → Exit, or Scene → Scene endpoints.");
  const duplicate = board.connections.some(connection => (connection.sourceType ?? "SCENE") === source.type && (connection.targetType ?? "SCENE") === target.type && (connection.sourceElementId ?? connection.sourceNodeId) === sourceId && (connection.targetElementId ?? connection.targetNodeId) === targetId);
  if (duplicate) throw new Error("This connection already exists.");
  const now = timestamp();
  const connection = {
    id: uuid(),
    sourceElementId: source.type === "SCENE" ? sourceId : null,
    targetElementId: target.type === "SCENE" ? targetId : null,
    sourceNodeId: source.type === "CHAPTER_NODE" ? sourceId : null,
    targetNodeId: target.type === "CHAPTER_NODE" ? targetId : null,
    sourceType: source.type,
    targetType: target.type,
    connectionType: normalizeConnectionType(connectionType),
    label: String(label ?? "").trim(),
    description: "",
    objectAssignments: [],
    visualConfig: {},
    createdAt: now,
    updatedAt: now
  };
  board.connections.push(connection);
  board.updatedAt = now;
  return connection;
}

export function createChapterNode(board, chapterId, { nodeType = "ENTRY", title = "" } = {}) {
  if (!CHAPTER_NODE_TYPES.includes(nodeType)) throw new Error(`Unsupported chapter node type: ${nodeType}`);
  const chapter = board.chapters?.find(candidate => candidate.id === chapterId);
  if (!chapter) throw new Error("The chapter does not exist.");
  const now = timestamp();
  const prefix = nodeType === "ENTRY" ? "IN" : "OUT";
  const node = {
    id: uuid(),
    displayId: nextDisplayId(board.chapters.flatMap(candidate => candidate.nodes ?? []), prefix),
    nodeType,
    title: title.trim() || (nodeType === "ENTRY" ? "Entry" : "Exit"),
    position: { x: nodeType === "ENTRY" ? 80 : 760, y: 80 + (chapter.nodes?.filter(candidate => candidate.nodeType === nodeType).length ?? 0) * 80 },
    createdAt: now,
    updatedAt: now
  };
  chapter.nodes ??= [];
  chapter.nodes.push(node);
  chapter.updatedAt = now;
  board.updatedAt = now;
  return node;
}

export function updateChapterNode(node, { title = null, position = null } = {}) {
  if (title !== null) node.title = String(title ?? "").trim() || node.title;
  if (position) node.position = { x: Number(position.x) || 0, y: Number(position.y) || 0 };
  node.updatedAt = timestamp();
  return node;
}

export function removeChapterNode(board, nodeId) {
  let removed = false;
  for (const chapter of board.chapters ?? []) {
    const before = chapter.nodes?.length ?? 0;
    chapter.nodes = (chapter.nodes ?? []).filter(node => node.id !== nodeId);
    if (chapter.nodes.length !== before) {
      chapter.updatedAt = timestamp();
      removed = true;
    }
  }
  if (!removed) throw new Error("The chapter node does not exist.");
  board.chapterConnections = (board.chapterConnections ?? []).filter(connection => connection.sourceNodeId !== nodeId && connection.targetNodeId !== nodeId);
  board.connections = (board.connections ?? []).filter(connection => connection.sourceNodeId !== nodeId && connection.targetNodeId !== nodeId);
  board.updatedAt = timestamp();
}

export function createChapterConnection(board, sourceNodeId, targetNodeId, label = "") {
  const nodes = (board.chapters ?? []).flatMap(chapter => (chapter.nodes ?? []).map(node => ({ ...node, chapterId: chapter.id })));
  const source = nodes.find(node => node.id === sourceNodeId);
  const target = nodes.find(node => node.id === targetNodeId);
  if (!source || !target) throw new Error("The source or target chapter node does not exist.");
  if (source.nodeType !== "EXIT" || target.nodeType !== "ENTRY") throw new Error("Chapter connections must link an exit node to an entry node.");
  if (source.chapterId === target.chapterId) throw new Error("Chapter connections must link different chapters.");
  board.chapterConnections ??= [];
  if (board.chapterConnections.some(connection => connection.sourceNodeId === sourceNodeId && connection.targetNodeId === targetNodeId)) throw new Error("This chapter connection already exists.");
  const now = timestamp();
  const connection = { id: uuid(), sourceNodeId, targetNodeId, label: String(label ?? "").trim(), description: "", createdAt: now, updatedAt: now };
  board.chapterConnections.push(connection);
  board.updatedAt = now;
  return connection;
}

export function removeChapterConnection(board, connectionId) {
  const before = (board.chapterConnections ?? []).length;
  board.chapterConnections = (board.chapterConnections ?? []).filter(connection => connection.id !== connectionId);
  if (board.chapterConnections.length === before) throw new Error("The chapter connection does not exist.");
  board.updatedAt = timestamp();
}

export function moveSceneToChapter(board, sceneId, targetChapterId, targetIndex = null) {
  const scene = board.scenes.find(candidate => candidate.id === sceneId);
  const targetChapter = board.chapters?.find(candidate => candidate.id === targetChapterId);
  if (!scene || !targetChapter) throw new Error("The scene or target chapter does not exist.");
  scene.chapterId = targetChapter.id;
  scene.updatedAt = timestamp();
  const removedConnections = [];
  board.connections = board.connections.filter(connection => {
    const source = connectionEndpoint(board, connection.sourceElementId ?? connection.sourceNodeId, connection.sourceType ?? (connection.sourceNodeId ? "CHAPTER_NODE" : "SCENE"));
    const target = connectionEndpoint(board, connection.targetElementId ?? connection.targetNodeId, connection.targetType ?? (connection.targetNodeId ? "CHAPTER_NODE" : "SCENE"));
    const keep = !source || !target || source.chapterId === target.chapterId;
    if (!keep) removedConnections.push(connection);
    return keep;
  });
  const targetSceneIds = new Set(board.scenes.filter(candidate => candidate.chapterId === targetChapter.id && candidate.id !== scene.id).map(candidate => candidate.id));
  const orderedScenes = board.scenes.filter(candidate => targetSceneIds.has(candidate.id));
  const index = targetIndex === null ? orderedScenes.length : Math.max(0, Math.min(Number(targetIndex), orderedScenes.length));
  orderedScenes.splice(index, 0, scene);
  let targetOffset = 0;
  board.scenes = board.scenes.map(candidate => {
    if (candidate.id === scene.id || targetSceneIds.has(candidate.id)) return orderedScenes[targetOffset++];
    return candidate;
  });
  board.updatedAt = timestamp();
  return { scene, removedConnections };
}

export function reorderScenes(board, chapterId, orderedSceneIds) {
  const sceneMap = new Map(board.scenes.map(scene => [scene.id, scene]));
  const chapterScenes = board.scenes.filter(scene => scene.chapterId === chapterId);
  const ordered = orderedSceneIds.map(id => sceneMap.get(id)).filter(scene => scene?.chapterId === chapterId);
  const remaining = chapterScenes.filter(scene => !ordered.includes(scene));
  const next = [...ordered, ...remaining];
  let offset = 0;
  board.scenes = board.scenes.map(scene => scene.chapterId === chapterId ? next[offset++] : scene);
  board.updatedAt = timestamp();
}

export function reorderChapters(board, orderedChapterIds) {
  const chapterMap = new Map((board.chapters ?? []).map(chapter => [chapter.id, chapter]));
  const ordered = orderedChapterIds.map(id => chapterMap.get(id)).filter(Boolean);
  const remaining = (board.chapters ?? []).filter(chapter => !ordered.includes(chapter));
  board.chapters = [...ordered, ...remaining];
  board.updatedAt = timestamp();
}

export function removeChapter(board, chapterId) {
  const chapter = board.chapters?.find(candidate => candidate.id === chapterId);
  if (!chapter) throw new Error("The chapter does not exist.");
  const sceneIds = new Set(board.scenes.filter(scene => scene.chapterId === chapterId).map(scene => scene.id));
  const elementIds = new Set(board.elements.filter(element => sceneIds.has(element.sceneId)).map(element => element.id));
  const nodeIds = new Set(chapter.nodes?.map(node => node.id) ?? []);
  board.connections = board.connections.filter(connection => !elementIds.has(connection.sourceElementId) && !elementIds.has(connection.targetElementId) && !nodeIds.has(connection.sourceNodeId) && !nodeIds.has(connection.targetNodeId));
  board.elements = board.elements.filter(element => !elementIds.has(element.id));
  board.scenes = board.scenes.filter(scene => !sceneIds.has(scene.id));
  board.chapters = board.chapters.filter(candidate => candidate.id !== chapterId);
  board.chapterConnections = (board.chapterConnections ?? []).filter(connection => !nodeIds.has(connection.sourceNodeId) && !nodeIds.has(connection.targetNodeId));
  board.updatedAt = timestamp();
}

export function updateConnection(connection, { label = null, connectionType = null, description = null } = {}) {
  if (label !== null) connection.label = String(label ?? "").trim();
  if (connectionType !== null) connection.connectionType = normalizeConnectionType(connectionType);
  if (description !== null) connection.description = String(description ?? "");
  connection.updatedAt = timestamp();
  return connection;
}

export function assignObjectToConnection(connection, objectId, role = "", notes = "") {
  if (!objectId?.trim()) throw new Error("An object ID is required.");
  connection.objectAssignments ??= [];
  if (connection.objectAssignments.some(assignment => assignment.objectId === objectId)) throw new Error("This object is already assigned to the connection.");
  const now = timestamp();
  const assignment = { id: uuid(), objectId, role: role.trim(), notes, createdAt: now, updatedAt: now };
  connection.objectAssignments.push(assignment);
  connection.updatedAt = now;
  return assignment;
}

export function removeObjectFromConnection(connection, assignmentId) {
  const previousLength = connection.objectAssignments?.length ?? 0;
  connection.objectAssignments = (connection.objectAssignments ?? []).filter(assignment => assignment.id !== assignmentId);
  if (connection.objectAssignments.length === previousLength) throw new Error("The connection object assignment does not exist.");
  connection.updatedAt = timestamp();
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
