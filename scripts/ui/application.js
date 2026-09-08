import { MODULE_ID, STATUS } from "../domain/constants.js";
import { assignObjectToConnection, assignObjectToScene, clone, createBoardObject, createConnection, createScene, createSceneElement, duplicateSceneElements, copySceneElements, moveObjectAssignment, normalizeConnectionType, pasteSceneElements, removeObjectAssignment, removeObjectFromConnection, removeSceneElements, removeConnection, updateConnection, updateObjectAssignment } from "../domain/model.js";
import { downloadSceneBoardJson, downloadSceneBoardPng, downloadSceneBoardSvg, printSceneBoardAsPdf, sceneBoardFromJson } from "../domain/export.js";
import { connectionGeometry } from "../domain/geometry.js";
import { HistoryStack } from "../domain/history.js";
import { SCENE_ELEMENT_MIN_WIDTH, normalizeSceneElementSize, sceneElementPresentation } from "../domain/scene-card.js";
import { ObjectDetailsApplication } from "./object-details.js";
import { SceneDetailsApplication } from "./scene-details.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

function localize(key) {
  return game.i18n?.localize(key) ?? key;
}

function notifyError(error) {
  console.error(`[${MODULE_ID}]`, error);
  ui.notifications.error(error.message ?? String(error));
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
  try {
    const document = await fromUuid(uuid);
    if (document) return document;
  } catch {
    // Fall back to the world collection below. Some player-owned Actors can
    // be resolved from the collection even when UUID resolution is delayed.
  }
  const [documentName, id] = String(uuid).split(".");
  if (documentName === "Actor" && id) return game.actors?.get(id) ?? globalThis.fromUuidSync?.(uuid) ?? null;
  return globalThis.fromUuidSync?.(uuid) ?? null;
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
  PLAYLIST: "fa-music"
});

function buildSceneTree(scenes) {
  const childrenByParent = new Map();
  for (const scene of scenes) {
    const parentId = scene.parentId ?? null;
    const children = childrenByParent.get(parentId) ?? [];
    children.push(scene);
    childrenByParent.set(parentId, children);
  }
  const tree = [];
  const visit = (parentId, depth) => {
    for (const scene of childrenByParent.get(parentId) ?? []) {
      const children = childrenByParent.get(scene.id) ?? [];
      tree.push({ ...scene, treeDepth: depth, treeLevel: depth + 2, hasChildren: children.length > 0, statusLabel: localize(`MEL_STORYBOARD.STATUS.${scene.status}`) });
      visit(scene.id, depth + 1);
    }
  };
  visit(null, 0);
  for (const scene of scenes) {
    if (!tree.some(item => item.id === scene.id)) tree.push({ ...scene, treeDepth: 0, treeLevel: 2, hasChildren: false, statusLabel: localize(`MEL_STORYBOARD.STATUS.${scene.status}`) });
  }
  return tree;
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
    return false;
  }

  constructor(options = {}) {
    super(options);
    this.store = game.melStoryboard.store;
    this.board = this.store.read();
    this.selectedElementIds = [];
    this.history = new HistoryStack();
    this.drag = null;
    this.connectionDrag = null;
    this.playerCharacterDrag = null;
    this.resize = null;
    this.canvasPan = null;
    this.suppressCanvasClick = false;
    this.clipboard = null;
    this.zoom = 1;
    this.connectionSourceId = null;
    this.selectedConnectionId = null;
    this.connectionDescriptionEditor = null;
    this.connectionDescriptionEditorShell = null;
    this.connectionDescriptionEditorGeneration = 0;
    this.contextMenuElement = null;
    this.contextMenuHost = null;
    this.contextMenuHandler = null;
    this.contextMenuOutsideHandler = null;
    this.contextMenuKeyHandler = null;
    this.sidebarCollapsed = true;
    this.inspectorCollapsed = true;
  }

  async _prepareContext() {
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
    const elements = this.board.elements.map(element => {
      const scene = scenesById.get(element.sceneId);
      const playerCharacters = (scene?.objectAssignments ?? [])
        .map(assignment => objectsById.get(assignment.objectId))
        .filter(object => object?.objectType === "PLAYER_CHARACTER")
        .map(object => ({ ...object, image: object.image || "icons/svg/mystery-man.svg" }));
      const presentation = normalizeSceneElementSize(element, scene, {
        fallbackTitle: localize("MEL_STORYBOARD.ELEMENT_TYPES.SCENE"),
        statusLabel: scene ? localize(`MEL_STORYBOARD.STATUS.${scene.status}`) : "",
        playerCharacterCount: playerCharacters.length
      });
      // Keep legacy elements usable with the new multi-line layout. The
      // normalized dimensions are persisted with the next board save.
      element.size = presentation.size;
      return {
        ...element,
        ...presentation,
        playerCharacterTokens: playerCharacters.map((object, index) => ({
          ...object,
          objectId: object.id,
          tokenX: 10 + index * (presentation.playerCharacterTokenSize + 4),
          tokenY: presentation.playerCharacterTokenY,
          tokenSize: presentation.playerCharacterTokenSize,
          tokenLabelX: presentation.playerCharacterTokenSize / 2,
          tokenLabelY: presentation.playerCharacterTokenSize + 13
        })),
        isSelected: this.selectedElementIds.includes(element.id)
      };
    });
    const byId = new Map(elements.map(element => [element.id, element]));
    const connections = this.board.connections.map(connection => {
      const sourceElement = byId.get(connection.sourceElementId);
      const targetElement = byId.get(connection.targetElementId);
      const connectionType = normalizeConnectionType(connection.connectionType);
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
        isBilateral: bilateral,
        isDeactivated: connectionType.endsWith("deactivated"),
        isSelected: this.selectedConnectionId === connection.id,
        label: connection.label?.trim() ?? "",
        hasLabel: Boolean(connection.label?.trim())
      };
    });
    const selectedElement = this.board.elements.find(element => this.selectedElementIds.includes(element.id));
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
      statusLabel: localize(`MEL_STORYBOARD.STATUS.${selectedSceneRecord.status}`),
      incomingCount: this.board.connections.filter(connection => connection.targetElementId === selectedElement.id).length,
      outgoingCount: this.board.connections.filter(connection => connection.sourceElementId === selectedElement.id).length
    } : null;
    const selectedConnectionRecord = this.board.connections.find(connection => connection.id === this.selectedConnectionId);
    const selectedConnection = selectedConnectionRecord ? {
      ...selectedConnectionRecord,
      connectionType: normalizeConnectionType(selectedConnectionRecord.connectionType),
      sourceTitle: scenesById.get(this.board.elements.find(element => element.id === selectedConnectionRecord.sourceElementId)?.sceneId)?.title ?? "",
      targetTitle: scenesById.get(this.board.elements.find(element => element.id === selectedConnectionRecord.targetElementId)?.sceneId)?.title ?? ""
    } : null;
    const connectionTypeOptions = selectedConnection ? [
      { value: "unilateral", label: localize("MEL_STORYBOARD.CONNECTION_TYPES.UNILATERAL"), selected: selectedConnection.connectionType === "unilateral" },
      { value: "unilateral deactivated", label: localize("MEL_STORYBOARD.CONNECTION_TYPES.UNILATERAL_DEACTIVATED"), selected: selectedConnection.connectionType === "unilateral deactivated" },
      { value: "bilateral", label: localize("MEL_STORYBOARD.CONNECTION_TYPES.BILATERAL"), selected: selectedConnection.connectionType === "bilateral" },
      { value: "bilateral deactivated", label: localize("MEL_STORYBOARD.CONNECTION_TYPES.BILATERAL_DEACTIVATED"), selected: selectedConnection.connectionType === "bilateral deactivated" }
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
    const statuses = Object.values(STATUS).map(value => ({ value, label: localize(`MEL_STORYBOARD.STATUS.${value}`), selected: selectedScene?.status === value }));
    const sceneTree = buildSceneTree(this.board.scenes);
    const maxX = Math.max(1200, ...elements.map(element => element.position.x + element.size.width + 80));
    const maxY = Math.max(800, ...elements.map(element => element.position.y + element.size.height + 80));
    return {
      board: { ...this.board, elements, connections, objects },
      sceneTree,
      selectedElement,
      selectedScene,
      selectedConnection,
      connectionTypeOptions,
      selectedConnectionObjects,
      sidebarCollapsed: this.sidebarCollapsed,
      inspectorCollapsed: this.inspectorCollapsed,
      canConnect: this.selectedElementIds.length === 2,
      hasScenes: this.board.scenes.length > 0,
      objects,
      selectedObjects,
      statuses,
      canvas: { width: maxX, height: maxY },
      canUndo: this.history.canUndo,
      canRedo: this.history.canRedo,
      connectionStatus: this.connectionSourceId ? localize("MEL_STORYBOARD.NOTIFICATIONS.SelectConnectionTarget") : "",
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
        newScene: localize("MEL_STORYBOARD.ACTIONS.NewScene"),
        collapseSidebar: localize("MEL_STORYBOARD.ACTIONS.CollapseSidebar"),
        expandSidebar: localize("MEL_STORYBOARD.ACTIONS.ExpandSidebar"),
        collapseInspector: localize("MEL_STORYBOARD.ACTIONS.CollapseInspector"),
        expandInspector: localize("MEL_STORYBOARD.ACTIONS.ExpandInspector"),
        story: localize("MEL_STORYBOARD.LABELS.Story"),
        scenes: localize("MEL_STORYBOARD.LABELS.Scenes"),
        noScenes: localize("MEL_STORYBOARD.EMPTY.NoScenes"),
        sceneCanvas: localize("MEL_STORYBOARD.ACCESSIBILITY.SceneCanvas"),
        inspector: localize("MEL_STORYBOARD.ACCESSIBILITY.Inspector"),
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
        connectionDescription: localize("MEL_STORYBOARD.LABELS.ConnectionDescription"),
        connectionTypes: {
          unilateral: localize("MEL_STORYBOARD.CONNECTION_TYPES.UNILATERAL"),
          unilateralDeactivated: localize("MEL_STORYBOARD.CONNECTION_TYPES.UNILATERAL_DEACTIVATED"),
          bilateral: localize("MEL_STORYBOARD.CONNECTION_TYPES.BILATERAL"),
          bilateralDeactivated: localize("MEL_STORYBOARD.CONNECTION_TYPES.BILATERAL_DEACTIVATED")
        },
        status: localize("MEL_STORYBOARD.LABELS.Status"),
        description: localize("MEL_STORYBOARD.LABELS.Description"),
        save: localize("MEL_STORYBOARD.ACTIONS.Save"),
        connections: localize("MEL_STORYBOARD.LABELS.Connections"),
        incoming: localize("MEL_STORYBOARD.LABELS.Incoming"),
        outgoing: localize("MEL_STORYBOARD.LABELS.Outgoing"),
        selectScene: localize("MEL_STORYBOARD.EMPTY.SelectScene")
      }
    };
  }

  async _onRender(context, options) {
    this.#destroyConnectionDescriptionEditor();
    await super._onRender(context, options);
    this.#closeContextMenu();
    if (this.contextMenuHost !== this.element) {
      this.contextMenuHost?.removeEventListener("contextmenu", this.contextMenuHandler, true);
      this.contextMenuHandler = event => this.#onContextMenu(event);
      this.element.addEventListener("contextmenu", this.contextMenuHandler, true);
      this.contextMenuHost = this.element;
    }
    this.element.tabIndex = 0;
    if (!this.keyboardBound) {
      this.element.addEventListener("keydown", event => this.#onKeyDown(event));
      this.keyboardBound = true;
    }
    this.element.querySelectorAll("[data-action]").forEach(element => element.addEventListener("click", event => this.#handleAction(event)));
    this.#bindFoundryLinks(this.element);
    this.element.querySelectorAll("[data-scene-element]").forEach(element => {
      element.addEventListener("pointerdown", event => this.#startDrag(event));
      element.addEventListener("pointerdown", event => {
        if (event.button === 1) this.#startConnectionDrag(event);
      });
      element.addEventListener("click", async event => {
        event.stopPropagation();
        if (this.connectionSourceId && this.connectionSourceId !== element.dataset.elementId) {
          await this.#connectTo(element.dataset.elementId);
          return;
        }
        this.#selectElement(element.dataset.elementId, event.ctrlKey || event.metaKey);
      });
      element.addEventListener("dblclick", async event => {
        event.preventDefault();
        event.stopPropagation();
        if (!this.connectionSourceId) await this.#showSceneDetails(element.dataset.elementId);
      });
    });
    this.#bindPlayerCharacterTokens();
    this.element.querySelectorAll("[data-connection-id]").forEach(connection => {
      connection.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        this.#selectConnection(connection.dataset.connectionId);
      });
    });
    this.element.querySelectorAll("[data-scene-resize]").forEach(handle => {
      handle.addEventListener("pointerdown", event => this.#startResize(event));
    });
    const canvas = this.element.querySelector("[data-storyboard-canvas]");
    canvas?.addEventListener("pointerdown", event => this.#startCanvasPan(event));
    canvas?.addEventListener("click", event => {
      const isCanvasBackground = event.target === event.currentTarget || event.target?.matches?.("[data-canvas-background]");
      if (this.suppressCanvasClick) {
        this.suppressCanvasClick = false;
        return;
      }
      if (isCanvasBackground && !this.connectionSourceId) {
        this.selectedElementIds = [];
        this.selectedConnectionId = null;
        this.render({ force: true });
      }
    });
    canvas?.addEventListener("wheel", event => this.#onCanvasWheel(event), { passive: false });
    if (foundry.applications.ux?.DragDrop) {
      this.documentDragDrop = new foundry.applications.ux.DragDrop({
        dropSelector: "[data-scene-element], [data-connection-id]",
        permissions: { drop: () => Boolean(game.user?.isGM) },
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
    this.element.querySelectorAll("[data-scene-field]").forEach(field => field.addEventListener("change", event => this.#updateSceneField(event)));
    this.element.querySelector("[data-json-import]")?.addEventListener("change", event => this.#importFile(event));
    if (context.selectedConnection) await this.#activateConnectionDescriptionEditor(context.selectedConnection.description ?? "");
  }

  _onClose(options) {
    this.#closeContextMenu();
    this.#finishCanvasPan();
    this.#finishPlayerCharacterDrag();
    this.#finishConnectionDrag();
    this.#destroyConnectionDescriptionEditor();
    return super._onClose(options);
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

  async #openFoundryDocument(event) {
    event.preventDefault();
    event.stopPropagation();
    const uuid = event.currentTarget?.dataset?.uuid;
    if (!uuid) return;
    const document = await fromUuid(uuid);
    if (!document) {
      ui.notifications.warn(localize("MEL_STORYBOARD.NOTIFICATIONS.FoundryObjectUnavailable"));
      return;
    }
    if (document.documentName === "Scene" && typeof document.view === "function") {
      await document.view();
      return;
    }
    const sheet = document.sheet;
    if (sheet?.render) {
      await sheet.render({ force: true });
      sheet.bringToFront?.();
      return;
    }
    ui.notifications.warn(localize("MEL_STORYBOARD.NOTIFICATIONS.FoundryObjectUnavailable"));
  }

  #selectElement(elementId, additive = false) {
    this.inspectorCollapsed = false;
    this.selectedConnectionId = null;
    this.selectedElementIds = additive
      ? (this.selectedElementIds.includes(elementId) ? this.selectedElementIds.filter(id => id !== elementId) : [...this.selectedElementIds, elementId])
      : [elementId];
    this.render({ force: true });
  }

  #selectConnection(connectionId) {
    if (!this.board.connections.some(connection => connection.id === connectionId)) return;
    this.selectedConnectionId = connectionId;
    this.selectedElementIds = [];
    this.connectionSourceId = null;
    this.inspectorCollapsed = false;
    this.render({ force: true });
  }

  async #activateConnectionDescriptionEditor(description) {
    const editorHost = this.element.querySelector("[data-connection-description-editor]");
    if (!editorHost) return;
    const generation = ++this.connectionDescriptionEditorGeneration;
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
    if (generation !== this.connectionDescriptionEditorGeneration || !editorShell.isConnected || !this.selectedConnectionId) {
      editor.destroy();
      return;
    }
    this.connectionDescriptionEditor = editor;
  }

  #destroyConnectionDescriptionEditor() {
    this.connectionDescriptionEditorGeneration += 1;
    this.connectionDescriptionEditor?.destroy();
    this.connectionDescriptionEditor = null;
    this.connectionDescriptionEditorShell?.remove();
    this.connectionDescriptionEditorShell = null;
  }

  #getConnectionDescriptionValue() {
    const document = this.connectionDescriptionEditor?.view?.state?.doc;
    if (!document) return this.board.connections.find(connection => connection.id === this.selectedConnectionId)?.description ?? "";
    return foundry.prosemirror.dom.serializeString(document.content);
  }

  async #saveConnectionDetails() {
    const connection = this.board.connections.find(candidate => candidate.id === this.selectedConnectionId);
    if (!connection) return;
    const label = this.element.querySelector("[data-connection-field='label']")?.value ?? connection.label ?? "";
    const connectionType = this.element.querySelector("[data-connection-field='connectionType']")?.value ?? connection.connectionType;
    this.history.capture(this.board);
    updateConnection(connection, { label, connectionType, description: this.#getConnectionDescriptionValue() });
    this.board = await this.store.save(this.board);
    this.#destroyConnectionDescriptionEditor();
    await this.render({ force: true });
  }

  #selectedScene() {
    const element = this.board.elements.find(candidate => candidate.id === this.selectedElementIds[0]);
    return this.board.scenes.find(scene => scene.id === element?.sceneId) ?? null;
  }

  #exportLabels() {
    return { title: localize("MEL_STORYBOARD.EXPORT.Scenes"), scene: localize("MEL_STORYBOARD.ELEMENT_TYPES.SCENE"), status: status => localize(`MEL_STORYBOARD.STATUS.${status}`) };
  }

  #onContextMenu(event) {
    const target = event.target instanceof Element ? event.target : null;
    const path = event.composedPath?.() ?? [];
    const findTarget = selector => path.find(candidate => candidate instanceof Element && candidate.matches(selector)) ?? target?.closest(selector);
    const connectionTarget = findTarget("[data-connection-id]");
    const sceneTarget = findTarget("[data-scene-element]");
    const canvasTarget = findTarget("[data-storyboard-canvas]");
    if (!connectionTarget && !sceneTarget && !canvasTarget) return;
    event.preventDefault();
    event.stopPropagation();
    this.#openContextMenu(event, {
      connectionId: connectionTarget?.dataset.connectionId ?? null,
      elementId: sceneTarget?.dataset.elementId ?? null
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
    if (event.button !== 0 || !isCanvasBackground || this.connectionSourceId) return;
    const scroll = this.element.querySelector(".mel-storyboard-canvas-scroll");
    if (!scroll) return;
    event.preventDefault();
    this.canvasPan = {
      scroll,
      startX: event.clientX,
      startY: event.clientY,
      startScrollLeft: scroll.scrollLeft,
      startScrollTop: scroll.scrollTop,
      moved: false
    };
    this.canvasPan.move = moveEvent => this.#canvasPanMove(moveEvent);
    this.canvasPan.end = () => this.#finishCanvasPan();
    scroll.classList.add("is-panning");
    window.addEventListener("pointermove", this.canvasPan.move);
    window.addEventListener("pointerup", this.canvasPan.end, { once: true });
    window.addEventListener("pointercancel", this.canvasPan.end, { once: true });
  }

  #startConnectionDrag(event) {
    if (event.button !== 1 || this.connectionSourceId || this.connectionDrag) return;
    const sourceElementId = event.currentTarget?.dataset.elementId;
    const source = this.board.elements.find(element => element.id === sourceElementId);
    const svg = this.element.querySelector("[data-storyboard-canvas]");
    if (!source || !svg) return;
    event.preventDefault();
    event.stopPropagation();
    const preview = document.createElementNS("http://www.w3.org/2000/svg", "line");
    preview.classList.add("mel-storyboard-connection-preview");
    preview.setAttribute("x1", source.position.x + source.size.width / 2);
    preview.setAttribute("y1", source.position.y + source.size.height / 2);
    preview.setAttribute("x2", source.position.x + source.size.width / 2);
    preview.setAttribute("y2", source.position.y + source.size.height / 2);
    svg.append(preview);
    this.connectionDrag = { sourceElementId, source, preview, targetElementId: null };
    this.connectionDrag.move = moveEvent => this.#connectionDragMove(moveEvent);
    this.connectionDrag.end = endEvent => this.#finishConnectionDrag(endEvent);
    event.currentTarget.classList.add("is-connection-drag-source");
    window.addEventListener("pointermove", this.connectionDrag.move);
    window.addEventListener("pointerup", this.connectionDrag.end, { once: true });
    window.addEventListener("pointercancel", this.connectionDrag.end, { once: true });
  }

  #connectionDragMove(event) {
    if (!this.connectionDrag) return;
    const svg = this.element.querySelector("[data-storyboard-canvas]");
    if (!svg) return;
    const point = this.#svgPoint(svg, event);
    this.connectionDrag.preview.setAttribute("x2", point.x);
    this.connectionDrag.preview.setAttribute("y2", point.y);
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest?.("[data-scene-element]");
    const targetElementId = target?.dataset.elementId && target.dataset.elementId !== this.connectionDrag.sourceElementId
      ? target.dataset.elementId
      : null;
    this.connectionDrag.targetElementId = targetElementId;
    this.element.querySelectorAll("[data-scene-element]").forEach(element => {
      element.classList.toggle("is-connection-drop-target", element.dataset.elementId === targetElementId);
    });
  }

  async #finishConnectionDrag(event = null) {
    const drag = this.connectionDrag;
    if (!drag) return;
    window.removeEventListener("pointermove", drag.move);
    window.removeEventListener("pointerup", drag.end);
    window.removeEventListener("pointercancel", drag.end);
    drag.preview?.remove();
    this.element.querySelectorAll(".is-connection-drag-source, .is-connection-drop-target").forEach(element => {
      element.classList.remove("is-connection-drag-source", "is-connection-drop-target");
    });
    this.connectionDrag = null;
    const releaseTarget = event && document.elementFromPoint(event.clientX, event.clientY)?.closest?.("[data-scene-element]");
    const releaseTargetId = releaseTarget?.dataset.elementId && releaseTarget.dataset.elementId !== drag.sourceElementId
      ? releaseTarget.dataset.elementId
      : drag.targetElementId;
    if (!releaseTargetId) return;
    try {
      this.history.capture(this.board);
      const connection = createConnection(this.board, drag.sourceElementId, releaseTargetId);
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
    if (!this.canvasPan.frame) this.canvasPan.frame = requestAnimationFrame(() => this.#applyCanvasPanFrame());
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
    if (frame) cancelAnimationFrame(frame);
    this.#applyCanvasPanFrame();
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
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

  #openContextMenu(event, { connectionId = null, elementId = null } = {}) {
    this.#closeContextMenu();
    const sceneMenu = Boolean(elementId);
    const connectionMenu = Boolean(connectionId);
    const menu = document.createElement("menu");
    menu.className = "mel-storyboard-context-menu";
    menu.setAttribute("role", "menu");
    const entries = connectionMenu ? [
      { label: localize("MEL_STORYBOARD.ACTIONS.DeleteConnection"), icon: "×", action: () => this.#deleteConnection(connectionId) }
    ] : sceneMenu ? [
      { label: localize("MEL_STORYBOARD.ACTIONS.ConnectScene"), icon: "→", action: async () => { this.selectedElementIds = [elementId]; this.connectionSourceId = elementId; ui.notifications.info(localize("MEL_STORYBOARD.NOTIFICATIONS.SelectConnectionTarget")); await this.render({ force: true }); } },
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
        try { await entry.action(); } catch (error) { notifyError(error); }
      });
      menu.append(item);
    }
    menu.addEventListener("contextmenu", menuEvent => menuEvent.preventDefault());
    document.body.append(menu);
    const left = Math.min(event.clientX, window.innerWidth - menu.offsetWidth - 8);
    const top = Math.min(event.clientY, window.innerHeight - menu.offsetHeight - 8);
    menu.style.left = `${Math.max(8, left)}px`;
    menu.style.top = `${Math.max(8, top)}px`;
    this.contextMenuElement = menu;
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

  #closeContextMenu() {
    this.contextMenuElement?.remove();
    if (this.contextMenuOutsideHandler) document.removeEventListener("pointerdown", this.contextMenuOutsideHandler, true);
    if (this.contextMenuKeyHandler) document.removeEventListener("keydown", this.contextMenuKeyHandler, true);
    this.contextMenuElement = null;
    this.contextMenuOutsideHandler = null;
    this.contextMenuKeyHandler = null;
  }

  async #createScene(event = null) {
    const nextNumber = this.board.scenes.reduce((highest, scene) => {
      const match = /^Scene\s+(\d+)$/i.exec(scene.title?.trim() ?? "");
      return Math.max(highest, match ? Number(match[1]) : 0);
    }, 0) + 1;
    const title = `Scene ${nextNumber}`;
    this.history.capture(this.board);
    const scene = createScene(this.board, { title });
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

  async #connectTo(targetId) {
    if (!this.connectionSourceId || this.connectionSourceId === targetId) return;
    this.history.capture(this.board);
    createConnection(this.board, this.connectionSourceId, targetId);
    this.board = await this.store.save(this.board);
    this.selectedElementIds = [this.connectionSourceId, targetId];
    this.connectionSourceId = null;
    await this.render({ force: true });
  }

  #onKeyDown(event) {
    const tagName = event.target?.tagName?.toLowerCase();
    if (["input", "textarea", "select"].includes(tagName) || event.target?.isContentEditable) return;
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
    if (!this.clipboard) return;
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
      focusNotes,
      onOpenDocument: event => this.#openFoundryDocument(event),
      onSave: async notes => {
        this.history.capture(this.board);
        updateObjectAssignment(owner, assignmentId, { notes });
        this.board = await this.store.save(this.board);
        await this.render({ force: true });
      }
    });
    await details.render({ force: true });
    details.bringToFront();
  }

  async #editObjectNote(assignmentId) {
    await this.#showObjectDetails(assignmentId, { focusNotes: true });
  }

  async #editConnectionObjectNote(assignmentId) {
    await this.#showConnectionObjectDetails(assignmentId, { focusNotes: true });
  }

  async #showSceneDetails(elementId) {
    const element = this.board.elements.find(candidate => candidate.id === elementId);
    const scene = this.board.scenes.find(candidate => candidate.id === element?.sceneId);
    if (!scene) return;
    const details = new SceneDetailsApplication({
      scene: {
        title: scene.title
      },
      assignmentNotes: scene.notes ?? "",
      onSave: async notes => {
        this.history.capture(this.board);
        scene.notes = notes;
        scene.updatedAt = new Date().toISOString();
        this.board = await this.store.save(this.board);
        await this.render({ force: true });
      }
    });
    await details.render({ force: true });
    details.bringToFront();
    await new Promise(resolve => globalThis.requestAnimationFrame?.(resolve) ?? resolve());
    details.bringToFront();
  }

  #startPlayerCharacterDrag(event) {
    if (event.button !== 0 || this.connectionSourceId) return;
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
      token
    };
    this.playerCharacterDrag.move = moveEvent => this.#playerCharacterDragMove(moveEvent);
    this.playerCharacterDrag.end = endEvent => this.#finishPlayerCharacterDrag(endEvent);
    token.classList.add("is-dragging");
    window.addEventListener("pointermove", this.playerCharacterDrag.move);
    window.addEventListener("pointerup", this.playerCharacterDrag.end, { once: true });
    window.addEventListener("pointercancel", this.playerCharacterDrag.end, { once: true });
  }

  #playerCharacterDragMove(event) {
    if (!this.playerCharacterDrag) return;
    const drag = this.playerCharacterDrag;
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 4) return;
    drag.moved = true;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest?.("[data-scene-element]");
    const targetId = target?.dataset.elementId ?? null;
    drag.dropTargetId = targetId && targetId !== drag.sourceElementId ? targetId : null;
    this.element.querySelectorAll("[data-scene-element]").forEach(element => {
      element.classList.toggle("is-player-character-drop-target", element.dataset.elementId === drag.dropTargetId);
    });
  }

  async #finishPlayerCharacterDrag() {
    const drag = this.playerCharacterDrag;
    if (!drag) return;
    window.removeEventListener("pointermove", drag.move);
    window.removeEventListener("pointerup", drag.end);
    window.removeEventListener("pointercancel", drag.end);
    drag.token?.classList.remove("is-dragging");
    this.element.querySelectorAll(".is-player-character-drop-target").forEach(element => element.classList.remove("is-player-character-drop-target"));
    this.playerCharacterDrag = null;
    if (!drag.moved || !drag.dropTargetId) return;
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
    const raw = event.dataTransfer?.getData("text/plain") || event.dataTransfer?.getData("text");
    if (!raw) return;
    let data;
    try { data = JSON.parse(raw); } catch { return; }
    const supportedTypes = new Set(["Actor", "Item", "JournalEntry", "JournalEntryPage", "Scene", "RollTable", "Macro", "Playlist"]);
    if (!data?.uuid) return;
    const target = event.target instanceof Element ? event.target.closest("[data-scene-element], [data-connection-id]") : null;
    const element = this.board.elements.find(candidate => candidate.id === target?.dataset.elementId);
    const scene = this.board.scenes.find(candidate => candidate.id === element?.sceneId);
    const connection = this.board.connections.find(candidate => candidate.id === target?.dataset.connectionId);
    if (!scene && !connection) return;
    const document = await fromUuid(data.uuid);
    if (!document) throw new Error("The dropped Foundry document could not be resolved.");
    const foundryType = data.type ?? document.documentName;
    if (!supportedTypes.has(foundryType)) return;
    const objectType = foundryType === "Actor"
      ? (document.type === "character" ? "PLAYER_CHARACTER" : "NPC")
      : foundryType === "Item" ? "ITEM" : foundryType === "Scene" ? "FOUNDRY_SCENE" : "JOURNAL";
    const extendedObjectType = foundryType === "RollTable"
      ? "ROLLABLE_TABLE"
      : foundryType === "Macro" ? "MACRO" : foundryType === "Playlist" ? "PLAYLIST" : objectType;
    this.history.capture(this.board);
    const existing = this.board.objects.find(object => object.foundryUuid === data.uuid);
    const object = existing ?? createBoardObject(this.board, {
      objectType: extendedObjectType,
      title: document.name ?? data.uuid,
      foundryUuid: data.uuid,
      foundryDocumentType: foundryType,
      image: foundryArtwork(document)
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
    const target = event.target instanceof Element ? event.target.closest("[data-scene-element], [data-connection-id]") : null;
    target?.classList.toggle("is-drop-target", active);
  }

  async #handleAction(event) {
    const action = event.currentTarget.dataset.action;
    try {
      if (action === "add-scene") {
        await this.#createScene();
      } else if (action === "toggle-sidebar") {
        this.sidebarCollapsed = !this.sidebarCollapsed;
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
        this.selectedElementIds = element ? [element.id] : [];
        this.selectedConnectionId = null;
        this.inspectorCollapsed = false;
      } else if (action === "save-scene") {
        this.board = await this.store.save(this.board);
        ui.notifications.info(localize("MEL_STORYBOARD.NOTIFICATIONS.Saved"));
      } else if (action === "export-json") downloadSceneBoardJson(this.board);
      else if (action === "export-svg") downloadSceneBoardSvg(this.board, this.#exportLabels());
      else if (action === "export-png") await downloadSceneBoardPng(this.board, this.#exportLabels());
      else if (action === "export-pdf") printSceneBoardAsPdf(this.board, this.#exportLabels());
      await this.render({ force: true });
    } catch (error) { notifyError(error); }
  }

  async #updateSceneField(event) {
    const scene = this.#selectedScene();
    if (!scene) return;
    this.history.capture(this.board);
    scene[event.currentTarget.dataset.sceneField] = event.currentTarget.value;
    scene.updatedAt = new Date().toISOString();
    this.board = await this.store.save(this.board);
    await this.render({ force: true });
  }

  async #importFile(event) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    try {
      this.board = await this.store.import(sceneBoardFromJson(await file.text()));
      this.selectedElementIds = [];
      this.selectedConnectionId = null;
      this.connectionSourceId = null;
      await this.render({ force: true });
    } catch (error) { notifyError(error); }
    finally { event.currentTarget.value = ""; }
  }

  #startDrag(event) {
    if (event.button !== 0 || this.connectionSourceId || event.ctrlKey || event.metaKey || event.target?.closest?.("[data-scene-resize]")) return;
    event.preventDefault();
    const element = this.board.elements.find(candidate => candidate.id === event.currentTarget.dataset.elementId);
    if (!element) return;
    this.selectedElementIds = [element.id];
    const svg = this.element.querySelector("[data-storyboard-canvas]");
    const point = this.#svgPoint(svg, event);
    this.history.capture(this.board);
    this.drag = { element, startX: point.x, startY: point.y, original: clone(element.position), board: this.board };
    this.drag.move = moveEvent => this.#dragMove(moveEvent);
    this.drag.end = endEvent => this.#finishDrag(endEvent);
    window.addEventListener("pointermove", this.drag.move);
    window.addEventListener("pointerup", this.drag.end, { once: true });
  }

  #startResize(event) {
    if (event.button !== 0 || this.connectionSourceId) return;
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
      original: clone(element.size)
    };
    this.resize.move = moveEvent => this.#resizeMove(moveEvent);
    this.resize.end = () => this.#finishResize();
    window.addEventListener("pointermove", this.resize.move);
    window.addEventListener("pointerup", this.resize.end, { once: true });
  }

  #resizeMove(event) {
    if (!this.resize) return;
    this.resize.pendingEvent = event;
    if (!this.resize.frame) this.resize.frame = requestAnimationFrame(() => this.#applyResizeFrame());
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
      playerCharacterCount: this.#playerCharacterObjects(scene).length
    });
    element.size = presentation.size;
    node.setAttribute("aria-label", presentation.title);
    const namespace = "http://www.w3.org/2000/svg";
    const create = (tag, attributes = {}, text = null) => {
      const child = document.createElementNS(namespace, tag);
      for (const [name, value] of Object.entries(attributes)) child.setAttribute(name, String(value));
      if (text !== null) child.textContent = text;
      return child;
    };
    const title = create("text", { class: "mel-storyboard-element-title", x: 14, y: presentation.titleY });
    for (const [index, line] of presentation.titleLines.entries()) title.append(create("tspan", { x: 14, dy: index ? 18 : 0 }, line));
    const children = [create("rect", { class: "mel-storyboard-element-frame", width: presentation.size.width, height: presentation.size.height, rx: 10 }), title];
    if (presentation.descriptionLines.length) {
      const description = create("text", { class: "mel-storyboard-element-description", x: 14, y: presentation.descriptionY });
      for (const [index, line] of presentation.descriptionLines.entries()) description.append(create("tspan", { x: 14, dy: index ? presentation.descriptionLineHeight : 0 }, line));
      children.push(description);
    }
    children.push(
      create("text", { class: "mel-storyboard-element-id", x: presentation.displayIdX, y: presentation.titleY, "text-anchor": "end" }, presentation.displayId),
      create("rect", { class: "mel-storyboard-element-status-badge", x: 10, y: presentation.statusBadgeY, width: presentation.statusBadgeWidth, height: 18, rx: 9 }),
      create("text", { class: "mel-storyboard-element-status", x: 18, y: presentation.statusY }, presentation.statusLabel),
      create("rect", { class: "mel-storyboard-element-resize-handle", "data-scene-resize": "", "data-element-id": element.id, x: presentation.resizeHandleX, y: presentation.resizeHandleY, width: 10, height: 10, rx: 2, "aria-label": "Resize scene" })
    );
    for (const [index, object] of this.#playerCharacterObjects(scene).entries()) {
      const token = create("g", {
        class: "mel-storyboard-player-token",
        "data-player-character-token": "",
        "data-object-id": object.id,
        "data-scene-element-id": element.id,
        transform: `translate(${10 + index * (presentation.playerCharacterTokenSize + 4)} ${presentation.playerCharacterTokenY})`,
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
    if (!this.drag.frame) this.drag.frame = requestAnimationFrame(() => this.#applyDragFrame());
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
      if (connection.sourceElementId !== movedElementId && connection.targetElementId !== movedElementId) continue;
      const source = this.board.elements.find(element => element.id === connection.sourceElementId);
      const target = this.board.elements.find(element => element.id === connection.targetElementId);
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

  async #finishDrag() {
    if (!this.drag) return;
    const { move, element } = this.drag;
    if (this.drag.frame) cancelAnimationFrame(this.drag.frame);
    this.#applyDragFrame();
    window.removeEventListener("pointermove", move);
    this.drag = null;
    this.board = await this.store.save(this.board);
    this.selectedElementIds = [element.id];
    await this.render({ force: true });
  }

  async #finishResize() {
    if (!this.resize) return;
    const { move, element } = this.resize;
    if (this.resize.frame) cancelAnimationFrame(this.resize.frame);
    this.#applyResizeFrame();
    window.removeEventListener("pointermove", move);
    this.resize = null;
    this.board = await this.store.save(this.board);
    this.selectedElementIds = [element.id];
    await this.render({ force: true });
  }
}
