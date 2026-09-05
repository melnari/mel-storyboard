import { createBoardTemplate, createTemplateVersion } from "../domain/model.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

function localize(key) {
  return game.i18n?.localize(key) ?? key;
}

export class TemplateManagementApplication extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "mel-storyboard-template-management",
    classes: ["mel-storyboard", "standard-form"],
    position: { width: 820, height: 720 },
    window: { resizable: true }
  };

  static PARTS = { body: { template: "modules/mel-storyboard/templates/template-management.hbs" } };

  _canDetach() {
    return false;
  }

  constructor(options = {}) {
    super(options);
    this.store = game.melStoryboard.store;
    this.board = this.store.read();
  }

  async _prepareContext() {
    this.board = this.store.read();
    const referencedTemplateIds = new Set(this.board.scenes.map(scene => scene.templateId).filter(Boolean));
    const templates = this.board.templates.map(template => ({
      ...template,
      label: template.name?.trim() || localize(template.nameKey),
      scopeLabel: localize(`MEL_STORYBOARD.LABELS.${template.scope === "board" ? "BoardTemplate" : "GlobalTemplate"}`),
      referenced: referencedTemplateIds.has(template.id),
      canDelete: template.scope === "board" && !referencedTemplateIds.has(template.id),
      fields: (template.fields ?? []).map(field => ({ ...field, label: field.label?.trim() || localize(field.labelKey) }))
    }));
    return {
      templates,
      labels: {
        title: localize("MEL_STORYBOARD.UI.TemplateManagement"),
        newTemplate: localize("MEL_STORYBOARD.ACTIONS.NewTemplate"),
        copyTemplate: localize("MEL_STORYBOARD.ACTIONS.CopyTemplate"),
        saveTemplate: localize("MEL_STORYBOARD.ACTIONS.SaveTemplate"),
        addTemplateField: localize("MEL_STORYBOARD.ACTIONS.AddTemplateField"),
        deleteTemplate: localize("MEL_STORYBOARD.ACTIONS.DeleteTemplate"),
        templateFields: localize("MEL_STORYBOARD.LABELS.TemplateFields"),
        templateName: localize("MEL_STORYBOARD.LABELS.TemplateName"),
        version: localize("MEL_STORYBOARD.LABELS.TemplateVersion"),
        scope: localize("MEL_STORYBOARD.LABELS.Scope"),
        referenced: localize("MEL_STORYBOARD.LABELS.TemplateReferenced"),
        noTemplates: localize("MEL_STORYBOARD.EMPTY.NoTemplates")
      }
    };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    this.element.querySelectorAll("[data-action]").forEach(button => button.addEventListener("click", event => this.#handleAction(event)));
  }

  async #handleAction(event) {
    try {
      const action = event.currentTarget.dataset.action;
      if (action === "new-template") await this.#newTemplate();
      else if (action === "copy-template") await this.#copyTemplate(event.currentTarget.dataset.templateId);
      else if (action === "save-template") await this.#saveTemplate(event.currentTarget.dataset.templateId);
      else if (action === "add-template-field") await this.#addTemplateField(event.currentTarget.dataset.templateId);
      else if (action === "delete-template") await this.#deleteTemplate(event.currentTarget.dataset.templateId);
      await this.render({ force: true });
    } catch (error) {
      console.error("[mel-storyboard]", error);
      ui.notifications.error(error.message ?? String(error));
    }
  }

  async #newTemplate() {
    const source = this.board.templates.find(template => template.active) ?? this.board.templates[0];
    if (!source) return;
    await this.#copyTemplate(source.id);
  }

  async #copyTemplate(templateId) {
    const source = this.board.templates.find(template => template.id === templateId);
    if (!source) return;
    const sourceName = source.name?.trim() || localize(source.nameKey);
    const name = window.prompt(localize("MEL_STORYBOARD.PROMPTS.TemplateCopyName"), `${sourceName} (${localize("MEL_STORYBOARD.LABELS.Copy")})`);
    if (name === null || !name.trim()) return;
    createBoardTemplate(this.board, source.id, { name });
    this.board = await this.store.save(this.board);
  }

  async #saveTemplate(templateId) {
    const source = this.board.templates.find(template => template.id === templateId);
    const card = [...this.element.querySelectorAll("[data-template-card]")].find(candidate => candidate.dataset.templateId === templateId);
    if (!source || !card) return;
    const name = card.querySelector("[data-template-name]")?.value?.trim() ?? "";
    const fields = (source.fields ?? []).map(field => {
      const input = [...card.querySelectorAll("[data-template-field-label]")].find(candidate => candidate.dataset.fieldKey === field.stableKey);
      return { ...field, label: input?.value?.trim() || field.label || localize(field.labelKey) };
    });
    if (name === (source.name ?? "") && JSON.stringify(fields) === JSON.stringify(source.fields ?? [])) return;
    createTemplateVersion(this.board, source.id, { name, fields });
    this.board = await this.store.save(this.board);
  }

  async #addTemplateField(templateId) {
    const source = this.board.templates.find(template => template.id === templateId);
    if (!source) return;
    const key = window.prompt(localize("MEL_STORYBOARD.PROMPTS.TemplateFieldKey"));
    if (key === null || !key.trim()) return;
    const stableKey = key.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (!stableKey || source.fields.some(field => field.stableKey === stableKey)) return;
    const label = window.prompt(localize("MEL_STORYBOARD.PROMPTS.TemplateFieldLabel"), key.trim());
    if (label === null || !label.trim()) return;
    createTemplateVersion(this.board, source.id, {
      fields: [...source.fields, { stableKey, label: label.trim(), fieldType: "rich-text", required: false, sortOrder: (source.fields.length + 1) * 10 }]
    });
    this.board = await this.store.save(this.board);
  }

  async #deleteTemplate(templateId) {
    const template = this.board.templates.find(candidate => candidate.id === templateId);
    if (!template || template.scope !== "board") return;
    if (this.board.scenes.some(scene => scene.templateId === templateId)) {
      ui.notifications.warn(localize("MEL_STORYBOARD.NOTIFICATIONS.TemplateInUse"));
      return;
    }
    if (!window.confirm(localize("MEL_STORYBOARD.PROMPTS.DeleteTemplate"))) return;
    this.board.templates = this.board.templates.filter(candidate => candidate.id !== templateId);
    this.board.updatedAt = new Date().toISOString();
    this.board = await this.store.save(this.board);
  }
}
