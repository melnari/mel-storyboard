import { MODULE_ID } from "./domain/constants.js";
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
  game.settings.registerMenu(MODULE_ID, "openDesigner", {
    name: "MEL_STORYBOARD.SETTINGS.OpenDesigner.Name",
    label: "MEL_STORYBOARD.SETTINGS.OpenDesigner.Label",
    hint: "MEL_STORYBOARD.SETTINGS.OpenDesigner.Hint",
    icon: "fas fa-sitemap",
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
    icon: "fas fa-sitemap",
    button: true,
    onChange: () => game.melStoryboard.open()
  });
});

function mountStoryboardToggle() {
  if (!game.user?.isGM || document.querySelector("[data-mel-storyboard-toggle]")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.melStoryboardToggle = "true";
  button.className = "mel-storyboard-toggle";
  button.innerHTML = `<i class="fas fa-sitemap" aria-hidden="true"></i>`;
  button.title = game.i18n.localize("MEL_STORYBOARD.SETTINGS.OpenDesigner.Label");
  button.setAttribute("aria-label", button.title);
  button.addEventListener("click", () => game.melStoryboard.toggle());
  document.body.append(button);
}

Hooks.once("ready", mountStoryboardToggle);
Hooks.on("renderSceneControls", mountStoryboardToggle);
