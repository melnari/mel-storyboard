import test from "node:test";
import assert from "node:assert/strict";
import { CONNECTION_TYPES, STATUS } from "../scripts/domain/constants.js";
import { HistoryStack } from "../scripts/domain/history.js";
import { assignActorToScene, copySceneElements, createConnection, createScene, createSceneBoard, createSceneElement, duplicateSceneElements, pasteSceneElements, removeConnection } from "../scripts/domain/model.js";
import { sceneBoardToJson, sceneBoardToSvg } from "../scripts/domain/export.js";
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
});

test("scene status values use the approved domain keys", () => {
  const board = createSceneBoard();
  const scene = createScene(board);
  assert.deepEqual(Object.values(STATUS), ["OFFEN", "AKTIV", "ERFOLG", "TEILERFOLG", "FEHLSCHLAG", "UEBERSPRUNGEN"]);
  assert.equal(scene.status, STATUS.OFFEN);
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
  createScene(board, { title: "Export scene" });
  assert.match(sceneBoardToJson(board), /Export scene/);
  assert.match(sceneBoardToSvg(board), /^<svg /);
});
