import { MODULE_ID, PRIVATE_BOARD_DATA_FLAG, PRIVATE_BOARD_FLAG, SCENE_ICON_NONE, SCENE_SHAPES, STORE_KEY, STORE_SCHEMA_VERSION } from "./constants.js";
import { clone, createChapter, createDefaultTemplate, createSceneBoard, normalizeConnectionStatus, normalizeConnectionType } from "./model.js";
import { isDesignatedGamemaster } from "./permissions.js";
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
    archived: Boolean(chapter.archived),
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
      sceneShape: Object.values(SCENE_SHAPES).includes(scene.sceneShape) ? scene.sceneShape : SCENE_SHAPES.STANDARD,
      iconType: scene.iconType ?? SCENE_ICON_NONE,
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
    connectionStatus: normalizeConnectionStatus(connection.connectionStatus),
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
    default: {}
  });
}

export class SceneBoardStore {
  constructor(settings = game.settings) {
    this.settings = settings;
    this.cachedBoard = createSceneBoard();
    this.initializationPromise = null;
    this.storageError = null;
    this.storageAvailable = false;
  }

  get hasStorage() {
    return this.storageAvailable;
  }

  get canWrite() {
    return this.isReadyForEditing && isDesignatedGamemaster();
  }

  get hasBoardData() {
    return Boolean(this.cachedBoard && typeof this.cachedBoard === "object"
      && Array.isArray(this.cachedBoard.scenes) && Array.isArray(this.cachedBoard.elements));
  }

  get isReadyForEditing() {
    return this.hasStorage && this.hasBoardData;
  }

  async initialize() {
    if (this.isReadyForEditing) return true;
    if (this.initializationPromise) return this.initializationPromise;
    this.initializationPromise = (async () => {
      this.storageError = null;
      const storedBoard = this.#readWorldBoard();
      // Compatibility path for worlds which were already migrated to the
      // private Journal by an earlier development build. The Journal is read
      // once and then the normal world setting becomes the single source of
      // truth again.
      const journalBoard = this.#readJournalBoard();
      const useJournal = journalBoard && (!storedBoard
        || (storedBoard.scenes.length === 0 && journalBoard.scenes.length > 0));
      if (storedBoard && !useJournal) {
        this.cachedBoard = normalizeSceneBoard(storedBoard);
        this.storageAvailable = true;
        return true;
      }
      if (journalBoard) {
        this.cachedBoard = normalizeSceneBoard(journalBoard);
        if (!isDesignatedGamemaster()) {
          this.storageAvailable = true;
          return true;
        }
        if (await this.#writeWorldBoard(this.cachedBoard)) return true;
        return false;
      }

      if (!isDesignatedGamemaster()) {
        this.cachedBoard = createSceneBoard();
        return false;
      }

      this.cachedBoard = createSceneBoard();
      return this.#writeWorldBoard(this.cachedBoard);
    })();

    try {
      return await this.initializationPromise;
    } finally {
      this.initializationPromise = null;
    }
  }

  #readWorldBoard() {
    try {
      const stored = this.settings.get(MODULE_ID, STORE_KEY);
      return stored && typeof stored === "object" && Array.isArray(stored.scenes) && Array.isArray(stored.elements)
        ? stored
        : null;
    } catch (error) {
      this.storageError = error;
      return null;
    }
  }

  #readJournalBoard() {
    const entries = game.journal?.contents ?? [...(game.journal ?? [])];
    const entry = entries.find(candidate => {
      const flags = candidate?.flags?.[MODULE_ID] ?? {};
      const marker = candidate?.getFlag?.(MODULE_ID, PRIVATE_BOARD_FLAG) ?? flags[PRIVATE_BOARD_FLAG];
      const data = candidate?.getFlag?.(MODULE_ID, PRIVATE_BOARD_DATA_FLAG) ?? flags[PRIVATE_BOARD_DATA_FLAG];
      return marker === true || (data && typeof data === "object" && Array.isArray(data.scenes) && Array.isArray(data.elements));
    });
    if (!entry) return null;
    const flags = entry.flags?.[MODULE_ID] ?? {};
    const stored = entry.getFlag?.(MODULE_ID, PRIVATE_BOARD_DATA_FLAG) ?? flags[PRIVATE_BOARD_DATA_FLAG];
    return stored && typeof stored === "object" && Array.isArray(stored.scenes) && Array.isArray(stored.elements)
      ? stored
      : null;
  }

  async #writeWorldBoard(board) {
    try {
      await this.settings.set(MODULE_ID, STORE_KEY, board);
      this.storageAvailable = true;
      this.storageError = null;
      return true;
    } catch (error) {
      this.storageError = error;
      console.error(`[${MODULE_ID}] Could not write storyboard data to the world setting`, error);
      return false;
    }
  }

  #assertGM() {
    if (!isDesignatedGamemaster() || !this.canWrite) {
      throw new Error("Only Foundry's designated active full Game Master may change the scene board.");
    }
  }

  read() {
    return clone(normalizeSceneBoard(this.cachedBoard));
  }

  async save(board) {
    this.#assertGM();
    const result = validateSceneBoard(board);
    if (!result.valid) throw new Error(`Scene board validation failed: ${result.errors.join(" ")}`);
    const saved = clone(board);
    saved.schemaVersion = STORE_SCHEMA_VERSION;
    saved.updatedAt = new Date().toISOString();
    await this.settings.set(MODULE_ID, STORE_KEY, saved);
    this.cachedBoard = clone(saved);
    this.storageAvailable = true;
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
