import test from "node:test";
import assert from "node:assert/strict";
import { CONNECTION_TYPES, STATUS } from "../scripts/domain/constants.js";
import { HistoryStack } from "../scripts/domain/history.js";
import { assignActorToScene, assignObjectToConnection, assignObjectToScene, copySceneElements, createBoardObject, createBoardTemplate, createConnection, createScene, createSceneBoard, createSceneElement, createTemplateVersion, duplicateSceneElements, migrateSceneTemplate, moveObjectAssignment, pasteSceneElements, previewTemplateMigration, removeConnection, removeObjectAssignment, removeObjectFromConnection, updateConnection, updateObjectAssignment } from "../scripts/domain/model.js";
import { sceneBoardToJson, sceneBoardToSvg } from "../scripts/domain/export.js";
import { connectionGeometry } from "../scripts/domain/geometry.js";
import { validateSceneBoard } from "../scripts/domain/validation.js";

test("new scene boards contain only scene-oriented records", () => {
  const board = createSceneBoard();
  assert.equal(board.scenes.length, 0);
  assert.equal(board.elements.length, 0);
  assert.equal(board.connections.length, 0);
  assert.equal(board.templates.length, 1);
  assert.equal("projects" in board, false);
  assert.equal(validateSceneBoard(board).valid, true);
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
  assert.deepEqual(Object.values(STATUS), ["OFFEN", "AKTIV", "ERFOLG", "TEILERFOLG", "FEHLSCHLAG", "UEBERSPRUNGEN"]);
  assert.equal(scene.status, STATUS.OFFEN);
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
});
