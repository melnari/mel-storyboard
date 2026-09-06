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
    this.noteEditorObserver = null;
    this.editingNote = false;
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

  async #startNoteEdit() {
    if (this.editingNote) return;
    this.editingNote = true;
    this.element.querySelector("[data-note-view]")?.setAttribute("hidden", "");
    const editorSection = this.element.querySelector("[data-note-editor-section]");
    editorSection?.removeAttribute("hidden");
    const editorHost = this.element.querySelector("[data-note-editor]");
    if (!editorHost) return;
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
    const activateEditor = () => {
      const editor = this.noteEditor;
      if (!editor) return false;
      editor.removeAttribute("disabled");
      editor.removeAttribute("readonly");
      try {
        editor.disabled = false;
        editor.editable = true;
      } catch (error) {
        console.warn("[mel-storyboard] Could not set ProseMirror editable state", error);
      }
      const proseMirror = editor.querySelector(".ProseMirror");
      if (!proseMirror) return false;
      proseMirror.contentEditable = "true";
      proseMirror.removeAttribute("aria-disabled");
      proseMirror.style.pointerEvents = "auto";
      proseMirror.style.userSelect = "text";
      proseMirror.focus();
      return true;
    };
    this.noteEditorObserver = new MutationObserver(() => {
      if (activateEditor()) this.noteEditorObserver?.disconnect();
    });
    this.noteEditorObserver.observe(this.noteEditor, { childList: true, subtree: true });
    this.noteEditor.addEventListener("open", () => {
      if (activateEditor()) this.noteEditorObserver?.disconnect();
    }, { once: true });
    queueMicrotask(activateEditor);
  }

  #cancelNoteEdit() {
    this.noteEditorObserver?.disconnect();
    this.noteEditorObserver = null;
    this.noteEditor?.remove();
    this.noteEditor = null;
    this.editingNote = false;
    this.element.querySelector("[data-note-editor-section]")?.setAttribute("hidden", "");
    this.element.querySelector("[data-note-view]")?.removeAttribute("hidden");
  }

  async #save() {
    const editor = this.noteEditor ?? this.element.querySelector("prose-mirror");
    editor?.save?.();
    const notes = editor?.value ?? this.assignmentNotes;
    await this.onSave?.(notes);
    await this.close();
  }
}
