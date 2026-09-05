import { ELEMENT_TYPES, STATUS, STORE_SCHEMA_VERSION } from "./constants.js";
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
    projectId: null,
    nameKey: "MEL_STORYBOARD.TEMPLATES.GENERAL.Name",
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

export function createMap(projectId, title = "Overview map") {
  const now = timestamp();
  return {
    id: uuid(),
    projectId,
    title,
    viewport: { x: 0, y: 0, zoom: 1 },
    elements: [],
    connections: [],
    createdAt: now,
    updatedAt: now
  };
}

export function createProject({ title, description = "" }) {
  if (!title?.trim()) throw new Error("A project title is required.");
  const id = uuid();
  const now = timestamp();
  const project = {
    schemaVersion: STORE_SCHEMA_VERSION,
    id,
    title: title.trim(),
    description,
    createdAt: now,
    updatedAt: now,
    maps: [],
    scenes: [],
    objects: [],
    templates: [],
    notes: []
  };
  project.templates.push(createDefaultTemplate());
  project.maps.push(createMap(id));
  return project;
}

export function createStoryScene(project, { title = "New scene", description = "" } = {}) {
  const now = timestamp();
  const scene = {
    id: uuid(),
    projectId: project.id,
    displayId: nextDisplayId(project.scenes, "S"),
    title,
    description,
    status: STATUS.OPEN,
    templateId: project.templates.find(template => template.active)?.id ?? null,
    fieldValues: {},
    phaseId: null,
    storyLineId: null,
    actorAssignments: [],
    objectAssignments: [],
    createdAt: now,
    updatedAt: now
  };
  project.scenes.push(scene);
  project.updatedAt = now;
  return scene;
}

export function createMapElement(map, { entityId = null, elementType = "SCENE", title = "" } = {}) {
  if (!ELEMENT_TYPES.includes(elementType)) throw new Error(`Unsupported element type: ${elementType}`);
  const element = {
    id: uuid(),
    mapId: map.id,
    entityId,
    elementType,
    title,
    description: "",
    position: { x: 120, y: 120 },
    size: { width: 180, height: 80 },
    zIndex: map.elements.length,
    status: null,
    visualConfig: {},
    createdAt: timestamp(),
    updatedAt: timestamp()
  };
  map.elements.push(element);
  map.updatedAt = element.updatedAt;
  return element;
}

export function createConnection(map, sourceElementId, targetElementId, connectionType = "FLOW") {
  if (!map.elements.some(element => element.id === sourceElementId)) throw new Error("The source element does not exist.");
  if (!map.elements.some(element => element.id === targetElementId)) throw new Error("The target element does not exist.");
  const connection = {
    id: uuid(),
    mapId: map.id,
    sourceElementId,
    targetElementId,
    connectionType,
    label: "",
    description: "",
    visualConfig: {},
    createdAt: timestamp(),
    updatedAt: timestamp()
  };
  map.connections.push(connection);
  map.updatedAt = connection.updatedAt;
  return connection;
}

export function createDomainObject(project, { objectType, name, description = "" }) {
  if (!name?.trim()) throw new Error("An object name is required.");
  const now = timestamp();
  const object = {
    id: uuid(),
    projectId: project.id,
    displayId: nextDisplayId(project.objects, "O"),
    objectType,
    name: name.trim(),
    description,
    attributes: {},
    createdAt: now,
    updatedAt: now
  };
  project.objects.push(object);
  project.updatedAt = now;
  return object;
}

export function createNote(project, { ownerEntityId, title = "", content = "", category = "GENERAL" }) {
  const now = timestamp();
  const note = { id: uuid(), ownerEntityId, title, content, category, authorId: null, createdAt: now, updatedAt: now };
  project.notes.push(note);
  project.updatedAt = now;
  return note;
}

export function assignActorToScene(scene, actorUuid, role = "PRESENT", notes = "") {
  if (!actorUuid?.trim()) throw new Error("An Actor UUID is required.");
  const assignment = { id: uuid(), actorUuid: actorUuid.trim(), role, notes, createdAt: timestamp(), updatedAt: timestamp() };
  scene.actorAssignments = scene.actorAssignments ?? [];
  scene.actorAssignments.push(assignment);
  scene.updatedAt = assignment.updatedAt;
  return assignment;
}

export function duplicateMapElements(map, elementIds, offset = { x: 32, y: 32 }) {
  const selected = map.elements.filter(element => elementIds.includes(element.id));
  const idMap = new Map();
  const duplicates = selected.map(element => {
    const duplicate = clone(element);
    duplicate.id = uuid();
    duplicate.position = { x: element.position.x + offset.x, y: element.position.y + offset.y };
    duplicate.createdAt = timestamp();
    duplicate.updatedAt = duplicate.createdAt;
    idMap.set(element.id, duplicate.id);
    return duplicate;
  });
  const copiedConnections = map.connections
    .filter(connection => idMap.has(connection.sourceElementId) && idMap.has(connection.targetElementId))
    .map(connection => ({
      ...clone(connection),
      id: uuid(),
      sourceElementId: idMap.get(connection.sourceElementId),
      targetElementId: idMap.get(connection.targetElementId),
      createdAt: timestamp(),
      updatedAt: timestamp()
    }));
  map.elements.push(...duplicates);
  map.connections.push(...copiedConnections);
  map.updatedAt = timestamp();
  return { duplicates, copiedConnections };
}
