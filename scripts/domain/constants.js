export const MODULE_ID = "mel-storyboard";
export const STORE_KEY = "sceneBoard";
export const STORE_SCHEMA_VERSION = 5;

export const STATUS = Object.freeze({
  OFFEN: "OFFEN",
  WAITING: "WAITING",
  AKTIV: "AKTIV",
  ERFOLG: "ERFOLG",
  TEILERFOLG: "TEILERFOLG",
  FEHLSCHLAG: "FEHLSCHLAG",
  UEBERSPRUNGEN: "UEBERSPRUNGEN"
});

export const STATUS_COLOR_SETTING = "statusColors";

export const STATUS_COLOR_CLASSES = Object.freeze({
  OFFEN: "open",
  WAITING: "waiting",
  AKTIV: "active",
  ERFOLG: "success",
  TEILERFOLG: "partial-success",
  FEHLSCHLAG: "failure",
  UEBERSPRUNGEN: "skipped"
});

export const ELEMENT_TYPES = Object.freeze(["SCENE"]);

export const CHAPTER_NODE_TYPES = Object.freeze(["ENTRY", "EXIT"]);

export const OBJECT_TYPES = Object.freeze([
  "PLAYER_CHARACTER", "NPC", "GROUP", "FACTION", "PLACE", "ITEM", "INFORMATION", "EVENT", "JOURNAL", "FOUNDRY_SCENE", "ROLLABLE_TABLE", "MACRO", "PLAYLIST"
]);

export const CONNECTION_TYPES = Object.freeze([
  "FLOW", "DECISION", "SUCCESS", "PARTIAL_SUCCESS", "FAILURE", "INFORMATION", "DEPENDENCY", "PARALLEL", "OPTIONAL", "CUSTOM"
]);

export const CONNECTION_DISPLAY_TYPES = Object.freeze([
  "unilateral", "unilateral deactivated", "bilateral", "bilateral deactivated"
]);
