# Mel-Storyboard

Mel-Storyboard is a Foundry Virtual Tabletop 14.x module for Game Masters who plan branching adventures visually. It provides a Foundry-native scene board for arranging Scenes, documenting their content, and connecting them into a directed or bilateral flow.

## Current version

`0.0.7`

The current release organizes the Scene board into Chapters. Storyline and separate template-management features are not part of the active user interface.

## Requirements

- Foundry Virtual Tabletop 14.x. The module is verified against Foundry `14.360`.
- A Game Master user for editing the board.

Mel-Storyboard is system-independent. It uses Foundry users, world settings, document permissions, and native Foundry document links. It does not require a separate account, login, server, or external application.

## Opening the Storyboard

The Storyboard can be opened through:

- the module entry in Foundry Game Settings;
- the Storyboard icon in the Foundry Scene Controls;
- the `Ctrl+Alt+S` keybinding.

The application is a Foundry-native window and cannot be detached into a separate window.

## Scene board

The interface consists of three areas:

- A collapsible navigation tree on the left. The root is named `Story`; Chapters contain their Scenes with display IDs and titles.
- A central canvas with a grid and the Scene Cards of the selected Chapter.
- A collapsible inspector on the right for Chapter Details, Scene Details, or Connection Details.

Chapters receive sequential names such as `Chapter 1`, `Chapter 2`, and so on. Chapters can be reordered by dragging them in the tree. Scenes can be reordered within a Chapter or dragged between Chapters. Right-clicking the Story root creates a Chapter. Right-clicking a Chapter opens Chapter Details, creates Entry or Exit nodes, or deletes the Chapter after confirmation. Deleting a Chapter removes its Scenes, Scene Cards, Scene Connections, and Chapter-node links.

Each Chapter can contain multiple editable Entry and Exit nodes. Chapter links are created through a node context menu and connect an Exit node in one Chapter to an Entry node in another Chapter. Scene Connections remain restricted to Scenes within the same Chapter.

Scene Cards display the title, description, display ID, and status. Their width and height adapt to their content and can also be resized manually. Text wraps when the card is resized.

The optional world setting `Use status-based coloring` is disabled by default. When enabled, Scene Card backgrounds use readable pastel colors for Open, Waiting, Active, Success, Partial Success, Failure, and Skipped. The same coloring is included in SVG, PNG, and PDF exports. When disabled, the existing neutral card color scheme is retained.

Player Characters assigned to a Scene are shown as small artwork tokens at the bottom of the card. Hovering a token shows the Actor name. A Player Character token can be dragged to another Scene Card to move the assignment.

## Scene actions

- Create a Scene from the left navigation or the canvas context menu. New Scenes receive sequential names such as `Scene 1`, `Scene 2`, and so on.
- Select a Scene to open its Scene Details in the right inspector.
- Edit the title, status, and description in Scene Details and save the changes.
- Double-click a Scene Card to open its focused Scene Details window with its note field.
- Right-click a Scene Card to connect or delete it.
- Duplicate Scenes as independent Scene and Scene Card records.
- Move Scene Cards by dragging with the left mouse button.
- Click the canvas background to clear the current selection.
- Pan the canvas by dragging its background with the left mouse button.
- Zoom with the `+` and `-` toolbar buttons or the mouse wheel.
- Undo and redo changes from the toolbar or with the usual keyboard shortcuts.

## Connections

Connections can be created in two ways:

1. Choose the connection action from a Scene context menu and select the target Scene.
2. Press and hold the middle mouse button on a Scene Card, drag to another Scene Card, and release.

Click a Connection to open Connection Details in the right inspector. The following fields and actions are available:

- Connection Label;
- Connection Type;
- Rich Text Description using Foundry's editor;
- Save button;
- independent Object assignments through Drag & Drop.

The available Connection Types are:

- `unilateral` — one arrow in the source-to-target direction;
- `unilateral deactivated` — one direction shown as a dotted connection;
- `bilateral` — symmetrical arrows in both directions;
- `bilateral deactivated` — symmetrical dotted connection with arrows in both directions.

Scene statuses are `Open`, `Waiting`, `Active`, `Success`, `Partial Success`, `Failure`, and `Skipped`.

The Connection Details Object list supports the same Details, Note, and Delete actions as Scene Objects. Connection Objects are assigned directly to the Connection and do not need to be assigned to either Scene.

Right-clicking a Connection provides the delete action. Connection Labels are edited in Connection Details rather than through the context menu.

## Foundry Object links

Foundry documents can be dragged onto a Scene Card or Connection. The module supports:

- Actors, including Player Characters and NPCs;
- Items;
- Journals and Journal Pages;
- Scenes;
- Rollable Tables;
- Macros;
- Playlists.

Assigned Objects show their title, artwork or icon, type, and optional note. The title links back to the corresponding Foundry document. Foundry Scenes are opened with their native `View` behavior for the GM.

Object Details provide the document type, title, UUID, Foundry document type, and a Foundry-compatible Rich Text note editor. Notes are stored on the assignment, so a note can be maintained independently for each Scene or Connection assignment.

## Import and export

The `Import/Export` menu provides:

- JSON import;
- JSON export;
- SVG export;
- PNG export;
- PDF export.

Before exporting, choose the entire Storyboard, the current Chapter, or selected Chapters. During import, choose whether to replace the entire Storyboard, add the imported content as new Chapters, or add the first imported Chapter to an existing Chapter. Older JSON boards without Chapters are migrated automatically into `Chapter 1`.

JSON preserves the editable board data, including Chapters, Entry and Exit nodes, Scenes, Scene Card positions and sizes, statuses, descriptions, Connections, Chapter links, Connection Types, labels, descriptions, and linked Objects.

SVG, PNG, and PDF exports contain the visual Scene board, including Scene Card text, statuses, Connection labels, arrows, bilateral Connections, and dotted deactivated Connections.

Imported boards are validated and normalized. Older Connections without the current Connection fields default to `unilateral`. Unsupported schema versions are rejected with an error instead of replacing the board with empty data.

## Storage and permissions

The board is stored in a Foundry world setting. Editing is restricted to the GM. Foundry document access remains subject to Foundry's own permissions and document availability.

## Languages

The module uses English (`en`) as its default and fallback language and includes:

- German (`de`);
- French (`fr`);
- Spanish (`es`);
- Dutch (`nl`).

User-authored Scene, Connection, and Object content is not automatically translated.

## Installation

The module can be installed from its manifest URL:

```text
https://raw.githubusercontent.com/melnari/mel-storyboard/main/module.json
```

It can also be installed manually by placing the repository in:

```text
Data/modules/mel-storyboard/
```

Enable `Mel-Storyboard` in the Foundry module management screen and reload the world.

## Development

The repository has no runtime package dependencies. Run the automated checks from the project directory:

```text
npm test
npm run check
```

The checks cover domain behavior, import/export data handling, Connection geometry, JavaScript syntax, manifest paths, JSON files, and localization keys.

## License

Code and project material are distributed under the Apache License 2.0. See [LICENSE](LICENSE).

Parts of this module were created with AI assistance. The maintainer reviews, tests, maintains, develops, and supports the code and is responsible for its quality, compatibility, licensing, and continued development.
