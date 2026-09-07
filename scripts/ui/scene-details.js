const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

function localize(key) {
  return game.i18n?.localize(key) ?? key;
}

/**
 * A scene-focused detail card opened from a scene card double-click.
 *
 * The scene note is stored on the storyboard scene itself and is deliberately
 * separate from the scene description used on the board card.
 */
export class SceneDetailsApplication extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "mel-storyboard-scene-details",
    classes: ["mel-storyboard", "standard-form"],
    position: { width: 460, height: 620 },
    window: { resizable: true }
  };

  static PARTS = { body: { template: "modules/mel-storyboard/templates/scene-details.hbs" } };

  _canDetach() {
    return false;
  }

  constructor(options = {}) {
    super(options);
    this.scene = options.scene;
    this.assignmentNotes = options.assignmentNotes ?? "";
    this.onSave = options.onSave;
    this.noteEditor = null;
    this.noteEditorShell = null;
    this.noteEditorGeneration = 0;
    this.editingNote = false;
    this.savingNote = false;
  }

  async _prepareContext() {
    const labels = {
      note: localize("MEL_STORYBOARD.ACTIONS.ObjectNote"),
      editPage: localize("MEL_STORYBOARD.ACTIONS.EditPage"),
      noNote: localize("MEL_STORYBOARD.EMPTY.NoObjectNote")
    };
    const noteHtml = this.assignmentNotes?.trim()
      ? await foundry.applications.ux.TextEditor.enrichHTML(this.assignmentNotes)
      : `<p class="mel-storyboard-object-details-no-note">${labels.noNote}</p>`;
    return {
      scene: this.scene,
      assignmentNotes: this.assignmentNotes,
      assignmentNotesHtml: noteHtml,
      labels
    };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const title = this.element.querySelector(".window-title");
    if (title) title.textContent = localize("MEL_STORYBOARD.LABELS.SceneDetails");
    this.element.querySelector("[data-action='edit-note']")?.addEventListener("click", () => this.#startNoteEdit());
    this.#bringToFrontSoon();
  }

  #bringToFrontSoon() {
    this.bringToFront();
    globalThis.requestAnimationFrame?.(() => this.rendered && this.bringToFront());
    globalThis.setTimeout?.(() => this.rendered && this.bringToFront(), 0);
  }

  async #startNoteEdit() {
    if (this.editingNote) return;
    this.editingNote = true;
    this.element.querySelector("[data-note-view]")?.setAttribute("hidden", "");
    const editorSection = this.element.querySelector("[data-note-editor-section]");
    editorSection?.removeAttribute("hidden");
    const editorHost = this.element.querySelector("[data-note-editor]");
    if (!editorHost) {
      this.editingNote = false;
      editorSection?.setAttribute("hidden", "");
      this.element.querySelector("[data-note-view]")?.removeAttribute("hidden");
      return;
    }

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
          uuid: `MelStoryboard.SceneDetails.${foundry.utils.randomID()}`,
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
      console.error("[mel-storyboard] Could not create scene note editor", error);
      this.#destroyNoteEditor();
      this.editingNote = false;
      this.element.querySelector("[data-note-editor-section]")?.setAttribute("hidden", "");
      this.element.querySelector("[data-note-view]")?.removeAttribute("hidden");
      globalThis.ui?.notifications?.error?.("MEL_STORYBOARD.ERRORS.NoteEditor", { localize: true });
      return;
    }

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

  #getEditorValue() {
    const document = this.noteEditor?.view?.state?.doc;
    if (!document) return this.assignmentNotes;
    return foundry.prosemirror.dom.serializeString(document.content);
  }

  async #save() {
    if (this.savingNote) return;
    this.savingNote = true;
    try {
      const notes = this.#getEditorValue();
      await this.onSave?.(notes);
      this.assignmentNotes = notes;
      const noteContent = this.element.querySelector("[data-note-content]");
      if (noteContent) {
        noteContent.innerHTML = notes.trim()
          ? await foundry.applications.ux.TextEditor.enrichHTML(notes)
          : `<p class="mel-storyboard-object-details-no-note">${localize("MEL_STORYBOARD.EMPTY.NoObjectNote")}</p>`;
      }
      this.#destroyNoteEditor();
      this.editingNote = false;
      this.element.querySelector("[data-note-editor-section]")?.setAttribute("hidden", "");
      this.element.querySelector("[data-note-view]")?.removeAttribute("hidden");
      this.#bringToFrontSoon();
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
