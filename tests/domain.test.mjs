import test from "node:test";
import assert from "node:assert/strict";
import { CONNECTION_TYPES, STATUS } from "../scripts/domain/constants.js";
import { HistoryStack } from "../scripts/domain/history.js";
import { assignActorToScene, assignObjectToConnection, assignObjectToScene, copySceneElements, createBoardObject, createBoardTemplate, createChapter, createChapterConnection, createChapterNode, createConnection, createScene, createSceneBoard, createSceneElement, createTemplateVersion, duplicateSceneElements, migrateSceneTemplate, moveObjectAssignment, moveSceneToChapter, pasteSceneElements, previewTemplateMigration, removeConnection, removeObjectAssignment, removeObjectFromConnection, updateConnection, updateObjectAssignment } from "../scripts/domain/model.js";
import { sceneBoardToJson, sceneBoardToSvg, scopeSceneBoard } from "../scripts/domain/export.js";
import { connectionGeometry } from "../scripts/domain/geometry.js";
import { SceneBoardStore } from "../scripts/domain/scene-board-store.js";
import { validateSceneBoard } from "../scripts/domain/validation.js";
import { plainTextFromHtml, sceneElementPresentation } from "../scripts/domain/scene-card.js";

test("new scene boards contain only scene-oriented records", () => {
  const board = createSceneBoard();
  assert.equal(board.chapters.length, 1);
  assert.equal(board.chapters[0].title, "Chapter 1");
  assert.equal(board.scenes.length, 0);
  assert.equal(board.elements.length, 0);
  assert.equal(board.connections.length, 0);
  assert.equal(board.templates.length, 1);
  assert.equal("projects" in board, false);
  assert.equal(validateSceneBoard(board).valid, true);
});

test("chapters contain scenes and restrict scene connections to one chapter", () => {
  const board = createSceneBoard();
  const secondChapter = createChapter(board, { title: "Chapter 2" });
  const firstScene = createScene(board, { title: "First", chapterId: board.chapters[0].id });
  const secondScene = createScene(board, { title: "Second", chapterId: secondChapter.id });
  const firstElement = createSceneElement(board, { sceneId: firstScene.id });
  const secondElement = createSceneElement(board, { sceneId: secondScene.id });
  assert.throws(() => createConnection(board, firstElement.id, secondElement.id), /chapter/);
  moveSceneToChapter(board, secondScene.id, board.chapters[0].id);
  assert.doesNotThrow(() => createConnection(board, firstElement.id, secondElement.id));
  assert.equal(validateSceneBoard(board).valid, true);
});

test("chapter entry and exit nodes can link different chapters", () => {
  const board = createSceneBoard();
  const secondChapter = createChapter(board, { title: "Chapter 2" });
  const exit = createChapterNode(board, board.chapters[0].id, { nodeType: "EXIT", title: "Leave" });
  const entry = createChapterNode(board, secondChapter.id, { nodeType: "ENTRY", title: "Arrive" });
  const connection = createChapterConnection(board, exit.id, entry.id, "Next chapter");
  assert.equal(connection.label, "Next chapter");
  assert.equal(board.chapterConnections.length, 1);
  assert.equal(validateSceneBoard(board).valid, true);
});

test("entry and exit nodes can connect to scenes in their own chapter", () => {
  const board = createSceneBoard();
  const chapterId = board.chapters[0].id;
  const scene = createScene(board, { title: "Middle", chapterId });
  const element = createSceneElement(board, { sceneId: scene.id });
  const entry = createChapterNode(board, chapterId, { nodeType: "ENTRY" });
  const exit = createChapterNode(board, chapterId, { nodeType: "EXIT" });
  assert.doesNotThrow(() => createConnection(board, entry.id, element.id, "unilateral", "", "CHAPTER_NODE", "SCENE"));
  assert.doesNotThrow(() => createConnection(board, element.id, exit.id, "unilateral", "", "SCENE", "CHAPTER_NODE"));
  assert.throws(() => createConnection(board, exit.id, element.id, "unilateral", "", "CHAPTER_NODE", "SCENE"), /Entry/);
  assert.equal(validateSceneBoard(board).valid, true);
});

test("moving a scene removes connections that would cross chapter boundaries", () => {
  const board = createSceneBoard();
  const sourceChapter = board.chapters[0];
  const targetChapter = createChapter(board, { title: "Chapter 2" });
  const first = createScene(board, { title: "First", chapterId: sourceChapter.id });
  const second = createScene(board, { title: "Second", chapterId: sourceChapter.id });
  const firstElement = createSceneElement(board, { sceneId: first.id });
  const secondElement = createSceneElement(board, { sceneId: second.id });
  const connection = createConnection(board, firstElement.id, secondElement.id);
  const entry = createChapterNode(board, sourceChapter.id, { nodeType: "ENTRY" });
  const exit = createChapterNode(board, sourceChapter.id, { nodeType: "EXIT" });
  const entryConnection = createConnection(board, entry.id, secondElement.id, "unilateral", "", "CHAPTER_NODE", "SCENE");
  const exitConnection = createConnection(board, firstElement.id, exit.id, "unilateral", "", "SCENE", "CHAPTER_NODE");
  const result = moveSceneToChapter(board, second.id, targetChapter.id);
  assert.deepEqual(result.removedConnections.map(item => item.id), [connection.id, entryConnection.id]);
  assert.deepEqual(board.connections.map(item => item.id), [exitConnection.id]);
  assert.equal(validateSceneBoard(board).valid, true);
});

test("moving a scene onto another scene preserves the requested order", () => {
  const board = createSceneBoard();
  const first = createScene(board, { title: "First" });
  const second = createScene(board, { title: "Second" });
  const third = createScene(board, { title: "Third" });
  moveSceneToChapter(board, third.id, first.chapterId, 0);
  assert.deepEqual(board.scenes.map(scene => scene.title), ["Third", "First", "Second"]);
});

test("scenes get stable UUIDs and unique visible IDs", () => {
  const board = createSceneBoard();
  const first = createScene(board, { title: "First" });
  const second = createScene(board, { title: "Second" });
  assert.notEqual(first.id, second.id);
  assert.deepEqual([first.displayId, second.displayId], ["S-001", "S-002"]);
  assert.equal(first.notes, "");
});

test("scene status values use the approved domain keys", () => {
  const board = createSceneBoard();
  const scene = createScene(board);
  assert.deepEqual(Object.values(STATUS), ["OFFEN", "WAITING", "AKTIV", "ERFOLG", "TEILERFOLG", "FEHLSCHLAG", "UEBERSPRUNGEN"]);
  assert.equal(scene.status, STATUS.OFFEN);
});

test("scene card descriptions strip rich-text HTML while keeping readable breaks", () => {
  assert.equal(plainTextFromHtml("<p><strong>First</strong> line</p><p>Second&nbsp;&amp; line<br>continues</p>"), "First line\nSecond & line\ncontinues");
  const presentation = sceneElementPresentation(createSceneElement(createSceneBoard(), {}), { title: "Scene", description: "<p><em>Readable</em> card text</p>" });
  assert.deepEqual(presentation.descriptionLines, ["Readable card text"]);
  assert.equal(presentation.descriptionLines.some(line => /<[^>]+>/.test(line)), false);
});

test("templates support board copies, versions, previews, and confirmed migrations", () => {
  const board = createSceneBoard();
  const scene = createScene(board);
  const source = board.templates[0];
  const copy = createBoardTemplate(board, source.id, { name: "Board scene" });
  const version = createTemplateVersion(board, copy.id, { fields: [...copy.fields, { stableKey: "newField", labelKey: "MEL_STORYBOARD.TEMPLATES.GENERAL.Notes", fieldType: "rich-text", required: false, sortOrder: 80 }] });
  const preview = previewTemplateMigration(scene, source, version);
  assert.equal(copy.scope, "board");
  assert.equal(version.version, 2);
  assert.deepEqual(preview.added, ["newField"]);
  assert.throws(() => migrateSceneTemplate(board, scene.id, version.id), /explicit confirmation/);
  migrateSceneTemplate(board, scene.id, version.id, { confirmed: true });
  assert.equal(scene.templateId, version.id);
  assert.equal(scene.templateVersion, version.version);
  assert.equal(scene.fieldValues.newField, "");
  assert.equal(validateSceneBoard(board).valid, true);
});

test("scene objects use typed records and Foundry UUID references", () => {
  const board = createSceneBoard();
  const scene = createScene(board);
  const actor = createBoardObject(board, { objectType: "NPC", title: "Keeper", foundryUuid: "Actor.keeper" });
  const assignment = assignObjectToScene(scene, actor.id);
  assert.equal(actor.foundryUuid, "Actor.keeper");
  assert.equal(scene.objectAssignments[0].objectId, actor.id);
  updateObjectAssignment(scene, assignment.id, { notes: "Only appears in the opening scene." });
  assert.equal(scene.objectAssignments[0].notes, "Only appears in the opening scene.");
  assert.throws(() => createBoardObject(board, { objectType: "NPC", title: "Missing UUID" }), /Actor UUID/);
  removeObjectAssignment(scene, assignment.id);
  assert.equal(scene.objectAssignments.length, 0);
  assert.equal(validateSceneBoard(board).valid, true);
});

test("player character assignments can be moved between scenes", () => {
  const board = createSceneBoard();
  const source = createScene(board, { title: "Source" });
  const target = createScene(board, { title: "Target" });
  const character = createBoardObject(board, { objectType: "PLAYER_CHARACTER", title: "Hero", foundryUuid: "Actor.hero", image: "hero.webp" });
  const assignment = assignObjectToScene(source, character.id, "PRESENT", "Keep this note");
  const moved = moveObjectAssignment(board, character.id, source.id, target.id);
  assert.equal(moved.id, assignment.id);
  assert.equal(source.objectAssignments.length, 0);
  assert.equal(target.objectAssignments[0].objectId, character.id);
  assert.equal(target.objectAssignments[0].notes, "Keep this note");
  assert.equal(validateSceneBoard(board).valid, true);
});

test("duplicating scenes creates new scene and element records", () => {
  const board = createSceneBoard();
  const scene = createScene(board, { title: "Original scene" });
  const element = createSceneElement(board, { sceneId: scene.id, title: scene.title });
  const result = duplicateSceneElements(board, [element.id]);
  assert.equal(result.duplicates.length, 1);
  assert.equal(board.scenes.length, 2);
  assert.notEqual(result.duplicates[0].sceneId, scene.id);
  assert.notEqual(result.duplicates[0].id, element.id);
  assert.equal(validateSceneBoard(board).valid, true);
});

test("copy and paste assigns new scene and element UUIDs and keeps internal links", () => {
  const board = createSceneBoard();
  const first = createScene(board, { title: "First" });
  const second = createScene(board, { title: "Second" });
  const firstElement = createSceneElement(board, { sceneId: first.id });
  const secondElement = createSceneElement(board, { sceneId: second.id });
  createConnection(board, firstElement.id, secondElement.id);
  const payload = copySceneElements(board, [firstElement.id, secondElement.id]);
  const result = pasteSceneElements(board, payload);
  assert.equal(result.duplicates.length, 2);
  assert.equal(result.copiedConnections.length, 1);
  assert.equal(board.scenes.length, 4);
  assert.equal(board.connections.length, 2);
  assert.equal(validateSceneBoard(board).valid, true);
});

test("connections are directed and reject duplicates", () => {
  const board = createSceneBoard();
  const first = createSceneElement(board, { sceneId: createScene(board).id });
  const second = createSceneElement(board, { sceneId: createScene(board).id });
  const connection = createConnection(board, first.id, second.id, CONNECTION_TYPES.SUCCESS);
  assert.equal(connection.sourceElementId, first.id);
  assert.equal(connection.targetElementId, second.id);
  assert.throws(() => createConnection(board, first.id, second.id), /already exists/);
});

test("connections support labels and place an explicit arrow before the target", () => {
  const board = createSceneBoard();
  const first = createSceneElement(board, { sceneId: createScene(board).id });
  const second = createSceneElement(board, { sceneId: createScene(board).id });
  first.position = { x: 100, y: 100 };
  second.position = { x: 500, y: 100 };
  const connection = createConnection(board, first.id, second.id, CONNECTION_TYPES.FLOW, "Weiter");
  const geometry = connectionGeometry(first, second);
  assert.equal(connection.label, "Weiter");
  assert.match(geometry.arrowPoints, /,/);
  assert.ok(geometry.target.x < second.position.x);
  assert.ok(geometry.source.x > first.position.x + first.size.width);
  const svg = sceneBoardToSvg(board);
  assert.match(svg, /class="connection-arrow"/);
  assert.match(svg, /Weiter/);
});

test("bilateral connection geometry ends symmetrically at both arrow tips", () => {
  const board = createSceneBoard();
  const first = createSceneElement(board, { sceneId: createScene(board).id });
  const second = createSceneElement(board, { sceneId: createScene(board).id });
  first.position = { x: 100, y: 100 };
  second.position = { x: 500, y: 100 };
  const geometry = connectionGeometry(first, second, { bilateral: true });
  assert.equal(geometry.source.x, 292);
  assert.equal(geometry.target.x, 488);
  assert.equal(geometry.arrowPoints.split(" ")[0], `${geometry.target.x},${geometry.target.y}`);
  assert.equal(geometry.reverseArrowPoints.split(" ")[0], `${geometry.source.x},${geometry.source.y}`);
  assert.ok(geometry.reverseArrowPoints);
});

test("connections support display types, descriptions, and independent object assignments", () => {
  const board = createSceneBoard();
  const first = createSceneElement(board, { sceneId: createScene(board).id });
  const second = createSceneElement(board, { sceneId: createScene(board).id });
  const object = createBoardObject(board, { objectType: "INFORMATION", title: "Connection clue" });
  const connection = createConnection(board, first.id, second.id);
  assert.equal(connection.connectionType, "unilateral");
  assert.deepEqual(connection.objectAssignments, []);
  const assignment = assignObjectToConnection(connection, object.id, "clue", "Only relevant for this transition.");
  updateConnection(connection, { label: "Branch", connectionType: "bilateral deactivated", description: "A disabled two-way transition." });
  assert.equal(connection.label, "Branch");
  assert.equal(connection.connectionType, "bilateral deactivated");
  assert.equal(connection.description, "A disabled two-way transition.");
  assert.equal(connection.objectAssignments[0].id, assignment.id);
  removeObjectFromConnection(connection, assignment.id);
  assert.equal(connection.objectAssignments.length, 0);
  const svg = sceneBoardToSvg(board);
  assert.match(svg, /stroke-dasharray="2 7"/);
  assert.equal((svg.match(/class="connection-arrow"/g) ?? []).length, 2);
  assert.equal(validateSceneBoard(board).valid, true);
});

test("JSON export and import preserve connection data and normalize legacy connections", async () => {
  const board = createSceneBoard();
  const firstScene = createScene(board, { title: "First" });
  const secondScene = createScene(board, { title: "Second" });
  const firstElement = createSceneElement(board, { sceneId: firstScene.id });
  const secondElement = createSceneElement(board, { sceneId: secondScene.id });
  const object = createBoardObject(board, { objectType: "INFORMATION", title: "Transition object" });
  const connection = createConnection(board, firstElement.id, secondElement.id, "bilateral deactivated", "Both ways");
  connection.description = "Connection description";
  assignObjectToConnection(connection, object.id, "context", "Connection-only note");
  const exported = JSON.parse(sceneBoardToJson(board));
  assert.equal(exported.connections[0].connectionType, "bilateral deactivated");
  assert.equal(exported.connections[0].description, "Connection description");
  assert.equal(exported.connections[0].objectAssignments[0].objectId, object.id);

  const stored = {};
  const settings = {
    get: () => board,
    set: async (_moduleId, _key, value) => { stored.board = value; }
  };
  const previousGame = globalThis.game;
  globalThis.game = { user: { isGM: true } };
  try {
    const imported = await new SceneBoardStore(settings).import(exported);
    assert.equal(imported.connections[0].connectionType, "bilateral deactivated");
    assert.equal(imported.connections[0].objectAssignments.length, 1);
    const legacy = structuredClone(exported);
    delete legacy.connections[0].description;
    delete legacy.connections[0].objectAssignments;
    legacy.connections[0].connectionType = "FLOW";
    const normalizedLegacy = await new SceneBoardStore(settings).import(legacy);
    assert.equal(normalizedLegacy.connections[0].connectionType, "unilateral");
    assert.equal(normalizedLegacy.connections[0].description, "");
    assert.deepEqual(normalizedLegacy.connections[0].objectAssignments, []);
    await assert.rejects(() => new SceneBoardStore(settings).import({ schemaVersion: 999 }), /Unsupported scene board schema version/);
  } finally {
    if (previousGame === undefined) delete globalThis.game;
    else globalThis.game = previousGame;
  }
});

test("connections can be removed without removing their scenes", () => {
  const board = createSceneBoard();
  const first = createSceneElement(board, { sceneId: createScene(board).id });
  const second = createSceneElement(board, { sceneId: createScene(board).id });
  const connection = createConnection(board, first.id, second.id);
  removeConnection(board, connection.id);
  assert.equal(board.connections.length, 0);
  assert.equal(board.scenes.length, 2);
  assert.equal(validateSceneBoard(board).valid, true);
});

test("history supports undo and redo snapshots", () => {
  const history = new HistoryStack();
  const initial = { value: 1 };
  const changed = { value: 2 };
  history.capture(initial);
  assert.deepEqual(history.undo(changed), initial);
  assert.deepEqual(history.redo(initial), changed);
});

test("Actor assignments keep Foundry UUIDs instead of copying Actor data", () => {
  const board = createSceneBoard();
  const scene = createScene(board);
  const assignment = assignActorToScene(scene, "Actor.test-uuid", "INFORMATION_SOURCE");
  assert.equal(assignment.actorUuid, "Actor.test-uuid");
  assert.equal(scene.actorAssignments.length, 1);
});

test("scene board exports are suitable for file transport", () => {
  const board = createSceneBoard();
  const scene = createScene(board, { title: "Export scene", description: "A description that is included in the exported scene card." });
  scene.status = STATUS.ERFOLG;
  createSceneElement(board, { sceneId: scene.id, title: scene.title });
  assert.match(sceneBoardToJson(board), /Export scene/);
  const svg = sceneBoardToSvg(board, { scene: "Scene", status: status => status });
  assert.match(svg, /^<svg /);
  assert.match(svg, /element-description/);
  assert.match(svg, /element-id/);
  assert.match(svg, /text-anchor="end"/);
  assert.match(svg, /element-status-badge/);
  const coloredSvg = sceneBoardToSvg(board, { scene: "Scene", status: status => status, statusColors: true });
  assert.match(coloredSvg, /status-open/);
  assert.match(coloredSvg, /#313846/);
});

test("chapter-scoped graphic exports isolate chapter content", () => {
  const board = createSceneBoard();
  const secondChapter = createChapter(board, { title: "Second chapter" });
  const firstScene = createScene(board, { title: "First chapter scene", chapterId: board.chapters[0].id });
  const secondScene = createScene(board, { title: "Second chapter scene", chapterId: secondChapter.id });
  createSceneElement(board, { sceneId: firstScene.id });
  createSceneElement(board, { sceneId: secondScene.id });
  const firstChapterSvg = sceneBoardToSvg(scopeSceneBoard(board, [board.chapters[0].id]));
  const secondChapterSvg = sceneBoardToSvg(scopeSceneBoard(board, [secondChapter.id]));
  assert.match(firstChapterSvg, /First chapter scene/);
  assert.doesNotMatch(firstChapterSvg, /Second chapter scene/);
  assert.match(secondChapterSvg, /Second chapter scene/);
  assert.doesNotMatch(secondChapterSvg, /First chapter scene/);
});
