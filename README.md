# Mel-Storyboard

Mel-Storyboard is a Foundry Virtual Tabletop module for planning branching stories and adventures on a visual scene board. Scenes are arranged in chapters, connected on a canvas, enriched with Foundry document links, and tracked with statuses, notes, icons, and player-character assignments.

## Release and compatibility

- Current version: `1.0.0`
- Minimum Foundry VTT version: `14`
- Verified Foundry VTT version: `14.370`
- Supported languages: English, German, French, Spanish, and Dutch
- License: Apache License 2.0

The module is system-independent and has no external service or runtime package dependency.

## Installation

Install from the module manifest:

```text
https://raw.githubusercontent.com/melnari/mel-storyboard/main/module.json
```

Alternatively, place the repository in:

```text
Data/modules/mel-storyboard/
```

Enable `Mel-Storyboard` in Foundry's Module Management and reload the world.

## Access model

Mel-Storyboard is a GM tool. Players do not receive access to the module.

- The full Game Master designated by Foundry as `game.users.activeGM` can edit and save the shared Storyboard.
- Assistant Game Masters can open the Storyboard in read-only mode.
- Other full Game Masters are also read-only while another full Game Master is designated active.
- Read-only users can navigate the board, open Foundry links, and export it, but cannot modify board data or save their window view.
- The module does not use browser locks, edit leases, heartbeats, or a second login/session system.

## Opening the Storyboard

The application can be opened or toggled through:

- the `Storyboard` entry in Foundry Game Settings;
- the Storyboard button in the Foundry Scene Controls;
- the default `Alt+S` keybinding.

`Alt+S` opens the application when it is closed and closes it when it is open. The application is a resizable Foundry window and cannot be detached.

While the active full GM's Foundry client remains open, the module remembers the Storyboard window position and size, zoom, active chapter, selected element, expanded tree entries, Archive state, and collapsed sidebars. This view state is held in memory only. After restarting Foundry or the GM session, the normal initial view is used. Read-only view changes are temporary.

## User interface

The application has three areas:

1. The left navigation tree contains the active `Story` hierarchy and the `Archive`.
2. The center canvas displays the selected chapter, its Scene Cards, Entry/Exit nodes, and connections.
3. The right inspector displays `Details` for the selected scene, chapter, or connection.

The sidebar and inspector can be collapsed independently. The desktop layout uses a 275 px navigation column and a 380 px inspector column when both are expanded. The application follows Foundry's active Light/Dark theme for backgrounds, typography, controls, links, status indicators, and exported graphics.

The navigation tree shows every chapter and scene as a two-line entry: title on the first line and display ID plus status below it. The selected entry is highlighted as a complete row. Hold the pointer over a chapter or scene for two seconds to show its complete title.

## Chapters and Archive

`Story` is the root for active chapters. `Archive` is a second root containing archived chapters only. Chapters contain scenes, Scene Cards, Entry/Exit nodes, and chapter links.

- New chapters are named `Chapter 1`, `Chapter 2`, and so on.
- New scenes are named `Scene 1`, `Scene 2`, and so on.
- Chapters can be expanded, collapsed, and reordered by drag and drop.
- Scenes can be reordered within a chapter or dragged to another chapter.
- Right-clicking the Story root creates a chapter.
- Right-clicking a chapter opens Details, creates a scene, creates Entry/Exit nodes, archives the chapter, or deletes it.
- Archiving moves the complete chapter to the end of the Archive. All chapters may be archived.
- Right-clicking an archived chapter restores it to the end of the active Story hierarchy.
- Deleting a chapter requires confirmation and removes its scenes, Scene Cards, local connections, Entry/Exit nodes, and chapter links.
- The last remaining chapter cannot be deleted.

Moving a scene to another chapter removes any Scene Connections that would cross the chapter boundary and displays a warning. The scene is then appended to the target chapter unless it is dropped on another scene, in which case it is inserted at that position.

## Scenes and Scene Cards

Select a scene in the tree or on the canvas to edit it in the right-side `Details` inspector. Double-clicking a Scene Card does not open a separate detail window.

Scene Details contain:

- Title;
- Status;
- Scene shape;
- optional Scene icon type;
- full rich-text Description;
- assigned Foundry Objects and assignment notes.

The Scene Card displays the title, display ID, status, optional icon, player-character tokens, and connections. In Detailed mode it also displays a plain-text description preview. Rich-text tags are removed from the preview, readable line breaks are retained, and the preview is limited to ten rendered lines. If the card is too small for the complete preview, the last visible line ends with `...`. The full Description in Scene Details is never changed by this preview rule.

Titles wrap to the available card width, including after manual resizing. Scene Cards can be moved and resized with the mouse. Resizing stores a locked visual size; the card still wraps and truncates text to fit that size.

### Scene shapes

The Scene Details `Scene shape` selector offers:

- `Standard scene`: rounded rectangular card;
- `Decision`: detailed cards use a rectangular card with a diamond marker; compact cards use a flat diamond;
- `Event`: parallelogram with slanted sides;
- `Challenge`: rounded card with a double frame.

The selected shape is stored with the scene. Connection endpoints are calculated against the visible shape boundary, including the parallelogram and compact diamond. All shapes are used consistently in the canvas and SVG, PNG, and PDF exports.

### Detailed and Compact scenes

The world setting `Scene display` is global and defaults to `Detailed scenes`.

`Detailed scenes` display the description preview in addition to the title, ID, status, icons, player-character tokens, and connections.

`Compact scenes` omit descriptions from Scene Cards but retain titles, IDs, statuses, icons, player-character tokens, and connections. Standard, Event, and Challenge shapes remain available. A compact Decision scene is a flat diamond with a centered title, a centered ID in the upper area, status, and available icons/tokens inside the shape. Compact decision titles are limited to two lines and use `...` when shortened; the Scene Details description remains complete.

### Statuses and coloring

Scenes and chapters support these statuses:

| Status | Meaning |
|---|---|
| `Open` | `OFFEN` |
| `Waiting` | `WAITING` |
| `Active` | `AKTIV` |
| `Success` | `ERFOLG` |
| `Partial success` | `TEILERFOLG` |
| `Failure` | `FEHLSCHLAG` |
| `Skipped` | `UEBERSPRUNGEN` |
| `Completed` | `ABGESCHLOSSEN` |
| `Unfinished` | `UNERLEDIGT` |

The world setting `Use status-based coloring` is disabled by default. When enabled, Scene Cards use readable pastel status colors. `Completed` uses the `Waiting` color and `Unfinished` uses the `Skipped` color. The navigation tree remains in the neutral theme; status coloring does not recolor the left tree. When the setting is disabled, the default card color scheme is retained.

### Scene icons and player characters

The world setting `Show Icons on Scene` is disabled by default. When enabled, Scene Details contains a localized `Type` dropdown based on Foundry's `CONFIG.JournalEntry.noteIcons`. It contains `None` plus the available Map Notes entry icons and no `Custom` entry. The stored icon key is language-independent. The selected icon is shown on the lower-right of normal cards and centered at the bottom of compact Decision diamonds. `None` hides the icon; disabling the setting hides it without deleting the saved selection.

Scene icons are included in SVG, PNG, and PDF exports. With status coloring enabled, icons use a contrasting status-specific color; icons in the default neutral scheme are white.

Objects of type `Player character` assigned to a scene are shown as small artwork tokens on the Scene Card. A token can be dragged to another Scene Card to move its assignment. Right-clicking a player-character token removes the assignment from the current scene without deleting the underlying Foundry Object.

## Connections and chapter links

### Scene Connections

Scene Connections are restricted to a single chapter. Valid endpoint combinations are:

- Scene → Scene;
- Entry → Scene;
- Scene → Exit.

Connections can be created by:

- right-clicking a Scene Card and choosing the connection action;
- right-clicking an Entry or Exit node and choosing the compatible source/target action;
- dragging with the middle mouse button from one endpoint to another.

The domain validation rejects self-connections, invalid Entry/Exit directions, duplicate connections, and cross-chapter connections.

Each Scene Connection has:

- a title/label;
- a connection type;
- a connection status;
- a rich-text description;
- independent Foundry Object assignments.

Connection types are:

- `unilateral`;
- `unilateral deactivated` (dotted);
- `bilateral`;
- `bilateral deactivated` (dotted in both directions).

Connection statuses are:

- `not used` (default neutral presentation);
- `used` (green line and arrows);
- `repeatedly used` (dark-green line and arrows).

The connection status is independent of the connection type. Selecting a connection opens Connection Details in the right inspector. Connections can be deleted from their context menu.

### Entry/Exit and chapter links

Each chapter can contain multiple editable Entry and Exit nodes. Nodes are circles, can be renamed, and can be moved on the canvas like Scene Cards. A chapter context menu creates them; a node context menu renames or deletes them, starts a compatible Scene Connection, or links the node to another chapter node.

Chapter links are separate from Scene Connections. They connect an Exit node in one chapter to an Entry node in another chapter. A node can be linked through the context menu. Double-clicking a linked Entry or Exit node switches to the other chapter, centers the target node in the view, and briefly highlights it. Chapter links can be selected and deleted independently.

## Foundry Object links

Foundry documents can be dragged onto a Scene Card or a Scene Connection. The live drag-and-drop handler accepts:

- `Actor` – mapped to `Player character` for character actors, otherwise `NPC`;
- `Item`;
- `JournalEntry` and `JournalEntryPage`;
- `Scene`;
- `RollTable`;
- `Macro`;
- `Playlist`;
- `PlaylistSound` (individual Playlist track).

The board stores one shared Object record per Foundry UUID and an independent assignment per Scene or Connection. Assignments can hold a role and a rich-text note. The Object Details window shows the object type, title, UUID, Foundry document type, and assignment note. Notes belong to the assignment, not to the Foundry document.

Foundry links retain their UUID and display title. Journal links can target a Journal Entry, a Journal Page, or a heading anchor on a page, for example:

```text
@UUID[JournalEntry.hS70xLgbM69RW99I.JournalEntryPage.ktQMVpgbM0KkB7JU#uberschrift-1]{Überschrift 1}
```

Opening a Journal Page renders the parent Journal and selects the page; a stored heading anchor is forwarded to Foundry's Journal sheet when supported. Scene links use the native `Scene.view()` behavior. Individual Playlist-track links activate the native Playlist sidebar, expand the parent Playlist, scroll to the track, and briefly highlight it. The Playlist track configuration sheet is not opened.

## Import and export

The `Import/Export` menu provides JSON import and JSON, SVG, PNG, and PDF export.

Before an export, choose:

- the entire Storyboard;
- the current chapter;
- selected chapters.

JSON exports preserve editable board data. Graphic exports include Scene Cards, shapes, statuses, icons, player-character artwork, Entry/Exit nodes, connection lines, arrows, labels, bilateral arrows, and deactivated dotted lines. The export theme is read from the active Light/Dark theme. Scene and player-character artwork is embedded as data URLs when available so SVG, PNG, and PDF retain the images.

When more than one chapter is selected, SVG and PNG create one file per chapter and PDF creates one page per chapter. Each chapter is rendered in its own board scope so equal Scene Card coordinates cannot overlap between chapters.

JSON import offers:

- replace the entire Storyboard;
- add the imported chapters as new chapters;
- add the first imported chapter to an existing target chapter.

Merged imports receive new UUIDs and display IDs; internal scene, element, node, object, template, and connection references are remapped. Imported data is normalized and validated before it becomes the stored board. Older supported board data is normalized into the current chapter-based schema; a board without chapters receives `Chapter 1`.

## Storage and compatibility

The shared board is stored in the world setting:

```text
mel-storyboard.sceneBoard
```

The current board schema version is `5`. It contains chapters, scenes, visual Scene Elements, Scene Connections, chapter links, objects, and retained template records.

For compatibility with worlds containing the module's private Journal storage flags, startup can read a valid board from a Journal and copy it into the world setting when the world setting is missing or empty. The world setting is then the runtime source of truth; the Journal is not used for normal reads and is not automatically deleted.

The Store validates every save and import. Only the designated active full Game Master may write. The UI and Store both enforce read-only access.

## Localization

The default language is English. The following language files are shipped and kept with the same key set:

- `lang/en.json`;
- `lang/de.json`;
- `lang/fr.json`;
- `lang/es.json`;
- `lang/nl.json`.

Interface labels, statuses, connection types, scene shapes, scene icon names, object types, prompts, notifications, and settings are localized. User-authored titles, descriptions, and notes are not machine-translated.

## Development

The repository has no runtime package dependencies. Run the checks from the repository directory:

```text
npm test
npm run check
```

`npm test` runs the Node domain and export tests. `npm run check` validates JavaScript syntax, manifest paths, JSON files, and localization-key parity.

The architecture and data model are documented in [TECHNICAL_DOCUMENTATION.md](TECHNICAL_DOCUMENTATION.md).

## Known boundaries

- Only full-GM users can edit; Assistant GMs are read-only.
- Scene Connections cannot cross chapter boundaries.
- Chapter links are only Exit → Entry between different chapters.
- Only chapters can be archived; scenes have no independent archive state.
- Foundry document links require the document to remain available to the current user.
- The application is desktop-oriented and cannot be detached.
- Template records and domain functions remain part of the compatible board schema, but template management is not exposed in the active Storyboard interface.

## Support and license

- Repository: <https://github.com/melnari/mel-storyboard>
- Issues: <https://github.com/melnari/mel-storyboard/issues>
- License: [Apache License 2.0](LICENSE)

The module does not bundle third-party artwork or audio. Artwork and audio references come from the user's Foundry documents and remain subject to their permissions and licenses.

## AI Usage Declaration

Parts of this module were created with AI assistance. The maintainer reviews, tests, maintains, develops, and supports the code and is responsible for its quality, compatibility and continued development.
