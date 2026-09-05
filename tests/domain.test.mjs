import test from "node:test";
import assert from "node:assert/strict";
import { CONNECTION_TYPES } from "../scripts/domain/constants.js";
import { HistoryStack } from "../scripts/domain/history.js";
import { assignActorToScene, copyMapElements, createConnection, createMapElement, createProject, createStoryScene, duplicateMapElements, pasteMapElements } from "../scripts/domain/model.js";
import { projectToJson, projectToSvg } from "../scripts/domain/export.js";
import { validateProject } from "../scripts/domain/validation.js";

test("new projects contain one map and one standard template", () => {
  const project = createProject({ title: "Test project" });
  assert.equal(project.maps.length, 1);
  assert.equal(project.templates.length, 1);
  assert.equal(project.maps[0].projectId, project.id);
  assert.equal(validateProject(project).valid, true);
});

test("story scenes get stable UUIDs and unique visible IDs", () => {
  const project = createProject({ title: "Test project" });
  const first = createStoryScene(project);
  const second = createStoryScene(project);
  assert.notEqual(first.id, second.id);
  assert.deepEqual([first.displayId, second.displayId], ["S-001", "S-002"]);
});

test("duplicating elements copies only internal connections", () => {
  const project = createProject({ title: "Test project" });
  const map = project.maps[0];
  const first = createMapElement(map, { title: "First" });
  const second = createMapElement(map, { title: "Second" });
  const outside = createMapElement(map, { title: "Outside" });
  createConnection(map, first.id, second.id, CONNECTION_TYPES.FLOW);
  createConnection(map, second.id, outside.id, CONNECTION_TYPES.DEPENDENCY);
  const result = duplicateMapElements(map, [first.id, second.id]);
  assert.equal(result.duplicates.length, 2);
  assert.equal(result.copiedConnections.length, 1);
  assert.equal(map.connections.length, 3);
  assert.equal(validateProject(project).valid, true);
});

test("copy and paste assigns new map element UUIDs and keeps internal links", () => {
  const project = createProject({ title: "Clipboard project" });
  const sourceMap = project.maps[0];
  const targetMap = { ...project.maps[0], id: "target-map", elements: [], connections: [] };
  const first = createMapElement(sourceMap, { title: "First" });
  const second = createMapElement(sourceMap, { title: "Second" });
  createConnection(sourceMap, first.id, second.id);
  const payload = copyMapElements(sourceMap, [first.id, second.id]);
  const result = pasteMapElements(targetMap, payload);
  assert.equal(result.duplicates.length, 2);
  assert.equal(result.copiedConnections.length, 1);
  assert.ok(result.duplicates.every(element => element.mapId === targetMap.id));
  assert.ok(result.copiedConnections.every(connection => connection.mapId === targetMap.id));
});

test("validation reports broken scene references", () => {
  const project = createProject({ title: "Test project" });
  const map = project.maps[0];
  createMapElement(map, { entityId: "missing-scene", elementType: "SCENE" });
  const result = validateProject(project);
  assert.equal(result.valid, false);
  assert.match(result.errors[0], /missing scene/);
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
  const project = createProject({ title: "Actor project" });
  const scene = createStoryScene(project);
  const assignment = assignActorToScene(scene, "Actor.test-uuid", "INFORMATION_SOURCE");
  assert.equal(assignment.actorUuid, "Actor.test-uuid");
  assert.equal(scene.actorAssignments.length, 1);
});

test("project exports are deterministic enough for file transport", () => {
  const project = createProject({ title: "Export project" });
  assert.match(projectToJson(project), /Export project/);
  assert.match(projectToSvg(project), /^<svg /);
});
