import { MODULE_ID, SHOW_SCENE_ICONS_SETTING, STATUS_COLOR_SETTING, STORE_KEY, UI_STATE_SETTING } from "./domain/constants.js";
import { SceneBoardStore, registerSceneBoardSetting } from "./domain/scene-board-store.js";
import { StoryboardApplication } from "./ui/application.js";

Hooks.once("init", () => {
  registerSceneBoardSetting();
  const store = new SceneBoardStore();
  game.melStoryboard = {
    store,
    application: null,
    open: options => {
      if (!game.user?.isGM) return null;
      const existing = game.melStoryboard.application;
      if (existing?.element?.isConnected || existing?.isClosing) return existing;
      game.melStoryboard.application = new StoryboardApplication(options);
      game.melStoryboard.application.render({ force: true });
      return game.melStoryboard.application;
    },
    toggle: () => {
      const application = game.melStoryboard.application;
      if (application?.element?.isConnected) void application.close();
      else game.melStoryboard.open();
    }
  };
  game.settings.register(MODULE_ID, UI_STATE_SETTING, {
    name: "Mel-Storyboard view preferences",
    scope: "user",
    config: false,
    type: Object,
    default: {}
  });
  game.settings.register(MODULE_ID, STATUS_COLOR_SETTING, {
    name: "MEL_STORYBOARD.SETTINGS.StatusColors.Name",
    hint: "MEL_STORYBOARD.SETTINGS.StatusColors.Hint",
    scope: "world",
    config: true,
    restricted: true,
    type: Boolean,
    default: false,
    onChange: () => {
      const application = game.melStoryboard?.application;
      if (application?.element?.isConnected) application.render({ force: true });
    }
  });
  game.settings.register(MODULE_ID, SHOW_SCENE_ICONS_SETTING, {
    name: "MEL_STORYBOARD.SETTINGS.ShowSceneIcons.Name",
    hint: "MEL_STORYBOARD.SETTINGS.ShowSceneIcons.Hint",
    scope: "world",
    config: true,
    restricted: true,
    type: Boolean,
    default: false,
    onChange: () => {
      const application = game.melStoryboard?.application;
      if (application?.element?.isConnected) application.render({ force: true });
    }
  });
  game.settings.registerMenu(MODULE_ID, "openDesigner", {
    name: "MEL_STORYBOARD.SETTINGS.OpenDesigner.Name",
    label: "MEL_STORYBOARD.SETTINGS.OpenDesigner.Label",
    hint: "MEL_STORYBOARD.SETTINGS.OpenDesigner.Hint",
    icon: "fa-solid fa-sitemap",
    type: StoryboardApplication,
    restricted: true
  });
  game.keybindings.register(MODULE_ID, "openDesigner", {
    name: "MEL_STORYBOARD.KEYBINDINGS.OpenDesigner.Name",
    hint: "MEL_STORYBOARD.KEYBINDINGS.OpenDesigner.Hint",
    editable: [{ key: "S", modifiers: ["CONTROL", "ALT"] }],
    restricted: true,
    onDown: () => {
      game.melStoryboard.open();
      return true;
    }
  });
});
Hooks.on("getSceneControlButtons", controls => {
  if (!game.user?.isGM) return;
  const control = Array.isArray(controls) ? controls.find(candidate => candidate.name === "tokens") : controls?.tokens;
  if (!control) return;
  control.tools ??= {};
  const order = Math.max(-1, ...Object.values(control.tools).map(tool => Number(tool.order)).filter(Number.isFinite)) + 1;
  control.tools["mel-storyboard"] = {
    name: "mel-storyboard",
    title: "MEL_STORYBOARD.SETTINGS.OpenDesigner.Label",
    icon: "fa-solid fa-sitemap",
    order,
    button: true,
    onChange: () => game.melStoryboard.toggle()
  };
});

function refreshApplicationAccess() {
  const application = game.melStoryboard?.application;
  if (application?.element?.isConnected) void application.refreshEditorAccess?.();
}

Hooks.on("updateUser", refreshApplicationAccess);
Hooks.on("userConnected", refreshApplicationAccess);
Hooks.on("updateSetting", setting => {
  if (setting?.key !== `${MODULE_ID}.${STORE_KEY}`) return;
  const application = game.melStoryboard?.application;
  if (application?.readOnly) {
    void application.refreshReadOnlyBoard().catch(error => console.warn(`[${MODULE_ID}] Could not refresh the read-only storyboard`, error));
  }
});

Hooks.once("ready", async () => {
  if (!game.user?.isGM) return;
  try {
    await game.melStoryboard.store.initialize();
    const application = game.melStoryboard?.application;
    if (application?.element?.isConnected) await application.refreshEditorAccess();
    else if (application && !application.isClosing) await application.render({ force: true });
  } catch (error) {
    console.error(`[${MODULE_ID}] Could not initialize storyboard storage`, error);
  }
});
