export const MODULE_ID = "mel-storyboard";
export const STORE_KEY = "sceneBoard";
export const STORE_SCHEMA_VERSION = 4;

export const STATUS = Object.freeze({
  OFFEN: "OFFEN",
  AKTIV: "AKTIV",
  ERFOLG: "ERFOLG",
  TEILERFOLG: "TEILERFOLG",
  FEHLSCHLAG: "FEHLSCHLAG",
  UEBERSPRUNGEN: "UEBERSPRUNGEN"
});

export const ELEMENT_TYPES = Object.freeze(["SCENE"]);

export const OBJECT_TYPES = Object.freeze([
  "PLAYER_CHARACTER", "NPC", "GROUP", "FACTION", "PLACE", "ITEM", "INFORMATION", "EVENT"
]);

export const CONNECTION_TYPES = Object.freeze([
  "FLOW", "DECISION", "SUCCESS", "PARTIAL_SUCCESS", "FAILURE", "INFORMATION", "DEPENDENCY", "PARALLEL", "OPTIONAL", "CUSTOM"
]);
