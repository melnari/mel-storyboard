export function isFullGamemaster(user = game.user) {
  return Number(user?.role) === Number(globalThis.CONST?.USER_ROLES?.GAMEMASTER ?? 4);
}

function activeFullGamemaster() {
  const activeGM = game.users?.activeGM;
  if (isFullGamemaster(activeGM)) return activeGM;
  const users = game.users?.contents ?? [...(game.users ?? [])];
  return users.find(user => user?.active && isFullGamemaster(user)) ?? null;
}

/**
 * Foundry normally designates one active GM. The collection fallback handles
 * startup moments where activeGM has not been resolved yet and still keeps
 * Assistant GMs read-only.
 */
export function isDesignatedGamemaster(user = game.user) {
  if (!isFullGamemaster(user) || !user?.id) return false;
  return activeFullGamemaster()?.id === user.id;
}
