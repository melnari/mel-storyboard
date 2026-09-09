import { MODULE_ID, STORE_KEY, STORE_SCHEMA_VERSION } from "./constants.js";
import { clone, createChapter, createDefaultTemplate, createSceneBoard, normalizeConnectionType } from "./model.js";
import { validateSceneBoard } from "./validation.js";

export function normalizeSceneBoard(stored, { resetInvalid = true } = {}) {
  if (!stored || typeof stored !== "object") return createSceneBoard();
  let board = clone(stored);
  if (board.schemaVersion === 2 && Array.isArray(board.scenes) && Array.isArray(board.elements)) {
    const statusMap = { OPEN: "OFFEN", WAITING: "WAITING", ACTIVE: "AKTIV", SUCCESS: "ERFOLG", PARTIAL_SUCCESS: "TEILERFOLG", FAILURE: "FEHLSCHLAG", SKIPPED: "UEBERSPRUNGEN" };
    board.scenes = board.scenes.map(scene => ({ ...scene, status: statusMap[scene.status] ?? scene.status, parentId: scene.parentId ?? null }));
    board.schemaVersion = 3;
  }
  if (![3, 4, STORE_SCHEMA_VERSION].includes(board.schemaVersion)) {
    if (resetInvalid) return createSceneBoard();
    throw new Error(`Unsupported scene board schema version: ${board.schemaVersion ?? "missing"}`);
  }
  const defaultTemplate = createDefaultTemplate();
  board.templates = (Array.isArray(board.templates) && board.templates.length ? board.templates : [defaultTemplate]).map(template => ({
    ...template,
    name: template.name ?? "",
    scope: template.scope ?? "global",
    sourceTemplateId: template.sourceTemplateId ?? null,
    targetType: template.targetType ?? "SCENE",
    version: template.version ?? 1,
    fields: template.fields ?? []
  }));
  board.chapters = Array.isArray(board.chapters) ? board.chapters : [];
  if (!board.chapters.length) {
    const migrationChapter = createChapter({ chapters: [], updatedAt: board.updatedAt }, { title: "Chapter 1" });
    board.chapters = [migrationChapter];
  }
  board.chapters = board.chapters.map(chapter => ({
    ...chapter,
    displayId: chapter.displayId ?? "C-001",
    title: chapter.title ?? "Chapter",
    description: chapter.description ?? "",
    status: chapter.status ?? "OFFEN",
    nodes: Array.isArray(chapter.nodes) ? chapter.nodes.map(node => ({
      ...node,
      nodeType: node.nodeType === "EXIT" ? "EXIT" : "ENTRY",
      title: node.title ?? (node.nodeType === "EXIT" ? "Exit" : "Entry"),
      position: { x: Number(node.position?.x) || 0, y: Number(node.position?.y) || 0 }
    })) : []
  }));
  board.objects = Array.isArray(board.objects) ? board.objects : [];
  board.elements = (board.elements ?? []).map(element => ({
    ...element,
    position: {
      x: Number(element.position?.x) || 0,
      y: Number(element.position?.y) || 0
    },
    size: {
      width: Number(element.size?.width) || 180,
      height: Number(element.size?.height) || 80
    },
    visualConfig: element.visualConfig && typeof element.visualConfig === "object" ? element.visualConfig : {}
  }));
  board.scenes = (board.scenes ?? []).map(scene => {
    const template = board.templates.find(candidate => candidate.id === scene.templateId) ?? board.templates.find(candidate => candidate.active) ?? board.templates[0];
    return {
      ...scene,
      chapterId: board.chapters.some(chapter => chapter.id === scene.chapterId) ? scene.chapterId : board.chapters[0].id,
      parentId: scene.parentId ?? null,
      notes: scene.notes ?? "",
      templateId: scene.templateId ?? template?.id ?? null,
      templateVersion: scene.templateVersion ?? template?.version ?? 1,
      fieldValues: scene.fieldValues ?? {},
      actorAssignments: Array.isArray(scene.actorAssignments) ? scene.actorAssignments : [],
      objectAssignments: Array.isArray(scene.objectAssignments) ? scene.objectAssignments : []
    };
  });
  board.connections = (Array.isArray(board.connections) ? board.connections : []).map(connection => ({
    ...connection,
    sourceType: connection.sourceType ?? (connection.sourceNodeId ? "CHAPTER_NODE" : "SCENE"),
    targetType: connection.targetType ?? (connection.targetNodeId ? "CHAPTER_NODE" : "SCENE"),
    connectionType: normalizeConnectionType(connection.connectionType),
    description: connection.description ?? "",
    objectAssignments: Array.isArray(connection.objectAssignments) ? connection.objectAssignments : []
  }));
  const sceneChapterByElementId = new Map(board.elements.map(element => [element.id, board.scenes.find(scene => scene.id === element.sceneId)?.chapterId]));
  const nodeById = new Map(board.chapters.flatMap(chapter => chapter.nodes.map(node => [node.id, { node, chapterId: chapter.id }])));
  const connectionEndpoint = (connection, side) => {
    const type = connection[`${side}Type`];
    const id = type === "CHAPTER_NODE" ? connection[`${side}NodeId`] : connection[`${side}ElementId`];
    if (!id) return null;
    return type === "CHAPTER_NODE" ? nodeById.get(id) : { chapterId: sceneChapterByElementId.get(id), node: null };
  };
  board.connections = board.connections.filter(connection => {
    const source = connectionEndpoint(connection, "source");
    const target = connectionEndpoint(connection, "target");
    if (!source || !target || source.chapterId !== target.chapterId) return false;
    const sourceIsScene = connection.sourceType === "SCENE";
    const targetIsScene = connection.targetType === "SCENE";
    return sourceIsScene && targetIsScene
      || !sourceIsScene && source.node?.nodeType === "ENTRY" && targetIsScene
      || sourceIsScene && !targetIsScene && target.node?.nodeType === "EXIT";
  });
  const nodeIds = new Set(board.chapters.flatMap(chapter => chapter.nodes.map(node => node.id)));
  board.chapterConnections = (Array.isArray(board.chapterConnections) ? board.chapterConnections : []).filter(connection => nodeIds.has(connection.sourceNodeId) && nodeIds.has(connection.targetNodeId)).map(connection => ({
    ...connection,
    label: connection.label ?? "",
    description: connection.description ?? ""
  }));
  board.schemaVersion = STORE_SCHEMA_VERSION;
  return board;
}

export function registerSceneBoardSetting() {
  game.settings.register(MODULE_ID, STORE_KEY, {
    name: "MEL_STORYBOARD.SETTINGS.SceneBoard.Name",
    hint: "MEL_STORYBOARD.SETTINGS.SceneBoard.Hint",
    scope: "world",
    config: false,
    type: Object,
    default: createSceneBoard()
  });
}

export class SceneBoardStore {
  constructor(settings = game.settings) {
    this.settings = settings;
  }

  #assertGM() {
    if (!game.user?.isGM) throw new Error("Only a GM may change the scene board.");
  }

  read() {
    const stored = this.settings.get(MODULE_ID, STORE_KEY);
    return clone(normalizeSceneBoard(stored));
  }

  async save(board) {
    this.#assertGM();
    const result = validateSceneBoard(board);
    if (!result.valid) throw new Error(`Scene board validation failed: ${result.errors.join(" ")}`);
    const saved = clone(board);
    saved.schemaVersion = STORE_SCHEMA_VERSION;
    saved.updatedAt = new Date().toISOString();
    await this.settings.set(MODULE_ID, STORE_KEY, saved);
    return clone(saved);
  }

  async import(board) {
    this.#assertGM();
    const normalized = normalizeSceneBoard(board, { resetInvalid: false });
    const result = validateSceneBoard(normalized);
    if (!result.valid) throw new Error(`Scene board validation failed: ${result.errors.join(" ")}`);
    return this.save(normalized);
  }
}
