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
  UEBERSPRUNGEN: "UEBERSPRUNGEN",
  ABGESCHLOSSEN: "ABGESCHLOSSEN",
  UNERLEDIGT: "UNERLEDIGT"
});

export const STATUS_COLOR_SETTING = "statusColors";
export const SHOW_SCENE_ICONS_SETTING = "showSceneIcons";
export const SCENE_ICON_NONE = "NONE";

export const SCENE_SHAPES = Object.freeze({
  STANDARD: "STANDARD",
  DECISION: "DECISION",
  EVENT: "EVENT",
  CHALLENGE: "CHALLENGE"
});

export const SCENE_SHAPE_VALUES = Object.freeze(Object.values(SCENE_SHAPES));

export const STATUS_COLOR_CLASSES = Object.freeze({
  OFFEN: "open",
  WAITING: "waiting",
  AKTIV: "active",
  ERFOLG: "success",
  TEILERFOLG: "partial-success",
  FEHLSCHLAG: "failure",
  UEBERSPRUNGEN: "skipped",
  ABGESCHLOSSEN: "waiting",
  UNERLEDIGT: "skipped"
});

export const ELEMENT_TYPES = Object.freeze(["SCENE"]);

export const CHAPTER_NODE_TYPES = Object.freeze(["ENTRY", "EXIT"]);

export const OBJECT_TYPES = Object.freeze([
  "PLAYER_CHARACTER", "NPC", "GROUP", "FACTION", "PLACE", "ITEM", "INFORMATION", "EVENT", "JOURNAL", "FOUNDRY_SCENE", "ROLLABLE_TABLE", "MACRO", "PLAYLIST", "PLAYLIST_SOUND"
]);

export const CONNECTION_TYPES = Object.freeze([
  "FLOW", "DECISION", "SUCCESS", "PARTIAL_SUCCESS", "FAILURE", "INFORMATION", "DEPENDENCY", "PARALLEL", "OPTIONAL", "CUSTOM"
]);

export const CONNECTION_DISPLAY_TYPES = Object.freeze([
  "unilateral", "unilateral deactivated", "bilateral", "bilateral deactivated"
]);

export const CONNECTION_STATUS = Object.freeze({
  NOT_USED: "not-used",
  USED: "used",
  REPEATED_USED: "repeated-used"
});

export const CONNECTION_STATUS_VALUES = Object.freeze(Object.values(CONNECTION_STATUS));

export const CONNECTION_STATUS_CLASSES = Object.freeze({
  [CONNECTION_STATUS.NOT_USED]: "not-used",
  [CONNECTION_STATUS.USED]: "used",
  [CONNECTION_STATUS.REPEATED_USED]: "repeated-used"
});
