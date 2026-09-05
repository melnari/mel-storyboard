import { MODULE_ID } from "./domain/constants.js";
import { ProjectStore, registerProjectSetting } from "./domain/project-store.js";
import { StoryboardApplication } from "./ui/application.js";

Hooks.once("init", () => {
  registerProjectSetting();
  const store = new ProjectStore();
  game.melStoryboard = {
    store,
    open: options => new StoryboardApplication(options).render({ force: true })
  };
  game.settings.registerMenu(MODULE_ID, "openDesigner", {
    name: "MEL_STORYBOARD.SETTINGS.OpenDesigner.Name",
    label: "MEL_STORYBOARD.SETTINGS.OpenDesigner.Label",
    hint: "MEL_STORYBOARD.SETTINGS.OpenDesigner.Hint",
    icon: "fas fa-diagram-project",
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
  const control = Array.isArray(controls) ? controls.find(candidate => candidate.name === "tokens") : controls.tokens;
  if (!control) return;
  control.tools ??= [];
  control.tools.push({
    name: "mel-storyboard",
    title: "MEL_STORYBOARD.SETTINGS.OpenDesigner.Label",
    icon: "fas fa-diagram-project",
    button: true,
    onChange: () => game.melStoryboard.open()
  });
});

