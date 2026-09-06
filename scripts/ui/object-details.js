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
    this.noteEditorShell = null;
    this.noteEditorGeneration = 0;
    this.editingNote = false;
    this.savingNote = false;
  }

  async _prepareContext() {
    const labels = {
      objectType: localize("MEL_STORYBOARD.LABELS.ObjectType"),
      objectTitle: localize("MEL_STORYBOARD.LABELS.ObjectTitle"),
      foundryUuid: localize("MEL_STORYBOARD.LABELS.FoundryUuid"),
      foundryDocumentType: localize("MEL_STORYBOARD.LABELS.FoundryDocumentType"),
      objectNote: localize("MEL_STORYBOARD.ACTIONS.ObjectNote"),
      editPage: localize("MEL_STORYBOARD.ACTIONS.EditPage"),
      saveEntry: localize("MEL_STORYBOARD.ACTIONS.SaveEntry"),
      cancel: localize("MEL_STORYBOARD.ACTIONS.Cancel"),
      close: localize("MEL_STORYBOARD.ACTIONS.Close"),
      noNote: localize("MEL_STORYBOARD.EMPTY.NoObjectNote")
    };
    const noteHtml = this.assignmentNotes?.trim()
      ? await foundry.applications.ux.TextEditor.enrichHTML(this.assignmentNotes)
      : `<p class="mel-storyboard-object-details-no-note">${labels.noNote}</p>`;
    return {
      object: { ...this.object, foundryLinkHtml: this.foundryLinkHtml },
      assignmentNotes: this.assignmentNotes,
      assignmentNotesHtml: noteHtml,
      labels
    };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const title = this.element.querySelector(".window-title");
    if (title) title.textContent = localize("MEL_STORYBOARD.ACTIONS.ObjectDetails");
    this.element.querySelector("[data-action='edit-note']")?.addEventListener("click", () => this.#startNoteEdit());
    this.element.querySelector("[data-action='save-note']")?.addEventListener("click", () => this.#save());
    this.element.querySelector("[data-action='cancel-note']")?.addEventListener("click", () => this.#cancelNoteEdit());
    this.element.querySelector("[data-action='close']")?.addEventListener("click", () => this.close());
    this.element.querySelectorAll("[data-storyboard-foundry-link]").forEach(link => {
      link.addEventListener("click", event => this.onOpenDocument?.(event));
    });
    if (this.focusNotes) await this.#startNoteEdit();
    this.bringToFront();
  }

  /**
   * Create a local Foundry ProseMirror editor without using the
   * HTMLProseMirrorElement form-control lifecycle.
   *
   * The note belongs to the storyboard assignment, not to a Foundry
   * Document. Consequently this editor intentionally does not use a document
   * UUID or collaborative editing.
   */
  async #startNoteEdit() {
    if (this.editingNote) return;
    this.editingNote = true;
    this.element.querySelector("[data-note-view]")?.setAttribute("hidden", "");
    const editorSection = this.element.querySelector("[data-note-editor-section]");
    editorSection?.removeAttribute("hidden");
    const editorHost = this.element.querySelector("[data-note-editor]");
    if (!editorHost) return;

    const generation = ++this.noteEditorGeneration;
    const editorShell = document.createElement("div");
    editorShell.className = "editor prosemirror mel-storyboard-object-details-note-editor-shell";
    const editorTarget = document.createElement("div");
    editorTarget.className = "editor-content";
    editorShell.append(editorTarget);
    editorHost.replaceChildren(editorShell);
    this.noteEditorShell = editorShell;

    let editor;
    try {
      const { defaultSchema, plugins } = foundry.prosemirror;
      editor = await foundry.applications.ux.ProseMirrorEditor.create(
        editorTarget,
        this.assignmentNotes,
        {
          uuid: `MelStoryboard.ObjectDetails.${foundry.utils.randomID()}`,
          plugins: {
            menu: plugins.ProseMirrorMenu.build(defaultSchema, {
              destroyOnSave: false,
              onSave: () => this.#save()
            }),
            keyMaps: plugins.ProseMirrorKeyMaps.build(defaultSchema, {
              onSave: () => this.#save()
            })
          },
          props: { editable: () => true }
        }
      );
    } catch (error) {
      console.error("[mel-storyboard] Could not create note editor", error);
      this.#destroyNoteEditor();
      this.editingNote = false;
      this.element.querySelector("[data-note-editor-section]")?.setAttribute("hidden", "");
      this.element.querySelector("[data-note-view]")?.removeAttribute("hidden");
      ui.notifications?.error?.("MEL_STORYBOARD.ERRORS.NoteEditor", { localize: true });
      return;
    }

    // The application may have been closed while the asynchronous editor
    // factory was running. Do not retain an orphaned EditorView in that case.
    if (generation !== this.noteEditorGeneration || !this.editingNote || !editorShell.isConnected) {
      editor.destroy();
      return;
    }

    this.noteEditor = editor;
    editor.view.focus();
  }

  #destroyNoteEditor() {
    this.noteEditorGeneration += 1;
    this.noteEditor?.destroy();
    this.noteEditor = null;
    this.noteEditorShell?.remove();
    this.noteEditorShell = null;
  }

  #cancelNoteEdit() {
    this.#destroyNoteEditor();
    this.editingNote = false;
    this.element.querySelector("[data-note-editor-section]")?.setAttribute("hidden", "");
    this.element.querySelector("[data-note-view]")?.removeAttribute("hidden");
  }

  #getEditorValue() {
    const document = this.noteEditor?.view?.state?.doc;
    if (!document) return this.assignmentNotes;
    return foundry.prosemirror.dom.serializeString(document.content);
  }

  async #save() {
    if (this.savingNote) return;
    this.savingNote = true;
    try {
      await this.onSave?.(this.#getEditorValue());
      await this.close();
    } finally {
      this.savingNote = false;
    }
  }

  async close(options = {}) {
    this.#destroyNoteEditor();
    this.editingNote = false;
    return super.close(options);
  }
}
