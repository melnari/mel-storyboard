import { MODULE_ID, STATUS } from "../domain/constants.js";
import { clone, createConnection, createScene, createSceneElement, duplicateSceneElements, copySceneElements, pasteSceneElements, removeSceneElements } from "../domain/model.js";
import { downloadSceneBoardJson, downloadSceneBoardPng, downloadSceneBoardSvg, printSceneBoardAsPdf, sceneBoardFromJson } from "../domain/export.js";
import { HistoryStack } from "../domain/history.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const { ContextMenu } = foundry.applications.ux;

function localize(key) {
  return game.i18n?.localize(key) ?? key;
}

function format(key, data) {
  return game.i18n?.format(key, data) ?? key;
}

function notifyError(error) {
  console.error(`[${MODULE_ID}]`, error);
  ui.notifications.error(error.message ?? String(error));
}

function buildSceneTree(scenes, query = "") {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matches = scene => !normalizedQuery || `${scene.displayId} ${scene.title} ${scene.description}`.toLocaleLowerCase().includes(normalizedQuery);
  const childrenByParent = new Map();
  for (const scene of scenes) {
    const parentId = scene.parentId ?? null;
    const children = childrenByParent.get(parentId) ?? [];
    children.push(scene);
    childrenByParent.set(parentId, children);
  }
  const tree = [];
  const hasMatchingDescendant = sceneId => (childrenByParent.get(sceneId) ?? []).some(child => matches(child) || hasMatchingDescendant(child.id));
  const visit = (parentId, depth) => {
    for (const scene of childrenByParent.get(parentId) ?? []) {
      const children = childrenByParent.get(scene.id) ?? [];
      if (matches(scene) || hasMatchingDescendant(scene.id)) {
        tree.push({ ...scene, treeDepth: depth, hasChildren: children.length > 0, statusLabel: localize(`MEL_STORYBOARD.STATUS.${scene.status}`) });
      }
      visit(scene.id, depth + 1);
    }
  };
  visit(null, 0);
  for (const scene of scenes) {
    if (!tree.some(item => item.id === scene.id)) tree.push({ ...scene, treeDepth: 0, hasChildren: false, statusLabel: localize(`MEL_STORYBOARD.STATUS.${scene.status}`) });
  }
  return tree;
}

export class StoryboardApplication extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "mel-storyboard-application",
    classes: ["mel-storyboard", "standard-form"],
    position: { width: 1280, height: 820 },
    window: { resizable: true }
  };

  static PARTS = { body: { template: "modules/mel-storyboard/templates/storyboard.hbs" } };

  constructor(options = {}) {
    super(options);
    this.store = game.melStoryboard.store;
    this.board = this.store.read();
    this.selectedElementIds = [];
    this.history = new HistoryStack();
    this.drag = null;
    this.searchQuery = "";
    this.clipboard = null;
    this.connectionSourceId = null;
    this.contextMenu = null;
  }

  async _prepareContext() {
    const scenesById = new Map(this.board.scenes.map(scene => [scene.id, scene]));
    const elements = this.board.elements.map(element => {
      const scene = scenesById.get(element.sceneId);
      return { ...element, label: scene?.title || element.title || localize("MEL_STORYBOARD.ELEMENT_TYPES.SCENE"), typeLabel: scene?.displayId ?? "", statusLabel: scene ? localize(`MEL_STORYBOARD.STATUS.${scene.status}`) : "", isSelected: this.selectedElementIds.includes(element.id) };
    });
    const byId = new Map(elements.map(element => [element.id, element]));
    const connections = this.board.connections.map(connection => ({
      ...connection,
      source: { x: (byId.get(connection.sourceElementId)?.position.x ?? 0) + 90, y: (byId.get(connection.sourceElementId)?.position.y ?? 0) + 40 },
      target: { x: (byId.get(connection.targetElementId)?.position.x ?? 0) + 90, y: (byId.get(connection.targetElementId)?.position.y ?? 0) + 40 }
    }));
    const selectedElement = this.board.elements.find(element => this.selectedElementIds.includes(element.id));
    const selectedSceneRecord = scenesById.get(selectedElement?.sceneId);
    const selectedScene = selectedSceneRecord ? {
      ...selectedSceneRecord,
      statusLabel: localize(`MEL_STORYBOARD.STATUS.${selectedSceneRecord.status}`),
      incomingCount: this.board.connections.filter(connection => connection.targetElementId === selectedElement.id).length,
      outgoingCount: this.board.connections.filter(connection => connection.sourceElementId === selectedElement.id).length
    } : null;
    const statuses = Object.values(STATUS).map(value => ({ value, label: localize(`MEL_STORYBOARD.STATUS.${value}`), selected: selectedScene?.status === value }));
    const query = this.searchQuery.trim().toLocaleLowerCase();
    const sceneTree = buildSceneTree(this.board.scenes, query);
    const maxX = Math.max(1200, ...elements.map(element => element.position.x + element.size.width + 80));
    const maxY = Math.max(800, ...elements.map(element => element.position.y + element.size.height + 80));
    return {
      board: { ...this.board, elements, connections },
      sceneTree,
      selectedElement,
      selectedScene,
      canConnect: this.selectedElementIds.length === 2,
      hasScenes: this.board.scenes.length > 0,
      statuses,
      canvas: { width: maxX, height: maxY },
      canUndo: this.history.canUndo,
      canRedo: this.history.canRedo,
      searchQuery: this.searchQuery,
      connectionStatus: this.connectionSourceId ? localize("MEL_STORYBOARD.NOTIFICATIONS.SelectConnectionTarget") : "",
      labels: {
        title: localize("MEL_STORYBOARD.UI.Title"),
        undo: localize("MEL_STORYBOARD.ACTIONS.Undo"),
        redo: localize("MEL_STORYBOARD.ACTIONS.Redo"),
        importExport: localize("MEL_STORYBOARD.UI.ImportExport"),
        importJson: localize("MEL_STORYBOARD.ACTIONS.ImportJson"),
        exportJson: localize("MEL_STORYBOARD.ACTIONS.ExportJson"),
        exportSvg: localize("MEL_STORYBOARD.ACTIONS.ExportSvg"),
        exportPng: localize("MEL_STORYBOARD.ACTIONS.ExportPng"),
        exportPdf: localize("MEL_STORYBOARD.ACTIONS.ExportPdf"),
        newScene: localize("MEL_STORYBOARD.ACTIONS.NewScene"),
        scenes: localize("MEL_STORYBOARD.LABELS.Scenes"),
        searchScenes: localize("MEL_STORYBOARD.LABELS.SearchScenes"),
        noScenes: localize("MEL_STORYBOARD.EMPTY.NoScenes"),
        sceneCanvas: localize("MEL_STORYBOARD.ACCESSIBILITY.SceneCanvas"),
        inspector: localize("MEL_STORYBOARD.ACCESSIBILITY.Inspector"),
        sceneDetails: localize("MEL_STORYBOARD.LABELS.SceneDetails"),
        titleField: localize("MEL_STORYBOARD.LABELS.Title"),
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

  _onRender() {
    this.contextMenu?.close({ animate: false });
    this.contextMenu = new ContextMenu(this.element, "[data-scene-element], [data-storyboard-canvas]", this.#contextMenuEntries(), { fixed: true, relative: "cursor" });
    this.element.tabIndex = 0;
    if (!this.keyboardBound) {
      this.element.addEventListener("keydown", event => this.#onKeyDown(event));
      this.keyboardBound = true;
    }
    this.element.querySelectorAll("[data-action]").forEach(element => element.addEventListener("click", event => this.#handleAction(event)));
    this.element.querySelectorAll("[data-scene-element]").forEach(element => {
      element.addEventListener("pointerdown", event => this.#startDrag(event));
      element.addEventListener("click", async event => {
        event.stopPropagation();
        if (this.connectionSourceId && this.connectionSourceId !== element.dataset.elementId) {
          await this.#connectTo(element.dataset.elementId);
          return;
        }
        this.#selectElement(element.dataset.elementId, event.ctrlKey || event.metaKey);
      });
    });
    this.element.querySelector("[data-storyboard-canvas]")?.addEventListener("click", event => {
      if (event.target === event.currentTarget && !this.connectionSourceId) {
        this.selectedElementIds = [];
        this.render({ force: true });
      }
    });
    this.element.querySelectorAll("[data-scene-field]").forEach(field => field.addEventListener("change", event => this.#updateSceneField(event)));
    this.element.querySelector("[data-search-scenes]")?.addEventListener("input", event => {
      this.searchQuery = event.currentTarget.value;
      this.render({ force: true });
    });
    this.element.querySelector("[data-json-import]")?.addEventListener("change", event => this.#importFile(event));
    this.element.querySelector("[data-search-scenes]")?.focus({ preventScroll: true });
  }

  #selectElement(elementId, additive = false) {
    this.selectedElementIds = additive
      ? (this.selectedElementIds.includes(elementId) ? this.selectedElementIds.filter(id => id !== elementId) : [...this.selectedElementIds, elementId])
      : [elementId];
    this.render({ force: true });
  }

  #selectedScene() {
    const element = this.board.elements.find(candidate => candidate.id === this.selectedElementIds[0]);
    return this.board.scenes.find(scene => scene.id === element?.sceneId) ?? null;
  }

  #exportLabels() {
    return { title: localize("MEL_STORYBOARD.EXPORT.Scenes"), scene: localize("MEL_STORYBOARD.ELEMENT_TYPES.SCENE"), status: status => localize(`MEL_STORYBOARD.STATUS.${status}`) };
  }

  #contextMenuEntries() {
    const sceneTarget = target => Boolean(target?.dataset?.elementId);
    const canvasTarget = target => target?.hasAttribute?.("data-storyboard-canvas") === true;
    const selectTarget = target => {
      const elementId = target?.dataset?.elementId;
      if (elementId) this.selectedElementIds = [elementId];
      return elementId;
    };
    return [
      { label: localize("MEL_STORYBOARD.ACTIONS.NewScene"), icon: "fas fa-plus", visible: canvasTarget, onClick: event => this.#createScene(event) },
      { label: localize("MEL_STORYBOARD.ACTIONS.EditScene"), icon: "fas fa-pen", visible: sceneTarget, onClick: (_event, target) => this.#renameScene(selectTarget(target)) },
      { label: localize("MEL_STORYBOARD.ACTIONS.ConnectScene"), icon: "fas fa-arrow-right", visible: sceneTarget, onClick: async (_event, target) => { this.connectionSourceId = selectTarget(target); ui.notifications.info(localize("MEL_STORYBOARD.NOTIFICATIONS.SelectConnectionTarget")); await this.render({ force: true }); } },
      { label: localize("MEL_STORYBOARD.ACTIONS.DeleteScene"), icon: "fas fa-trash", visible: sceneTarget, onClick: () => this.#deleteSelected() }
    ];
  }

  async #createScene(event = null) {
    const title = window.prompt(localize("MEL_STORYBOARD.PROMPTS.SceneTitle"), localize("MEL_STORYBOARD.DEFAULTS.SceneTitle"));
    if (!title?.trim()) return;
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
    await this.render({ force: true });
  }

  async #renameScene(elementId) {
    const scene = this.board.scenes.find(candidate => candidate.id === this.board.elements.find(element => element.id === elementId)?.sceneId);
    if (!scene) return;
    const title = window.prompt(localize("MEL_STORYBOARD.PROMPTS.RenameScene"), scene.title);
    if (!title?.trim() || title.trim() === scene.title) return;
    this.history.capture(this.board);
    scene.title = title.trim();
    scene.updatedAt = new Date().toISOString();
    this.board = await this.store.save(this.board);
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
    const scene = this.#selectedScene();
    if (scene && !window.confirm(format("MEL_STORYBOARD.PROMPTS.DeleteScene", { title: scene.title }))) return;
    this.history.capture(this.board);
    removeSceneElements(this.board, this.selectedElementIds);
    this.board = await this.store.save(this.board);
    this.selectedElementIds = [];
    await this.render({ force: true });
  }

  async #handleAction(event) {
    const action = event.currentTarget.dataset.action;
    try {
      if (action === "add-scene") {
        await this.#createScene();
      } else if (action === "duplicate-selected") await this.#duplicateSelected();
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
      await this.render({ force: true });
    } catch (error) { notifyError(error); }
    finally { event.currentTarget.value = ""; }
  }

  #startDrag(event) {
    if (event.button !== 0 || this.connectionSourceId || event.ctrlKey || event.metaKey) return;
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
    const positions = new Map(this.board.elements.map(element => [element.id, { x: element.position.x + element.size.width / 2, y: element.position.y + element.size.height / 2 }]));
    for (const connection of this.board.connections) {
      if (connection.sourceElementId !== movedElementId && connection.targetElementId !== movedElementId) continue;
      const source = positions.get(connection.sourceElementId);
      const target = positions.get(connection.targetElementId);
      const line = this.element.querySelector(`[data-connection-id="${connection.id}"]`);
      if (line && source && target) { line.setAttribute("x1", source.x); line.setAttribute("y1", source.y); line.setAttribute("x2", target.x); line.setAttribute("y2", target.y); }
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
}
