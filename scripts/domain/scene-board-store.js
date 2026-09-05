import { MODULE_ID, STORE_KEY, STORE_SCHEMA_VERSION } from "./constants.js";
import { clone, createSceneBoard } from "./model.js";
import { validateSceneBoard } from "./validation.js";

function normalizeSceneBoard(stored) {
  if (!stored || typeof stored !== "object") return createSceneBoard();
  if (stored.schemaVersion === STORE_SCHEMA_VERSION) return stored;
  if (stored.schemaVersion === 2 && Array.isArray(stored.scenes) && Array.isArray(stored.elements)) {
    const statusMap = { OPEN: "OFFEN", ACTIVE: "AKTIV", SUCCESS: "ERFOLG", PARTIAL_SUCCESS: "TEILERFOLG", FAILURE: "FEHLSCHLAG", SKIPPED: "UEBERSPRUNGEN" };
    return {
      ...stored,
      schemaVersion: STORE_SCHEMA_VERSION,
      scenes: stored.scenes.map(scene => ({ ...scene, status: statusMap[scene.status] ?? scene.status, parentId: scene.parentId ?? null }))
    };
  }
  return createSceneBoard();
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
    const result = validateSceneBoard(board);
    if (!result.valid) throw new Error(`Scene board validation failed: ${result.errors.join(" ")}`);
    return this.save(board);
  }
}
