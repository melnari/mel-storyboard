import { MODULE_ID, STORE_KEY, STORE_SCHEMA_VERSION } from "./constants.js";
import { clone, createDefaultTemplate, createSceneBoard } from "./model.js";
import { validateSceneBoard } from "./validation.js";

function normalizeSceneBoard(stored) {
  if (!stored || typeof stored !== "object") return createSceneBoard();
  let board = clone(stored);
  if (board.schemaVersion === 2 && Array.isArray(board.scenes) && Array.isArray(board.elements)) {
    const statusMap = { OPEN: "OFFEN", ACTIVE: "AKTIV", SUCCESS: "ERFOLG", PARTIAL_SUCCESS: "TEILERFOLG", FAILURE: "FEHLSCHLAG", SKIPPED: "UEBERSPRUNGEN" };
    board.scenes = board.scenes.map(scene => ({ ...scene, status: statusMap[scene.status] ?? scene.status, parentId: scene.parentId ?? null }));
    board.schemaVersion = 3;
  }
  if (board.schemaVersion !== 3 && board.schemaVersion !== STORE_SCHEMA_VERSION) return createSceneBoard();
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
  board.objects = Array.isArray(board.objects) ? board.objects : [];
  board.scenes = (board.scenes ?? []).map(scene => {
    const template = board.templates.find(candidate => candidate.id === scene.templateId) ?? board.templates.find(candidate => candidate.active) ?? board.templates[0];
    return {
      ...scene,
      parentId: scene.parentId ?? null,
      templateId: scene.templateId ?? template?.id ?? null,
      templateVersion: scene.templateVersion ?? template?.version ?? 1,
      fieldValues: scene.fieldValues ?? {},
      actorAssignments: scene.actorAssignments ?? [],
      objectAssignments: scene.objectAssignments ?? []
    };
  });
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
    const normalized = normalizeSceneBoard(board);
    const result = validateSceneBoard(normalized);
    if (!result.valid) throw new Error(`Scene board validation failed: ${result.errors.join(" ")}`);
    return this.save(normalized);
  }
}
