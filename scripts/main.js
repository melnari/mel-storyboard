import { MODULE_ID, STATUS_COLOR_SETTING } from "./domain/constants.js";
import { SceneBoardStore, registerSceneBoardSetting } from "./domain/scene-board-store.js";
import { StoryboardApplication } from "./ui/application.js";

Hooks.once("init", () => {
  registerSceneBoardSetting();
  const store = new SceneBoardStore();
  game.melStoryboard = {
    store,
    application: null,
    open: options => {
      if (game.melStoryboard.application?.element?.isConnected) return game.melStoryboard.application;
      game.melStoryboard.application = new StoryboardApplication(options);
      game.melStoryboard.application.render({ force: true });
      return game.melStoryboard.application;
    },
    toggle: () => {
      if (game.melStoryboard.application?.element?.isConnected) {
        game.melStoryboard.application.close();
        game.melStoryboard.application = null;
      } else game.melStoryboard.open();
    }
  };
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
