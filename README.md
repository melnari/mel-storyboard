# Mel Storyboard

Mel Storyboard is a Foundry VTT 14.x add-on module for the GM-focused visual planning and documentation of scenes and their directed flow.

## Current status

The project is in early development. Version `0.1.0` provides a Foundry-native scene board with scene creation, renaming, deletion, duplication, movement, directed connections, search, scene details, undo/redo, copy/paste, and JSON/SVG/PNG/PDF export.

The module deliberately has no Story or Storyline management. The active data model contains only scenes, scene board elements, directed connections, scene templates, and scene-related assignments.

## Requirements

- Foundry Virtual Tabletop 14.x.
- A GM user for scene board editing.

The module is system-independent and uses Foundry users, world settings, and document permissions. It does not provide a separate login or external server.

The scene board can be opened from the Settings menu, the left-side Storyboard toggle, or `Ctrl+Alt+S`. Right-clicking a scene opens actions for renaming, duplicating, deleting, and starting a directed connection. During connection mode, click the target scene to define the direction.

## Development

The repository intentionally has no runtime dependencies. Run the checks with:

```text
npm test
npm run check
```

The module can be installed in a Foundry data directory by placing this repository in `Data/modules/mel-storyboard/`.

## Languages

The module ships English (`en`) as the default and fallback language, plus German, French, Spanish, and Dutch. User-authored scene content is never automatically translated.

## License

Code and project material are distributed under the Apache License 2.0. See [LICENSE](LICENSE).

Parts of this module were created with AI assistance. The maintainer reviews, tests, maintains, develops, and supports the code and is responsible for its quality, compatibility, licensing, and continued development.
