# ADR-0001: Foundry-native scene board storage

## Status

Accepted for the initial implementation; validate against the exact target Foundry VTT 14 build before release.

## Context

Mel Storyboard is a GM-focused, system-independent Foundry VTT module. The current scope is intentionally limited to one scene board: scenes, their visual elements, directed connections, templates, and scene-related assignments. Story, Storyline, project, and map metadata are out of scope and are not part of the active data model.

## Decision

- Use the world-scoped `mel-storyboard.sceneBoard` setting as the GM-managed scene board store.
- Keep the persisted value JSON-shaped and versioned so a future migration can move large or permission-sensitive records to dedicated Foundry documents.
- Store stable technical UUIDs for scenes, visual scene elements, and connections; visible IDs are display-only.
- Keep Actors as references to real Foundry `Actor` documents by UUID; do not copy Actor data into the scene board.
- Use `ApplicationV2` with an SVG editor for the initial workspace.
- Use Foundry users, settings, and document permissions as the integration boundary. No external authentication or server is introduced.
- Do not migrate or retain the removed Story/Storyline metadata in the active store.

## Consequences

- The initial implementation is simple to install and has no runtime dependencies.
- GM-only data is not suitable for a player-facing client feature until its distribution and permission behavior have been verified in a real Foundry world.
- Large scene boards may require a future storage migration. The store includes a schema version to make that migration explicit.
- The exact V14 behavior of `ApplicationV2`, settings persistence, and document permission checks must be tested manually before release.
