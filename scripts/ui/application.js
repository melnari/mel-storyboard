import { CONNECTION_STATUS, CONNECTION_STATUS_CLASSES, MODULE_ID, SCENE_DISPLAY_MODE_SETTING, SCENE_DISPLAY_MODES, SCENE_ICON_NONE, SCENE_SHAPES, SHOW_SCENE_ICONS_SETTING, STATUS, STATUS_COLOR_CLASSES, STATUS_COLOR_SETTING } from "../domain/constants.js";
import { archiveChapter, assignObjectToConnection, assignObjectToScene, clone, createBoardObject, createChapter, createChapterConnection, createChapterNode, createConnection, createScene, createSceneBoard, createSceneElement, duplicateSceneElements, copySceneElements, moveObjectAssignment, moveSceneToChapter, normalizeConnectionStatus, normalizeConnectionType, pasteSceneElements, removeChapter, removeChapterConnection, removeChapterNode, removeObjectAssignment, removeObjectFromConnection, removeSceneElements, removeConnection, reorderChapters, restoreChapter, updateChapterNode, updateConnection, updateObjectAssignment } from "../domain/model.js";
import { downloadSceneBoardJson, downloadSceneBoardPng, downloadSceneBoardSvg, printSceneBoardAsPdf, printSceneBoardsAsPdf, sceneBoardFromJson, scopeSceneBoard } from "../domain/export.js";
import { normalizeSceneBoard } from "../domain/scene-board-store.js";
import { isDesignatedGamemaster, isFullGamemaster } from "../domain/permissions.js";
import { connectionGeometry } from "../domain/geometry.js";
import { HistoryStack } from "../domain/history.js";
import { uuid } from "../domain/ids.js";
import { SCENE_ELEMENT_MIN_WIDTH, normalizeSceneElementSize, sceneElementPresentation, sceneShapeFrame } from "../domain/scene-card.js";
import { ObjectDetailsApplication } from "./object-details.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

function localize(key) {
  return game.i18n?.localize(key) ?? key;
}

function notifyError(error) {
  console.error(`[${MODULE_ID}]`, error);
  ui.notifications.error(error.message ?? String(error));
}

const READ_ONLY_ACTIONS = new Set([
  "zoom-out", "zoom-in", "toggle-sidebar", "toggle-archive", "toggle-inspector",
  "object-details", "connection-object-details", "select-scene", "select-chapter",
  "toggle-chapter", "jump-node", "export-json", "export-svg", "export-png", "export-pdf"
]);

function readUserViewState() {
  if (!isDesignatedGamemaster()) return {};
  const state = game.melStoryboard?.viewState;
  return state && typeof state === "object" ? state : {};
}

function readOnlyMessage(store) {
  if (isFullGamemaster() && !isDesignatedGamemaster()) return localize("MEL_STORYBOARD.NOTIFICATIONS.OtherFullGamemasterActive");
  if (!store.isReadyForEditing) return localize("MEL_STORYBOARD.NOTIFICATIONS.StorageNotInitialized");
  return localize("MEL_STORYBOARD.NOTIFICATIONS.ReadOnlyAssistant");
}

function createFoundryLinkHtml(uuid, label, classes = []) {
  if (!uuid) return "";
  const anchor = foundry.applications.ux.TextEditor.createAnchor({
    classes: ["content-link", ...classes],
    dataset: { uuid, storyboardFoundryLink: "true" },
    attrs: { draggable: "true" },
    name: label
  });
  return anchor.outerHTML;
}

function splitFoundryUuid(uuid) {
  const value = String(uuid ?? "").trim();
  const separator = value.indexOf("#");
  return separator < 0
    ? { uuid: value, anchor: "" }
    : { uuid: value.slice(0, separator), anchor: value.slice(separator + 1) };
}

function appendFoundryAnchor(uuid, anchor) {
  const parts = splitFoundryUuid(uuid);
  const slug = typeof anchor === "string" ? anchor : anchor?.slug ?? anchor?.hash ?? "";
  return parts.uuid + (parts.anchor || !slug ? (parts.anchor ? `#${parts.anchor}` : "") : `#${slug}`);
}

function stripHtml(value) {
  return String(value ?? "").replace(/<[^>]*>/g, "").replace(/&(?:amp|lt|gt|quot|#39);/g, match => ({ "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" }[match] ?? match)).trim();
}

function parseFoundryLinkValue(value) {
  const source = String(value ?? "");
  const uuidMatch = source.match(/@UUID\[([^\]]+)\](?:\{([^}]*)\})?/i);
  if (uuidMatch) return { uuid: uuidMatch[1], label: stripHtml(uuidMatch[2] ?? "") };
  const htmlMatch = source.match(/<a\b[^>]*data-uuid=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
  if (htmlMatch) {
    const hashMatch = htmlMatch[0].match(/\bdata-(?:hash|anchor)=["']([^"']+)["']/i);
    return {
      uuid: appendFoundryAnchor(htmlMatch[1], hashMatch?.[1] ?? ""),
      label: stripHtml(htmlMatch[2])
    };
  }
  return null;
}

function parseFoundryDropData(event) {
  const transfer = event.dataTransfer;
  const values = [
    transfer?.getData("text/plain"),
    transfer?.getData("text"),
    transfer?.getData("text/html")
  ].filter(Boolean);
  let payload = null;
  for (const value of values) {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && parsed.uuid) {
        payload = { ...(payload ?? {}), ...parsed };
        break;
      }
    } catch {
      // Foundry may provide a UUID link as text instead of JSON drag data.
    }
  }
  for (const value of values) {
    const link = parseFoundryLinkValue(value);
    if (link) {
      payload = { ...(payload ?? {}), ...link };
      break;
    }
  }
  if (!payload?.uuid) return null;
  const anchor = payload.anchor ?? payload.hash ?? "";
  return {
    ...payload,
    uuid: appendFoundryAnchor(payload.uuid, anchor),
    label: payload.label?.trim() || anchor?.name?.trim() || payload.name?.trim() || ""
  };
}

function isPlaceholderArtwork(path) {
  return !path || /(?:^|\/)mystery-man\.svg$/i.test(path);
}

function foundryArtwork(document) {
  const source = document?.toObject?.() ?? document?._source ?? {};
  const candidates = [
    document?.img,
    source.img,
    document?.prototypeToken?.texture?.src,
    source.prototypeToken?.texture?.src,
    document?.token?.texture?.src,
    document?.texture?.src,
    source.texture?.src
  ];
  return candidates.find(path => !isPlaceholderArtwork(path)) ?? candidates.find(Boolean) ?? "";
}

async function resolveFoundryDocument(uuid) {
  if (!uuid) return null;
  const documentUuid = splitFoundryUuid(uuid).uuid;
  try {
    const document = await fromUuid(documentUuid);
    if (document) return document;
  } catch {
    // Fall back to the world collection below. Some player-owned Actors can
    // be resolved from the collection even when UUID resolution is delayed.
  }
  const [documentName, id] = String(documentUuid).split(".");
  if (documentName === "Actor" && id) return game.actors?.get(id) ?? globalThis.fromUuidSync?.(documentUuid) ?? null;
  return globalThis.fromUuidSync?.(documentUuid) ?? null;
}

const OBJECT_ICONS = Object.freeze({
  PLAYER_CHARACTER: "fa-user",
  NPC: "fa-user-gear",
  GROUP: "fa-users",
  FACTION: "fa-flag",
  PLACE: "fa-location-dot",
  ITEM: "fa-cube",
  INFORMATION: "fa-circle-info",
  EVENT: "fa-calendar-day",
  ROLLABLE_TABLE: "fa-dice-d20",
  MACRO: "fa-scroll",
  PLAYLIST: "fa-music",
  PLAYLIST_SOUND: "fa-music"
});

function sceneIconColorClass(statusColorsEnabled, status) {
  return statusColorsEnabled ? `icon-${STATUS_COLOR_CLASSES[status] ?? STATUS_COLOR_CLASSES.OFFEN}` : "icon-default";
}

const SCENE_ICON_LOCALIZATION_KEYS = Object.freeze({
  "Hanging Sign": "HangingSign",
  "Oak Tree": "OakTree"
});

function buildChapterTree(chapters, scenes, activeChapterId, selectedSceneId) {
  return chapters.map(chapter => ({
    ...chapter,
    // The chapter is the canvas context, but once a scene is selected the
    // scene is the single visible selection in the tree. This prevents the
    // parent chapter from looking selected at the same time.
    isActive: chapter.id === activeChapterId && !selectedSceneId,
    statusLabel: localize(`MEL_STORYBOARD.STATUS.${chapter.status}`),
    scenes: scenes.filter(scene => scene.chapterId === chapter.id).map(scene => ({
      ...scene,
      statusLabel: localize(`MEL_STORYBOARD.STATUS.${scene.status}`),
      isSelected: scene.id === selectedSceneId,
      treeLevel: 3
    }))
  }));
}

export class StoryboardApplication extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "mel-storyboard-application",
    classes: ["mel-storyboard", "standard-form"],
    position: { width: 1280, height: 820 },
    window: { title: "Mel-Storyboard", resizable: true }
  };

  static PARTS = { body: { template: "modules/mel-storyboard/templates/storyboard.hbs" } };

  _canDetach() {
    return true;
  }

  _onDetach(from, to) {
    super._onDetach?.(from, to);
    this.#rebindWindowObservers();
    this.#rebindContextMenuListeners();
  }

  _onAttach(from, to) {
    super._onAttach?.(from, to);
    this.#rebindWindowObservers();
    this.#rebindContextMenuListeners();
  }

  #getDocument() {
    return this.element?.ownerDocument ?? globalThis.document;
  }

  #getWindow() {
    return this.#getDocument()?.defaultView ?? globalThis.window;
  }

  #windowForEvent(event) {
    return event?.view ?? this.#getWindow();
  }

  #isElement(value) {
    const ElementClass = this.#getWindow()?.Element ?? globalThis.Element;
    return typeof ElementClass === "function" && value instanceof ElementClass;
  }

  constructor(options = {}) {
    const savedView = readUserViewState();
    const savedPosition = savedView.position && typeof savedView.position === "object" ? savedView.position : {};
    super({
      ...options,
      position: { ...StoryboardApplication.DEFAULT_OPTIONS.position, ...savedPosition, ...(options.position ?? {}) }
    });
    this.store = game.melStoryboard.store;
    this.board = this.store.read();
    this.readOnly = !isDesignatedGamemaster();
    this.accessRefreshPromise = null;
    this.isClosing = false;
    this.objectDetailsApplications = new Set();
    this.detailsDirty = false;
    this.pendingViewSave = null;
    this.positionObserver = null;
    this.canvasViewport = null;
    this.history = new HistoryStack();
    this.drag = null;
    this.connectionDrag = null;
    this.playerCharacterDrag = null;
    this.resize = null;
    this.canvasPan = null;
    this.suppressCanvasClick = false;
    this.clipboard = null;
    this.zoom = Number(savedView.zoom) > 0 ? Number(savedView.zoom) : 1;
    this.activeChapterId = this.board.chapters?.some(chapter => chapter.id === savedView.activeChapterId && !chapter.archived)
      ? savedView.activeChapterId
      : this.board.chapters?.find(chapter => !chapter.archived)?.id ?? null;
    const activeChapter = this.board.chapters?.find(chapter => chapter.id === this.activeChapterId) ?? null;
    const activeSceneIds = new Set((this.board.scenes ?? [])
      .filter(scene => scene.chapterId === this.activeChapterId)
      .map(scene => scene.id));
    const activeElementIds = new Set((this.board.elements ?? [])
      .filter(element => activeSceneIds.has(element.sceneId))
      .map(element => element.id));
    this.selectedElementIds = Array.isArray(savedView.selectedElementIds)
      ? savedView.selectedElementIds.filter(id => activeElementIds.has(id))
      : [];
    const activeNodeIds = new Set((activeChapter?.nodes ?? []).map(node => node.id));
    const connectionBelongsToActiveChapter = connection => {
      const endpoint = (side) => {
        const type = connection[`${side}Type`] ?? (connection[`${side}NodeId`] ? "CHAPTER_NODE" : "SCENE");
        return type === "CHAPTER_NODE"
          ? { type, id: connection[`${side}NodeId`] }
          : { type, id: connection[`${side}ElementId`] };
      };
      return [endpoint("source"), endpoint("target")].every(({ type, id }) => type === "CHAPTER_NODE" ? activeNodeIds.has(id) : activeElementIds.has(id));
    };
    this.selectedConnectionId = this.board.connections?.some(connection => connection.id === savedView.selectedConnectionId && connectionBelongsToActiveChapter(connection))
      ? savedView.selectedConnectionId
      : null;
    if (this.selectedConnectionId) this.selectedElementIds = [];
    const validChapterIds = new Set((this.board.chapters ?? []).map(chapter => chapter.id));
    const savedExpandedChapterIds = Array.isArray(savedView.expandedChapterIds)
      ? savedView.expandedChapterIds.filter(id => validChapterIds.has(id))
      : [];
    this.expandedChapterIds = new Set(savedExpandedChapterIds.length ? savedExpandedChapterIds : (this.activeChapterId ? [this.activeChapterId] : []));
    this.archiveExpanded = Boolean(savedView.archiveExpanded);
    this.connectionSourceId = null;
    this.connectionSourceType = null;
    this.connectionTargetId = null;
    this.connectionTargetType = null;
    this.connectionDescriptionEditor = null;
    this.connectionDescriptionEditorShell = null;
    this.connectionDescriptionEditorGeneration = 0;
    this.sceneDescriptionEditor = null;
    this.sceneDescriptionEditorShell = null;
    this.sceneDescriptionEditorGeneration = 0;
    this.chapterDescriptionEditor = null;
    this.chapterDescriptionEditorShell = null;
    this.chapterDescriptionEditorGeneration = 0;
    this.contextMenuElement = null;
    this.contextMenuHost = null;
    this.contextMenuDocument = null;
    this.pendingViewSaveWindow = null;
    this.contextMenuHandler = null;
    this.contextMenuOutsideHandler = null;
    this.contextMenuKeyHandler = null;
    this.sidebarCollapsed = typeof savedView.sidebarCollapsed === "boolean" ? savedView.sidebarCollapsed : true;
    this.inspectorCollapsed = typeof savedView.inspectorCollapsed === "boolean" ? savedView.inspectorCollapsed : true;
  }

  get canEdit() {
    return !this.readOnly && this.store.canWrite && isDesignatedGamemaster();
  }

  async render(options = {}) {
    this.#captureCanvasViewport();
    return super.render(options);
  }

  async _prepareContext() {
    // Keep retrying while storage is unavailable. A transient startup ordering
    // issue must not leave this application permanently stuck in read-only mode.
    if (!this.store.isReadyForEditing) {
      try {
        await this.store.initialize();
      } catch (error) {
        this.storageInitializationError = error;
        console.error(`[${MODULE_ID}] Could not initialize storyboard storage`, error);
      }
      this.board = this.store.read();
      this.readOnly = !isDesignatedGamemaster() || !this.store.canWrite;
    }
    const statusColorsEnabled = Boolean(game.settings.get(MODULE_ID, STATUS_COLOR_SETTING));
    const showSceneIconsEnabled = Boolean(game.settings.get(MODULE_ID, SHOW_SCENE_ICONS_SETTING));
    const sceneDisplayMode = game.settings.get(MODULE_ID, SCENE_DISPLAY_MODE_SETTING) === SCENE_DISPLAY_MODES.COMPACT
      ? SCENE_DISPLAY_MODES.COMPACT
      : SCENE_DISPLAY_MODES.DETAILED;
    const compactScenes = sceneDisplayMode === SCENE_DISPLAY_MODES.COMPACT;
    this.statusColorsEnabled = statusColorsEnabled;
    this.showSceneIconsEnabled = showSceneIconsEnabled;
    this.sceneDisplayMode = sceneDisplayMode;
    this.compactScenes = compactScenes;
    if (!this.board.chapters?.some(chapter => chapter.id === this.activeChapterId)) this.activeChapterId = this.board.chapters?.find(chapter => !chapter.archived)?.id ?? null;
    const activeChapter = this.board.chapters?.find(chapter => chapter.id === this.activeChapterId) ?? null;
    const scenesById = new Map(this.board.scenes.map(scene => [scene.id, scene]));
    const objects = await Promise.all((this.board.objects ?? []).map(async object => {
      let image = object.visualConfig?.image ?? "";
      if (object.objectType === "PLAYER_CHARACTER" && object.foundryUuid) {
        try {
          const document = await resolveFoundryDocument(object.foundryUuid);
          const resolvedArtwork = foundryArtwork(document);
          if (resolvedArtwork && !isPlaceholderArtwork(resolvedArtwork)) {
            object.visualConfig = { ...(object.visualConfig ?? {}), image: resolvedArtwork };
            image = resolvedArtwork;
          }
        } catch (error) {
          console.warn(`[${MODULE_ID}] Could not resolve player character artwork`, error);
        }
      }
      return {
        ...object,
        typeLabel: localize(`MEL_STORYBOARD.OBJECT_TYPES.${object.objectType}`),
        icon: OBJECT_ICONS[object.objectType] ?? "fa-cube",
        image,
        foundryLinkHtml: createFoundryLinkHtml(object.foundryUuid, object.title, ["mel-storyboard-object-title-link"])
      };
    }));
    const objectsById = new Map(objects.map(object => [object.id, object]));
    const visibleSceneIds = new Set(this.board.scenes.filter(scene => scene.chapterId === this.activeChapterId).map(scene => scene.id));
    const elements = this.board.elements.filter(element => visibleSceneIds.has(element.sceneId)).map(element => {
      const scene = scenesById.get(element.sceneId);
      const playerCharacters = (scene?.objectAssignments ?? [])
        .map(assignment => objectsById.get(assignment.objectId))
        .filter(object => object?.objectType === "PLAYER_CHARACTER")
        .map(object => ({ ...object, image: object.image || "icons/svg/mystery-man.svg" }));
      const presentation = normalizeSceneElementSize(element, scene, {
        fallbackTitle: localize("MEL_STORYBOARD.ELEMENT_TYPES.SCENE"),
        statusLabel: scene ? localize(`MEL_STORYBOARD.STATUS.${scene.status}`) : "",
        playerCharacterCount: playerCharacters.length,
        iconPath: showSceneIconsEnabled ? this.#sceneIconPath(scene?.iconType) : "",
        iconColorClass: sceneIconColorClass(statusColorsEnabled, scene?.status),
        compact: compactScenes
      });
      // Keep legacy elements usable with the new multi-line layout. The
      // normalized dimensions are persisted with the next board save.
      element.size = presentation.size;
      return {
        ...element,
        ...presentation,
        statusColorClass: statusColorsEnabled ? STATUS_COLOR_CLASSES[scene?.status] ?? STATUS_COLOR_CLASSES.OFFEN : "",
        playerCharacterTokens: playerCharacters.map((object, index) => ({
          ...object,
          objectId: object.id,
          tokenX: presentation.playerCharacterTokenStartX + index * (presentation.playerCharacterTokenSize + 4),
          tokenY: presentation.playerCharacterTokenY,
          tokenSize: presentation.playerCharacterTokenSize,
          tokenLabelX: presentation.playerCharacterTokenSize / 2,
          tokenLabelY: presentation.playerCharacterTokenSize + 13
        })),
        isSelected: this.selectedElementIds.includes(element.id)
      };
    });
    const chapterNodes = (activeChapter?.nodes ?? []).map(node => ({ ...node, isEntry: node.nodeType === "ENTRY", isExit: node.nodeType === "EXIT" }));
    const nodeById = new Map(chapterNodes.map(node => [node.id, node]));
    const geometryById = new Map(elements.map(element => [element.id, element]));
    for (const node of chapterNodes) geometryById.set(node.id, { ...node, position: { x: node.position.x - 18, y: node.position.y - 18 }, size: { width: 36, height: 36 } });
    const endpoint = (connection, side) => {
      const type = connection[`${side}Type`] ?? (connection[`${side}NodeId`] ? "CHAPTER_NODE" : "SCENE");
      const id = type === "CHAPTER_NODE" ? connection[`${side}NodeId`] : connection[`${side}ElementId`];
      return { id, type, element: geometryById.get(id) };
    };
    const connections = this.board.connections.filter(connection => {
      const source = endpoint(connection, "source");
      const target = endpoint(connection, "target");
      if (!source.element || !target.element) return false;
      const sourceVisible = source.type === "CHAPTER_NODE" ? nodeById.has(source.id) : visibleSceneIds.has(source.element.sceneId);
      const targetVisible = target.type === "CHAPTER_NODE" ? nodeById.has(target.id) : visibleSceneIds.has(target.element.sceneId);
      return sourceVisible && targetVisible;
    }).map(connection => {
      const source = endpoint(connection, "source");
      const target = endpoint(connection, "target");
      const sourceElement = source.element;
      const targetElement = target.element;
      const connectionType = normalizeConnectionType(connection.connectionType);
      const connectionStatus = normalizeConnectionStatus(connection.connectionStatus);
      const bilateral = connectionType.startsWith("bilateral");
      const geometry = sourceElement && targetElement
        ? connectionGeometry(sourceElement, targetElement, { bilateral })
        : { source: { x: 0, y: 0 }, target: { x: 0, y: 0 }, arrowPoints: "0,0 0,0 0,0", label: { x: 0, y: 0 } };
      return {
        ...connection,
        ...geometry,
        labelPosition: geometry.label,
        reverseArrowPoints: geometry.reverseArrowPoints ?? "",
        connectionType,
        connectionStatus,
        connectionStatusClass: CONNECTION_STATUS_CLASSES[connectionStatus],
        isBilateral: bilateral,
        isDeactivated: connectionType.endsWith("deactivated"),
        isSelected: this.selectedConnectionId === connection.id,
        label: connection.label?.trim() ?? "",
        hasLabel: Boolean(connection.label?.trim())
      };
    });
    const selectedElement = elements.find(element => this.selectedElementIds.includes(element.id));
    const selectedSceneRecord = scenesById.get(selectedElement?.sceneId);
    const selectedObjects = (selectedSceneRecord?.objectAssignments ?? []).map(assignment => {
      const object = objectsById.get(assignment.objectId);
      return object ? {
        ...object,
        assignmentId: assignment.id,
        role: assignment.role,
        assignmentNotes: assignment.notes,
        assignmentNotesPreview: assignment.notes ? foundry.applications.ux.TextEditor.previewHTML(assignment.notes, 140) : ""
      } : null;
    }).filter(Boolean);
    const selectedScene = selectedSceneRecord ? {
      ...selectedSceneRecord,
      statusLabel: localize(`MEL_STORYBOARD.STATUS.${selectedSceneRecord.status}`)
    } : null;
    const selectedConnectionRecord = this.board.connections.find(connection => connection.id === this.selectedConnectionId);
    const selectedConnection = selectedConnectionRecord ? {
      ...selectedConnectionRecord,
      connectionType: normalizeConnectionType(selectedConnectionRecord.connectionType),
      connectionStatus: normalizeConnectionStatus(selectedConnectionRecord.connectionStatus),
      sourceTitle: this.#connectionEndpointTitle(selectedConnectionRecord, "source", scenesById),
      targetTitle: this.#connectionEndpointTitle(selectedConnectionRecord, "target", scenesById)
    } : null;
    const connectionTypeOptions = selectedConnection ? [
      { value: "unilateral", label: localize("MEL_STORYBOARD.CONNECTION_TYPES.UNILATERAL"), selected: selectedConnection.connectionType === "unilateral" },
      { value: "unilateral deactivated", label: localize("MEL_STORYBOARD.CONNECTION_TYPES.UNILATERAL_DEACTIVATED"), selected: selectedConnection.connectionType === "unilateral deactivated" },
      { value: "bilateral", label: localize("MEL_STORYBOARD.CONNECTION_TYPES.BILATERAL"), selected: selectedConnection.connectionType === "bilateral" },
      { value: "bilateral deactivated", label: localize("MEL_STORYBOARD.CONNECTION_TYPES.BILATERAL_DEACTIVATED"), selected: selectedConnection.connectionType === "bilateral deactivated" }
    ] : [];
    const connectionStatusOptions = selectedConnection ? [
      { value: CONNECTION_STATUS.NOT_USED, label: localize("MEL_STORYBOARD.CONNECTION_STATUS.NOT_USED"), selected: selectedConnection.connectionStatus === CONNECTION_STATUS.NOT_USED },
      { value: CONNECTION_STATUS.USED, label: localize("MEL_STORYBOARD.CONNECTION_STATUS.USED"), selected: selectedConnection.connectionStatus === CONNECTION_STATUS.USED },
      { value: CONNECTION_STATUS.REPEATED_USED, label: localize("MEL_STORYBOARD.CONNECTION_STATUS.REPEATED_USED"), selected: selectedConnection.connectionStatus === CONNECTION_STATUS.REPEATED_USED }
    ] : [];
    const sceneShapeOptions = selectedScene ? [
      { value: SCENE_SHAPES.STANDARD, label: localize("MEL_STORYBOARD.SCENE_SHAPES.STANDARD"), selected: selectedScene.sceneShape === SCENE_SHAPES.STANDARD },
      { value: SCENE_SHAPES.DECISION, label: localize("MEL_STORYBOARD.SCENE_SHAPES.DECISION"), selected: selectedScene.sceneShape === SCENE_SHAPES.DECISION },
      { value: SCENE_SHAPES.EVENT, label: localize("MEL_STORYBOARD.SCENE_SHAPES.EVENT"), selected: selectedScene.sceneShape === SCENE_SHAPES.EVENT },
      { value: SCENE_SHAPES.CHALLENGE, label: localize("MEL_STORYBOARD.SCENE_SHAPES.CHALLENGE"), selected: selectedScene.sceneShape === SCENE_SHAPES.CHALLENGE }
    ] : [];
    const selectedConnectionObjects = (selectedConnectionRecord?.objectAssignments ?? []).map(assignment => {
      const object = objectsById.get(assignment.objectId);
      return object ? {
        ...object,
        assignmentId: assignment.id,
        role: assignment.role,
        assignmentNotes: assignment.notes,
        assignmentNotesPreview: assignment.notes ? foundry.applications.ux.TextEditor.previewHTML(assignment.notes, 140) : ""
      } : null;
    }).filter(Boolean);
    const statuses = Object.values(STATUS).map(value => ({ value, label: localize(`MEL_STORYBOARD.STATUS.${value}`), selected: (selectedScene?.status ?? activeChapter?.status) === value }))
      .sort((left, right) => left.label.localeCompare(right.label, game.i18n?.lang, { sensitivity: "base" }));
    const selectedSceneId = selectedSceneRecord?.id ?? null;
    const sceneTree = buildChapterTree((this.board.chapters ?? []).filter(chapter => !chapter.archived), this.board.scenes, this.activeChapterId, selectedSceneId).map(chapter => ({ ...chapter, isExpanded: this.expandedChapterIds.has(chapter.id) }));
    const archiveTree = buildChapterTree((this.board.chapters ?? []).filter(chapter => chapter.archived), this.board.scenes, this.activeChapterId, selectedSceneId).map(chapter => ({ ...chapter, isExpanded: this.expandedChapterIds.has(chapter.id), isArchived: true }));
    const selectedChapter = activeChapter ? {
      ...activeChapter,
      statusLabel: localize(`MEL_STORYBOARD.STATUS.${activeChapter.status}`),
      statusColorClass: statusColorsEnabled ? STATUS_COLOR_CLASSES[activeChapter.status] ?? STATUS_COLOR_CLASSES.OFFEN : ""
    } : null;
    const maxX = Math.max(1200, ...elements.map(element => element.position.x + element.size.width + 80), ...chapterNodes.map(node => node.position.x + 100));
    const maxY = Math.max(800, ...elements.map(element => element.position.y + element.size.height + 80), ...chapterNodes.map(node => node.position.y + 100));
    const chapterNodeById = new Map((this.board.chapters ?? []).flatMap(chapter => (chapter.nodes ?? []).map(node => [node.id, { ...node, chapterId: chapter.id }])));
    const chapterConnectionVisuals = (this.board.chapterConnections ?? []).flatMap(connection => {
      const source = chapterNodeById.get(connection.sourceNodeId);
      const target = chapterNodeById.get(connection.targetNodeId);
      if (!source || !target) return [];
      if (source.chapterId === this.activeChapterId) {
        const x1 = source.position.x + 18;
        const y1 = source.position.y;
        const x2 = maxX - 30;
        return [{ ...connection, x1, y1, x2, y2: y1, arrowPoints: `${x2},${y1} ${x2 - 12},${y1 - 6} ${x2 - 12},${y1 + 6}`, labelX: (x1 + x2) / 2, labelY: y1 - 8 }];
      }
      if (target.chapterId === this.activeChapterId) {
        const x1 = 30;
        const y1 = target.position.y;
        const x2 = target.position.x - 18;
        return [{ ...connection, x1, y1, x2, y2: y1, arrowPoints: `${x2},${y1} ${x2 - 12},${y1 - 6} ${x2 - 12},${y1 + 6}`, labelX: (x1 + x2) / 2, labelY: y1 - 8 }];
      }
      return [];
    });
    return {
      board: { ...this.board, elements, connections, objects },
      sceneTree,
      archiveTree,
      archiveExpanded: this.archiveExpanded,
      activeChapter: selectedChapter,
      chapterNodes,
      chapterConnectionVisuals,
      selectedElement,
      selectedScene,
      selectedConnection,
      connectionTypeOptions,
      connectionStatusOptions,
      sceneShapeOptions,
      selectedConnectionObjects,
      sceneIconOptions: this.#sceneIconOptions(selectedSceneRecord?.iconType),
      showSceneIconsEnabled,
      compactScenes,
      sidebarCollapsed: this.sidebarCollapsed,
      inspectorCollapsed: this.inspectorCollapsed,
      readOnly: this.readOnly,
      readOnlyMessage: readOnlyMessage(this.store),
      canEdit: !this.readOnly && this.store.canWrite,
      detailsDirty: this.detailsDirty,
      canConnect: this.selectedElementIds.length === 2,
      hasScenes: this.board.scenes.some(scene => scene.chapterId === this.activeChapterId),
      hasChapters: this.board.chapters?.some(chapter => !chapter.archived) ?? false,
      hasArchivedChapters: this.board.chapters?.some(chapter => chapter.archived) ?? false,
      objects,
      selectedObjects,
      statuses,
      canvas: { width: maxX, height: maxY },
      canUndo: this.history.canUndo,
      canRedo: this.history.canRedo,
      connectionStatus: this.connectionSourceId
        ? localize("MEL_STORYBOARD.NOTIFICATIONS.SelectConnectionTarget")
        : this.connectionTargetId
          ? localize("MEL_STORYBOARD.NOTIFICATIONS.SelectConnectionSource")
          : "",
      labels: {
        title: localize("MEL_STORYBOARD.UI.Title"),
        zoomOut: localize("MEL_STORYBOARD.ACTIONS.ZoomOut"),
        zoomIn: localize("MEL_STORYBOARD.ACTIONS.ZoomIn"),
        undo: localize("MEL_STORYBOARD.ACTIONS.Undo"),
        redo: localize("MEL_STORYBOARD.ACTIONS.Redo"),
        importExport: localize("MEL_STORYBOARD.UI.ImportExport"),
        importJson: localize("MEL_STORYBOARD.ACTIONS.ImportJson"),
        exportJson: localize("MEL_STORYBOARD.ACTIONS.ExportJson"),
        exportSvg: localize("MEL_STORYBOARD.ACTIONS.ExportSvg"),
        exportPng: localize("MEL_STORYBOARD.ACTIONS.ExportPng"),
        exportPdf: localize("MEL_STORYBOARD.ACTIONS.ExportPdf"),
        newChapter: localize("MEL_STORYBOARD.ACTIONS.NewChapter"),
        newScene: localize("MEL_STORYBOARD.ACTIONS.NewScene"),
        chapterDetails: localize("MEL_STORYBOARD.LABELS.ChapterDetails"),
        chapterEntry: localize("MEL_STORYBOARD.ACTIONS.NewEntryNode"),
        chapterExit: localize("MEL_STORYBOARD.ACTIONS.NewExitNode"),
        deleteChapter: localize("MEL_STORYBOARD.ACTIONS.DeleteChapter"),
        renameNode: localize("MEL_STORYBOARD.ACTIONS.RenameNode"),
        deleteNode: localize("MEL_STORYBOARD.ACTIONS.DeleteNode"),
        linkNode: localize("MEL_STORYBOARD.ACTIONS.LinkNode"),
        collapseSidebar: localize("MEL_STORYBOARD.ACTIONS.CollapseSidebar"),
        expandSidebar: localize("MEL_STORYBOARD.ACTIONS.ExpandSidebar"),
        collapseInspector: localize("MEL_STORYBOARD.ACTIONS.CollapseInspector"),
        expandInspector: localize("MEL_STORYBOARD.ACTIONS.ExpandInspector"),
        story: localize("MEL_STORYBOARD.LABELS.Story"),
        archive: localize("MEL_STORYBOARD.LABELS.Archive"),
        scenes: localize("MEL_STORYBOARD.LABELS.Scenes"),
        noScenes: localize("MEL_STORYBOARD.EMPTY.NoScenes"),
        sceneCanvas: localize("MEL_STORYBOARD.ACCESSIBILITY.SceneCanvas"),
        inspector: localize("MEL_STORYBOARD.ACCESSIBILITY.Inspector"),
        details: localize("MEL_STORYBOARD.ACTIONS.ObjectDetails"),
        sceneDetails: localize("MEL_STORYBOARD.LABELS.SceneDetails"),
        connectionDetails: localize("MEL_STORYBOARD.LABELS.ConnectionDetails"),
        objects: localize("MEL_STORYBOARD.LABELS.Objects"),
        objectDetails: localize("MEL_STORYBOARD.ACTIONS.ObjectDetails"),
        objectNote: localize("MEL_STORYBOARD.ACTIONS.ObjectNote"),
        deleteObject: localize("MEL_STORYBOARD.ACTIONS.DeleteObject"),
        noObjects: localize("MEL_STORYBOARD.EMPTY.NoObjects"),
        titleField: localize("MEL_STORYBOARD.LABELS.Title"),
        connectionLabel: localize("MEL_STORYBOARD.LABELS.ConnectionLabel"),
        connectionType: localize("MEL_STORYBOARD.LABELS.ConnectionType"),
        connectionStatus: localize("MEL_STORYBOARD.LABELS.ConnectionStatus"),
        connectionDescription: localize("MEL_STORYBOARD.LABELS.ConnectionDescription"),
        connectionTypes: {
          unilateral: localize("MEL_STORYBOARD.CONNECTION_TYPES.UNILATERAL"),
          unilateralDeactivated: localize("MEL_STORYBOARD.CONNECTION_TYPES.UNILATERAL_DEACTIVATED"),
          bilateral: localize("MEL_STORYBOARD.CONNECTION_TYPES.BILATERAL"),
          bilateralDeactivated: localize("MEL_STORYBOARD.CONNECTION_TYPES.BILATERAL_DEACTIVATED")
        },
        status: localize("MEL_STORYBOARD.LABELS.Status"),
        sceneShape: localize("MEL_STORYBOARD.LABELS.SceneShape"),
        sceneIconType: localize("MEL_STORYBOARD.LABELS.SceneIconType"),
        description: localize("MEL_STORYBOARD.LABELS.Description"),
        save: localize("MEL_STORYBOARD.ACTIONS.Save"),
        readOnly: localize("MEL_STORYBOARD.NOTIFICATIONS.ReadOnlyAssistant"),
        unsavedChanges: localize("MEL_STORYBOARD.DIALOGS.UnsavedChanges"),
        saveChanges: localize("MEL_STORYBOARD.ACTIONS.SaveChanges"),
        discardChanges: localize("MEL_STORYBOARD.ACTIONS.DiscardChanges"),
        continueEditing: localize("MEL_STORYBOARD.ACTIONS.ContinueEditing"),
        editorAccessChanged: localize("MEL_STORYBOARD.NOTIFICATIONS.EditorAccessChanged"),
        selectScene: localize("MEL_STORYBOARD.EMPTY.SelectScene")
      }
    };
  }

  async _onRender(context, options) {
    this.#destroyConnectionDescriptionEditor();
    this.#destroySceneDescriptionEditor();
    this.#destroyChapterDescriptionEditor();
    await super._onRender(context, options);
    this.element.querySelector(".window-title")?.replaceChildren(this.#getDocument().createTextNode(localize("MEL_STORYBOARD.UI.Title")));
    this.#closeContextMenu();
    if (this.contextMenuHost !== this.element) {
      this.contextMenuHost?.removeEventListener("contextmenu", this.contextMenuHandler, true);
      this.contextMenuHandler = event => this.#onContextMenu(event);
      this.element.addEventListener("contextmenu", this.contextMenuHandler, true);
      this.contextMenuHost = this.element;
    }
    this.element.tabIndex = 0;
    this.element.classList.toggle("is-read-only", this.readOnly);
    this.element.classList.toggle("has-unsaved-details", this.detailsDirty);
    this.#syncReadOnlyBanner();
    this.#applyReadOnlyState();
    this.#observeWindowPosition();
    if (!this.keyboardBound) {
      this.element.addEventListener("keydown", event => this.#onKeyDown(event));
      this.keyboardBound = true;
    }
    this.element.querySelectorAll("[data-action]").forEach(element => element.addEventListener("click", event => this.#handleAction(event)));
    this.#bindFoundryLinks(this.element);
    this.#bindChapterTreeDragDrop();
    this.element.querySelectorAll("[data-scene-element]").forEach(element => {
      element.addEventListener("pointerdown", event => this.#startSceneDrag(event));
      element.addEventListener("pointerdown", event => {
        if (event.button === 1) this.#startConnectionDrag(event);
      });
      element.addEventListener("click", async event => {
        event.stopPropagation();
        if (this.connectionSourceId && this.connectionSourceId !== element.dataset.elementId) {
          await this.#connectTo(element.dataset.elementId, "SCENE");
          return;
        }
        if (this.connectionTargetId && this.connectionTargetId !== element.dataset.elementId) {
          await this.#connectFrom(element.dataset.elementId, "SCENE");
          return;
        }
        await this.#selectElement(element.dataset.elementId, event.ctrlKey || event.metaKey);
      });
    });
    this.element.querySelectorAll("[data-chapter-node]").forEach(node => {
      node.addEventListener("pointerdown", event => {
        if (event.button === 0) this.#startChapterNodeDrag(event);
        if (event.button === 1) this.#startConnectionDrag(event);
      });
      node.addEventListener("click", async event => {
        event.preventDefault();
        event.stopPropagation();
        if (this.connectionSourceId && this.connectionSourceId !== node.dataset.nodeId) {
          await this.#connectTo(node.dataset.nodeId, "CHAPTER_NODE");
          return;
        }
        if (this.connectionTargetId && this.connectionTargetId !== node.dataset.nodeId) {
          await this.#connectFrom(node.dataset.nodeId, "CHAPTER_NODE");
        }
      });
      node.addEventListener("dblclick", async event => {
        event.preventDefault();
        event.stopPropagation();
        if (!this.connectionSourceId && await this.#resolveUnsavedDetails()) await this.#jumpToLinkedNode(node.dataset.nodeId);
      });
    });
    this.#bindPlayerCharacterTokens();
    this.element.querySelectorAll("[data-connection-id]").forEach(connection => {
      connection.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        void this.#selectConnection(connection.dataset.connectionId);
      });
    });
    this.element.querySelectorAll("[data-scene-resize]").forEach(handle => {
      handle.addEventListener("pointerdown", event => this.#startResize(event));
    });
    const canvas = this.element.querySelector("[data-storyboard-canvas]");
    canvas?.addEventListener("pointerdown", event => this.#startCanvasPan(event));
    canvas?.addEventListener("click", async event => {
      const isCanvasBackground = event.target === event.currentTarget || event.target?.matches?.("[data-canvas-background]");
      if (this.suppressCanvasClick) {
        this.suppressCanvasClick = false;
        return;
      }
      if (isCanvasBackground && !this.connectionSourceId) {
        if (this.connectionTargetId) {
          this.connectionTargetId = null;
          this.connectionTargetType = null;
          this.render({ force: true });
          return;
        }
        if (!await this.#resolveUnsavedDetails()) return;
        this.selectedElementIds = [];
        this.selectedConnectionId = null;
        this.render({ force: true });
      }
    });
    canvas?.addEventListener("wheel", event => this.#onCanvasWheel(event), { passive: false });
    if (foundry.applications.ux?.DragDrop) {
      this.documentDragDrop = new foundry.applications.ux.DragDrop({
        dropSelector: "[data-scene-element], [data-connection-id]",
        permissions: { drop: () => !this.readOnly && this.store.canWrite },
        callbacks: {
          dragenter: event => this.#markDropTarget(event, true),
          dragleave: event => this.#markDropTarget(event, false),
          dragend: event => this.#markDropTarget(event, false),
          drop: event => { this.#markDropTarget(event, false); return this.#onFoundryDrop(event); }
        }
      });
      this.documentDragDrop.bind(this.element);
    }
    this.#applyZoom();
    this.#restoreCanvasViewport();
    this.element.querySelectorAll("[data-scene-field], [data-chapter-field], [data-connection-field]").forEach(field => {
      field.addEventListener("input", () => this.#markDetailsDirty());
      field.addEventListener("change", () => this.#markDetailsDirty());
    });
    this.element.querySelector("[data-json-import]")?.addEventListener("change", event => this.#importFile(event));
    if (this.readOnly) {
      if (context.selectedConnection) await this.#renderReadOnlyDescription("[data-connection-description-editor]", context.selectedConnection.description ?? "");
      else if (context.selectedScene) await this.#renderReadOnlyDescription("[data-scene-description-editor]", context.selectedScene.description ?? "");
      else if (context.activeChapter) await this.#renderReadOnlyDescription("[data-chapter-description-editor]", context.activeChapter.description ?? "");
    } else if (context.selectedConnection) {
      await this.#activateConnectionDescriptionEditor(context.selectedConnection.description ?? "");
    } else if (context.selectedScene) {
      await this.#activateSceneDescriptionEditor(context.selectedScene.description ?? "");
    } else if (context.activeChapter) {
      await this.#activateChapterDescriptionEditor(context.activeChapter.description ?? "");
    }
    this.#scheduleViewStateSave();
  }

  async _onClose(options) {
    this.isClosing = true;
    await this.#saveViewState();
    this.#closeContextMenu();
    this.#finishCanvasPan();
    this.#finishPlayerCharacterDrag();
    this.#finishConnectionDrag();
    this.#finishChapterNodeDrag();
    this.#destroyConnectionDescriptionEditor();
    this.#destroySceneDescriptionEditor();
    this.#destroyChapterDescriptionEditor();
    this.positionObserver?.disconnect();
    this.positionObserver = null;
    if (game.melStoryboard?.application === this) game.melStoryboard.application = null;
    return super._onClose(options);
  }

  async close(options = {}) {
    for (const details of [...this.objectDetailsApplications]) {
      await details.close();
      if (details.element?.isConnected) return this;
    }
    if (!await this.#resolveUnsavedDetails()) return this;
    this.isClosing = true;
    await this.#saveViewState();
    return super.close(options);
  }

  async refreshEditorAccess() {
    if (!game.user?.isGM) {
      await this.#revokeAccess();
      return;
    }
    if (this.isClosing || !this.element?.isConnected || this.accessRefreshPromise) return;
    const hadStorage = this.store.hasStorage;
    this.accessRefreshPromise = (async () => {
      try { await this.store.initialize(); }
      catch (error) { console.warn(`[${MODULE_ID}] Could not complete private storyboard storage migration`, error); }
      if (this.isClosing || !this.element?.isConnected) return;
      const storageAttached = !hadStorage && this.store.hasStorage;
      const canEdit = isDesignatedGamemaster() && this.store.canWrite;
      const nextReadOnly = !canEdit;
      const previousReadOnly = this.readOnly;
      if (!this.detailsDirty && this.store.hasStorage) this.board = this.store.read();
      if (nextReadOnly === this.readOnly) {
        this.#syncReadOnlyBanner();
        this.#applyReadOnlyState();
        if (storageAttached && !this.detailsDirty) await this.render({ force: true });
        return;
      }
      this.readOnly = nextReadOnly;
      if (nextReadOnly && !previousReadOnly) this.#cancelActiveEdits();
      this.#syncReadOnlyBanner();
      for (const details of this.objectDetailsApplications) await details.setReadOnly(nextReadOnly);
      if (this.readOnly && this.detailsDirty) {
        ui.notifications.warn(localize("MEL_STORYBOARD.NOTIFICATIONS.EditorAccessChanged"));
        this.element.classList.add("is-read-only", "has-unsaved-details");
        this.#applyReadOnlyState();
        this.#setDescriptionEditorsReadOnly(true);
        return;
      }
      if (!nextReadOnly && previousReadOnly && this.detailsDirty) {
        this.readOnly = false;
        this.element.classList.remove("is-read-only");
        this.#applyReadOnlyState();
        this.#setDescriptionEditorsReadOnly(false);
        if (!await this.#resolveUnsavedDetails()) return;
      }
      await this.render({ force: true });
    })();
    try {
      await this.accessRefreshPromise;
    } finally {
      this.accessRefreshPromise = null;
    }
  }

  async #revokeAccess() {
    if (this.isClosing) return;
    this.readOnly = true;
    this.board = createSceneBoard();
    this.selectedElementIds = [];
    this.selectedConnectionId = null;
    this.detailsDirty = false;
    this.#cancelActiveEdits();
    for (const details of [...this.objectDetailsApplications]) await details.close({ force: true });
    this.isClosing = true;
    await super.close();
    if (game.melStoryboard?.application === this && !this.element?.isConnected) game.melStoryboard.application = null;
  }

  async refreshReadOnlyBoard() {
    if (!this.readOnly || !this.element?.isConnected || this.detailsDirty) return;
    this.board = this.store.read();
    if (!this.board.chapters.some(chapter => chapter.id === this.activeChapterId && !chapter.archived)) {
      this.activeChapterId = this.board.chapters.find(chapter => !chapter.archived)?.id ?? null;
    }
    if (this.selectedElementIds.some(id => !this.board.elements.some(element => element.id === id))) this.selectedElementIds = [];
    if (this.selectedConnectionId && !this.board.connections.some(connection => connection.id === this.selectedConnectionId)) this.selectedConnectionId = null;
    await this.render({ force: true });
  }

  #applyReadOnlyState() {
    this.element.querySelectorAll("[data-scene-field], [data-chapter-field], [data-connection-field], [data-scene-resize]")
      .forEach(control => {
        if ("disabled" in control) control.disabled = this.readOnly;
        else control.setAttribute("aria-disabled", String(this.readOnly));
      });
    this.element.querySelectorAll("[data-action]").forEach(button => {
      if (this.readOnly && !READ_ONLY_ACTIONS.has(button.dataset.action)) {
        if ("disabled" in button) {
          if (button.dataset.preReadOnlyDisabled === undefined) button.dataset.preReadOnlyDisabled = String(button.disabled);
          button.disabled = true;
        } else {
          button.dataset.preReadOnlyAriaDisabled ??= button.getAttribute("aria-disabled") ?? "";
          button.setAttribute("aria-disabled", "true");
        }
      } else if (!this.readOnly && button.dataset.preReadOnlyDisabled !== undefined) {
        button.disabled = button.dataset.preReadOnlyDisabled === "true";
        delete button.dataset.preReadOnlyDisabled;
      } else if (!this.readOnly && button.dataset.preReadOnlyAriaDisabled !== undefined) {
        const prior = button.dataset.preReadOnlyAriaDisabled;
        if (prior) button.setAttribute("aria-disabled", prior);
        else button.removeAttribute("aria-disabled");
        delete button.dataset.preReadOnlyAriaDisabled;
      }
    });
    const importInput = this.element.querySelector("[data-json-import]");
    if (importInput) importInput.disabled = this.readOnly;
    this.element.querySelectorAll("[data-chapter-id][draggable='true']").forEach(item => {
      item.draggable = !this.readOnly;
    });
    this.element.querySelectorAll("[data-action='save-scene'], [data-action='save-chapter'], [data-action='save-connection']")
      .forEach(button => { button.disabled = this.readOnly || !this.detailsDirty; });
    this.element.querySelectorAll("[data-scene-resize]").forEach(handle => {
      handle.setAttribute("tabindex", this.readOnly ? "-1" : "0");
      handle.setAttribute("aria-hidden", String(this.readOnly));
    });
  }

  #setDescriptionEditorsReadOnly(readOnly) {
    const editors = [
      [this.connectionDescriptionEditor, this.connectionDescriptionEditorShell],
      [this.sceneDescriptionEditor, this.sceneDescriptionEditorShell],
      [this.chapterDescriptionEditor, this.chapterDescriptionEditorShell]
    ];
    for (const [editor, shell] of editors) {
      editor?.view?.setProps?.({ editable: () => !readOnly });
      shell?.querySelectorAll("button, input, select, [role='button']").forEach(control => {
        if (readOnly) {
          if (control.dataset.preReadOnlyDisabled === undefined) control.dataset.preReadOnlyDisabled = String(control.disabled ?? false);
          if (control.dataset.preReadOnlyAriaDisabled === undefined) control.dataset.preReadOnlyAriaDisabled = control.getAttribute("aria-disabled") ?? "";
          if ("disabled" in control) control.disabled = true;
          control.setAttribute("aria-disabled", "true");
        } else {
          if (control.dataset.preReadOnlyDisabled !== undefined) {
            if ("disabled" in control) control.disabled = control.dataset.preReadOnlyDisabled === "true";
            delete control.dataset.preReadOnlyDisabled;
          }
          if (control.dataset.preReadOnlyAriaDisabled !== undefined) {
            const previousValue = control.dataset.preReadOnlyAriaDisabled;
            if (previousValue) control.setAttribute("aria-disabled", previousValue);
            else control.removeAttribute("aria-disabled");
            delete control.dataset.preReadOnlyAriaDisabled;
          }
        }
      });
    }
  }

  #syncReadOnlyBanner() {
    if (!this.element) return;
    let banner = this.element.querySelector(".mel-storyboard-read-only-banner");
    if (!this.readOnly) {
      banner?.remove();
      return;
    }
    if (!banner) {
      banner = this.#getDocument().createElement("div");
      banner.className = "mel-storyboard-read-only-banner";
      banner.setAttribute("role", "status");
      banner.setAttribute("aria-live", "polite");
      banner.innerHTML = '<i class="fas fa-eye" aria-hidden="true"></i><span></span>';
      this.element.querySelector(".mel-storyboard-toolbar")?.after(banner);
    }
    const message = readOnlyMessage(this.store);
    const text = banner.querySelector("span");
    if (text) text.textContent = message;
  }

  async #renderReadOnlyDescription(selector, value) {
    const host = this.element.querySelector(selector);
    if (!host) return;
    const content = value?.trim()
      ? await foundry.applications.ux.TextEditor.enrichHTML(value)
      : `<p class="mel-storyboard-empty">${localize("MEL_STORYBOARD.EMPTY.NoDescription")}</p>`;
    host.classList.add("mel-storyboard-read-only-rich-text");
    host.innerHTML = content;
  }

  #markDetailsDirty() {
    if (this.readOnly || !this.store.canWrite || !this.canEdit) return;
    this.detailsDirty = true;
    this.element.classList.add("has-unsaved-details");
    this.element.querySelectorAll("[data-action='save-scene'], [data-action='save-chapter'], [data-action='save-connection']")
      .forEach(button => { button.disabled = false; button.classList.add("is-ready-to-save"); });
  }

  #scheduleViewStateSave() {
    if (this.readOnly || !this.store.canWrite || !this.canEdit) return;
    const appWindow = this.#getWindow();
    if (this.pendingViewSave) (this.pendingViewSaveWindow ?? appWindow)?.clearTimeout(this.pendingViewSave);
    this.pendingViewSaveWindow = appWindow;
    this.pendingViewSave = appWindow?.setTimeout(() => {
      this.pendingViewSave = null;
      this.pendingViewSaveWindow = null;
      void this.#saveViewState();
    }, 350);
  }

  #observeWindowPosition() {
    const MutationObserverClass = this.#getWindow()?.MutationObserver ?? globalThis.MutationObserver;
    if (this.positionObserver || !this.element || typeof MutationObserverClass !== "function") return;
    this.positionObserver = new MutationObserverClass(() => this.#scheduleViewStateSave());
    this.positionObserver.observe(this.element, { attributes: true, attributeFilter: ["style"] });
  }

  #rebindWindowObservers() {
    this.positionObserver?.disconnect();
    this.positionObserver = null;
    this.#observeWindowPosition();
  }

  async #saveViewState() {
    if (this.readOnly || !this.store.canWrite || !this.canEdit) return;
    if (this.pendingViewSave) {
      (this.pendingViewSaveWindow ?? this.#getWindow())?.clearTimeout(this.pendingViewSave);
      this.pendingViewSave = null;
      this.pendingViewSaveWindow = null;
    }
    const rect = this.element?.getBoundingClientRect?.();
    const position = rect ? {
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    } : {};
    game.melStoryboard.viewState = {
      position,
      sidebarCollapsed: this.sidebarCollapsed,
      inspectorCollapsed: this.inspectorCollapsed,
      activeChapterId: this.activeChapterId,
      selectedElementIds: [...this.selectedElementIds],
      selectedConnectionId: this.selectedConnectionId,
      expandedChapterIds: [...this.expandedChapterIds],
      archiveExpanded: this.archiveExpanded,
      zoom: this.zoom
    };
  }

  #cancelActiveEdits() {
    for (const drag of [this.drag, this.resize, this.chapterNodeDrag, this.playerCharacterDrag, this.connectionDrag]) {
      if (!drag) continue;
      const dragWindow = drag.ownerWindow ?? this.#getWindow();
      if (drag.frame) dragWindow?.cancelAnimationFrame?.(drag.frame);
      if (drag.move) dragWindow?.removeEventListener("pointermove", drag.move);
      if (drag.end) {
        dragWindow?.removeEventListener("pointerup", drag.end);
        dragWindow?.removeEventListener("pointercancel", drag.end);
      }
      drag.preview?.remove();
      drag.token?.classList.remove("is-dragging");
      drag.target?.classList.remove("is-dragging");
    }
    this.drag = null;
    this.resize = null;
    this.chapterNodeDrag = null;
    this.playerCharacterDrag = null;
    this.connectionDrag = null;
    this.element?.querySelectorAll(".is-connection-drag-source, .is-connection-drop-target, .is-player-character-drop-target")
      .forEach(node => node.classList.remove("is-connection-drag-source", "is-connection-drop-target", "is-player-character-drop-target"));
  }

  async #resolveUnsavedDetails() {
    if (!this.detailsDirty) return true;
    const document = this.#getDocument();
    const dialog = document.createElement("dialog");
    dialog.className = "mel-storyboard-unsaved-dialog";
    dialog.setAttribute("aria-labelledby", "mel-storyboard-unsaved-title");
    const heading = document.createElement("h2");
    heading.id = "mel-storyboard-unsaved-title";
    heading.textContent = localize("MEL_STORYBOARD.DIALOGS.UnsavedChanges");
    const message = document.createElement("p");
    message.textContent = localize("MEL_STORYBOARD.DIALOGS.UnsavedChangesPrompt");
    const actions = document.createElement("footer");
    actions.className = "mel-storyboard-unsaved-dialog-actions";
    const options = [
      ...(this.readOnly ? [] : [["save", localize("MEL_STORYBOARD.ACTIONS.SaveChanges")]]),
      ["discard", localize("MEL_STORYBOARD.ACTIONS.DiscardChanges")],
      ["cancel", localize("MEL_STORYBOARD.ACTIONS.ContinueEditing")]
    ];
    for (const [value, label] of options) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.choice = value;
      button.textContent = label;
      if (value === "save") button.classList.add("primary");
      actions.append(button);
    }
    dialog.append(heading, message, actions);
    this.element.append(dialog);
    const choice = await new Promise(resolve => {
      const finish = value => {
        dialog.close();
        dialog.remove();
        resolve(value);
      };
      actions.addEventListener("click", event => {
        const button = event.target.closest("button[data-choice]");
        if (button) finish(button.dataset.choice);
      });
      dialog.addEventListener("cancel", event => {
        event.preventDefault();
        finish("cancel");
      });
      dialog.addEventListener("click", event => {
        if (event.target === dialog) finish("cancel");
      });
      dialog.showModal();
      actions.querySelector("[data-choice='save'], [data-choice='discard'], [data-choice='cancel']")?.focus();
    });
    if (choice === "cancel") return false;
    if (choice === "discard") {
      this.detailsDirty = false;
      return true;
    }
    if (choice === "save") {
      try {
        if (this.selectedConnectionId) await this.#saveConnectionDetails();
        else if (this.selectedElementIds.length) await this.#saveSceneDetails();
        else await this.#saveChapterDetails();
        return !this.detailsDirty;
      } catch (error) {
        notifyError(error);
        return false;
      }
    }
    return false;
  }

  #bindPlayerCharacterTokens() {
    this.element.querySelectorAll("[data-player-character-token]").forEach(token => {
      if (token.dataset.playerCharacterBound) return;
      token.dataset.playerCharacterBound = "true";
      token.addEventListener("pointerdown", event => this.#startPlayerCharacterDrag(event));
      token.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
      });
    });
  }

  #bindFoundryLinks(root) {
    root.querySelectorAll("[data-storyboard-foundry-link]").forEach(link => {
      link.addEventListener("click", event => this.#openFoundryDocument(event));
    });
  }

  #bindChapterTreeDragDrop() {
    this.element.querySelectorAll("[data-chapter-id][draggable='true']").forEach(item => {
      item.addEventListener("dragstart", event => {
        if (this.readOnly || !this.canEdit) { event.preventDefault(); return; }
        event.stopPropagation();
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("application/x-mel-storyboard-tree", JSON.stringify({
          type: item.dataset.sceneId ? "scene" : "chapter",
          id: item.dataset.sceneId ?? item.dataset.chapterId,
          chapterId: item.dataset.chapterId
        }));
        item.classList.add("is-dragging");
      });
      item.addEventListener("dragend", () => item.classList.remove("is-dragging", "is-drop-target"));
      item.addEventListener("dragover", event => {
        if (this.readOnly || !this.canEdit) return;
        event.preventDefault();
        event.stopPropagation();
        item.classList.add("is-drop-target");
      });
      item.addEventListener("dragleave", () => item.classList.remove("is-drop-target"));
      item.addEventListener("drop", async event => {
        if (this.readOnly || !this.canEdit) return;
        event.preventDefault();
        event.stopPropagation();
        item.classList.remove("is-drop-target");
        await this.#handleChapterTreeDrop(event, item);
      });
    });
  }

  async #handleChapterTreeDrop(event, target) {
    if (this.readOnly || !this.canEdit || !await this.#resolveUnsavedDetails()) return;
    const raw = event.dataTransfer?.getData("application/x-mel-storyboard-tree");
    if (!raw) return;
    let payload;
    try { payload = JSON.parse(raw); } catch { return; }
    if (payload.type === "chapter" && target.dataset.chapterId && !target.dataset.sceneId) {
      if (payload.id === target.dataset.chapterId) return;
      this.history.capture(this.board);
      const ids = this.board.chapters.filter(chapter => !chapter.archived).map(chapter => chapter.id);
      const sourceIndex = ids.indexOf(payload.id);
      const targetIndex = ids.indexOf(target.dataset.chapterId);
      if (sourceIndex < 0 || targetIndex < 0) return;
      ids.splice(sourceIndex, 1);
      ids.splice(targetIndex, 0, payload.id);
      reorderChapters(this.board, ids);
    } else if (payload.type === "scene" && target.dataset.sceneId) {
      const targetScene = this.board.scenes.find(scene => scene.id === target.dataset.sceneId);
      if (!targetScene || payload.id === targetScene.id) return;
      this.history.capture(this.board);
      const targetScenes = this.board.scenes.filter(scene => scene.chapterId === targetScene.chapterId && scene.id !== payload.id).map(scene => scene.id);
      const sourceIndex = targetScenes.indexOf(payload.id);
      if (sourceIndex >= 0) targetScenes.splice(sourceIndex, 1);
      targetScenes.splice(Math.max(0, targetScenes.indexOf(targetScene.id)), 0, payload.id);
      const moveResult = moveSceneToChapter(this.board, payload.id, targetScene.chapterId, targetScenes.indexOf(payload.id));
      this.#notifyRemovedChapterConnections(moveResult.removedConnections);
    } else if (payload.type === "scene" && target.dataset.chapterId) {
      const targetChapter = this.board.chapters.find(chapter => chapter.id === target.dataset.chapterId);
      if (!targetChapter) return;
      this.history.capture(this.board);
      const moveResult = moveSceneToChapter(this.board, payload.id, targetChapter.id);
      this.#notifyRemovedChapterConnections(moveResult.removedConnections);
      this.activeChapterId = targetChapter.id;
      this.expandedChapterIds.add(targetChapter.id);
    } else return;
    this.board = await this.store.save(this.board);
    await this.render({ force: true });
  }

  #notifyRemovedChapterConnections(connections = []) {
    if (!connections.length) return;
    const message = localize("MEL_STORYBOARD.NOTIFICATIONS.RemovedCrossChapterConnections").replace("{count}", String(connections.length));
    ui.notifications.warn(message);
  }

  async #openFoundryDocument(event) {
    event.preventDefault();
    event.stopPropagation();
    const fullUuid = event.currentTarget?.dataset?.uuid;
    if (!fullUuid) return;
    const { uuid, anchor } = splitFoundryUuid(fullUuid);
    const foundryDocument = await fromUuid(uuid);
    if (!foundryDocument) {
      ui.notifications.warn(localize("MEL_STORYBOARD.NOTIFICATIONS.FoundryObjectUnavailable"));
      return;
    }
    if (foundryDocument.documentName === "Scene" && typeof foundryDocument.view === "function") {
      await foundryDocument.view();
      return;
    }
    if (foundryDocument.documentName === "PlaylistSound") {
      await this.#openPlaylistSoundInSidebar(foundryDocument);
      return;
    }
    const journalPage = foundryDocument.documentName === "JournalEntryPage";
    const sheet = journalPage ? foundryDocument.parent?.sheet : foundryDocument.sheet;
    if (sheet?.render) {
      if (journalPage || anchor) {
        await sheet.render(true, {
          ...(journalPage ? { pageId: foundryDocument.id } : {}),
          ...(anchor ? { anchor } : {})
        });
      } else {
        await sheet.render({ force: true });
      }
      sheet.bringToFront?.();
      return;
    }
    ui.notifications.warn(localize("MEL_STORYBOARD.NOTIFICATIONS.FoundryObjectUnavailable"));
  }

  async #openPlaylistSoundInSidebar(sound) {
    const playlist = sound.parent;
    const playlistDirectory = ui.playlists ?? ui.sidebar?.tabs?.playlists;
    if (!playlist || !playlistDirectory) {
      ui.notifications.warn(localize("MEL_STORYBOARD.NOTIFICATIONS.FoundryObjectUnavailable"));
      return;
    }

    try {
      // Foundry v14 keeps expanded playlist IDs on the native directory. Add
      // the parent before rendering so the embedded sound is present in the
      // resulting directory tree instead of opening PlaylistSoundConfig.
      playlistDirectory._expanded ??= new Set();
      playlistDirectory._expanded.add(playlist.id);
      playlistDirectory.activate?.();
      await playlistDirectory.render({ force: true });

      const escape = this.#getWindow()?.CSS?.escape ?? globalThis.CSS?.escape ?? (value => String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&"));
      const playlistElement = playlistDirectory.element?.querySelector(`[data-entry-id="${escape(playlist.id)}"]`);
      const soundElement = playlistElement?.querySelector(`[data-sound-id="${escape(sound.id)}"]`)
        ?? playlistDirectory.element?.querySelector(`[data-sound-id="${escape(sound.id)}"]`);
      if (!soundElement) return;
      soundElement.scrollIntoView({ block: "nearest", inline: "nearest" });
      soundElement.classList.add("mel-storyboard-foundry-track-focus");
      this.#getWindow()?.setTimeout(() => soundElement.classList.remove("mel-storyboard-foundry-track-focus"), 1800);
    } catch (error) {
      console.error(`[${MODULE_ID}] Could not open Playlist track in the native Playlist sidebar`, error);
      ui.notifications.warn(localize("MEL_STORYBOARD.NOTIFICATIONS.FoundryObjectUnavailable"));
    }
  }

  async #selectElement(elementId, additive = false) {
    const alreadySelected = this.selectedElementIds.includes(elementId);
    if (alreadySelected && !additive) return;
    if (this.detailsDirty && !await this.#resolveUnsavedDetails()) return;
    const element = this.board.elements.find(candidate => candidate.id === elementId);
    const scene = this.board.scenes.find(candidate => candidate.id === element?.sceneId);
    if (scene?.chapterId) {
      this.activeChapterId = scene.chapterId;
      this.expandedChapterIds.add(scene.chapterId);
    }
    this.inspectorCollapsed = false;
    this.selectedConnectionId = null;
    this.selectedElementIds = additive
      ? (this.selectedElementIds.includes(elementId) ? this.selectedElementIds.filter(id => id !== elementId) : [...this.selectedElementIds, elementId])
      : [elementId];
    this.render({ force: true });
  }

  async #selectConnection(connectionId) {
    if (!this.board.connections.some(connection => connection.id === connectionId)) return;
    if (this.selectedConnectionId === connectionId) return;
    if (this.detailsDirty && this.selectedConnectionId !== connectionId && !await this.#resolveUnsavedDetails()) return;
    this.selectedConnectionId = connectionId;
    this.selectedElementIds = [];
    this.connectionSourceId = null;
    this.connectionSourceType = null;
    this.connectionTargetId = null;
    this.connectionTargetType = null;
    this.inspectorCollapsed = false;
    this.render({ force: true });
  }

  async #activateConnectionDescriptionEditor(description) {
    const editorHost = this.element.querySelector("[data-connection-description-editor]");
    if (!editorHost) return;
    const generation = ++this.connectionDescriptionEditorGeneration;
    const document = this.#getDocument();
    const editorShell = document.createElement("div");
    editorShell.className = "editor prosemirror mel-storyboard-connection-description-editor-shell";
    const editorTarget = document.createElement("div");
    editorTarget.className = "editor-content";
    editorShell.append(editorTarget);
    editorHost.replaceChildren(editorShell);
    this.connectionDescriptionEditorShell = editorShell;
    let editor;
    try {
      const { defaultSchema, plugins } = foundry.prosemirror;
      editor = await foundry.applications.ux.ProseMirrorEditor.create(editorTarget, description, {
        uuid: `MelStoryboard.ConnectionDetails.${foundry.utils.randomID()}`,
        plugins: {
          menu: plugins.ProseMirrorMenu.build(defaultSchema, {
            destroyOnSave: false,
            onSave: () => this.#saveConnectionDetails()
          }),
          keyMaps: plugins.ProseMirrorKeyMaps.build(defaultSchema, {
            onSave: () => this.#saveConnectionDetails()
          })
        },
        props: { editable: () => true }
      });
    } catch (error) {
      console.error("[mel-storyboard] Could not create connection description editor", error);
      this.#destroyConnectionDescriptionEditor();
      ui.notifications.error(localize("MEL_STORYBOARD.ERRORS.NoteEditor"));
      return;
    }
    if (generation !== this.connectionDescriptionEditorGeneration || !editorShell.isConnected || !this.selectedConnectionId || this.readOnly || !this.canEdit) {
      editor.destroy();
      if (generation === this.connectionDescriptionEditorGeneration && this.readOnly && editorShell.isConnected) {
        await this.#renderReadOnlyDescription("[data-connection-description-editor]", description);
      }
      return;
    }
    this.connectionDescriptionEditor = editor;
    editor.view.dom.addEventListener("input", () => this.#markDetailsDirty());
  }

  async #activateSceneDescriptionEditor(description) {
    const editorHost = this.element.querySelector("[data-scene-description-editor]");
    if (!editorHost) return;
    const generation = ++this.sceneDescriptionEditorGeneration;
    const document = this.#getDocument();
    const editorShell = document.createElement("div");
    editorShell.className = "editor prosemirror mel-storyboard-scene-description-editor-shell";
    const editorTarget = document.createElement("div");
    editorTarget.className = "editor-content";
    editorShell.append(editorTarget);
    editorHost.replaceChildren(editorShell);
    this.sceneDescriptionEditorShell = editorShell;
    let editor;
    try {
      const { defaultSchema, plugins } = foundry.prosemirror;
      editor = await foundry.applications.ux.ProseMirrorEditor.create(editorTarget, description, {
        uuid: `MelStoryboard.SceneDetails.${foundry.utils.randomID()}`,
        plugins: {
          menu: plugins.ProseMirrorMenu.build(defaultSchema, {
            destroyOnSave: false,
            onSave: () => this.#saveSceneDetails()
          }),
          keyMaps: plugins.ProseMirrorKeyMaps.build(defaultSchema, {
            onSave: () => this.#saveSceneDetails()
          })
        },
        props: { editable: () => true }
      });
    } catch (error) {
      console.error("[mel-storyboard] Could not create scene description editor", error);
      this.#destroySceneDescriptionEditor();
      ui.notifications.error(localize("MEL_STORYBOARD.ERRORS.NoteEditor"));
      return;
    }
    if (generation !== this.sceneDescriptionEditorGeneration || !editorShell.isConnected || !this.selectedElementIds.length || this.readOnly || !this.canEdit) {
      editor.destroy();
      if (generation === this.sceneDescriptionEditorGeneration && this.readOnly && editorShell.isConnected) {
        await this.#renderReadOnlyDescription("[data-scene-description-editor]", description);
      }
      return;
    }
    this.sceneDescriptionEditor = editor;
    editor.view.dom.addEventListener("input", () => this.#markDetailsDirty());
  }

  async #activateChapterDescriptionEditor(description) {
    const editorHost = this.element.querySelector("[data-chapter-description-editor]");
    if (!editorHost) return;
    const generation = ++this.chapterDescriptionEditorGeneration;
    const document = this.#getDocument();
    const editorShell = document.createElement("div");
    editorShell.className = "editor prosemirror mel-storyboard-chapter-description-editor-shell";
    const editorTarget = document.createElement("div");
    editorTarget.className = "editor-content";
    editorShell.append(editorTarget);
    editorHost.replaceChildren(editorShell);
    this.chapterDescriptionEditorShell = editorShell;
    let editor;
    try {
      const { defaultSchema, plugins } = foundry.prosemirror;
      editor = await foundry.applications.ux.ProseMirrorEditor.create(editorTarget, description, {
        uuid: `MelStoryboard.ChapterDetails.${foundry.utils.randomID()}`,
        plugins: {
          menu: plugins.ProseMirrorMenu.build(defaultSchema, {
            destroyOnSave: false,
            onSave: () => this.#saveChapterDetails()
          }),
          keyMaps: plugins.ProseMirrorKeyMaps.build(defaultSchema, {
            onSave: () => this.#saveChapterDetails()
          })
        },
        props: { editable: () => true }
      });
    } catch (error) {
      console.error("[mel-storyboard] Could not create chapter description editor", error);
      this.#destroyChapterDescriptionEditor();
      ui.notifications.error(localize("MEL_STORYBOARD.ERRORS.NoteEditor"));
      return;
    }
    if (generation !== this.chapterDescriptionEditorGeneration || !editorShell.isConnected || !this.activeChapterId || this.readOnly || !this.canEdit) {
      editor.destroy();
      if (generation === this.chapterDescriptionEditorGeneration && this.readOnly && editorShell.isConnected) {
        await this.#renderReadOnlyDescription("[data-chapter-description-editor]", description);
      }
      return;
    }
    this.chapterDescriptionEditor = editor;
    editor.view.dom.addEventListener("input", () => this.#markDetailsDirty());
  }

  #destroyConnectionDescriptionEditor() {
    this.connectionDescriptionEditorGeneration += 1;
    this.connectionDescriptionEditor?.destroy();
    this.connectionDescriptionEditor = null;
    this.connectionDescriptionEditorShell?.remove();
    this.connectionDescriptionEditorShell = null;
  }

  #destroySceneDescriptionEditor() {
    this.sceneDescriptionEditorGeneration += 1;
    this.sceneDescriptionEditor?.destroy();
    this.sceneDescriptionEditor = null;
    this.sceneDescriptionEditorShell?.remove();
    this.sceneDescriptionEditorShell = null;
  }

  #destroyChapterDescriptionEditor() {
    this.chapterDescriptionEditorGeneration += 1;
    this.chapterDescriptionEditor?.destroy();
    this.chapterDescriptionEditor = null;
    this.chapterDescriptionEditorShell?.remove();
    this.chapterDescriptionEditorShell = null;
  }

  #getConnectionDescriptionValue() {
    const document = this.connectionDescriptionEditor?.view?.state?.doc;
    if (!document) return this.board.connections.find(connection => connection.id === this.selectedConnectionId)?.description ?? "";
    return foundry.prosemirror.dom.serializeString(document.content);
  }

  #getSceneDescriptionValue() {
    const document = this.sceneDescriptionEditor?.view?.state?.doc;
    if (!document) return this.#selectedScene()?.description ?? "";
    return foundry.prosemirror.dom.serializeString(document.content);
  }

  #getChapterDescriptionValue() {
    const document = this.chapterDescriptionEditor?.view?.state?.doc;
    if (!document) return this.board.chapters.find(chapter => chapter.id === this.activeChapterId)?.description ?? "";
    return foundry.prosemirror.dom.serializeString(document.content);
  }

  async #saveConnectionDetails() {
    if (this.readOnly || !this.canEdit) return;
    const connection = this.board.connections.find(candidate => candidate.id === this.selectedConnectionId);
    if (!connection) return;
    const label = this.element.querySelector("[data-connection-field='label']")?.value ?? connection.label ?? "";
    const connectionType = this.element.querySelector("[data-connection-field='connectionType']")?.value ?? connection.connectionType;
    const connectionStatus = this.element.querySelector("[data-connection-field='connectionStatus']")?.value ?? connection.connectionStatus;
    this.history.capture(this.board);
    updateConnection(connection, { label, connectionType, connectionStatus, description: this.#getConnectionDescriptionValue() });
    this.board = await this.store.save(this.board);
    this.detailsDirty = false;
    this.#destroyConnectionDescriptionEditor();
    await this.render({ force: true });
  }

  async #saveSceneDetails() {
    if (this.readOnly || !this.canEdit) return;
    const scene = this.#selectedScene();
    if (!scene) return;
    const title = this.element.querySelector("[data-scene-field='title']")?.value ?? scene.title;
    const status = this.element.querySelector("[data-scene-field='status']")?.value ?? scene.status;
    const sceneShape = this.element.querySelector("[data-scene-field='sceneShape']")?.value ?? scene.sceneShape;
    const iconType = this.element.querySelector("[data-scene-field='iconType']")?.value ?? scene.iconType;
    this.history.capture(this.board);
    scene.title = title.trim() || scene.title;
    scene.status = status;
    scene.sceneShape = sceneShape;
    scene.iconType = iconType;
    scene.description = this.#getSceneDescriptionValue();
    scene.updatedAt = new Date().toISOString();
    this.board = await this.store.save(this.board);
    this.detailsDirty = false;
    this.#destroySceneDescriptionEditor();
    ui.notifications.info(localize("MEL_STORYBOARD.NOTIFICATIONS.Saved"));
    await this.render({ force: true });
  }

  async #saveChapterDetails() {
    if (this.readOnly || !this.canEdit) return;
    const chapter = this.board.chapters.find(candidate => candidate.id === this.activeChapterId);
    if (!chapter) return;
    const title = this.element.querySelector("[data-chapter-field='title']")?.value ?? chapter.title;
    const status = this.element.querySelector("[data-chapter-field='status']")?.value ?? chapter.status;
    this.history.capture(this.board);
    chapter.title = title.trim() || chapter.title;
    chapter.status = status;
    chapter.description = this.#getChapterDescriptionValue();
    chapter.updatedAt = new Date().toISOString();
    this.board = await this.store.save(this.board);
    this.detailsDirty = false;
    this.#destroyChapterDescriptionEditor();
    ui.notifications.info(localize("MEL_STORYBOARD.NOTIFICATIONS.Saved"));
    await this.render({ force: true });
  }

  #selectedScene() {
    const element = this.board.elements.find(candidate => candidate.id === this.selectedElementIds[0]);
    return this.board.scenes.find(scene => scene.id === element?.sceneId) ?? null;
  }

  #exportLabels(title = localize("MEL_STORYBOARD.EXPORT.Scenes")) {
    return {
      title,
      scene: localize("MEL_STORYBOARD.ELEMENT_TYPES.SCENE"),
      status: status => localize(`MEL_STORYBOARD.STATUS.${status}`),
      statusColors: this.statusColorsEnabled,
      showSceneIcons: this.showSceneIconsEnabled,
      compactScenes: this.compactScenes,
      sceneIconPaths: globalThis.CONFIG?.JournalEntry?.noteIcons ?? {}
    };
  }

  #sceneIconPath(iconType) {
    if (!iconType || iconType === SCENE_ICON_NONE) return "";
    return globalThis.CONFIG?.JournalEntry?.noteIcons?.[iconType] ?? "";
  }

  #sceneIconOptions(selectedValue = SCENE_ICON_NONE) {
    const noteIcons = globalThis.CONFIG?.JournalEntry?.noteIcons ?? {};
    return [
      { value: SCENE_ICON_NONE, label: localize("MEL_STORYBOARD.SCENE_ICON_TYPES.None"), selected: selectedValue === SCENE_ICON_NONE },
      ...Object.entries(noteIcons).map(([value]) => ({
        value,
        label: (() => {
          const key = `MEL_STORYBOARD.SCENE_ICON_TYPES.${SCENE_ICON_LOCALIZATION_KEYS[value] ?? value}`;
          const translated = localize(key);
          return translated === key ? value : translated;
        })(),
        selected: value === selectedValue
      }))
    ].sort((left, right) => left.label.localeCompare(right.label, game.i18n?.lang, { sensitivity: "base" }));
  }

  #onContextMenu(event) {
    if (this.readOnly) {
      const target = this.#isElement(event.target)
        ? event.target.closest("[data-storyboard-canvas], [data-scene-element], [data-connection-id], [data-chapter-node], [data-chapter-id], [data-story-root], [data-archive-root]")
        : null;
      if (target) event.preventDefault();
      return;
    }
    const target = this.#isElement(event.target) ? event.target : null;
    const path = event.composedPath?.() ?? [];
    const findTarget = selector => path.find(candidate => this.#isElement(candidate) && candidate.matches(selector)) ?? target?.closest(selector);
    const connectionTarget = findTarget("[data-connection-id]");
    const chapterConnectionTarget = findTarget("[data-chapter-connection-id]");
    const playerCharacterTarget = findTarget("[data-player-character-token]");
    const sceneTarget = findTarget("[data-scene-element]");
    const chapterNodeTarget = findTarget("[data-chapter-node]");
    const chapterTarget = findTarget("[data-chapter-id]");
    const archiveRootTarget = findTarget("[data-archive-root]");
    const storyTarget = findTarget("[data-story-root]");
    const canvasTarget = findTarget("[data-storyboard-canvas]");
    if (archiveRootTarget && !chapterTarget && !sceneTarget && !chapterNodeTarget && !connectionTarget && !chapterConnectionTarget) {
      event.preventDefault();
      event.stopPropagation();
      this.#closeContextMenu();
      return;
    }
    if (!connectionTarget && !chapterConnectionTarget && !playerCharacterTarget && !sceneTarget && !chapterNodeTarget && !chapterTarget && !storyTarget && !canvasTarget) return;
    event.preventDefault();
    event.stopPropagation();
    this.#openContextMenu(event, {
      connectionId: connectionTarget?.dataset.connectionId ?? null,
      chapterConnectionId: chapterConnectionTarget?.dataset.chapterConnectionId ?? null,
      playerCharacterObjectId: playerCharacterTarget?.dataset.objectId ?? null,
      playerCharacterElementId: playerCharacterTarget?.dataset.sceneElementId ?? null,
      elementId: sceneTarget?.dataset.elementId ?? null,
      chapterId: chapterTarget?.dataset.chapterId ?? null,
      nodeId: chapterNodeTarget?.dataset.nodeId ?? null,
      isStoryRoot: Boolean(storyTarget),
      isArchived: Boolean(this.board.chapters.find(chapter => chapter.id === chapterTarget?.dataset.chapterId)?.archived)
    });
  }

  #onCanvasWheel(event) {
    if (!event.deltaY) return;
    event.preventDefault();
    const direction = event.deltaY < 0 ? 1 : -1;
    this.#changeZoom(direction * 0.1, event);
  }

  #startCanvasPan(event) {
    const isCanvasBackground = event.target === event.currentTarget || event.target?.matches?.("[data-canvas-background]");
    if (event.button !== 0 || !isCanvasBackground || this.connectionSourceId || this.connectionTargetId) return;
    const scroll = this.element.querySelector(".mel-storyboard-canvas-scroll");
    if (!scroll) return;
    event.preventDefault();
    const ownerWindow = this.#windowForEvent(event);
    this.canvasPan = {
      scroll,
      startX: event.clientX,
      startY: event.clientY,
      startScrollLeft: scroll.scrollLeft,
      startScrollTop: scroll.scrollTop,
      moved: false,
      ownerWindow
    };
    this.canvasPan.move = moveEvent => this.#canvasPanMove(moveEvent);
    this.canvasPan.end = () => this.#finishCanvasPan();
    scroll.classList.add("is-panning");
    ownerWindow.addEventListener("pointermove", this.canvasPan.move);
    ownerWindow.addEventListener("pointerup", this.canvasPan.end, { once: true });
    ownerWindow.addEventListener("pointercancel", this.canvasPan.end, { once: true });
  }

  #startConnectionDrag(event) {
    if (this.readOnly || !this.canEdit || this.detailsDirty) return;
    if (event.button !== 1 || this.connectionSourceId || this.connectionTargetId || this.connectionDrag) return;
    const sourceType = event.currentTarget?.matches?.("[data-chapter-node]") ? "CHAPTER_NODE" : "SCENE";
    const sourceId = sourceType === "CHAPTER_NODE" ? event.currentTarget?.dataset.nodeId : event.currentTarget?.dataset.elementId;
    const source = sourceType === "CHAPTER_NODE"
      ? this.board.chapters.flatMap(chapter => chapter.nodes ?? []).find(node => node.id === sourceId)
      : this.board.elements.find(element => element.id === sourceId);
    const svg = this.element.querySelector("[data-storyboard-canvas]");
    if (!source || !svg) return;
    event.preventDefault();
    event.stopPropagation();
    const ownerWindow = this.#windowForEvent(event);
    const preview = this.#getDocument().createElementNS("http://www.w3.org/2000/svg", "line");
    preview.classList.add("mel-storyboard-connection-preview");
    const center = sourceType === "CHAPTER_NODE" ? source.position : { x: source.position.x + source.size.width / 2, y: source.position.y + source.size.height / 2 };
    preview.setAttribute("x1", center.x);
    preview.setAttribute("y1", center.y);
    preview.setAttribute("x2", center.x);
    preview.setAttribute("y2", center.y);
    svg.append(preview);
    this.connectionDrag = { sourceId, sourceType, source, preview, target: null, ownerWindow };
    this.connectionDrag.move = moveEvent => this.#connectionDragMove(moveEvent);
    this.connectionDrag.end = endEvent => this.#finishConnectionDrag(endEvent);
    event.currentTarget.classList.add("is-connection-drag-source");
    ownerWindow.addEventListener("pointermove", this.connectionDrag.move);
    ownerWindow.addEventListener("pointerup", this.connectionDrag.end, { once: true });
    ownerWindow.addEventListener("pointercancel", this.connectionDrag.end, { once: true });
  }

  #connectionDragMove(event) {
    if (!this.connectionDrag) return;
    const svg = this.element.querySelector("[data-storyboard-canvas]");
    if (!svg) return;
    const point = this.#svgPoint(svg, event);
    this.connectionDrag.preview.setAttribute("x2", point.x);
    this.connectionDrag.preview.setAttribute("y2", point.y);
    const target = this.#getDocument().elementFromPoint(event.clientX, event.clientY)?.closest?.("[data-scene-element], [data-chapter-node]");
    const targetType = target?.matches?.("[data-chapter-node]") ? "CHAPTER_NODE" : "SCENE";
    const targetId = targetType === "CHAPTER_NODE" ? target?.dataset.nodeId : target?.dataset.elementId;
    const validTargetId = targetId && !(targetType === this.connectionDrag.sourceType && targetId === this.connectionDrag.sourceId)
      ? targetId
      : null;
    this.connectionDrag.target = validTargetId ? { id: validTargetId, type: targetType } : null;
    this.element.querySelectorAll("[data-scene-element], [data-chapter-node]").forEach(element => {
      const id = element.matches("[data-chapter-node]") ? element.dataset.nodeId : element.dataset.elementId;
      const type = element.matches("[data-chapter-node]") ? "CHAPTER_NODE" : "SCENE";
      element.classList.toggle("is-connection-drop-target", id === validTargetId && type === targetType);
    });
  }

  async #finishConnectionDrag(event = null) {
    const drag = this.connectionDrag;
    if (!drag) return;
    const dragWindow = drag.ownerWindow ?? this.#getWindow();
    dragWindow?.removeEventListener("pointermove", drag.move);
    dragWindow?.removeEventListener("pointerup", drag.end);
    dragWindow?.removeEventListener("pointercancel", drag.end);
    drag.preview?.remove();
    this.element.querySelectorAll(".is-connection-drag-source, .is-connection-drop-target").forEach(element => {
      element.classList.remove("is-connection-drag-source", "is-connection-drop-target");
    });
    this.connectionDrag = null;
    if (this.readOnly || !this.canEdit) return;
    const releaseTarget = event && this.#getDocument().elementFromPoint(event.clientX, event.clientY)?.closest?.("[data-scene-element], [data-chapter-node]");
    const releaseTargetType = releaseTarget?.matches?.("[data-chapter-node]") ? "CHAPTER_NODE" : "SCENE";
    const releaseTargetRawId = releaseTargetType === "CHAPTER_NODE" ? releaseTarget?.dataset.nodeId : releaseTarget?.dataset.elementId;
    const releaseTargetId = releaseTargetRawId && !(releaseTargetType === drag.sourceType && releaseTargetRawId === drag.sourceId)
      ? { id: releaseTargetRawId, type: releaseTargetType }
      : drag.target;
    if (!releaseTargetId) return;
    try {
      this.history.capture(this.board);
      const connection = createConnection(this.board, drag.sourceId, releaseTargetId.id, "unilateral", "", drag.sourceType, releaseTargetId.type);
      this.board = await this.store.save(this.board);
      this.selectedElementIds = [];
      this.selectedConnectionId = connection.id;
      this.inspectorCollapsed = false;
      await this.render({ force: true });
    } catch (error) {
      notifyError(error);
    }
  }

  #canvasPanMove(event) {
    if (!this.canvasPan) return;
    this.canvasPan.pendingEvent = event;
    if (!this.canvasPan.frame) this.canvasPan.frame = this.canvasPan.ownerWindow?.requestAnimationFrame?.(() => this.#applyCanvasPanFrame());
  }

  #applyCanvasPanFrame() {
    if (!this.canvasPan?.pendingEvent) return;
    const { scroll, startX, startY, startScrollLeft, startScrollTop, pendingEvent } = this.canvasPan;
    if (Math.abs(pendingEvent.clientX - startX) > 2 || Math.abs(pendingEvent.clientY - startY) > 2) this.canvasPan.moved = true;
    scroll.scrollLeft = startScrollLeft - (pendingEvent.clientX - startX);
    scroll.scrollTop = startScrollTop - (pendingEvent.clientY - startY);
    this.canvasPan.pendingEvent = null;
    this.canvasPan.frame = null;
  }

  #finishCanvasPan() {
    if (!this.canvasPan) return;
    const { move, end, scroll, frame } = this.canvasPan;
    const ownerWindow = this.canvasPan.ownerWindow ?? this.#getWindow();
    if (frame) ownerWindow?.cancelAnimationFrame?.(frame);
    this.#applyCanvasPanFrame();
    ownerWindow?.removeEventListener("pointermove", move);
    ownerWindow?.removeEventListener("pointerup", end);
    ownerWindow?.removeEventListener("pointercancel", end);
    scroll.classList.remove("is-panning");
    this.suppressCanvasClick = this.canvasPan.moved;
    this.canvasPan = null;
  }

  #changeZoom(delta, event = null) {
    const nextZoom = Math.min(2.5, Math.max(0.4, Math.round((this.zoom + delta) * 10) / 10));
    if (nextZoom === this.zoom) return;
    const scroll = this.element.querySelector(".mel-storyboard-canvas-scroll");
    const svg = this.element.querySelector("[data-storyboard-canvas]");
    if (!scroll || !svg) {
      this.zoom = nextZoom;
      return;
    }
    const scrollRect = scroll.getBoundingClientRect();
    const oldWidth = svg.getBoundingClientRect().width;
    const oldHeight = svg.getBoundingClientRect().height;
    const pointerX = event ? event.clientX - scrollRect.left : scroll.clientWidth / 2;
    const pointerY = event ? event.clientY - scrollRect.top : scroll.clientHeight / 2;
    const anchorX = (scroll.scrollLeft + pointerX) / Math.max(oldWidth, 1);
    const anchorY = (scroll.scrollTop + pointerY) / Math.max(oldHeight, 1);
    this.zoom = nextZoom;
    this.#applyZoom();
    const newWidth = svg.getBoundingClientRect().width;
    const newHeight = svg.getBoundingClientRect().height;
    scroll.scrollLeft = anchorX * newWidth - pointerX;
    scroll.scrollTop = anchorY * newHeight - pointerY;
  }

  #captureCanvasViewport() {
    const scroll = this.element?.querySelector(".mel-storyboard-canvas-scroll");
    if (!scroll) return;
    this.canvasViewport = {
      left: scroll.scrollLeft,
      top: scroll.scrollTop
    };
  }

  #restoreCanvasViewport() {
    const viewport = this.canvasViewport;
    const scroll = this.element?.querySelector(".mel-storyboard-canvas-scroll");
    if (!viewport || !scroll) return;
    const apply = () => {
      if (!scroll.isConnected) return;
      scroll.scrollLeft = viewport.left;
      scroll.scrollTop = viewport.top;
    };
    apply();
    this.#getWindow()?.requestAnimationFrame?.(apply);
  }

  #applyZoom() {
    const svg = this.element.querySelector("[data-storyboard-canvas]");
    if (!svg) return;
    const width = Number(svg.dataset.canvasWidth) * this.zoom;
    const height = Number(svg.dataset.canvasHeight) * this.zoom;
    svg.setAttribute("width", String(width));
    svg.setAttribute("height", String(height));
    svg.style.width = `${width}px`;
    svg.style.height = `${height}px`;
  }

  #openContextMenu(event, { connectionId = null, chapterConnectionId = null, playerCharacterObjectId = null, playerCharacterElementId = null, elementId = null, chapterId = null, nodeId = null, isStoryRoot = false, isArchived = false } = {}) {
    if (this.readOnly || !this.canEdit) return;
    this.#closeContextMenu();
    const document = this.#getDocument();
    const appWindow = this.#getWindow();
    const sceneMenu = Boolean(elementId);
    const connectionMenu = Boolean(connectionId);
    const chapterConnectionMenu = Boolean(chapterConnectionId);
    const playerCharacterMenu = Boolean(playerCharacterObjectId && playerCharacterElementId);
    const chapterMenu = Boolean(chapterId);
    const nodeMenu = Boolean(nodeId);
    const node = nodeId
      ? this.board.chapters.flatMap(chapter => chapter.nodes ?? []).find(candidate => candidate.id === nodeId)
      : null;
    const menu = document.createElement("menu");
    menu.className = "mel-storyboard-context-menu";
    menu.setAttribute("role", "menu");
    const entries = connectionMenu ? [
      { label: localize("MEL_STORYBOARD.ACTIONS.DeleteConnection"), icon: "×", action: () => this.#deleteConnection(connectionId) }
    ] : chapterConnectionMenu ? [
      { label: localize("MEL_STORYBOARD.ACTIONS.DeleteChapterConnection"), icon: "×", action: () => this.#deleteChapterConnection(chapterConnectionId) }
    ] : nodeMenu ? [
      { label: localize("MEL_STORYBOARD.ACTIONS.RenameNode"), icon: "✎", action: () => this.#renameChapterNode(nodeId) },
      ...(node?.nodeType === "ENTRY" ? [
        { label: localize("MEL_STORYBOARD.ACTIONS.ConnectToScene"), icon: "→", action: () => this.#beginConnectionFrom(nodeId, "CHAPTER_NODE") }
      ] : []),
      ...(node?.nodeType === "EXIT" ? [
        { label: localize("MEL_STORYBOARD.ACTIONS.ConnectFromScene"), icon: "←", action: () => this.#beginConnectionTo(nodeId, "CHAPTER_NODE") }
      ] : []),
      { label: localize("MEL_STORYBOARD.ACTIONS.LinkNode"), icon: "⇄", action: () => this.#linkChapterNode(nodeId) },
      { label: localize("MEL_STORYBOARD.ACTIONS.DeleteNode"), icon: "×", action: () => this.#deleteChapterNode(nodeId) }
    ] : chapterMenu ? (isArchived ? [
      { label: localize("MEL_STORYBOARD.ACTIONS.RestoreChapter"), icon: "↶", action: () => this.#restoreArchivedChapter(chapterId) }
    ] : [
      { label: localize("MEL_STORYBOARD.ACTIONS.ChapterDetails"), icon: "ⓘ", action: () => this.#selectChapter(chapterId) },
      { label: localize("MEL_STORYBOARD.ACTIONS.NewScene"), icon: "+", action: async () => { this.activeChapterId = chapterId; await this.#createScene(); } },
      { label: localize("MEL_STORYBOARD.ACTIONS.NewEntryNode"), icon: "○", action: () => this.#createChapterNode(chapterId, "ENTRY") },
      { label: localize("MEL_STORYBOARD.ACTIONS.NewExitNode"), icon: "○", action: () => this.#createChapterNode(chapterId, "EXIT") },
      { label: localize("MEL_STORYBOARD.ACTIONS.ArchiveChapter"), icon: "▣", action: () => this.#archiveChapter(chapterId) },
      { label: localize("MEL_STORYBOARD.ACTIONS.DeleteChapter"), icon: "×", action: () => this.#deleteChapter(chapterId) }
    ]) : isStoryRoot ? [
      { label: localize("MEL_STORYBOARD.ACTIONS.NewChapter"), icon: "+", action: () => this.#createChapter() }
    ] : playerCharacterMenu ? [
      { label: localize("MEL_STORYBOARD.ACTIONS.RemovePlayerCharacter"), icon: "×", action: () => this.#removePlayerCharacterFromScene(playerCharacterElementId, playerCharacterObjectId) }
    ] : sceneMenu ? [
      { label: localize("MEL_STORYBOARD.ACTIONS.ConnectScene"), icon: "→", action: async () => { this.selectedElementIds = [elementId]; await this.#beginConnectionFrom(elementId, "SCENE"); } },
      { label: localize("MEL_STORYBOARD.ACTIONS.DeleteScene"), icon: "×", action: async () => { this.selectedElementIds = [elementId]; await this.#deleteSelected(); } }
    ] : [
      { label: localize("MEL_STORYBOARD.ACTIONS.NewScene"), icon: "+", action: () => this.#createScene(event) }
    ];
    for (const entry of entries) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "mel-storyboard-context-menu-item";
      item.setAttribute("role", "menuitem");
      const icon = document.createElement("span");
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = entry.icon;
      const label = document.createElement("span");
      label.textContent = entry.label;
      item.append(icon, label);
      item.addEventListener("click", async () => {
        this.#closeContextMenu();
        try {
          if (await this.#resolveUnsavedDetails()) await entry.action();
        } catch (error) { notifyError(error); }
      });
      menu.append(item);
    }
    menu.addEventListener("contextmenu", menuEvent => menuEvent.preventDefault());
    this.element.append(menu);
    const left = Math.min(event.clientX, appWindow.innerWidth - menu.offsetWidth - 8);
    const top = Math.min(event.clientY, appWindow.innerHeight - menu.offsetHeight - 8);
    menu.style.left = `${Math.max(8, left)}px`;
    menu.style.top = `${Math.max(8, top)}px`;
    this.contextMenuElement = menu;
    this.contextMenuDocument = document;
    this.contextMenuOutsideHandler = pointerEvent => {
      if (!menu.contains(pointerEvent.target)) this.#closeContextMenu();
    };
    this.contextMenuKeyHandler = keyEvent => {
      if (keyEvent.key === "Escape") this.#closeContextMenu();
    };
    document.addEventListener("pointerdown", this.contextMenuOutsideHandler, true);
    document.addEventListener("keydown", this.contextMenuKeyHandler, true);
  }

  async #deleteConnection(connectionId) {
    this.history.capture(this.board);
    removeConnection(this.board, connectionId);
    this.board = await this.store.save(this.board);
    await this.render({ force: true });
  }

  async #deleteChapterConnection(connectionId) {
    this.history.capture(this.board);
    removeChapterConnection(this.board, connectionId);
    this.board = await this.store.save(this.board);
    await this.render({ force: true });
  }

  async #archiveChapter(chapterId) {
    const chapter = this.board.chapters.find(candidate => candidate.id === chapterId);
    if (!chapter || chapter.archived) return;
    this.history.capture(this.board);
    archiveChapter(this.board, chapterId);
    if (this.activeChapterId === chapterId) {
      this.activeChapterId = this.board.chapters.find(candidate => !candidate.archived)?.id ?? null;
      this.selectedElementIds = [];
      this.selectedConnectionId = null;
      this.connectionSourceId = null;
      this.connectionSourceType = null;
      this.connectionTargetId = null;
      this.connectionTargetType = null;
    }
    this.archiveExpanded = true;
    this.board = await this.store.save(this.board);
    await this.render({ force: true });
  }

  async #restoreArchivedChapter(chapterId) {
    const chapter = this.board.chapters.find(candidate => candidate.id === chapterId);
    if (!chapter?.archived) return;
    this.history.capture(this.board);
    restoreChapter(this.board, chapterId);
    this.activeChapterId = chapterId;
    this.expandedChapterIds.add(chapterId);
    this.archiveExpanded = false;
    this.selectedElementIds = [];
    this.selectedConnectionId = null;
    this.connectionSourceId = null;
    this.connectionSourceType = null;
    this.connectionTargetId = null;
    this.connectionTargetType = null;
    this.inspectorCollapsed = false;
    this.board = await this.store.save(this.board);
    await this.render({ force: true });
  }

  #closeContextMenu() {
    this.contextMenuElement?.remove();
    if (this.contextMenuOutsideHandler) this.contextMenuDocument?.removeEventListener("pointerdown", this.contextMenuOutsideHandler, true);
    if (this.contextMenuKeyHandler) this.contextMenuDocument?.removeEventListener("keydown", this.contextMenuKeyHandler, true);
    this.contextMenuElement = null;
    this.contextMenuDocument = null;
    this.contextMenuOutsideHandler = null;
    this.contextMenuKeyHandler = null;
  }

  #rebindContextMenuListeners() {
    if (!this.contextMenuElement) return;
    const previousDocument = this.contextMenuDocument;
    previousDocument?.removeEventListener("pointerdown", this.contextMenuOutsideHandler, true);
    previousDocument?.removeEventListener("keydown", this.contextMenuKeyHandler, true);
    const nextDocument = this.#getDocument();
    nextDocument?.addEventListener("pointerdown", this.contextMenuOutsideHandler, true);
    nextDocument?.addEventListener("keydown", this.contextMenuKeyHandler, true);
    this.contextMenuDocument = nextDocument;
  }

  async #createScene(event = null) {
    const activeChapter = this.board.chapters.find(chapter => chapter.id === this.activeChapterId);
    if (!activeChapter || activeChapter.archived) return;
    const nextNumber = this.board.scenes.reduce((highest, scene) => {
      const match = /^Scene\s+(\d+)$/i.exec(scene.title?.trim() ?? "");
      return Math.max(highest, match ? Number(match[1]) : 0);
    }, 0) + 1;
    const title = `Scene ${nextNumber}`;
    this.history.capture(this.board);
    const scene = createScene(this.board, { title, chapterId: this.activeChapterId });
    const element = createSceneElement(this.board, { sceneId: scene.id, title: scene.title });
    const svg = this.element.querySelector("[data-storyboard-canvas]");
    if (event && svg) {
      const point = this.#svgPoint(svg, event);
      element.position = { x: Math.max(0, point.x - element.size.width / 2), y: Math.max(0, point.y - element.size.height / 2) };
    }
    this.board = await this.store.save(this.board);
    this.selectedElementIds = [element.id];
    this.inspectorCollapsed = false;
    await this.render({ force: true });
  }

  async #selectChapter(chapterId) {
    const chapter = this.board.chapters.find(candidate => candidate.id === chapterId);
    if (!chapter) return;
    if (this.activeChapterId === chapterId && !this.selectedElementIds.length && !this.selectedConnectionId) return;
    if (this.detailsDirty && !await this.#resolveUnsavedDetails()) return;
    this.activeChapterId = chapterId;
    if (chapter.archived) this.archiveExpanded = true;
    this.expandedChapterIds.add(chapterId);
    this.selectedElementIds = [];
    this.selectedConnectionId = null;
    this.connectionSourceId = null;
    this.connectionSourceType = null;
    this.connectionTargetId = null;
    this.connectionTargetType = null;
    this.inspectorCollapsed = false;
    this.render({ force: true });
  }

  #toggleChapter(chapterId) {
    if (this.expandedChapterIds.has(chapterId)) this.expandedChapterIds.delete(chapterId);
    else this.expandedChapterIds.add(chapterId);
    this.render({ force: true });
  }

  async #createChapter() {
    const nextNumber = this.board.chapters.reduce((highest, chapter) => {
      const match = /^Chapter\s+(\d+)$/i.exec(chapter.title?.trim() ?? "");
      return Math.max(highest, match ? Number(match[1]) : 0);
    }, 0) + 1;
    this.history.capture(this.board);
    const chapter = createChapter(this.board, { title: `Chapter ${nextNumber}` });
    this.activeChapterId = chapter.id;
    this.expandedChapterIds.add(chapter.id);
    this.selectedElementIds = [];
    this.selectedConnectionId = null;
    this.inspectorCollapsed = false;
    this.board = await this.store.save(this.board);
    await this.render({ force: true });
  }

  async #createChapterNode(chapterId, nodeType) {
    this.history.capture(this.board);
    createChapterNode(this.board, chapterId, { nodeType });
    this.activeChapterId = chapterId;
    this.selectedElementIds = [];
    this.selectedConnectionId = null;
    this.board = await this.store.save(this.board);
    await this.render({ force: true });
  }

  async #renameChapterNode(nodeId) {
    const node = this.board.chapters.flatMap(chapter => chapter.nodes ?? []).find(candidate => candidate.id === nodeId);
    if (!node) return;
    await Dialog.prompt({
      title: localize("MEL_STORYBOARD.ACTIONS.RenameNode"),
      content: `<form><div class="form-group"><label>${localize("MEL_STORYBOARD.LABELS.Title")}</label><input type="text" name="title" value="${String(node.title).replace(/"/g, "&quot;")}" autofocus></div></form>`,
      callback: async html => {
        const title = html.find("[name='title']").val();
        this.history.capture(this.board);
        updateChapterNode(node, { title });
        this.board = await this.store.save(this.board);
        await this.render({ force: true });
      },
      rejectClose: false
    });
  }

  async #deleteChapterNode(nodeId) {
    this.history.capture(this.board);
    removeChapterNode(this.board, nodeId);
    this.board = await this.store.save(this.board);
    await this.render({ force: true });
  }

  async #linkChapterNode(nodeId) {
    const source = this.board.chapters.flatMap(chapter => (chapter.nodes ?? []).map(node => ({ ...node, chapterId: chapter.id }))).find(node => node.id === nodeId);
    if (!source) return;
    const targetType = source.nodeType === "EXIT" ? "ENTRY" : "EXIT";
    const targets = this.board.chapters.flatMap(chapter => (chapter.nodes ?? []).map(node => ({ ...node, chapterId: chapter.id }))).filter(node => node.nodeType === targetType && node.chapterId !== source.chapterId);
    if (!targets.length) {
      ui.notifications.warn(localize("MEL_STORYBOARD.NOTIFICATIONS.NoChapterNodeTargets"));
      return;
    }
    const options = targets.map(target => `<option value="${target.id}">${target.displayId}: ${target.title} (${this.board.chapters.find(chapter => chapter.id === target.chapterId)?.title ?? ""})</option>`).join("");
    await Dialog.prompt({
      title: localize("MEL_STORYBOARD.ACTIONS.LinkNode"),
      content: `<form><div class="form-group"><label>${localize("MEL_STORYBOARD.LABELS.TargetNode")}</label><select name="targetNode">${options}</select></div></form>`,
      callback: async html => {
        const targetId = html.find("[name='targetNode']").val();
        this.history.capture(this.board);
        if (source.nodeType === "EXIT") createChapterConnection(this.board, source.id, targetId);
        else createChapterConnection(this.board, targetId, source.id);
        this.board = await this.store.save(this.board);
        await this.render({ force: true });
      },
      rejectClose: false
    });
  }

  async #deleteChapter(chapterId) {
    if (this.board.chapters.length <= 1) {
      ui.notifications.warn(localize("MEL_STORYBOARD.NOTIFICATIONS.LastChapter"));
      return;
    }
    const chapter = this.board.chapters.find(candidate => candidate.id === chapterId);
    if (!chapter) return;
    const confirmed = await Dialog.confirm({
      title: localize("MEL_STORYBOARD.ACTIONS.DeleteChapter"),
      content: `<p>${localize("MEL_STORYBOARD.NOTIFICATIONS.ConfirmDeleteChapter").replace("{name}", chapter.title)}</p>`
    });
    if (!confirmed) return;
    this.history.capture(this.board);
    removeChapter(this.board, chapterId);
    this.activeChapterId = this.board.chapters[0]?.id ?? null;
    this.expandedChapterIds.add(this.activeChapterId);
    this.selectedElementIds = [];
    this.selectedConnectionId = null;
    this.board = await this.store.save(this.board);
    await this.render({ force: true });
  }

  async #beginConnectionFrom(sourceId, sourceType = "SCENE") {
    if (this.readOnly || !this.canEdit || !sourceId) return;
    this.connectionSourceId = sourceId;
    this.connectionSourceType = sourceType;
    this.connectionTargetId = null;
    this.connectionTargetType = null;
    this.selectedConnectionId = null;
    this.selectedElementIds = sourceType === "SCENE" ? [sourceId] : [];
    ui.notifications.info(localize("MEL_STORYBOARD.NOTIFICATIONS.SelectConnectionTarget"));
    await this.render({ force: true });
  }

  async #beginConnectionTo(targetId, targetType = "CHAPTER_NODE") {
    if (this.readOnly || !this.canEdit || !targetId) return;
    this.connectionSourceId = null;
    this.connectionSourceType = null;
    this.connectionTargetId = targetId;
    this.connectionTargetType = targetType;
    this.selectedConnectionId = null;
    this.selectedElementIds = [];
    ui.notifications.info(localize("MEL_STORYBOARD.NOTIFICATIONS.SelectConnectionSource"));
    await this.render({ force: true });
  }

  async #createConnectionFromEndpoints(sourceId, sourceType, targetId, targetType) {
    if (!sourceId || !targetId || (sourceId === targetId && sourceType === targetType)) return;
    try {
      this.history.capture(this.board);
      const connection = createConnection(this.board, sourceId, targetId, "unilateral", "", sourceType, targetType);
      this.board = await this.store.save(this.board);
      this.selectedElementIds = [];
      this.selectedConnectionId = connection.id;
      this.connectionSourceId = null;
      this.connectionSourceType = null;
      this.connectionTargetId = null;
      this.connectionTargetType = null;
      await this.render({ force: true });
    } catch (error) {
      notifyError(error);
    }
  }

  async #connectTo(targetId, targetType = "SCENE") {
    if (!this.connectionSourceId || this.connectionSourceId === targetId) return;
    await this.#createConnectionFromEndpoints(this.connectionSourceId, this.connectionSourceType ?? "SCENE", targetId, targetType);
  }

  async #connectFrom(sourceId, sourceType = "SCENE") {
    if (!this.connectionTargetId || this.connectionTargetId === sourceId) return;
    await this.#createConnectionFromEndpoints(sourceId, sourceType, this.connectionTargetId, this.connectionTargetType ?? "CHAPTER_NODE");
  }

  #connectionEndpointTitle(connection, side, scenesById = new Map(this.board.scenes.map(scene => [scene.id, scene]))) {
    const type = connection[`${side}Type`] ?? (connection[`${side}NodeId`] ? "CHAPTER_NODE" : "SCENE");
    if (type === "CHAPTER_NODE") {
      const nodeId = connection[`${side}NodeId`];
      const node = this.board.chapters.flatMap(chapter => chapter.nodes ?? []).find(candidate => candidate.id === nodeId);
      return node?.title ?? nodeId ?? "";
    }
    const element = this.board.elements.find(candidate => candidate.id === connection[`${side}ElementId`]);
    return scenesById.get(element?.sceneId)?.title ?? "";
  }

  async #jumpToLinkedNode(nodeId) {
    const link = (this.board.chapterConnections ?? []).find(connection => connection.sourceNodeId === nodeId || connection.targetNodeId === nodeId);
    if (!link) return;
    const targetNodeId = link.sourceNodeId === nodeId ? link.targetNodeId : link.sourceNodeId;
    const targetChapter = this.board.chapters.find(chapter => (chapter.nodes ?? []).some(node => node.id === targetNodeId));
    if (!targetChapter) return;
    this.activeChapterId = targetChapter.id;
    this.expandedChapterIds.add(targetChapter.id);
    this.selectedElementIds = [];
    this.selectedConnectionId = null;
    this.connectionSourceId = null;
    this.connectionSourceType = null;
    this.connectionTargetId = null;
    this.connectionTargetType = null;
    this.inspectorCollapsed = false;
    await this.render({ force: true });
    const focus = () => {
      const target = this.element.querySelector(`[data-chapter-node][data-node-id="${targetNodeId}"]`);
      target?.scrollIntoView?.({ block: "center", inline: "center" });
      target?.classList.add("is-focused");
      this.#getWindow()?.setTimeout?.(() => target?.classList.remove("is-focused"), 700);
    };
    if (this.#getWindow()?.requestAnimationFrame) this.#getWindow().requestAnimationFrame(focus);
    else focus();
  }

  #onKeyDown(event) {
    const tagName = event.target?.tagName?.toLowerCase();
    if (["input", "textarea", "select"].includes(tagName) || event.target?.isContentEditable) return;
    if (this.readOnly && !((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c")) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") { event.preventDefault(); this.#copySelection(); }
    else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") { event.preventDefault(); this.#pasteClipboard(); }
    else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); this.#handleAction({ currentTarget: { dataset: { action: event.shiftKey ? "redo" : "undo" } } }); }
    else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") { event.preventDefault(); this.#handleAction({ currentTarget: { dataset: { action: "redo" } } }); }
    else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") { event.preventDefault(); this.#duplicateSelected(); }
    else if (event.key === "Delete") { event.preventDefault(); this.#deleteSelected(); }
  }

  #copySelection() {
    if (!this.selectedElementIds.length) return;
    this.clipboard = copySceneElements(this.board, this.selectedElementIds);
    ui.notifications.info(localize("MEL_STORYBOARD.NOTIFICATIONS.Copied"));
  }

  async #pasteClipboard() {
    if (this.readOnly || !this.canEdit || !this.clipboard) return;
    this.history.capture(this.board);
    const result = pasteSceneElements(this.board, this.clipboard);
    this.board = await this.store.save(this.board);
    this.selectedElementIds = result.duplicates.map(element => element.id);
    await this.render({ force: true });
  }

  async #duplicateSelected() {
    if (!this.selectedElementIds.length) return;
    this.history.capture(this.board);
    const result = duplicateSceneElements(this.board, this.selectedElementIds);
    this.board = await this.store.save(this.board);
    this.selectedElementIds = result.duplicates.map(element => element.id);
    await this.render({ force: true });
  }

  async #deleteSelected() {
    if (!this.selectedElementIds.length) return;
    this.history.capture(this.board);
    removeSceneElements(this.board, this.selectedElementIds);
    this.board = await this.store.save(this.board);
    this.selectedElementIds = [];
    await this.render({ force: true });
  }

  async #removeObjectFromScene(assignmentId) {
    const scene = this.#selectedScene();
    if (!scene || !assignmentId) return;
    this.history.capture(this.board);
    removeObjectAssignment(scene, assignmentId);
    this.board = await this.store.save(this.board);
  }

  async #removePlayerCharacterFromScene(elementId, objectId) {
    const element = this.board.elements.find(candidate => candidate.id === elementId);
    const scene = this.board.scenes.find(candidate => candidate.id === element?.sceneId);
    const assignment = scene?.objectAssignments?.find(candidate => candidate.objectId === objectId);
    if (!scene || !assignment) return;
    this.history.capture(this.board);
    removeObjectAssignment(scene, assignment.id);
    this.board = await this.store.save(this.board);
    this.selectedElementIds = [elementId];
    await this.render({ force: true });
  }

  async #removeObjectFromConnection(assignmentId) {
    const connection = this.board.connections.find(candidate => candidate.id === this.selectedConnectionId);
    if (!connection || !assignmentId) return;
    this.history.capture(this.board);
    removeObjectFromConnection(connection, assignmentId);
    this.board = await this.store.save(this.board);
  }

  async #showObjectDetails(assignmentId, { focusNotes = false } = {}) {
    const scene = this.#selectedScene();
    await this.#showObjectDetailsForOwner(scene, assignmentId, { focusNotes });
  }

  async #showConnectionObjectDetails(assignmentId, { focusNotes = false } = {}) {
    const connection = this.board.connections.find(candidate => candidate.id === this.selectedConnectionId);
    await this.#showObjectDetailsForOwner(connection, assignmentId, { focusNotes });
  }

  async #showObjectDetailsForOwner(owner, assignmentId, { focusNotes = false } = {}) {
    const assignment = owner?.objectAssignments?.find(candidate => candidate.id === assignmentId);
    const object = this.board.objects.find(candidate => candidate.id === assignment?.objectId);
    if (!owner || !assignment || !object) return;
    const details = new ObjectDetailsApplication({
      object: {
        ...object,
        typeLabel: localize(`MEL_STORYBOARD.OBJECT_TYPES.${object.objectType}`),
        image: object.visualConfig?.image ?? ""
      },
      assignmentNotes: assignment.notes ?? "",
      foundryLinkHtml: createFoundryLinkHtml(object.foundryUuid, object.title),
      focusNotes: focusNotes && !this.readOnly && this.canEdit,
      readOnly: this.readOnly || !this.canEdit,
      onClose: () => this.objectDetailsApplications.delete(details),
      onOpenDocument: event => this.#openFoundryDocument(event),
      onSave: this.readOnly || !this.canEdit ? null : async notes => {
        if (this.readOnly || !this.canEdit) throw new Error(localize("MEL_STORYBOARD.NOTIFICATIONS.EditorAccessChanged"));
        this.history.capture(this.board);
        updateObjectAssignment(owner, assignmentId, { notes });
        this.board = await this.store.save(this.board);
        await this.render({ force: true });
      }
    });
    this.objectDetailsApplications.add(details);
    await details.render({ force: true });
    details.bringToFront();
  }

  async #editObjectNote(assignmentId) {
    await this.#showObjectDetails(assignmentId, { focusNotes: true });
  }

  async #editConnectionObjectNote(assignmentId) {
    await this.#showConnectionObjectDetails(assignmentId, { focusNotes: true });
  }

  #startPlayerCharacterDrag(event) {
    if (this.readOnly || !this.canEdit || this.detailsDirty) return;
    if (event.button !== 0 || this.connectionSourceId || this.connectionTargetId) return;
    const token = event.currentTarget;
    const objectId = token.dataset.objectId;
    const sourceElementId = token.dataset.sceneElementId;
    const object = this.board.objects?.find(candidate => candidate.id === objectId);
    if (!object || object.objectType !== "PLAYER_CHARACTER") return;
    event.preventDefault();
    event.stopPropagation();
    this.playerCharacterDrag = {
      objectId,
      sourceElementId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      dropTargetId: null,
      token,
      ownerWindow: this.#windowForEvent(event)
    };
    this.playerCharacterDrag.move = moveEvent => this.#playerCharacterDragMove(moveEvent);
    this.playerCharacterDrag.end = endEvent => this.#finishPlayerCharacterDrag(endEvent);
    token.classList.add("is-dragging");
    this.playerCharacterDrag.ownerWindow.addEventListener("pointermove", this.playerCharacterDrag.move);
    this.playerCharacterDrag.ownerWindow.addEventListener("pointerup", this.playerCharacterDrag.end, { once: true });
    this.playerCharacterDrag.ownerWindow.addEventListener("pointercancel", this.playerCharacterDrag.end, { once: true });
  }

  #playerCharacterDragMove(event) {
    if (!this.playerCharacterDrag) return;
    const drag = this.playerCharacterDrag;
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 4) return;
    drag.moved = true;
    const target = this.#getDocument().elementFromPoint(event.clientX, event.clientY)?.closest?.("[data-scene-element]");
    const targetId = target?.dataset.elementId ?? null;
    drag.dropTargetId = targetId && targetId !== drag.sourceElementId ? targetId : null;
    this.element.querySelectorAll("[data-scene-element]").forEach(element => {
      element.classList.toggle("is-player-character-drop-target", element.dataset.elementId === drag.dropTargetId);
    });
  }

  async #finishPlayerCharacterDrag() {
    const drag = this.playerCharacterDrag;
    if (!drag) return;
    const dragWindow = drag.ownerWindow ?? this.#getWindow();
    dragWindow?.removeEventListener("pointermove", drag.move);
    dragWindow?.removeEventListener("pointerup", drag.end);
    dragWindow?.removeEventListener("pointercancel", drag.end);
    drag.token?.classList.remove("is-dragging");
    this.element.querySelectorAll(".is-player-character-drop-target").forEach(element => element.classList.remove("is-player-character-drop-target"));
    this.playerCharacterDrag = null;
    if (!drag.moved || !drag.dropTargetId) return;
    if (this.readOnly || !this.canEdit) return;
    try {
      const targetElement = this.board.elements.find(element => element.id === drag.dropTargetId);
      const sourceElement = this.board.elements.find(element => element.id === drag.sourceElementId);
      const targetScene = this.board.scenes.find(scene => scene.id === targetElement?.sceneId);
      const sourceScene = this.board.scenes.find(scene => scene.id === sourceElement?.sceneId);
      if (!sourceScene || !targetScene) return;
      this.history.capture(this.board);
      moveObjectAssignment(this.board, drag.objectId, sourceScene.id, targetScene.id);
      this.board = await this.store.save(this.board);
      this.selectedElementIds = [drag.dropTargetId];
      await this.render({ force: true });
    } catch (error) {
      notifyError(error);
    }
  }

  async #onFoundryDrop(event) {
    if (this.readOnly || !this.canEdit) return;
    const data = parseFoundryDropData(event);
    if (!data) return;
    const supportedTypes = new Set(["Actor", "Item", "JournalEntry", "JournalEntryPage", "Scene", "RollTable", "Macro", "Playlist", "PlaylistSound"]);
    if (!data?.uuid) return;
    const { uuid: documentUuid } = splitFoundryUuid(data.uuid);
    const target = this.#isElement(event.target) ? event.target.closest("[data-scene-element], [data-connection-id]") : null;
    const element = this.board.elements.find(candidate => candidate.id === target?.dataset.elementId);
    const scene = this.board.scenes.find(candidate => candidate.id === element?.sceneId);
    const connection = this.board.connections.find(candidate => candidate.id === target?.dataset.connectionId);
    if (!scene && !connection) return;
    const foundryDocument = await fromUuid(documentUuid);
    if (!foundryDocument) throw new Error("The dropped Foundry document could not be resolved.");
    const foundryType = foundryDocument.documentName ?? data.type;
    if (!supportedTypes.has(foundryType)) return;
    const objectType = foundryType === "Actor"
      ? (foundryDocument.type === "character" ? "PLAYER_CHARACTER" : "NPC")
      : foundryType === "Item" ? "ITEM" : foundryType === "Scene" ? "FOUNDRY_SCENE" : "JOURNAL";
    const extendedObjectType = foundryType === "RollTable"
      ? "ROLLABLE_TABLE"
      : foundryType === "Macro" ? "MACRO" : foundryType === "Playlist" ? "PLAYLIST" : foundryType === "PlaylistSound" ? "PLAYLIST_SOUND" : objectType;
    this.history.capture(this.board);
    const existing = this.board.objects.find(object => object.foundryUuid === data.uuid);
    const object = existing ?? createBoardObject(this.board, {
      objectType: extendedObjectType,
      title: data.label?.trim() || data.name?.trim() || foundryDocument.name || data.uuid,
      foundryUuid: data.uuid,
      foundryDocumentType: foundryType,
      image: foundryArtwork(foundryDocument)
    });
    if (scene) assignObjectToScene(scene, object.id);
    else assignObjectToConnection(connection, object.id);
    this.board = await this.store.save(this.board);
    if (scene) {
      this.selectedElementIds = [element.id];
      this.selectedConnectionId = null;
    } else {
      this.selectedElementIds = [];
      this.selectedConnectionId = connection.id;
    }
    await this.render({ force: true });
  }

  #markDropTarget(event, active) {
    const target = this.#isElement(event.target) ? event.target.closest("[data-scene-element], [data-connection-id]") : null;
    target?.classList.toggle("is-drop-target", active);
  }

  async #handleAction(event) {
    const action = event.currentTarget.dataset.action;
    try {
      if (this.readOnly && !READ_ONLY_ACTIONS.has(action)) return;
      if (!READ_ONLY_ACTIONS.has(action) && (!this.store.canWrite || !this.canEdit)) {
        await this.refreshEditorAccess();
        return;
      }
      if (this.detailsDirty && !["save-scene", "save-chapter", "save-connection"].includes(action)) {
        if (!await this.#resolveUnsavedDetails()) return;
      }
      if (action === "add-scene") {
        await this.#createScene();
      } else if (action === "add-chapter") {
        await this.#createChapter();
      } else if (action === "toggle-sidebar") {
        this.sidebarCollapsed = !this.sidebarCollapsed;
      } else if (action === "toggle-archive") {
        this.archiveExpanded = !this.archiveExpanded;
      } else if (action === "toggle-inspector") {
        this.inspectorCollapsed = !this.inspectorCollapsed;
      } else if (action === "zoom-out") {
        this.#changeZoom(-0.1);
        return;
      } else if (action === "zoom-in") {
        this.#changeZoom(0.1);
        return;
      } else if (action === "object-details") {
        await this.#showObjectDetails(event.currentTarget.dataset.assignmentId);
        return;
      }
      else if (action === "remove-object") await this.#removeObjectFromScene(event.currentTarget.dataset.assignmentId);
      else if (action === "edit-object-note") {
        await this.#editObjectNote(event.currentTarget.dataset.assignmentId);
        return;
      }
      else if (action === "connection-object-details") {
        await this.#showConnectionObjectDetails(event.currentTarget.dataset.assignmentId);
        return;
      }
      else if (action === "remove-connection-object") await this.#removeObjectFromConnection(event.currentTarget.dataset.assignmentId);
      else if (action === "edit-connection-object-note") {
        await this.#editConnectionObjectNote(event.currentTarget.dataset.assignmentId);
        return;
      }
      else if (action === "save-connection") {
        await this.#saveConnectionDetails();
        return;
      }
      else if (action === "duplicate-selected") await this.#duplicateSelected();
      else if (action === "connect-selected") {
        if (this.selectedElementIds.length !== 2) return;
        this.history.capture(this.board);
        createConnection(this.board, this.selectedElementIds[0], this.selectedElementIds[1]);
        this.board = await this.store.save(this.board);
      } else if (action === "delete-selected") await this.#deleteSelected();
      else if (action === "undo" || action === "redo") {
        const snapshot = action === "undo" ? this.history.undo(this.board) : this.history.redo(this.board);
        if (!snapshot) return;
        this.board = await this.store.save(snapshot);
        this.selectedElementIds = [];
      } else if (action === "import-json") this.element.querySelector("[data-json-import]")?.click();
      else if (action === "select-scene") {
        const element = this.board.elements.find(candidate => candidate.sceneId === event.currentTarget.dataset.sceneId);
        const scene = this.board.scenes.find(candidate => candidate.id === event.currentTarget.dataset.sceneId);
        if (scene?.chapterId) {
          this.activeChapterId = scene.chapterId;
          this.expandedChapterIds.add(scene.chapterId);
        }
        this.selectedElementIds = element ? [element.id] : [];
        this.selectedConnectionId = null;
        this.inspectorCollapsed = false;
      } else if (action === "select-chapter") {
        await this.#selectChapter(event.currentTarget.dataset.chapterId);
        return;
      } else if (action === "toggle-chapter") {
        this.#toggleChapter(event.currentTarget.dataset.chapterId);
        return;
      } else if (action === "jump-node") {
        await this.#jumpToLinkedNode(event.currentTarget.dataset.nodeId);
        return;
      } else if (action === "save-scene") {
        await this.#saveSceneDetails();
        return;
      } else if (action === "save-chapter") {
        await this.#saveChapterDetails();
        return;
      } else if (action === "export-json") await this.#exportBoard("json");
      else if (action === "export-svg") await this.#exportBoard("svg");
      else if (action === "export-png") await this.#exportBoard("png");
      else if (action === "export-pdf") await this.#exportBoard("pdf");
      await this.render({ force: true });
    } catch (error) { notifyError(error); }
  }

  async #exportBoard(format) {
    const chapters = this.board.chapters ?? [];
    const options = chapters.map(chapter => `<option value="${chapter.id}" ${chapter.id === this.activeChapterId ? "selected" : ""}>${chapter.displayId}: ${chapter.title}</option>`).join("");
    await Dialog.prompt({
      title: localize("MEL_STORYBOARD.ACTIONS.ExportScope"),
      content: `<form><div class="form-group"><label>${localize("MEL_STORYBOARD.LABELS.ExportScope")}</label><select name="scope"><option value="all">${localize("MEL_STORYBOARD.LABELS.EntireStoryboard")}</option><option value="current">${localize("MEL_STORYBOARD.LABELS.CurrentChapter")}</option><option value="selected">${localize("MEL_STORYBOARD.LABELS.SelectedChapters")}</option></select></div><div class="form-group"><label>${localize("MEL_STORYBOARD.LABELS.Chapters")}</label><select name="chapters" multiple size="${Math.min(6, Math.max(2, chapters.length))}">${options}</select></div></form>`,
      callback: async html => {
        const scope = html.find("[name='scope']").val();
        const selected = Array.from(html.find("[name='chapters'] option:selected")).map(option => option.value);
        const chapterIds = scope === "all" ? null : scope === "current" ? [this.activeChapterId] : selected;
        const board = scopeSceneBoard(this.board, chapterIds);
        if (format === "json") {
          downloadSceneBoardJson(board);
          return;
        }
        const chaptersToExport = (this.board.chapters ?? []).filter(chapter => !chapterIds || chapterIds.includes(chapter.id));
        const chapterExports = chaptersToExport.map(chapter => ({
          chapter,
          board: scopeSceneBoard(this.board, [chapter.id]),
          labels: this.#exportLabels(`${localize("MEL_STORYBOARD.EXPORT.Scenes")} – ${chapter.displayId}: ${chapter.title}`)
        }));
        if (chapterExports.length > 1) {
          if (format === "svg" || format === "png") {
            for (const entry of chapterExports) {
              const safeTitle = String(entry.chapter.title ?? "chapter").trim().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").toLowerCase() || "chapter";
              const filename = `mel-storyboard-${entry.chapter.displayId}-${safeTitle}.${format}`;
              if (format === "svg") await downloadSceneBoardSvg(entry.board, entry.labels, filename);
              else await downloadSceneBoardPng(entry.board, entry.labels, filename);
            }
          } else if (format === "pdf") await printSceneBoardsAsPdf(chapterExports);
          return;
        }
        const labels = chapterExports[0]?.labels ?? this.#exportLabels();
        const exportBoard = chapterExports[0]?.board ?? board;
        if (format === "svg") await downloadSceneBoardSvg(exportBoard, labels);
        else if (format === "png") await downloadSceneBoardPng(exportBoard, labels);
        else if (format === "pdf") await printSceneBoardAsPdf(exportBoard, labels);
      },
      rejectClose: false
    });
  }

  async #importFile(event) {
    if (this.readOnly || !this.canEdit) return;
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    try {
      const imported = normalizeSceneBoard(sceneBoardFromJson(await file.text()), { resetInvalid: false });
      const options = this.board.chapters.map(chapter => `<option value="${chapter.id}">${chapter.displayId}: ${chapter.title}</option>`).join("");
      await Dialog.prompt({
        title: localize("MEL_STORYBOARD.ACTIONS.ImportTarget"),
        content: `<form><div class="form-group"><label>${localize("MEL_STORYBOARD.LABELS.ImportTarget")}</label><select name="target"><option value="replace">${localize("MEL_STORYBOARD.LABELS.ReplaceStoryboard")}</option><option value="new">${localize("MEL_STORYBOARD.LABELS.NewChapter")}</option><option value="existing">${localize("MEL_STORYBOARD.LABELS.ExistingChapter")}</option></select></div><div class="form-group"><label>${localize("MEL_STORYBOARD.LABELS.Chapter")}</label><select name="chapter">${options}</select></div></form>`,
        callback: async html => {
          const target = html.find("[name='target']").val();
          const chapterId = html.find("[name='chapter']").val();
          let importedChapterSelectionId = null;
          this.history.capture(this.board);
          if (target === "replace") this.board = await this.store.import(imported);
          else if (target === "new") importedChapterSelectionId = this.#mergeImportedChapters(imported);
          else this.#mergeImportedChapterInto(imported, chapterId);
          this.selectedElementIds = [];
          this.selectedConnectionId = null;
          this.connectionSourceId = null;
          this.connectionSourceType = null;
          this.connectionTargetId = null;
          this.connectionTargetType = null;
          this.activeChapterId = target === "replace"
              ? this.board.chapters.find(chapter => !chapter.archived)?.id ?? this.board.chapters[0]?.id ?? null
            : target === "existing"
              ? chapterId
              : importedChapterSelectionId ?? this.board.chapters.filter(chapter => !chapter.archived).at(-1)?.id ?? this.board.chapters.at(-1)?.id ?? null;
          this.board = await this.store.save(this.board);
          await this.render({ force: true });
        },
        rejectClose: false
      });
    } catch (error) { notifyError(error); }
    finally { event.currentTarget.value = ""; }
  }

  #mergeImportedChapters(imported) {
    const chapterMap = new Map();
    const sceneMap = new Map();
    const elementMap = new Map();
    const nodeMap = new Map();
    const objectMap = new Map();
    const templateMap = new Map();
    const importedObjects = (imported.objects ?? []).map(source => {
      const copied = { ...clone(source), id: uuid() };
      objectMap.set(source.id, copied.id);
      return copied;
    });
    const importedTemplates = (imported.templates ?? []).map(source => {
      const copied = { ...clone(source), id: uuid(), sourceTemplateId: source.sourceTemplateId ? uuid() : null };
      templateMap.set(source.id, copied.id);
      return copied;
    });
    const chapters = (imported.chapters ?? []).map(source => {
      const chapter = clone(source);
      chapter.id = uuid();
      chapter.displayId = `C-${String(this.board.chapters.length + chapterMap.size + 1).padStart(3, "0")}`;
      chapterMap.set(source.id, chapter.id);
      chapter.nodes = (source.nodes ?? []).map(node => {
        const copied = { ...clone(node), id: uuid() };
        nodeMap.set(node.id, copied.id);
        return copied;
      });
      return chapter;
    });
    const scenes = (imported.scenes ?? []).map(source => {
      const scene = { ...clone(source), id: uuid(), displayId: `S-${String(this.board.scenes.length + sceneMap.size + 1).padStart(3, "0")}`, chapterId: chapterMap.get(source.chapterId), templateId: templateMap.get(source.templateId) ?? source.templateId };
      scene.objectAssignments = (source.objectAssignments ?? []).map(assignment => ({ ...clone(assignment), objectId: objectMap.get(assignment.objectId) ?? assignment.objectId }));
      sceneMap.set(source.id, scene.id);
      return scene;
    });
    const elements = (imported.elements ?? []).map(source => {
      const element = { ...clone(source), id: uuid(), sceneId: sceneMap.get(source.sceneId) };
      elementMap.set(source.id, element.id);
      return element;
    });
    const connections = (imported.connections ?? []).map(source => {
      const sourceType = source.sourceType ?? (source.sourceNodeId ? "CHAPTER_NODE" : "SCENE");
      const targetType = source.targetType ?? (source.targetNodeId ? "CHAPTER_NODE" : "SCENE");
      const sourceId = sourceType === "CHAPTER_NODE" ? nodeMap.get(source.sourceNodeId) : elementMap.get(source.sourceElementId);
      const targetId = targetType === "CHAPTER_NODE" ? nodeMap.get(source.targetNodeId) : elementMap.get(source.targetElementId);
      return { ...clone(source), id: uuid(), sourceType, targetType, sourceElementId: sourceType === "SCENE" ? sourceId : null, targetElementId: targetType === "SCENE" ? targetId : null, sourceNodeId: sourceType === "CHAPTER_NODE" ? sourceId : null, targetNodeId: targetType === "CHAPTER_NODE" ? targetId : null, objectAssignments: (source.objectAssignments ?? []).map(assignment => ({ ...clone(assignment), objectId: objectMap.get(assignment.objectId) ?? assignment.objectId })) };
    }).filter(connection => (connection.sourceType === "CHAPTER_NODE" ? connection.sourceNodeId : connection.sourceElementId) && (connection.targetType === "CHAPTER_NODE" ? connection.targetNodeId : connection.targetElementId));
    this.board.objects.push(...importedObjects);
    this.board.templates.push(...importedTemplates);
    const chapterConnections = (imported.chapterConnections ?? []).map(source => ({ ...clone(source), id: uuid(), sourceNodeId: nodeMap.get(source.sourceNodeId), targetNodeId: nodeMap.get(source.targetNodeId) })).filter(connection => connection.sourceNodeId && connection.targetNodeId);
    const importedActiveChapters = chapters.filter(chapter => !chapter.archived);
    const importedArchivedChapters = chapters.filter(chapter => chapter.archived);
    const firstArchivedIndex = this.board.chapters.findIndex(chapter => chapter.archived);
    this.board.chapters.splice(firstArchivedIndex < 0 ? this.board.chapters.length : firstArchivedIndex, 0, ...importedActiveChapters, ...importedArchivedChapters);
    this.board.scenes.push(...scenes);
    this.board.elements.push(...elements);
    this.board.connections.push(...connections);
    this.board.chapterConnections.push(...chapterConnections);
    return importedActiveChapters.at(-1)?.id ?? importedArchivedChapters.at(-1)?.id ?? null;
  }

  #mergeImportedChapterInto(imported, targetChapterId) {
    const sourceChapter = imported.chapters?.[0];
    const targetChapter = this.board.chapters.find(chapter => chapter.id === targetChapterId);
    if (!sourceChapter || !targetChapter) throw new Error("The import target chapter does not exist.");
    const sceneMap = new Map();
    const nodeMap = new Map();
    const objectMap = new Map();
    const templateMap = new Map();
    for (const source of imported.objects ?? []) {
      const copied = { ...clone(source), id: uuid() };
      objectMap.set(source.id, copied.id);
      this.board.objects.push(copied);
    }
    for (const source of imported.templates ?? []) {
      const copied = { ...clone(source), id: uuid(), sourceTemplateId: source.sourceTemplateId ? uuid() : null };
      templateMap.set(source.id, copied.id);
      this.board.templates.push(copied);
    }
    for (const node of sourceChapter.nodes ?? []) {
      const copied = { ...clone(node), id: uuid() };
      nodeMap.set(node.id, copied.id);
      targetChapter.nodes.push(copied);
    }
    const scenes = (imported.scenes ?? []).filter(scene => scene.chapterId === sourceChapter.id).map(source => {
      const copied = { ...clone(source), id: uuid(), displayId: `S-${String(this.board.scenes.length + sceneMap.size + 1).padStart(3, "0")}`, chapterId: targetChapter.id, templateId: templateMap.get(source.templateId) ?? source.templateId };
      copied.objectAssignments = (source.objectAssignments ?? []).map(assignment => ({ ...clone(assignment), objectId: objectMap.get(assignment.objectId) ?? assignment.objectId }));
      sceneMap.set(source.id, copied.id);
      return copied;
    });
    const elementMap = new Map();
    const elements = (imported.elements ?? []).filter(element => sceneMap.has(element.sceneId)).map(source => {
      const copied = { ...clone(source), id: uuid(), sceneId: sceneMap.get(source.sceneId) };
      elementMap.set(source.id, copied.id);
      return copied;
    });
    this.board.scenes.push(...scenes);
    this.board.elements.push(...elements);
    this.board.connections.push(...(imported.connections ?? []).map(source => {
      const sourceType = source.sourceType ?? (source.sourceNodeId ? "CHAPTER_NODE" : "SCENE");
      const targetType = source.targetType ?? (source.targetNodeId ? "CHAPTER_NODE" : "SCENE");
      const sourceId = sourceType === "CHAPTER_NODE" ? nodeMap.get(source.sourceNodeId) : elementMap.get(source.sourceElementId);
      const targetId = targetType === "CHAPTER_NODE" ? nodeMap.get(source.targetNodeId) : elementMap.get(source.targetElementId);
      return { ...clone(source), id: uuid(), sourceType, targetType, sourceElementId: sourceType === "SCENE" ? sourceId : null, targetElementId: targetType === "SCENE" ? targetId : null, sourceNodeId: sourceType === "CHAPTER_NODE" ? sourceId : null, targetNodeId: targetType === "CHAPTER_NODE" ? targetId : null, objectAssignments: (source.objectAssignments ?? []).map(assignment => ({ ...clone(assignment), objectId: objectMap.get(assignment.objectId) ?? assignment.objectId })) };
    }).filter(connection => (connection.sourceType === "CHAPTER_NODE" ? connection.sourceNodeId : connection.sourceElementId) && (connection.targetType === "CHAPTER_NODE" ? connection.targetNodeId : connection.targetElementId)));
  }

  #startSceneDrag(event) {
    if (this.readOnly || !this.canEdit || this.detailsDirty) return;
    if (event.button !== 0 || this.connectionSourceId || this.connectionTargetId || event.ctrlKey || event.metaKey || event.target?.closest?.("[data-scene-resize]")) return;
    event.preventDefault();
    const element = this.board.elements.find(candidate => candidate.id === event.currentTarget.dataset.elementId);
    if (!element) return;
    this.selectedElementIds = [element.id];
    const svg = this.element.querySelector("[data-storyboard-canvas]");
    const point = this.#svgPoint(svg, event);
    this.history.capture(this.board);
    this.drag = { element, startX: point.x, startY: point.y, original: clone(element.position), board: this.board, ownerWindow: this.#windowForEvent(event) };
    this.drag.move = moveEvent => this.#dragMove(moveEvent);
    this.drag.end = endEvent => this.#finishDrag(endEvent);
    this.drag.ownerWindow.addEventListener("pointermove", this.drag.move);
    this.drag.ownerWindow.addEventListener("pointerup", this.drag.end, { once: true });
    this.drag.ownerWindow.addEventListener("pointercancel", this.drag.end, { once: true });
  }

  #startChapterNodeDrag(event) {
    if (this.readOnly || !this.canEdit || this.detailsDirty) return;
    if (event.button !== 0 || this.connectionSourceId || this.connectionTargetId || this.connectionDrag || this.resize) return;
    const nodeId = event.currentTarget?.dataset.nodeId;
    const node = this.board.chapters.flatMap(chapter => chapter.nodes ?? []).find(candidate => candidate.id === nodeId);
    const svg = this.element.querySelector("[data-storyboard-canvas]");
    if (!node || !svg) return;
    event.preventDefault();
    event.stopPropagation();
    const point = this.#svgPoint(svg, event);
    this.history.capture(this.board);
    this.chapterNodeDrag = { node, startX: point.x, startY: point.y, original: clone(node.position), target: event.currentTarget, moved: false, ownerWindow: this.#windowForEvent(event) };
    this.chapterNodeDrag.move = moveEvent => this.#chapterNodeDragMove(moveEvent);
    this.chapterNodeDrag.end = () => this.#finishChapterNodeDrag();
    event.currentTarget.classList.add("is-dragging");
    this.chapterNodeDrag.ownerWindow.addEventListener("pointermove", this.chapterNodeDrag.move);
    this.chapterNodeDrag.ownerWindow.addEventListener("pointerup", this.chapterNodeDrag.end, { once: true });
    this.chapterNodeDrag.ownerWindow.addEventListener("pointercancel", this.chapterNodeDrag.end, { once: true });
  }

  #chapterNodeDragMove(event) {
    if (!this.chapterNodeDrag) return;
    this.chapterNodeDrag.pendingEvent = event;
    if (!this.chapterNodeDrag.frame) this.chapterNodeDrag.frame = this.chapterNodeDrag.ownerWindow?.requestAnimationFrame?.(() => this.#applyChapterNodeDragFrame());
  }

  #applyChapterNodeDragFrame() {
    if (!this.chapterNodeDrag?.pendingEvent) return;
    const point = this.#svgPoint(this.element.querySelector("[data-storyboard-canvas]"), this.chapterNodeDrag.pendingEvent);
    const { node, original, startX, startY } = this.chapterNodeDrag;
    if (Math.hypot(point.x - startX, point.y - startY) > 2) this.chapterNodeDrag.moved = true;
    node.position = { x: Math.max(18, original.x + point.x - startX), y: Math.max(18, original.y + point.y - startY) };
    this.chapterNodeDrag.target?.setAttribute("transform", `translate(${node.position.x} ${node.position.y})`);
    this.#updateConnectionGeometry(node.id);
    this.chapterNodeDrag.pendingEvent = null;
    this.chapterNodeDrag.frame = null;
  }

  async #finishChapterNodeDrag() {
    if (!this.chapterNodeDrag) return;
    const drag = this.chapterNodeDrag;
    const dragWindow = drag.ownerWindow ?? this.#getWindow();
    if (drag.frame) dragWindow?.cancelAnimationFrame?.(drag.frame);
    this.#applyChapterNodeDragFrame();
    dragWindow?.removeEventListener("pointermove", drag.move);
    dragWindow?.removeEventListener("pointerup", drag.end);
    dragWindow?.removeEventListener("pointercancel", drag.end);
    drag.target?.classList.remove("is-dragging");
    this.chapterNodeDrag = null;
    if (!drag.moved) return;
    if (this.readOnly || !this.canEdit) {
      this.board = this.store.read();
      await this.render({ force: true });
      return;
    }
    this.board = await this.store.save(this.board);
    this.selectedElementIds = [];
    await this.render({ force: true });
  }

  #startResize(event) {
    if (this.readOnly || !this.canEdit || this.detailsDirty) return;
    if (event.button !== 0 || this.connectionSourceId || this.connectionTargetId) return;
    event.preventDefault();
    event.stopPropagation();
    const elementId = event.currentTarget.dataset.elementId;
    const element = this.board.elements.find(candidate => candidate.id === elementId);
    if (!element) return;
    this.selectedElementIds = [element.id];
    const point = this.#svgPoint(this.element.querySelector("[data-storyboard-canvas]"), event);
    this.history.capture(this.board);
    this.resize = {
      element,
      startX: point.x,
      startY: point.y,
      original: clone(element.size),
      ownerWindow: this.#windowForEvent(event)
    };
    this.resize.move = moveEvent => this.#resizeMove(moveEvent);
    this.resize.end = () => this.#finishResize();
    this.resize.ownerWindow.addEventListener("pointermove", this.resize.move);
    this.resize.ownerWindow.addEventListener("pointerup", this.resize.end, { once: true });
    this.resize.ownerWindow.addEventListener("pointercancel", this.resize.end, { once: true });
  }

  #resizeMove(event) {
    if (!this.resize) return;
    this.resize.pendingEvent = event;
    if (!this.resize.frame) this.resize.frame = this.resize.ownerWindow?.requestAnimationFrame?.(() => this.#applyResizeFrame());
  }

  #applyResizeFrame() {
    if (!this.resize?.pendingEvent) return;
    const point = this.#svgPoint(this.element.querySelector("[data-storyboard-canvas]"), this.resize.pendingEvent);
    this.resize.element.size = {
      width: Math.max(SCENE_ELEMENT_MIN_WIDTH, this.resize.original.width + point.x - this.resize.startX),
      height: Math.max(72, this.resize.original.height + point.y - this.resize.startY)
    };
    this.resize.element.visualConfig = { ...(this.resize.element.visualConfig ?? {}), sizeLocked: true };
    this.#updateSceneElementDom(this.resize.element);
    this.#updateConnectionGeometry(this.resize.element.id);
    this.resize.pendingEvent = null;
    this.resize.frame = null;
  }

  #updateSceneElementDom(element) {
    const node = this.element.querySelector(`[data-element-id="${element.id}"]`);
    if (!node) return;
    const scene = this.board.scenes.find(candidate => candidate.id === element.sceneId);
    const presentation = sceneElementPresentation(element, scene, {
      fallbackTitle: localize("MEL_STORYBOARD.ELEMENT_TYPES.SCENE"),
      statusLabel: scene ? localize(`MEL_STORYBOARD.STATUS.${scene.status}`) : "",
      playerCharacterCount: this.#playerCharacterObjects(scene).length,
      iconPath: this.showSceneIconsEnabled ? this.#sceneIconPath(scene?.iconType) : "",
      iconColorClass: sceneIconColorClass(this.statusColorsEnabled, scene?.status),
      compact: this.compactScenes
    });
    for (const className of [...node.classList]) {
      if (className.startsWith("status-")) node.classList.remove(className);
    }
    if (this.statusColorsEnabled) node.classList.add(`status-${STATUS_COLOR_CLASSES[scene?.status] ?? STATUS_COLOR_CLASSES.OFFEN}`);
    element.size = presentation.size;
    node.setAttribute("aria-label", presentation.title);
    const namespace = "http://www.w3.org/2000/svg";
    const create = (tag, attributes = {}, text = null) => {
      const child = this.#getDocument().createElementNS(namespace, tag);
      for (const [name, value] of Object.entries(attributes)) child.setAttribute(name, String(value));
      if (text !== null) child.textContent = text;
      return child;
    };
    const frame = sceneShapeFrame(presentation.sceneShape, presentation.size.width, presentation.size.height, { compact: presentation.isCompact });
    const frameChildren = frame.kind === "diamond"
      ? [create("path", { class: "mel-storyboard-element-frame", d: frame.path })]
      : frame.kind === "decision-rect"
      ? [
        create("rect", { class: "mel-storyboard-element-frame", width: presentation.size.width, height: presentation.size.height, rx: frame.radius }),
        create("path", { class: "mel-storyboard-element-decision-marker", d: frame.markerPath })
      ]
      : frame.kind === "path"
      ? [create("path", { class: "mel-storyboard-element-frame", d: frame.path })]
      : frame.kind === "double-rect"
        ? [
          create("rect", { class: "mel-storyboard-element-frame", width: presentation.size.width, height: presentation.size.height, rx: frame.radius }),
          create("rect", { class: "mel-storyboard-element-frame-inner", x: frame.inner.x, y: frame.inner.y, width: frame.inner.width, height: frame.inner.height, rx: frame.inner.radius })
        ]
        : [create("rect", { class: "mel-storyboard-element-frame", width: presentation.size.width, height: presentation.size.height, rx: frame.radius })];
    const title = create("text", { class: "mel-storyboard-element-title", x: presentation.textX, y: presentation.titleY, "text-anchor": presentation.textAnchor });
    for (const [index, line] of presentation.titleLines.entries()) title.append(create("tspan", { x: presentation.textX, dy: index ? 18 : 0 }, line));
    const children = [...frameChildren, title];
    if (presentation.descriptionLines.length) {
      const description = create("text", { class: "mel-storyboard-element-description", x: presentation.textX, y: presentation.descriptionY, "text-anchor": presentation.textAnchor });
      for (const [index, line] of presentation.descriptionLines.entries()) description.append(create("tspan", { x: presentation.textX, dy: index ? presentation.descriptionLineHeight : 0 }, line));
      children.push(description);
    }
    if (presentation.iconPath) children.push(create("image", { class: `mel-storyboard-scene-icon ${presentation.iconColorClass}`, href: presentation.iconPath, x: presentation.iconX, y: presentation.iconY, width: presentation.iconSize, height: presentation.iconSize, preserveAspectRatio: "xMidYMid meet", "aria-hidden": "true" }));
    children.push(
      create("text", { class: "mel-storyboard-element-id", x: presentation.displayIdX, y: presentation.displayIdY, "text-anchor": presentation.displayIdAnchor }, presentation.displayId),
      create("rect", { class: "mel-storyboard-element-status-badge", x: presentation.statusBadgeX, y: presentation.statusBadgeY, width: presentation.statusBadgeWidth, height: 18, rx: 9 }),
      create("text", { class: "mel-storyboard-element-status", x: presentation.statusTextX, y: presentation.statusY }, presentation.statusLabel),
      create("rect", { class: "mel-storyboard-element-resize-handle", "data-scene-resize": "", "data-element-id": element.id, x: presentation.resizeHandleX, y: presentation.resizeHandleY, width: 10, height: 10, rx: 2, "aria-label": "Resize scene" })
    );
    for (const [index, object] of this.#playerCharacterObjects(scene).entries()) {
      const token = create("g", {
        class: "mel-storyboard-player-token",
        "data-player-character-token": "",
        "data-object-id": object.id,
        "data-scene-element-id": element.id,
        transform: `translate(${presentation.playerCharacterTokenStartX + index * (presentation.playerCharacterTokenSize + 4)} ${presentation.playerCharacterTokenY})`,
        tabindex: "0",
        role: "button",
        "aria-label": object.title
      });
      token.append(
        create("title", {}, object.title),
        create("rect", { class: "mel-storyboard-player-token-frame", width: presentation.playerCharacterTokenSize, height: presentation.playerCharacterTokenSize, rx: 3 }),
        create("image", { href: object.visualConfig?.image || "icons/svg/mystery-man.svg", width: presentation.playerCharacterTokenSize, height: presentation.playerCharacterTokenSize, preserveAspectRatio: "xMidYMid slice" }),
        create("text", { class: "mel-storyboard-player-token-label", x: presentation.playerCharacterTokenSize / 2, y: presentation.playerCharacterTokenSize + 13, "text-anchor": "middle" }, object.title)
      );
      children.push(token);
    }
    node.replaceChildren(...children);
    this.#bindPlayerCharacterTokens();
  }

  #playerCharacterObjects(scene) {
    const objectsById = new Map((this.board.objects ?? []).map(object => [object.id, object]));
    return (scene?.objectAssignments ?? [])
      .map(assignment => objectsById.get(assignment.objectId))
      .filter(object => object?.objectType === "PLAYER_CHARACTER");
  }

  #svgPoint(svg, event) {
    const rect = svg.getBoundingClientRect();
    const viewBox = svg.viewBox.baseVal;
    return { x: (event.clientX - rect.left) * viewBox.width / rect.width, y: (event.clientY - rect.top) * viewBox.height / rect.height };
  }

  #dragMove(event) {
    if (!this.drag) return;
    this.drag.pendingEvent = event;
    if (!this.drag.frame) this.drag.frame = this.drag.ownerWindow?.requestAnimationFrame?.(() => this.#applyDragFrame());
  }

  #applyDragFrame() {
    if (!this.drag?.pendingEvent) return;
    const point = this.#svgPoint(this.element.querySelector("[data-storyboard-canvas]"), this.drag.pendingEvent);
    this.drag.element.position = { x: Math.max(0, this.drag.original.x + point.x - this.drag.startX), y: Math.max(0, this.drag.original.y + point.y - this.drag.startY) };
    this.element.querySelector(`[data-element-id="${this.drag.element.id}"]`)?.setAttribute("transform", `translate(${this.drag.element.position.x} ${this.drag.element.position.y})`);
    this.#updateConnectionGeometry(this.drag.element.id);
    this.drag.pendingEvent = null;
    this.drag.frame = null;
  }

  #updateConnectionGeometry(movedElementId) {
    for (const connection of this.board.connections) {
      const sourceType = connection.sourceType ?? (connection.sourceNodeId ? "CHAPTER_NODE" : "SCENE");
      const targetType = connection.targetType ?? (connection.targetNodeId ? "CHAPTER_NODE" : "SCENE");
      const sourceId = sourceType === "CHAPTER_NODE" ? connection.sourceNodeId : connection.sourceElementId;
      const targetId = targetType === "CHAPTER_NODE" ? connection.targetNodeId : connection.targetElementId;
      if (sourceId !== movedElementId && targetId !== movedElementId) continue;
      const source = this.#connectionGeometryEndpoint(sourceId, sourceType);
      const target = this.#connectionGeometryEndpoint(targetId, targetType);
      if (!source || !target) continue;
      const geometry = connectionGeometry(source, target, { bilateral: normalizeConnectionType(connection.connectionType).startsWith("bilateral") });
      for (const node of this.element.querySelectorAll(`[data-connection-id="${connection.id}"]`)) {
        if (node.classList.contains("mel-storyboard-connection")) {
          node.setAttribute("x1", geometry.source.x);
          node.setAttribute("y1", geometry.source.y);
          node.setAttribute("x2", geometry.target.x);
          node.setAttribute("y2", geometry.target.y);
        } else if (node.classList.contains("mel-storyboard-connection-arrow-reverse")) node.setAttribute("points", geometry.reverseArrowPoints ?? "");
        else if (node.classList.contains("mel-storyboard-connection-arrow")) node.setAttribute("points", geometry.arrowPoints);
        else if (node.classList.contains("mel-storyboard-connection-label")) {
          node.setAttribute("x", geometry.label.x);
          node.setAttribute("y", geometry.label.y);
        }
      }
    }
  }

  #connectionGeometryEndpoint(id, type) {
    if (type === "CHAPTER_NODE") {
      const node = this.board.chapters.flatMap(chapter => chapter.nodes ?? []).find(candidate => candidate.id === id);
      return node ? { position: { x: node.position.x - 18, y: node.position.y - 18 }, size: { width: 36, height: 36 } } : null;
    }
    const element = this.board.elements.find(candidate => candidate.id === id);
    if (!element) return null;
    const scene = this.board.scenes.find(candidate => candidate.id === element.sceneId);
    return {
      ...element,
      isCompactDecisionShape: Boolean(this.compactScenes && scene?.sceneShape === SCENE_SHAPES.DECISION)
    };
  }

  async #finishDrag() {
    if (!this.drag) return;
    const { move, end, element } = this.drag;
    const dragWindow = this.drag.ownerWindow ?? this.#getWindow();
    if (this.drag.frame) dragWindow?.cancelAnimationFrame?.(this.drag.frame);
    this.#applyDragFrame();
    dragWindow?.removeEventListener("pointermove", move);
    dragWindow?.removeEventListener("pointerup", end);
    dragWindow?.removeEventListener("pointercancel", end);
    this.drag = null;
    if (this.readOnly || !this.canEdit) {
      this.board = this.store.read();
      await this.render({ force: true });
      return;
    }
    this.board = await this.store.save(this.board);
    this.selectedElementIds = [element.id];
    await this.render({ force: true });
  }

  async #finishResize() {
    if (!this.resize) return;
    const { move, end, element } = this.resize;
    const resizeWindow = this.resize.ownerWindow ?? this.#getWindow();
    if (this.resize.frame) resizeWindow?.cancelAnimationFrame?.(this.resize.frame);
    this.#applyResizeFrame();
    resizeWindow?.removeEventListener("pointermove", move);
    resizeWindow?.removeEventListener("pointerup", end);
    resizeWindow?.removeEventListener("pointercancel", end);
    this.resize = null;
    if (this.readOnly || !this.canEdit) {
      this.board = this.store.read();
      await this.render({ force: true });
      return;
    }
    this.board = await this.store.save(this.board);
    this.selectedElementIds = [element.id];
    await this.render({ force: true });
  }
}
