import { MODULE_ID, STORE_KEY, STORE_SCHEMA_VERSION } from "./constants.js";
import { clone, createSceneBoard } from "./model.js";
import { validateSceneBoard } from "./validation.js";

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
    return clone(stored?.schemaVersion === STORE_SCHEMA_VERSION ? stored : createSceneBoard());
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
