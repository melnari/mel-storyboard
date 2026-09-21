# Mel-Storyboard

Mel-Storyboard is a Foundry Virtual Tabletop 14.x module for Game Masters who plan branching adventures visually. It provides a Foundry-native scene board for arranging Scenes, documenting their content, and connecting them into a directed or bilateral flow.

## Current version

`0.2.1`

The current release organizes the Scene board into Chapters. Storyline and separate template-management features are not part of the active user interface.

## Requirements

- Foundry Virtual Tabletop 14.x. The module is verified against Foundry `14.368`.
- A Game Master user for editing the board.
- No additional runtime modules or external services are required.

Mel-Storyboard is system-independent. It uses Foundry users, world settings, document permissions, and native Foundry document links. It does not require a separate account, login, server, or external application.

## Opening the Storyboard

The Storyboard can be opened through:

- the module entry in Foundry Game Settings;
- the Storyboard icon in the Foundry Scene Controls;
- the `Ctrl+Alt+S` keybinding.

The application is a Foundry-native window and cannot be detached into a separate window.

## Scene board

The interface consists of three areas:

- A collapsible navigation tree on the left. The active root is named `Story`; Chapters contain their Scenes with display IDs and titles. A second root named `Archive` contains archived Chapters only, with their Scenes nested below them.
- A central canvas with a grid and the Scene Cards of the selected Chapter.
- A collapsible inspector on the right for Chapter Details, Scene Details, or Connection Details.

The expanded navigation and inspector columns are sized for comfortable editing. Both columns can be collapsed independently. Hover a Chapter or Scene entry for two seconds to display its complete title below the entry; long titles wrap without changing the normal tree layout.

Chapters receive sequential names such as `Chapter 1`, `Chapter 2`, and so on. Active Chapters can be reordered by dragging them in the Story tree. Scenes can be reordered within a Chapter or dragged between active Chapters. Right-clicking the Story root creates a Chapter. Right-clicking an active Chapter opens Chapter Details, creates Entry or Exit nodes, archives the Chapter, or deletes the Chapter after confirmation. Archiving moves the complete Chapter, including its Scenes, Scene Cards, Scene Connections, Entry/Exit nodes, and Chapter-node links, to the end of the Archive. Right-clicking an archived Chapter offers Restore; restoring moves it to the end of the Story hierarchy. All Chapters may be archived. Deleting a Chapter removes its Scenes, Scene Cards, Scene Connections, and Chapter-node links.

Each Chapter can contain multiple editable Entry and Exit nodes. Entry and Exit nodes can be moved on the canvas like Scene Cards. Chapter links are created through a node context menu and connect an Exit node in one Chapter to an Entry node in another Chapter. Scene Connections remain restricted to Scenes within the same Chapter, with the additional valid paths Entry → Scene and Scene → Exit.

Scene Cards display the title, description, display ID, and status. Rich-text markup is removed from the compact description preview while readable line breaks are retained. The preview uses the full inner card width and is limited to ten rendered lines; longer text ends with `...` on the last visible line. Cards can be resized below the description's natural height; text that no longer fits is shortened with `...`, while the full description remains available in Scene Details. Titles and descriptions wrap to the available card width, including after manual resizing.

Scene Details also provide a localized `Scene shape` selector. The default `Standard scene` uses the existing rounded card. `Decision` uses the same readable rectangular card with a diamond marker in the header, `Event` renders a parallelogram with wider side margins, and `Challenge` renders a double-framed card. The selected shape is stored with the Scene and is reflected in the live canvas and SVG, PNG, and PDF exports. Connections continue to follow the visible shape boundary.

Scene Cards do not open a separate detail window on double-click. Select a Scene Card to use the right-side Scene Details inspector for editing.

The optional world setting `Use status-based coloring` is disabled by default. When enabled, Scene Card backgrounds use readable pastel colors for Open, Waiting, Active, Success, Partial Success, Failure, Skipped, Completed, and Unfinished. Completed uses the Waiting color and Unfinished uses the Skipped color. The same coloring is included in SVG, PNG, and PDF exports. When disabled, the existing neutral card color scheme is retained.

The optional world setting `Show Icons on Scene` is disabled by default. When enabled, Scene Details provides a localized `Type` selector containing Foundry's Map Notes entry icons plus `None` (without `Custom`). The selected icon is shown in the lower-right corner of the Scene Card and is included in SVG, PNG, and PDF exports. Changing the selector updates the Scene Card immediately; selecting `None` or disabling the setting hides the icon, while the selected type remains saved. The selector stores the original Foundry icon key, so changing the interface language does not change existing assignments.

When `Use status-based coloring` is also enabled, Scene Icons use a status-specific high-contrast foreground color. Open uses white; Waiting, Active, Success, Partial Success, Failure, and Skipped use dark colors suited to their pastel card backgrounds. In the neutral card color scheme, Scene Icons are always white. Player Character names shown on hover remain white on every status color.

Player Characters assigned to a Scene are shown as small artwork tokens at the bottom of the card. Hovering a token shows the Actor name. A Player Character token can be dragged to another Scene Card to move the assignment.

## Scene actions

- Create a Scene from the left navigation or the canvas context menu. New Scenes receive sequential names such as `Scene 1`, `Scene 2`, and so on.
- Select a Scene to open its Scene Details in the right inspector.
- Edit the title, status, and description in Scene Details and save the changes.
- Right-click a Scene Card to connect or delete it.
- Right-click an empty canvas area to create a Scene. Right-click a Chapter in the tree to append a new Scene to that Chapter.
- Duplicate Scenes as independent Scene and Scene Card records.
- Move Scene Cards by dragging with the left mouse button.
- Drag a Scene to another Chapter in the navigation tree. Connections that would cross the Chapter boundary are removed automatically and a warning is shown.
- Click the canvas background to clear the current selection.
- Pan the canvas by dragging its background with the left mouse button.
- Zoom with the `+` and `-` toolbar buttons or the mouse wheel.
- Undo and redo changes from the toolbar or with the usual keyboard shortcuts.

## Connections

Connections can be created in two ways:

1. Choose the connection action from a Scene context menu and select the target Scene.
2. Press and hold the middle mouse button on a Scene Card, drag to another Scene Card, and release.

The same middle-button drag interaction creates an Entry → Scene or Scene → Exit connection. Invalid endpoint directions and cross-Chapter connections are rejected. Moving a Scene to another Chapter automatically removes affected Connections so the board remains valid.

Click a Connection to open Connection Details in the right inspector. The following fields and actions are available:

- Connection Label;
- Connection Type;
- Connection Status (`not used`, `used`, or `repeatedly used`); the line and arrows use the selected status color, while the label remains in the neutral standard color;
- Rich Text Description using Foundry's editor;
- Save button;
- independent Object assignments through Drag & Drop.

The available Connection Types are:

- `unilateral` — one arrow in the source-to-target direction;
- `unilateral deactivated` — one direction shown as a dotted connection;
- `bilateral` — symmetrical arrows in both directions;
- `bilateral deactivated` — symmetrical dotted connection with arrows in both directions.

Scene statuses are `Open`, `Waiting`, `Active`, `Success`, `Partial Success`, `Failure`, `Skipped`, `Completed`, and `Unfinished`. A right-click on a Player Character token removes that assignment from the current Scene while leaving the shared Foundry Object available elsewhere.

The Connection Details Object list supports the same Details, Note, and Delete actions as Scene Objects. Connection Objects are assigned directly to the Connection and do not need to be assigned to either Scene.

Right-clicking a Connection provides the delete action. Connection Labels are edited in Connection Details rather than through the context menu.

## Foundry Object links

Foundry documents can be dragged onto a Scene Card or Connection. The module supports:

- Actors, including Player Characters and NPCs;
- Items;
- Journals, Journal Pages, and links to headings within Journal Pages;
- Scenes;
- Rollable Tables;
- Macros;
- Playlists;
- individual Playlist tracks (`PlaylistSound`).

Assigned Objects show their title, artwork or icon, type, and optional note. The title links back to the corresponding Foundry document. Existing Foundry Journal links can be dragged onto a Scene, including direct Journal Page links and heading anchors such as `@UUID[JournalEntry...JournalEntryPage...#heading-id]{Heading}`. The complete UUID including the optional anchor is preserved in JSON and graphic-board data. Clicking such a link opens the native Journal view and focuses the selected page or heading when available. Foundry Scenes are opened with their native `View` behavior for the GM. Individual Playlist tracks retain their embedded `PlaylistSound` UUID and open the native Foundry Playlist sidebar with the parent Playlist expanded and the linked track brought into view; the separate track configuration is not opened.

Object Details provide the document type, title, UUID, Foundry document type, and a Foundry-compatible Rich Text note editor. Notes are stored on the assignment, so a note can be maintained independently for each Scene or Connection assignment.

## Import and export

The `Import/Export` menu provides:

- JSON import;
- JSON export;
- SVG export;
- PNG export;
- PDF export.

Before exporting, choose the entire Storyboard, the current Chapter, or selected Chapters. JSON remains one editable board export. For graphic exports containing multiple Chapters, each Chapter is isolated to its own graphic: SVG and PNG create one file per Chapter, while PDF creates one Chapter per page. This prevents Chapter layouts from overlapping when different Chapters use the same canvas coordinates. During import, choose whether to replace the entire Storyboard, add the imported content as new Chapters, or add the first imported Chapter to an existing Chapter. Older JSON boards without Chapters are migrated automatically into `Chapter 1`.

JSON preserves the editable board data, including Chapter order and archived state, Entry and Exit nodes, Scenes, Scene Card positions and sizes, statuses, descriptions, Connections, Chapter links, Connection Types, Connection Status, labels, descriptions, and linked Objects.

SVG, PNG, and PDF exports contain the visual Scene board, including Scene Card text, statuses, optional Scene icons, Connection labels, arrows, bilateral Connections, Entry/Exit nodes, and dotted deactivated Connections. Scene icon assets are embedded into graphic exports so the downloaded SVG remains self-contained and the icons are retained when rendering PNG or PDF output. HTML formatting tags are not included in the Scene Card description text.

Imported boards are validated and normalized. Older Connections without the current Connection fields default to `unilateral`. Unsupported schema versions are rejected with an error instead of replacing the board with empty data.

## Storage and permissions

The board is stored in a Foundry world setting. Editing is restricted to the GM. Foundry document access remains subject to Foundry's own permissions and document availability.

The module adds two world settings under `Mel-Storyboard`:

- `Use status-based coloring`, disabled by default;
- `Show Icons on Scene`, disabled by default.

Both settings are GM-restricted. Disabling either setting hides its visual effect while retaining the saved Scene data.

## Languages

The module uses English (`en`) as its default and fallback language and includes:

- German (`de`);
- French (`fr`);
- Spanish (`es`);
- Dutch (`nl`).

User-authored Scene, Connection, and Object content is not automatically translated.

## Limitations and troubleshooting

- Scene-to-Scene Connections are limited to a single Chapter. Moving a Scene between Chapters removes affected cross-Chapter Connections and displays a warning.
- Chapter links are separate from Scene Connections and use Exit-to-Entry routing between different Chapters.
- Graphic exports are generated per Chapter when more than one Chapter is selected, so identical Scene Card coordinates cannot cause overlap between Chapters.
- Foundry document links require the referenced document to remain available to the current user. A deleted or inaccessible document cannot be opened from the board.
- Individual Playlist tracks open in the native Playlist sidebar. The track configuration sheet is intentionally not opened.

If the module does not appear after an update, reload the world after confirming that `Mel-Storyboard` is enabled in Module Management. For functional problems, reproduce the issue as a GM and report it with the Foundry version, module version, browser console error, and a minimal description at the [GitHub issue tracker](https://github.com/melnari/mel-storyboard/issues).

## Support and asset credits

For questions, bug reports, and feature requests, use the [GitHub repository](https://github.com/melnari/mel-storyboard) or its [issue tracker](https://github.com/melnari/mel-storyboard/issues).

The module does not bundle third-party artwork or audio assets. Scene and Object artwork is read from the user's Foundry documents and remains subject to the permissions and licenses of those documents. The module source is distributed under the Apache License 2.0.

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

For the architecture, data model, Foundry interfaces, event flows, maintenance guidance, and manual test matrix, see the [technical documentation](TECHNICAL_DOCUMENTATION.md).

## License

Code and project material are distributed under the Apache License 2.0. See [LICENSE](LICENSE).

Parts of this module were created with AI assistance. The maintainer reviews, tests, maintains, develops, and supports the code and is responsible for its quality, compatibility, licensing, and continued development.
