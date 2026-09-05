import { MODULE_ID, OBJECT_TYPES, STATUS } from "../domain/constants.js";
import { assignObjectToScene, clone, createBoardObject, createBoardTemplate, createConnection, createScene, createSceneElement, createTemplateVersion, duplicateSceneElements, copySceneElements, pasteSceneElements, migrateSceneTemplate, previewTemplateMigration, removeObjectAssignment, removeSceneElements, removeConnection } from "../domain/model.js";
import { downloadSceneBoardJson, downloadSceneBoardPng, downloadSceneBoardSvg, printSceneBoardAsPdf, sceneBoardFromJson } from "../domain/export.js";
import { connectionGeometry } from "../domain/geometry.js";
import { HistoryStack } from "../domain/history.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

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

const OBJECT_ICONS = Object.freeze({
  PLAYER_CHARACTER: "fa-user",
  NPC: "fa-user-gear",
  GROUP: "fa-users",
  FACTION: "fa-flag",
  PLACE: "fa-location-dot",
  ITEM: "fa-cube",
  INFORMATION: "fa-circle-info",
  EVENT: "fa-calendar-day"
});

const ACTOR_OBJECT_TYPES = new Set(["PLAYER_CHARACTER", "NPC", "GROUP", "FACTION"]);

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
    window: { resizable: true }
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
    this.clipboard = null;
    this.zoom = 1;
    this.connectionSourceId = null;
    this.contextMenuElement = null;
    this.contextMenuHost = null;
    this.contextMenuHandler = null;
    this.contextMenuOutsideHandler = null;
    this.contextMenuKeyHandler = null;
  }

  async _prepareContext() {
    const scenesById = new Map(this.board.scenes.map(scene => [scene.id, scene]));
    const elements = this.board.elements.map(element => {
      const scene = scenesById.get(element.sceneId);
      return { ...element, label: scene?.title || element.title || localize("MEL_STORYBOARD.ELEMENT_TYPES.SCENE"), typeLabel: scene?.displayId ?? "", statusLabel: scene ? localize(`MEL_STORYBOARD.STATUS.${scene.status}`) : "", isSelected: this.selectedElementIds.includes(element.id) };
    });
    const byId = new Map(elements.map(element => [element.id, element]));
    const objects = (this.board.objects ?? []).map(object => ({
      ...object,
      typeLabel: localize(`MEL_STORYBOARD.OBJECT_TYPES.${object.objectType}`),
      icon: OBJECT_ICONS[object.objectType] ?? "fa-cube"
    }));
    const objectsById = new Map(objects.map(object => [object.id, object]));
    const connections = this.board.connections.map(connection => {
      const sourceElement = byId.get(connection.sourceElementId);
      const targetElement = byId.get(connection.targetElementId);
      const geometry = sourceElement && targetElement
        ? connectionGeometry(sourceElement, targetElement)
        : { source: { x: 0, y: 0 }, target: { x: 0, y: 0 }, arrowPoints: "0,0 0,0 0,0", label: { x: 0, y: 0 } };
      return { ...connection, ...geometry, labelPosition: geometry.label, label: connection.label?.trim() ?? "", hasLabel: Boolean(connection.label?.trim()) };
    });
    const selectedElement = this.board.elements.find(element => this.selectedElementIds.includes(element.id));
    const selectedSceneRecord = scenesById.get(selectedElement?.sceneId);
    const selectedObjects = (selectedSceneRecord?.objectAssignments ?? []).map(assignment => {
      const object = objectsById.get(assignment.objectId);
      return object ? { ...object, assignmentId: assignment.id, role: assignment.role, assignmentNotes: assignment.notes } : null;
    }).filter(Boolean);
    const templateOptions = (this.board.templates ?? []).filter(template => (template.targetType ?? "SCENE") === "SCENE").map(template => ({
      id: template.id,
      label: template.name?.trim() || localize(template.nameKey),
      version: template.version,
      scopeLabel: localize(`MEL_STORYBOARD.LABELS.${template.scope === "board" ? "BoardTemplate" : "GlobalTemplate"}`),
      selected: template.id === selectedSceneRecord?.templateId
    }));
    const selectedTemplateRecord = this.board.templates.find(template => template.id === selectedSceneRecord?.templateId);
    const selectedTemplateFields = (selectedTemplateRecord?.fields ?? []).map(field => ({
      ...field,
      label: field.label?.trim() || localize(field.labelKey),
      value: selectedSceneRecord?.fieldValues?.[field.stableKey] ?? ""
    }));
    const selectedScene = selectedSceneRecord ? {
      ...selectedSceneRecord,
      statusLabel: localize(`MEL_STORYBOARD.STATUS.${selectedSceneRecord.status}`),
      templateLabel: templateOptions.find(template => template.selected)?.label ?? "",
      incomingCount: this.board.connections.filter(connection => connection.targetElementId === selectedElement.id).length,
      outgoingCount: this.board.connections.filter(connection => connection.sourceElementId === selectedElement.id).length
    } : null;
    const statuses = Object.values(STATUS).map(value => ({ value, label: localize(`MEL_STORYBOARD.STATUS.${value}`), selected: selectedScene?.status === value }));
    const sceneTree = buildSceneTree(this.board.scenes);
    const maxX = Math.max(1200, ...elements.map(element => element.position.x + element.size.width + 80));
    const maxY = Math.max(800, ...elements.map(element => element.position.y + element.size.height + 80));
    return {
      board: { ...this.board, elements, connections, objects },
      sceneTree,
      selectedElement,
      selectedScene,
      canConnect: this.selectedElementIds.length === 2,
      hasScenes: this.board.scenes.length > 0,
      objects,
      selectedObjects,
      availableObjects: objects.filter(object => !selectedObjects.some(selected => selected.id === object.id)),
      objectTypes: OBJECT_TYPES.map(value => ({ value, label: localize(`MEL_STORYBOARD.OBJECT_TYPES.${value}`), icon: OBJECT_ICONS[value] ?? "fa-cube" })),
      templateOptions,
      selectedTemplateFields,
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
        story: localize("MEL_STORYBOARD.LABELS.Story"),
        scenes: localize("MEL_STORYBOARD.LABELS.Scenes"),
        noScenes: localize("MEL_STORYBOARD.EMPTY.NoScenes"),
        sceneCanvas: localize("MEL_STORYBOARD.ACCESSIBILITY.SceneCanvas"),
        inspector: localize("MEL_STORYBOARD.ACCESSIBILITY.Inspector"),
        sceneDetails: localize("MEL_STORYBOARD.LABELS.SceneDetails"),
        template: localize("MEL_STORYBOARD.LABELS.Template"),
        templateVersion: localize("MEL_STORYBOARD.LABELS.TemplateVersion"),
        templateFields: localize("MEL_STORYBOARD.LABELS.TemplateFields"),
        copyTemplate: localize("MEL_STORYBOARD.ACTIONS.CopyTemplate"),
        addTemplateField: localize("MEL_STORYBOARD.ACTIONS.AddTemplateField"),
        objects: localize("MEL_STORYBOARD.LABELS.Objects"),
        objectType: localize("MEL_STORYBOARD.LABELS.ObjectType"),
        objectTitle: localize("MEL_STORYBOARD.LABELS.ObjectTitle"),
        foundryUuid: localize("MEL_STORYBOARD.LABELS.FoundryUuid"),
        existingObject: localize("MEL_STORYBOARD.LABELS.ExistingObject"),
        addObject: localize("MEL_STORYBOARD.ACTIONS.AddObject"),
        assignObject: localize("MEL_STORYBOARD.ACTIONS.AssignObject"),
        removeObject: localize("MEL_STORYBOARD.ACTIONS.RemoveObject"),
        noObjects: localize("MEL_STORYBOARD.EMPTY.NoObjects"),
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

  async _onRender(context, options) {
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
    this.element.querySelector("[data-storyboard-canvas]")?.addEventListener("wheel", event => this.#onCanvasWheel(event), { passive: false });
    this.#applyZoom();
    this.element.querySelectorAll("[data-scene-field]").forEach(field => field.addEventListener("change", event => this.#updateSceneField(event)));
    this.element.querySelector("[data-json-import]")?.addEventListener("change", event => this.#importFile(event));
  }

  _onClose(options) {
    this.#closeContextMenu();
    return super._onClose(options);
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
      { label: localize("MEL_STORYBOARD.ACTIONS.EditConnection"), icon: "✎", action: () => this.#editConnection(connectionId) },
      { label: localize("MEL_STORYBOARD.ACTIONS.DeleteConnection"), icon: "×", action: () => this.#deleteConnection(connectionId) }
    ] : sceneMenu ? [
      { label: localize("MEL_STORYBOARD.ACTIONS.EditScene"), icon: "✎", action: () => this.#renameScene(elementId) },
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
    if (!window.confirm(localize("MEL_STORYBOARD.PROMPTS.DeleteConnection"))) return;
    this.history.capture(this.board);
    removeConnection(this.board, connectionId);
    this.board = await this.store.save(this.board);
    await this.render({ force: true });
  }

  async #editConnection(connectionId) {
    const connection = this.board.connections.find(candidate => candidate.id === connectionId);
    if (!connection) return;
    const label = window.prompt(localize("MEL_STORYBOARD.PROMPTS.ConnectionLabel"), connection.label ?? "");
    if (label === null || label.trim() === (connection.label ?? "").trim()) return;
    this.history.capture(this.board);
    connection.label = label.trim();
    connection.updatedAt = new Date().toISOString();
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

  async #changeSceneTemplate(templateId) {
    const scene = this.#selectedScene();
    const nextTemplate = this.board.templates.find(template => template.id === templateId);
    if (!scene || !nextTemplate || scene.templateId === nextTemplate.id) return;
    const currentTemplate = this.board.templates.find(template => template.id === scene.templateId);
    const preview = previewTemplateMigration(scene, currentTemplate, nextTemplate);
    const confirmed = window.confirm(format("MEL_STORYBOARD.PROMPTS.TemplateMigration", {
      from: preview.fromVersion,
      to: preview.toVersion,
      added: preview.added.join(", ") || "—",
      removed: preview.removed.join(", ") || "—",
      changed: preview.changed.join(", ") || "—"
    }));
    if (!confirmed) {
      await this.render({ force: true });
      return;
    }
    this.history.capture(this.board);
    migrateSceneTemplate(this.board, scene.id, nextTemplate.id, { confirmed: true });
    this.board = await this.store.save(this.board);
    await this.render({ force: true });
  }

  async #copySelectedTemplate() {
    const scene = this.#selectedScene();
    const source = this.board.templates.find(template => template.id === scene?.templateId);
    if (!scene || !source) return;
    const sourceName = source.name?.trim() || localize(source.nameKey);
    const name = window.prompt(localize("MEL_STORYBOARD.PROMPTS.TemplateCopyName"), `${sourceName} (${localize("MEL_STORYBOARD.LABELS.Copy")})`);
    if (name === null || !name.trim()) return;
    this.history.capture(this.board);
    const copy = createBoardTemplate(this.board, source.id, { name });
    scene.templateId = copy.id;
    scene.templateVersion = copy.version;
    scene.updatedAt = new Date().toISOString();
    this.board = await this.store.save(this.board);
  }

  async #addTemplateField() {
    const scene = this.#selectedScene();
    const source = this.board.templates.find(template => template.id === scene?.templateId);
    if (!scene || !source) return;
    const key = window.prompt(localize("MEL_STORYBOARD.PROMPTS.TemplateFieldKey"));
    if (key === null || !key.trim()) return;
    const stableKey = key.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (!stableKey || source.fields.some(field => field.stableKey === stableKey)) return;
    const label = window.prompt(localize("MEL_STORYBOARD.PROMPTS.TemplateFieldLabel"), key.trim());
    if (label === null || !label.trim()) return;
    this.history.capture(this.board);
    createTemplateVersion(this.board, source.id, {
      fields: [...source.fields, { stableKey, label: label.trim(), fieldType: "rich-text", required: false, sortOrder: (source.fields.length + 1) * 10 }]
    });
    this.board = await this.store.save(this.board);
  }

  async #saveTemplateFields() {
    const scene = this.#selectedScene();
    if (!scene) return;
    this.history.capture(this.board);
    scene.fieldValues ??= {};
    for (const field of this.element.querySelectorAll("[data-template-field]")) {
      const editor = field.querySelector("prose-mirror, textarea, input");
      if (editor) scene.fieldValues[field.dataset.templateField] = editor.value ?? editor.textContent ?? "";
    }
    scene.updatedAt = new Date().toISOString();
    this.board = await this.store.save(this.board);
  }

  async #addObjectToScene() {
    const scene = this.#selectedScene();
    if (!scene) return;
    const objectType = this.element.querySelector("[data-object-field='objectType']")?.value ?? "INFORMATION";
    const title = this.element.querySelector("[data-object-field='title']")?.value ?? "";
    const foundryUuid = this.element.querySelector("[data-object-field='foundryUuid']")?.value ?? "";
    if (!title.trim()) return;
    if (ACTOR_OBJECT_TYPES.has(objectType) && !foundryUuid.trim()) {
      ui.notifications.warn(localize("MEL_STORYBOARD.NOTIFICATIONS.ActorUuidRequired"));
      return;
    }
    this.history.capture(this.board);
    const object = createBoardObject(this.board, { objectType, title, foundryUuid });
    assignObjectToScene(scene, object.id);
    this.board = await this.store.save(this.board);
  }

  async #assignExistingObject() {
    const scene = this.#selectedScene();
    const objectId = this.element.querySelector("[data-existing-object]")?.value;
    if (!scene || !objectId) return;
    this.history.capture(this.board);
    assignObjectToScene(scene, objectId);
    this.board = await this.store.save(this.board);
  }

  async #removeObjectFromScene(assignmentId) {
    const scene = this.#selectedScene();
    if (!scene || !assignmentId) return;
    this.history.capture(this.board);
    removeObjectAssignment(scene, assignmentId);
    this.board = await this.store.save(this.board);
  }

  async #handleAction(event) {
    const action = event.currentTarget.dataset.action;
    try {
      if (action === "add-scene") {
        await this.#createScene();
      } else if (action === "zoom-out") {
        this.#changeZoom(-0.1);
        return;
      } else if (action === "zoom-in") {
        this.#changeZoom(0.1);
        return;
      } else if (action === "copy-template") await this.#copySelectedTemplate();
      else if (action === "add-template-field") await this.#addTemplateField();
      else if (action === "save-template-fields") await this.#saveTemplateFields();
      else if (action === "add-object") await this.#addObjectToScene();
      else if (action === "assign-object") await this.#assignExistingObject();
      else if (action === "remove-object") await this.#removeObjectFromScene(event.currentTarget.dataset.assignmentId);
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
    if (event.currentTarget.dataset.sceneField === "templateId") {
      await this.#changeSceneTemplate(event.currentTarget.value);
      return;
    }
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
    for (const connection of this.board.connections) {
      if (connection.sourceElementId !== movedElementId && connection.targetElementId !== movedElementId) continue;
      const source = this.board.elements.find(element => element.id === connection.sourceElementId);
      const target = this.board.elements.find(element => element.id === connection.targetElementId);
      if (!source || !target) continue;
      const geometry = connectionGeometry(source, target);
      for (const node of this.element.querySelectorAll(`[data-connection-id="${connection.id}"]`)) {
        if (node.classList.contains("mel-storyboard-connection")) {
          node.setAttribute("x1", geometry.source.x);
          node.setAttribute("y1", geometry.source.y);
          node.setAttribute("x2", geometry.target.x);
          node.setAttribute("y2", geometry.target.y);
        } else if (node.classList.contains("mel-storyboard-connection-arrow")) node.setAttribute("points", geometry.arrowPoints);
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
}
