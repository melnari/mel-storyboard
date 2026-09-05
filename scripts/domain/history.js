import { clone } from "./model.js";

export class HistoryStack {
  #past = [];
  #future = [];
  #limit;

  constructor(limit = 100) {
    this.#limit = limit;
  }

  capture(state) {
    this.#past.push(clone(state));
    if (this.#past.length > this.#limit) this.#past.shift();
    this.#future = [];
  }

  undo(currentState) {
    if (!this.#past.length) return null;
    this.#future.push(clone(currentState));
    return this.#past.pop();
  }

  redo(currentState) {
    if (!this.#future.length) return null;
    this.#past.push(clone(currentState));
    return this.#future.pop();
  }

  get canUndo() { return this.#past.length > 0; }
  get canRedo() { return this.#future.length > 0; }
}

