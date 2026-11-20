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
    this.onClose = options.onClose;
    this.readOnly = Boolean(options.readOnly);
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
      readOnly: this.readOnly,
      labels
    };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const title = this.element.querySelector(".window-title");
    if (title) title.textContent = localize("MEL_STORYBOARD.ACTIONS.ObjectDetails");
    const editButton = this.element.querySelector("[data-action='edit-note']");
    if (editButton) {
      editButton.hidden = this.readOnly;
      editButton.disabled = this.readOnly;
      editButton.addEventListener("click", () => this.#startNoteEdit());
    }
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
    if (this.readOnly || !this.onSave || this.editingNote) return;
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
      globalThis.ui?.notifications?.error?.("MEL_STORYBOARD.ERRORS.NoteEditor", { localize: true });
      return;
    }

    // The application may have been closed while the asynchronous editor
    // factory was running. Do not retain an orphaned EditorView in that case.
    if (generation !== this.noteEditorGeneration || !this.editingNote || !editorShell.isConnected || this.readOnly || !this.onSave) {
      editor.destroy();
      if (generation === this.noteEditorGeneration && this.readOnly && editorShell.isConnected) {
        this.editingNote = false;
        this.element.querySelector("[data-note-editor-section]")?.setAttribute("hidden", "");
        this.element.querySelector("[data-note-view]")?.removeAttribute("hidden");
      }
      return;
    }

    this.noteEditor = editor;
    this.noteDirty = false;
    editor.view.dom.addEventListener("input", () => { this.noteDirty = true; });
    editor.view.focus();
  }

  async setReadOnly(readOnly) {
    this.readOnly = Boolean(readOnly);
    const editButton = this.element?.querySelector("[data-action='edit-note']");
    if (editButton) {
      editButton.hidden = this.readOnly;
      editButton.disabled = this.readOnly;
    }
    this.noteEditor?.view?.setProps?.({ editable: () => !this.readOnly });
    this.noteEditorShell?.querySelectorAll("button, input, select, [role='button']").forEach(control => {
      if (this.readOnly) {
        if (control.dataset.preReadOnlyDisabled === undefined) control.dataset.preReadOnlyDisabled = String(control.disabled ?? false);
        if (control.dataset.preReadOnlyAriaDisabled === undefined) control.dataset.preReadOnlyAriaDisabled = control.getAttribute("aria-disabled") ?? "";
        if ("disabled" in control) control.disabled = true;
        control.setAttribute("aria-disabled", "true");
      } else {
        if (control.dataset.preReadOnlyDisabled !== undefined) {
          if ("disabled" in control) control.disabled = control.dataset.preReadOnlyDisabled === "true";
          delete control.dataset.preReadOnlyDisabled;
        }
        if (control.dataset.preReadOnlyAriaDisabled !== undefined) {
          const previousValue = control.dataset.preReadOnlyAriaDisabled;
          if (previousValue) control.setAttribute("aria-disabled", previousValue);
          else control.removeAttribute("aria-disabled");
          delete control.dataset.preReadOnlyAriaDisabled;
        }
      }
    });
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
    if (this.readOnly || !this.onSave || this.savingNote) {
      if (this.readOnly) globalThis.ui?.notifications?.warn?.(localize("MEL_STORYBOARD.NOTIFICATIONS.EditorAccessChanged"));
      return;
    }
    this.savingNote = true;
    try {
      const notes = this.#getEditorValue();
      await this.onSave(notes);
      this.assignmentNotes = notes;
      this.noteDirty = false;
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
      this.bringToFront();
    } catch (error) {
      console.error("[mel-storyboard] Could not save storyboard object notes", error);
      globalThis.ui?.notifications?.error?.(error.message ?? localize("MEL_STORYBOARD.ERRORS.NoteEditor"));
    } finally {
      this.savingNote = false;
    }
  }

  async #resolveUnsavedNote() {
    if (!this.noteDirty) return true;
    const dialog = document.createElement("dialog");
    dialog.className = "mel-storyboard-unsaved-dialog";
    const heading = document.createElement("h2");
    heading.textContent = localize("MEL_STORYBOARD.DIALOGS.UnsavedChanges");
    const message = document.createElement("p");
    message.textContent = localize("MEL_STORYBOARD.DIALOGS.UnsavedChangesPrompt");
    const actions = document.createElement("footer");
    actions.className = "mel-storyboard-unsaved-dialog-actions";
    const choices = [
      ...(!this.readOnly ? [["save", localize("MEL_STORYBOARD.ACTIONS.SaveChanges")]] : []),
      ["discard", localize("MEL_STORYBOARD.ACTIONS.DiscardChanges")],
      ["cancel", localize("MEL_STORYBOARD.ACTIONS.KeepWindowOpen")]
    ];
    for (const [choice, label] of choices) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.choice = choice;
      button.textContent = label;
      actions.append(button);
    }
    dialog.append(heading, message, actions);
    this.element.append(dialog);
    const choice = await new Promise(resolve => {
      const finish = value => { dialog.close(); dialog.remove(); resolve(value); };
      actions.addEventListener("click", event => {
        const button = event.target.closest("button[data-choice]");
        if (button) finish(button.dataset.choice);
      });
      dialog.addEventListener("cancel", event => { event.preventDefault(); finish("cancel"); });
      dialog.showModal();
    });
    if (choice === "cancel") return false;
    if (choice === "discard") {
      this.noteDirty = false;
      return true;
    }
    if (choice === "save") {
      await this.#save();
      return !this.noteDirty;
    }
    return false;
  }

  async close(options = {}) {
    if (!options.force && !await this.#resolveUnsavedNote()) return this;
    this.#destroyNoteEditor();
    this.editingNote = false;
    return super.close(options);
  }

  async _onClose(options) {
    this.#destroyNoteEditor();
    this.onClose?.();
    return super._onClose(options);
  }
}
