# ADR-0001: Foundry-native storage and application architecture

## Status

Accepted for the initial implementation; validate against the exact target Foundry VTT 14 build before release.

## Context

Mel Storyboard is a GM-focused, system-independent Foundry VTT module. It must support multiple projects, overview maps, story scenes, map elements, connections, templates, notes, and references without an external server or separate authentication.

Foundry has no built-in Project or Story Scene document type. The module therefore needs a namespaced domain model while using Foundry's supported settings and document APIs. Story objects and their map representations must remain separate.

## Decision

- Use the world-scoped `mel-storyboard.projects` setting as the initial GM-managed project store.
- Keep the persisted value JSON-shaped and versioned so a future migration can move large or permission-sensitive records to dedicated Foundry documents.
- Store stable technical UUIDs for every domain record and use visible IDs only for display.
- Represent a map element as a separate record containing an optional `entityId` reference to a story scene or domain object.
- Keep Actors as references to real Foundry `Actor` documents by UUID; do not copy Actor data into the project store.
- Use `ApplicationV2` with an SVG editor for the initial workspace.
- Use `game.settings`, Foundry users, and Foundry document permissions as the integration boundary. No external authentication or server is introduced.
- Keep GM-only project data in the restricted world setting and do not expose it through ordinary player-facing UI.

## Consequences

- The initial implementation is simple to install and has no runtime dependencies.
- GM-only data is not suitable for a player-facing client feature until its distribution and permission behavior have been verified in a real Foundry world.
- Large projects may require a future storage migration. The store includes a schema version to make that migration explicit.
- The exact V14 behavior of `ApplicationV2`, settings persistence, and document permission checks must be tested manually before release.

