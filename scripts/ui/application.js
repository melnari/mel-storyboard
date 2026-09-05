import { MODULE_ID, STATUS } from "../domain/constants.js";
import { createConnection, createMap, createMapElement, createStoryScene, duplicateStoryElements, clone } from "../domain/model.js";
import { downloadProjectJson, downloadProjectPng, downloadProjectSvg, printProjectAsPdf, projectFromJson } from "../domain/export.js";
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

export class StoryboardApplication extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "mel-storyboard-application",
    classes: ["mel-storyboard", "standard-form"],
    position: { width: 1280, height: 820 },
    window: { resizable: true }
  };

  static PARTS = {
    body: { template: "modules/mel-storyboard/templates/storyboard.hbs" }
  };

  constructor(options = {}) {
    super(options);
    this.store = game.melStoryboard.store;
    this.projectId = options.projectId ?? this.store.list()[0]?.id ?? null;
    this.mapId = options.mapId ?? null;
    this.selectedElementId = null;
    this.selectedElementIds = [];
    this.history = new HistoryStack();
    this.drag = null;
    this.searchQuery = "";
    this.clipboard = null;
    this.connectionSourceId = null;
    this.contextMenu = null;
  }

  async _prepareContext() {
    let projects = this.store.list();
    const currentProject = projects.find(project => project.id === this.projectId) ?? projects[0] ?? null;
    if (!currentProject) {
      return { projects: [], currentProject: { title: localize("MEL_STORYBOARD.EMPTY.NoStorylines"), maps: [], scenes: [] }, currentMap: { elements: [], connections: [] }, canvas: { width: 1200, height: 800 }, statuses: [], hasProject: false, hasMap: false, canConnect: false, canUndo: this.history.canUndo, canRedo: this.history.canRedo, connectionStatus: "", searchQuery: this.searchQuery, localize };
    }
    this.projectId = currentProject.id;
    const currentMap = currentProject.maps.find(map => map.id === this.mapId) ?? currentProject.maps[0];
    this.mapId = currentMap?.id ?? null;
    const scenes = new Map(currentProject.scenes.map(scene => [scene.id, scene]));
    const mapElements = (currentMap?.elements ?? []).map(element => {
      const scene = scenes.get(element.entityId);
      return { ...element, label: scene?.title || element.title || localize(`MEL_STORYBOARD.ELEMENT_TYPES.${element.elementType}`), typeLabel: localize(`MEL_STORYBOARD.ELEMENT_TYPES.${element.elementType}`), statusLabel: scene ? localize(`MEL_STORYBOARD.STATUS.${scene.status}`) : "" , isSelected: this.selectedElementIds.includes(element.id) };
    });
    const byId = new Map(mapElements.map(element => [element.id, element]));
    const connections = (currentMap?.connections ?? []).map(connection => ({ ...connection, source: { x: (byId.get(connection.sourceElementId)?.position.x ?? 0) + 90, y: (byId.get(connection.sourceElementId)?.position.y ?? 0) + 40 }, target: { x: (byId.get(connection.targetElementId)?.position.x ?? 0) + 90, y: (byId.get(connection.targetElementId)?.position.y ?? 0) + 40 } }));
    const selectedElement = currentMap?.elements.find(element => element.id === (this.selectedElementIds[0] ?? this.selectedElementId));
    const selectedScene = selectedElement?.entityId ? currentProject.scenes.find(scene => scene.id === selectedElement.entityId) : null;
    const statuses = Object.values(STATUS).map(value => ({ value, label: localize(`MEL_STORYBOARD.STATUS.${value}`), selected: selectedScene?.status === value }));
    const maxX = Math.max(1200, ...mapElements.map(element => element.position.x + element.size.width + 80));
    const maxY = Math.max(800, ...mapElements.map(element => element.position.y + element.size.height + 80));
    const query = this.searchQuery.trim().toLocaleLowerCase();
    const visibleScenes = query ? currentProject.scenes.filter(scene => `${scene.displayId} ${scene.title} ${scene.description}`.toLocaleLowerCase().includes(query)) : currentProject.scenes;
    return { projects: projects.map(project => ({ ...project, isCurrent: project.id === currentProject.id })), currentProject: { ...currentProject, scenes: visibleScenes, maps: currentProject.maps.map(map => ({ ...map, isCurrent: map.id === currentMap?.id })) }, currentMap: currentMap ? { ...currentMap, elements: mapElements, connections } : { elements: [], connections: [] }, selectedElement, selectedScene, canConnect: this.selectedElementIds.length === 2, hasProject: true, hasMap: Boolean(currentMap), statuses, canvas: { width: maxX, height: maxY }, canUndo: this.history.canUndo, canRedo: this.history.canRedo, searchQuery: this.searchQuery, connectionStatus: this.connectionSourceId ? localize("MEL_STORYBOARD.NOTIFICATIONS.SelectConnectionTarget") : "", localize };
  }

  _onRender() {
    this.contextMenu?.close({ animate: false });
    this.contextMenu = new ContextMenu(this.element, "[data-element-id]", this.#contextMenuEntries(), { fixed: true, relative: "cursor" });
    this.element.tabIndex = 0;
    this.element.addEventListener("keydown", event => this.#onKeyDown(event));
    this.element.querySelectorAll("[data-action]").forEach(element => element.addEventListener("click", event => this.#handleAction(event)));
    this.element.querySelectorAll("[data-element-id]").forEach(element => {
      element.addEventListener("pointerdown", event => this.#startDrag(event));
      element.addEventListener("click", async event => {
        event.stopPropagation();
        if (this.connectionSourceId && this.connectionSourceId !== element.dataset.elementId) {
          await this.#connectTo(element.dataset.elementId);
          return;
        }
        if (event.ctrlKey || event.metaKey) {
          this.selectedElementIds = this.selectedElementIds.includes(element.dataset.elementId)
            ? this.selectedElementIds.filter(id => id !== element.dataset.elementId)
            : [...this.selectedElementIds, element.dataset.elementId];
        } else {
          this.selectedElementIds = [element.dataset.elementId];
        }
        this.selectedElementId = this.selectedElementIds[0] ?? null;
        this.render({ force: true });
      });
    });
    this.element.querySelector("[data-storyboard-canvas]")?.addEventListener("click", event => {
      if (event.target === event.currentTarget) {
        if (this.connectionSourceId) return;
        this.selectedElementId = null;
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
  }

  #currentProject() { return this.store.get(this.projectId); }
  #currentMap(project = this.#currentProject()) { return project?.maps.find(map => map.id === this.mapId) ?? project?.maps[0]; }
  #exportLabels() { return { sceneHeading: localize("MEL_STORYBOARD.EXPORT.StoryScenes"), status: status => localize(`MEL_STORYBOARD.STATUS.${status}`) }; }

  #contextMenuEntries() {
    const sceneVisible = target => Boolean(target?.dataset?.elementId);
    const selectTarget = target => {
      const elementId = target?.dataset?.elementId;
      if (!elementId) return null;
      this.selectedElementId = elementId;
      this.selectedElementIds = [elementId];
      return elementId;
    };
    return [
      { label: localize("MEL_STORYBOARD.ACTIONS.RenameScene"), icon: "fas fa-pen", visible: sceneVisible, onClick: (_event, target) => this.#renameScene(selectTarget(target)) },
      { label: localize("MEL_STORYBOARD.ACTIONS.DuplicateScene"), icon: "fas fa-copy", visible: sceneVisible, onClick: (_event, target) => { selectTarget(target); return this.#handleAction({ currentTarget: { dataset: { action: "duplicate-selected" } } }); } },
      { label: localize("MEL_STORYBOARD.ACTIONS.ConnectScene"), icon: "fas fa-arrow-right", visible: sceneVisible, onClick: async (_event, target) => {
        this.connectionSourceId = selectTarget(target);
        ui.notifications.info(localize("MEL_STORYBOARD.NOTIFICATIONS.SelectConnectionTarget"));
        await this.render({ force: true });
      } },
      { label: localize("MEL_STORYBOARD.ACTIONS.DeleteMapElement"), icon: "fas fa-trash", visible: sceneVisible, onClick: (_event, target) => { selectTarget(target); return this.#handleAction({ currentTarget: { dataset: { action: "delete-selected" } } }); } }
    ];
  }

  async #renameScene(elementId) {
    const project = this.#currentProject();
    const map = this.#currentMap(project);
    const element = map?.elements.find(candidate => candidate.id === elementId);
    const scene = project?.scenes.find(candidate => candidate.id === element?.entityId);
    if (!scene) return;
    const title = window.prompt(localize("MEL_STORYBOARD.PROMPTS.RenameScene"), scene.title);
    if (!title || title === scene.title) return;
    this.history.capture(project);
    scene.title = title;
    scene.updatedAt = new Date().toISOString();
    await this.store.save(project);
    await this.render({ force: true });
  }

  async #connectTo(targetId) {
    const project = this.#currentProject();
    const map = this.#currentMap(project);
    if (!map || !this.connectionSourceId || this.connectionSourceId === targetId) return;
    this.history.capture(project);
    createConnection(map, this.connectionSourceId, targetId);
    await this.store.save(project);
    this.selectedElementIds = [this.connectionSourceId, targetId];
    this.selectedElementId = this.connectionSourceId;
    this.connectionSourceId = null;
    await this.render({ force: true });
  }

  #onKeyDown(event) {
    const tagName = event.target?.tagName?.toLowerCase();
    if (["input", "textarea", "select"].includes(tagName) || event.target?.isContentEditable) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
      event.preventDefault();
      this.#copySelection();
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") {
      event.preventDefault();
      this.#pasteClipboard();
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      this.#handleAction({ currentTarget: { dataset: { action: event.shiftKey ? "redo" : "undo" } } });
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
      event.preventDefault();
      this.#handleAction({ currentTarget: { dataset: { action: "redo" } } });
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") {
      event.preventDefault();
      this.#handleAction({ currentTarget: { dataset: { action: "duplicate-selected" } } });
    } else if (event.key === "Delete") {
      event.preventDefault();
      this.#handleAction({ currentTarget: { dataset: { action: "delete-selected" } } });
    }
  }

  #copySelection() {
    const project = this.#currentProject();
    const map = this.#currentMap(project);
    if (!map || !this.selectedElementIds.length) return;
    this.clipboard = { mapId: map.id, elementIds: [...this.selectedElementIds] };
    ui.notifications.info(localize("MEL_STORYBOARD.NOTIFICATIONS.Copied"));
  }

  async #pasteClipboard() {
    const project = this.#currentProject();
    const map = this.#currentMap(project);
    if (!map || !this.clipboard || this.clipboard.mapId !== map.id) return;
    this.history.capture(project);
    const result = duplicateStoryElements(project, map, this.clipboard.elementIds);
    await this.store.save(project);
    this.selectedElementIds = result.duplicates.map(element => element.id);
    this.selectedElementId = this.selectedElementIds[0] ?? null;
    await this.render({ force: true });
  }

  async #handleAction(event) {
    const action = event.currentTarget.dataset.action;
    try {
      if (action === "create-project") {
        const title = window.prompt(localize("MEL_STORYBOARD.PROMPTS.StorylineTitle"));
        if (!title) return;
        const project = await this.store.create(title);
        this.projectId = project.id;
        this.mapId = project.maps[0].id;
        this.selectedElementId = null;
        this.selectedElementIds = [];
      } else if (action === "add-map") {
        const project = this.#currentProject();
        if (!project) return;
        const title = window.prompt(localize("MEL_STORYBOARD.PROMPTS.StoryTitle"), `${localize("MEL_STORYBOARD.DEFAULTS.StoryTitle")} ${project.maps.length + 1}`);
        if (!title) return;
        this.history.capture(project);
        const map = createMap(project.id, title);
        project.maps.push(map);
        await this.store.save(project);
        this.mapId = map.id;
      } else if (action === "add-scene") {
        const project = this.#currentProject();
        if (!project) return;
        const map = this.#currentMap(project);
        if (!map) return;
        this.history.capture(project);
        const scene = createStoryScene(project);
        const element = createMapElement(map, { entityId: scene.id, elementType: "SCENE", title: scene.title });
        element.position = { x: 120 + map.elements.length * 24, y: 120 + map.elements.length * 18 };
        await this.store.save(project);
        this.selectedElementId = element.id;
        this.selectedElementIds = [element.id];
      } else if (action === "rename-storyline") {
        const project = this.#currentProject();
        if (!project) return;
        const title = window.prompt(localize("MEL_STORYBOARD.PROMPTS.RenameStoryline"), project.title);
        if (!title || title === project.title) return;
        await this.store.rename(project.id, title);
      } else if (action === "delete-storyline") {
        const project = this.#currentProject();
        if (!project || !window.confirm(format("MEL_STORYBOARD.PROMPTS.DeleteStoryline", { title: project.title }))) return;
        await this.store.delete(project.id);
        this.projectId = null;
        this.mapId = null;
        this.selectedElementId = null;
        this.selectedElementIds = [];
      } else if (action === "rename-story") {
        const project = this.#currentProject();
        const map = this.#currentMap(project);
        if (!map) return;
        const title = window.prompt(localize("MEL_STORYBOARD.PROMPTS.RenameStory"), map.title);
        if (!title || title === map.title) return;
        this.history.capture(project);
        map.title = title;
        map.updatedAt = new Date().toISOString();
        await this.store.save(project);
      } else if (action === "delete-story") {
        const project = this.#currentProject();
        const map = this.#currentMap(project);
        if (!project || !map || !window.confirm(format("MEL_STORYBOARD.PROMPTS.DeleteStory", { title: map.title }))) return;
        this.history.capture(project);
        project.maps = project.maps.filter(candidate => candidate.id !== map.id);
        this.mapId = project.maps[0]?.id ?? null;
        this.selectedElementId = null;
        this.selectedElementIds = [];
        await this.store.save(project);
      } else if (action === "duplicate-selected") {
        const project = this.#currentProject();
        const map = this.#currentMap(project);
        if (!map || !this.selectedElementIds.length) return;
        this.history.capture(project);
        const result = duplicateStoryElements(project, map, this.selectedElementIds);
        await this.store.save(project);
        this.selectedElementIds = result.duplicates.map(element => element.id);
        this.selectedElementId = this.selectedElementIds[0] ?? null;
      } else if (action === "connect-selected") {
        const project = this.#currentProject();
        const map = this.#currentMap(project);
        if (!map || this.selectedElementIds.length !== 2) return;
        this.history.capture(project);
        createConnection(map, this.selectedElementIds[0], this.selectedElementIds[1]);
        await this.store.save(project);
      } else if (action === "delete-selected") {
        const project = this.#currentProject();
        const map = this.#currentMap(project);
        if (!map || !this.selectedElementIds.length) return;
        this.history.capture(project);
        const ids = new Set(this.selectedElementIds);
        map.elements = map.elements.filter(element => !ids.has(element.id));
        map.connections = map.connections.filter(connection => !ids.has(connection.sourceElementId) && !ids.has(connection.targetElementId));
        map.updatedAt = new Date().toISOString();
        await this.store.save(project);
        this.selectedElementId = null;
        this.selectedElementIds = [];
      } else if (action === "undo") {
        const project = this.#currentProject();
        const snapshot = this.history.undo(project);
        if (!snapshot) return;
        await this.store.save(snapshot);
        this.selectedElementId = null;
        this.selectedElementIds = [];
      } else if (action === "redo") {
        const project = this.#currentProject();
        const snapshot = this.history.redo(project);
        if (!snapshot) return;
        await this.store.save(snapshot);
        this.selectedElementId = null;
        this.selectedElementIds = [];
      } else if (action === "import-json") {
        this.element.querySelector("[data-json-import]")?.click();
      } else if (action === "select-project") {
        this.projectId = event.currentTarget.value;
        this.mapId = null;
        this.selectedElementId = null;
        this.selectedElementIds = [];
      } else if (action === "select-map") {
        this.mapId = event.currentTarget.value;
        this.selectedElementId = null;
        this.selectedElementIds = [];
      } else if (action === "select-scene") {
        const project = this.#currentProject();
        const map = this.#currentMap(project);
        const element = map.elements.find(candidate => candidate.entityId === event.currentTarget.dataset.sceneId);
        this.selectedElementId = element?.id ?? null;
        this.selectedElementIds = element ? [element.id] : [];
      } else if (action === "save-scene") {
        await this.store.save(this.#currentProject());
        ui.notifications.info(localize("MEL_STORYBOARD.NOTIFICATIONS.Saved"));
      } else if (action.startsWith("export-")) {
        const project = this.#currentProject();
        if (action === "export-json") downloadProjectJson(project);
        if (action === "export-svg") downloadProjectSvg(project, this.#exportLabels());
        if (action === "export-png") await downloadProjectPng(project, this.#exportLabels());
        if (action === "export-pdf") printProjectAsPdf(project, this.#exportLabels());
      }
      await this.render({ force: true });
    } catch (error) {
      notifyError(error);
    }
  }

  async #updateSceneField(event) {
    const project = this.#currentProject();
    const map = this.#currentMap(project);
    const element = map?.elements.find(candidate => candidate.id === this.selectedElementId);
    const scene = project?.scenes.find(candidate => candidate.id === element?.entityId);
    if (!scene) return;
    this.history.capture(project);
    scene[event.currentTarget.dataset.sceneField] = event.currentTarget.value;
    scene.updatedAt = new Date().toISOString();
    await this.store.save(project);
    await this.render({ force: true });
  }

  async #importFile(event) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    try {
      const imported = projectFromJson(await file.text());
      const project = await this.store.import(imported);
      this.projectId = project.id;
      this.mapId = project.maps[0]?.id ?? null;
      this.selectedElementId = null;
      this.selectedElementIds = [];
      await this.render({ force: true });
    } catch (error) {
      notifyError(error);
    } finally {
      event.currentTarget.value = "";
    }
  }

  #startDrag(event) {
    if (event.button !== 0 || this.connectionSourceId || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    const project = this.#currentProject();
    const map = this.#currentMap(project);
    const element = map?.elements.find(candidate => candidate.id === event.currentTarget.dataset.elementId);
    if (!element) return;
    this.selectedElementId = element.id;
    this.selectedElementIds = [element.id];
    const svg = this.element.querySelector("[data-storyboard-canvas]");
    const point = this.#svgPoint(svg, event);
    this.history.capture(project);
    this.drag = { element, startX: point.x, startY: point.y, original: clone(element.position), project };
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
    if (this.drag.frame) return;
    this.drag.frame = requestAnimationFrame(() => this.#applyDragFrame());
  }

  #applyDragFrame() {
    if (!this.drag?.pendingEvent) return;
    const event = this.drag.pendingEvent;
    const point = this.#svgPoint(this.element.querySelector("[data-storyboard-canvas]"), event);
    this.drag.element.position = { x: Math.max(0, this.drag.original.x + point.x - this.drag.startX), y: Math.max(0, this.drag.original.y + point.y - this.drag.startY) };
    const elementNode = [...this.element.querySelectorAll("[data-element-id]")].find(node => node.dataset.elementId === this.drag.element.id);
    elementNode?.setAttribute("transform", `translate(${this.drag.element.position.x} ${this.drag.element.position.y})`);
    this.#updateConnectionGeometry(this.drag.project, this.drag.element.id);
    this.drag.pendingEvent = null;
    this.drag.frame = null;
  }

  #updateConnectionGeometry(project, movedElementId) {
    const map = this.#currentMap(project);
    if (!map) return;
    const positions = new Map(map.elements.map(element => [element.id, { x: element.position.x + element.size.width / 2, y: element.position.y + element.size.height / 2 }]));
    for (const connection of map.connections) {
      if (connection.sourceElementId !== movedElementId && connection.targetElementId !== movedElementId) continue;
      const source = positions.get(connection.sourceElementId);
      const target = positions.get(connection.targetElementId);
      const line = this.element.querySelector(`[data-connection-id="${connection.id}"]`);
      if (!line || !source || !target) continue;
      line.setAttribute("x1", source.x);
      line.setAttribute("y1", source.y);
      line.setAttribute("x2", target.x);
      line.setAttribute("y2", target.y);
    }
  }

  async #finishDrag() {
    if (!this.drag) return;
    const { project, move, element } = this.drag;
    if (this.drag.frame) cancelAnimationFrame(this.drag.frame);
    this.#applyDragFrame();
    window.removeEventListener("pointermove", move);
    this.drag = null;
    this.selectedElementId = element.id;
    this.selectedElementIds = [element.id];
    await this.store.save(project);
    await this.render({ force: true });
  }
}
