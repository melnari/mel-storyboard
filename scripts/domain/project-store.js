import { MODULE_ID, STORE_KEY, STORE_SCHEMA_VERSION } from "./constants.js";
import { clone, createProject } from "./model.js";
import { validateProject } from "./validation.js";

export function registerProjectSetting() {
  game.settings.register(MODULE_ID, STORE_KEY, {
    name: "MEL_STORYBOARD.SETTINGS.ProjectStore.Name",
    hint: "MEL_STORYBOARD.SETTINGS.ProjectStore.Hint",
    scope: "world",
    config: false,
    type: Object,
    default: { schemaVersion: STORE_SCHEMA_VERSION, projects: [] }
  });
}

export class ProjectStore {
  constructor(settings = game.settings) {
    this.settings = settings;
  }

  #assertGM() {
    if (!game.user?.isGM) throw new Error("Only a GM may change Storyboard projects.");
  }

  readDatabase() {
    const database = this.settings.get(MODULE_ID, STORE_KEY) ?? { schemaVersion: STORE_SCHEMA_VERSION, projects: [] };
    return clone(database);
  }

  list() {
    return this.readDatabase().projects;
  }

  get(projectId) {
    return this.list().find(project => project.id === projectId) ?? null;
  }

  async save(project) {
    this.#assertGM();
    const result = validateProject(project);
    if (!result.valid) throw new Error(`Project validation failed: ${result.errors.join(" ")}`);
    const database = this.readDatabase();
    const index = database.projects.findIndex(candidate => candidate.id === project.id);
    if (index < 0) database.projects.push(clone(project));
    else database.projects[index] = clone(project);
    database.schemaVersion = STORE_SCHEMA_VERSION;
    await this.settings.set(MODULE_ID, STORE_KEY, database);
    return clone(project);
  }

  async create(title, description = "") {
    this.#assertGM();
    const project = createProject({ title, description });
    await this.save(project);
    return project;
  }

  async import(project) {
    this.#assertGM();
    const result = validateProject(project);
    if (!result.valid) throw new Error(`Project validation failed: ${result.errors.join(" ")}`);
    const database = this.readDatabase();
    if (database.projects.some(candidate => candidate.id === project.id)) {
      throw new Error("A project with this UUID already exists.");
    }
    database.projects.push(clone(project));
    await this.settings.set(MODULE_ID, STORE_KEY, database);
    return clone(project);
  }
}
