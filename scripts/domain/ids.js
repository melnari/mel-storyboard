export function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, character => {
    const random = Math.random() * 16 | 0;
    const value = character === "x" ? random : (random & 0x3 | 0x8);
    return value.toString(16);
  });
}

export function nextDisplayId(items, prefix) {
  const used = new Set(items.map(item => item.displayId).filter(Boolean));
  let number = 1;
  while (used.has(`${prefix}-${String(number).padStart(3, "0")}`)) number += 1;
  return `${prefix}-${String(number).padStart(3, "0")}`;
}

