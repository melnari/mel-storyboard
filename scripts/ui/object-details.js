const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

function localize(key) {
  return game.i18n?.localize(key) ?? key;
}

export class ObjectDetailsApplication extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "mel-storyboard-object-details",
    classes: ["mel-storyboard", "standard-form"],
    position: { width: 620, height: 620 },
    window: { resizable: true }
  };

  static PARTS = { body: { template: "modules/mel-storyboard/templates/object-details.hbs" } };

  _canDetach() {
    return false;
  }

  constructor(options = {}) {
    super(options);
    this.object = options.object;
    this.assignmentNotes = options.assignmentNotes ?? "";
    this.foundryLinkHtml = options.foundryLinkHtml ?? "";
    this.onSave = options.onSave;
    this.onOpenDocument = options.onOpenDocument;
    this.focusNotes = options.focusNotes ?? false;
    this.noteEditor = null;
  }

  async _prepareContext() {
    return {
      object: { ...this.object, foundryLinkHtml: this.foundryLinkHtml },
      assignmentNotes: this.assignmentNotes,
      labels: {
        objectType: localize("MEL_STORYBOARD.LABELS.ObjectType"),
        objectTitle: localize("MEL_STORYBOARD.LABELS.ObjectTitle"),
        foundryUuid: localize("MEL_STORYBOARD.LABELS.FoundryUuid"),
        foundryDocumentType: localize("MEL_STORYBOARD.LABELS.FoundryDocumentType"),
        objectNote: localize("MEL_STORYBOARD.ACTIONS.ObjectNote"),
        save: localize("MEL_STORYBOARD.ACTIONS.Save"),
        close: localize("MEL_STORYBOARD.ACTIONS.Close")
      }
    };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const title = this.element.querySelector(".window-title");
    if (title) title.textContent = localize("MEL_STORYBOARD.ACTIONS.ObjectDetails");
    const editorHost = this.element.querySelector("[data-note-editor]");
    if (editorHost) {
      const editorInput = foundry.applications.elements.HTMLProseMirrorElement.create({
        name: "notes",
        value: this.assignmentNotes,
        editable: true,
        disabled: false,
        readonly: false,
        collaborate: false,
        height: 220,
        toggled: false
      });
      editorHost.replaceChildren(editorInput);
      this.noteEditor = editorInput;
    }
    this.element.querySelector("[data-action='save']")?.addEventListener("click", () => this.#save());
    this.element.querySelector("[data-action='close']")?.addEventListener("click", () => this.close());
    this.element.querySelectorAll("[data-storyboard-foundry-link]").forEach(link => {
      link.addEventListener("click", event => this.onOpenDocument?.(event));
    });
    if (this.focusNotes) this.noteEditor?.focus();
    this.bringToFront();
  }

  async #save() {
    const editor = this.noteEditor ?? this.element.querySelector("prose-mirror");
    editor?.save?.();
    const notes = editor?.value ?? this.assignmentNotes;
    await this.onSave?.(notes);
    await this.close();
  }
}
