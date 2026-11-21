# Mel-Storyboard – Technical Documentation

## 1. Purpose and current state

Mel-Storyboard is a Foundry Virtual Tabletop module for Game Masters. It provides a shared visual storyboard in which scenes are organized into chapters, placed on a canvas, described, and connected into a branching flow.

This document describes the current implementation:

- module version: 1.0.0;
- minimum Foundry VTT version: 14;
- verified Foundry VTT version in module.json: 14.370;
- English reference localization with German, French, Spanish, and Dutch translations;
- shared board storage in the world setting mel-storyboard.sceneBoard;
- current board schema: STORE_SCHEMA_VERSION = 5.
- no external runtime packages and no external service.

The application is designed for Foundry Desktop and one active editing full Game Master. It is a GM preparation and play-support tool, not a player-facing interface. It supports Foundry's native ApplicationV2 detached-window lifecycle while retaining the same Storyboard application instance and interactions.

## 2. Permissions and session model

### 2.1 Roles

Permission checks are implemented in scripts/domain/permissions.js:

- isFullGamemaster(user) accepts only CONST.USER_ROLES.GAMEMASTER.
- isDesignatedGamemaster(user) compares the user with game.users.activeGM and falls back to the first active full GM if necessary.
- game.user.isGM alone is not sufficient for write access because Assistant GMs also satisfy the general GM check.

The resulting access model is:

| User | Open storyboard | Change board data | Save board | Save view state |
|---|---:|---:|---:|---:|
| designated active full GM | yes | yes | yes | yes |
| other full GM | yes | no | no | no |
| Assistant GM | yes | no | no | no |
| player | no | no | no | no |

Read-only users may navigate, change the temporary zoom, open Foundry links, and start exports. Mutating actions, detail fields, drag and drop, import, undo/redo, and save actions are disabled. The application displays a read-only indication.

The module does not use browser locks, heartbeats, a module-owned edit lease, or a second login/session system. The designated editor is determined solely by Foundry's game.users.activeGM.

### 2.2 Application view state

game.melStoryboard.viewState is a transient client-side store for the current Foundry client session. It is updated only by the designated active full GM and contains:

~~~js
{
  position: { left, top, width, height },
  sidebarCollapsed: Boolean,
  inspectorCollapsed: Boolean,
  activeChapterId: String | null,
  selectedElementIds: String[],
  selectedConnectionId: String | null,
  expandedChapterIds: String[],
  archiveExpanded: Boolean,
  zoom: Number
}
~~~

The view is restored when the application is closed and reopened in the same client session. It is not stored in world settings and is not restored after a Foundry restart or a new GM session. Read-only users may temporarily change their view, but those changes are not persisted.

### 2.3 Local drafts

Scene, chapter, and connection details use local drafts until the corresponding Save button is used. Rich-text editors and assignment notes are checked before a selection change, rerender, or close. When unsaved changes exist, the user can save, discard, or continue editing. If the active GM loses write access, drafts remain visible but cannot be saved until write access returns.

## 3. User interface

The main application is StoryboardApplication in scripts/ui/application.js. It is based on Foundry's ApplicationV2 and HandlebarsApplicationMixin APIs.

The main template is templates/storyboard.hbs. The application uses the ID mel-storyboard-application, has the window title Mel-Storyboard, is resizable, and returns true from _canDetach(). Foundry therefore exposes its native detach and attach controls. The application implements _onDetach() and _onAttach() to rebind its context-menu listeners to the current owner document.

Detaching and reattaching do not create a second Storyboard instance and do not copy or migrate board data. The same application element is moved between the Foundry window and the detached window. The UI resolves its current ownerDocument and defaultView for DOM creation, timers, animation frames, MutationObserver, element checks, viewport calculations, context menus, and pointer-driven canvas, node, scene, resize, connection, and player-character interactions. Foundry links continue to use the normal Foundry document and sidebar APIs from either window.

### 3.1 Layout

The workspace contains:

1. left navigation with Story and Archive;
2. center canvas;
3. right inspector for Details.

When both side areas are expanded, the current CSS layout uses:

~~~css
grid-template-columns: 275px minmax(0, 1fr) 380px;
~~~

The two side areas can be collapsed independently. The workspace uses the available window height; Foundry window-content padding is removed for this application.

The module consumes the active Foundry theme variables for backgrounds, surfaces, text, inputs, borders, focus, links, and status indicators. The same theme selection is passed to graphic exports through exportThemeTokens().

### 3.2 Opening and controls

The application is exposed through three Foundry interfaces:

- the GM-restricted Settings menu openDesigner;
- the mel-storyboard tool in Scene Controls;
- the GM-restricted Alt+S keybinding.

game.melStoryboard.toggle() opens the application when no connected application exists and closes it when it is open.

The ApplicationV2 window's native detach action calls detachWindow(); its corresponding attach action calls attachWindow(). The module does not implement a second window manager. A detached window uses the same Storyboard state, and returning it to the main window uses the same application instance. Browser popup permissions can prevent detached mode even though the module supports it.

The toolbar contains:

- zoom out and zoom in;
- undo and redo;
- Import/Export.

Zoom is limited to 0.4 through 2.5 and changes in increments of 0.1. Zooming attempts to preserve the canvas position below the pointer. The canvas can be panned with the left mouse button on empty space.

### 3.3 Navigation tree

The left tree is prepared by buildChapterTree(). Each chapter or scene entry contains its title on the first line and display ID plus status on the second line. Selection is driven by the actual selected domain object: selecting a scene highlights the scene entry, while its parent chapter is not simultaneously marked as selected.

Chapter and scene entries expose a mel-storyboard-tree-hover-title tooltip. CSS makes it visible after a two-second hover delay. The complete title does not change the normal tree row height.

Story contains non-archived chapters. Archive contains only chapters with archived === true; their scenes are displayed below the chapter. An empty Archive is visually muted.

### 3.4 Context menus

Context menus are built in the application context-menu handlers and are available only in edit mode.

| Target | Actions |
|---|---|
| Story root | New Chapter |
| active chapter | Details, New Scene, New Entry, New Exit, Archive Chapter, Delete Chapter |
| archived chapter | Restore |
| Entry node | Rename, start connection to scene, link chapter node, delete node |
| Exit node | Rename, select scene as source, link chapter node, delete node |
| scene | start connection, delete scene |
| player-character token | remove character from scene |
| Scene Connection | delete connection |
| Chapter Connection | delete chapter connection |
| empty canvas | New Scene |

Deleting a chapter requires confirmation. The final remaining chapter cannot be deleted.

## 4. Board functions

### 4.1 Chapters

New chapters use sequential generated titles such as Chapter 1 and Chapter 2. The title number is determined from already used generated titles. The technical display ID is independent and is assigned by nextDisplayId(), for example C-001 and C-002.

Chapters can be reordered by drag and drop in the active Story area. Archiving moves a chapter to the end of the board list and sets archived to true. Restoring moves it back to the end of the active Story hierarchy. The chapter, its scenes, elements, local connections, and nodes remain intact while archived.

removeChapter() removes:

- all scenes in the chapter;
- all Scene Elements belonging to those scenes;
- Scene Connections with a scene or node endpoint in the chapter;
- the chapter nodes;
- Chapter Connections referencing those nodes.

### 4.2 Scenes

New scenes are created in the active chapter, receive a title such as Scene 1, and use two records:

- the domain Scene record in board.scenes;
- the visual Scene Element record in board.elements.

Scene Cards can be:

- selected;
- moved with the left mouse button;
- resized through the resize handle;
- copied, pasted, or duplicated;
- deleted;
- reordered within a chapter;
- moved to another chapter.

Moving a scene to another chapter removes any board.connections that would become invalid across the chapter boundary. The UI reports the number and reason for removed connections.

Scene Details are edited in the right inspector. Double-clicking a Scene Card does not open a separate Scene Details window.

### 4.3 Entry and Exit nodes

Each chapter may contain multiple Entry and Exit nodes. Nodes are stored in chapter.nodes and rendered as circles on the canvas. Like Scene Cards, nodes have a canvas position and can be moved with the left mouse button.

Entry and Exit nodes can be renamed and deleted. removeChapterNode() also removes all Scene Connections and Chapter Connections that reference the node. Display IDs use IN-### for Entry and OUT-### for Exit.

### 4.4 Undo, redo, copy, and delete

HistoryStack stores up to 100 complete board snapshots. Before a mutating operation, the application calls history.capture(this.board). undo() and redo() move snapshots between the past and future stacks and save the resulting board through the Store.

Keyboard commands inside the application include:

- Ctrl/Cmd+C: copy selected Scene Elements;
- Ctrl/Cmd+V: paste copied Scene Elements;
- Ctrl/Cmd+D: duplicate the selection;
- Ctrl/Cmd+Z: undo;
- Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y: redo;
- Delete: delete the selection.

Input, Select, Textarea, and contenteditable elements are excluded from these canvas commands.
## 5. Scene presentation

### 5.1 Shared presentation model

sceneElementPresentation() in scripts/domain/scene-card.js is the central layout function for both the live canvas and graphic exports. It calculates:

- normalized title and description text;
- line wrapping and truncation;
- card width and height;
- status badge;
- Scene Icon and Player Character token positions;
- scene shape and frame paths;
- ID and text anchors;
- resize-handle position.

normalizeSceneElementSize() is the public entry point used by the application. Legacy element sizes are updated using the calculated size; manually resized cards set visualConfig.sizeLocked.

### 5.2 Description and title

plainTextFromHtml() removes HTML tags from the Scene Card preview and converts block endings and br elements into readable line breaks. The complete rich-text description remains unchanged in the Scene record and inspector.

Detailed mode displays at most ten visible description lines. Excess text is shortened with ... at the end of the last visible line. A manually reduced card also respects its actually available height. Titles wrap to the available width and the card height is adjusted for multiple title lines.

Compact mode has no descriptionLines. Titles, IDs, statuses, Scene Icons, Player Character tokens, and connections remain visible.

### 5.3 Shapes

The values come from SCENE_SHAPES:

~~~js
{
  STANDARD: "STANDARD",
  DECISION: "DECISION",
  EVENT: "EVENT",
  CHALLENGE: "CHALLENGE"
}
~~~

| Value | Detailed mode | Compact mode |
|---|---|---|
| STANDARD | rounded rectangular card | rounded rectangular card without description |
| DECISION | rectangular card with a diamond marker | flat diamond with centered ID and centered title |
| EVENT | parallelogram with slanted sides | parallelogram without description |
| CHALLENGE | rounded card with a double frame | double frame without description |

Compact Decision uses at most two title lines. The ID is horizontally centered with text-anchor="middle". The Scene Icon is centered along the bottom; Player Character tokens are placed in a separate row above it when needed.

### 5.4 Status and icons

STATUS_COLOR_CLASSES maps internal status values to CSS classes:

~~~js
ABGESCHLOSSEN -> waiting
UNERLEDIGT    -> skipped
~~~

The remaining statuses have their own classes. The statusColors setting determines whether these classes are applied to cards and chapter status indicators. The left navigation remains neutral regardless of this setting.

showSceneIcons controls display only. The scene record keeps iconType when display is disabled. #sceneIconOptions() builds its list from CONFIG.JournalEntry.noteIcons, adds NONE, and sorts visible labels using the active language. Stored icon keys remain language-independent.

## 6. Connections and geometry

### 6.1 Scene Connections

board.connections stores connections within a single chapter. Endpoints are distinguished by sourceType and targetType:

- SCENE references a Scene Element through sourceElementId or targetElementId;
- CHAPTER_NODE references an Entry or Exit node through sourceNodeId or targetNodeId.

createConnection() accepts only:

~~~text
SCENE -> SCENE
ENTRY -> SCENE
SCENE -> EXIT
~~~

The function rejects missing endpoints, self-connections, duplicates, cross-chapter connections, and invalid Entry/Exit directions. validateSceneBoard() repeats these checks before saving.

Connection display types are:

~~~text
unilateral
unilateral deactivated
bilateral
bilateral deactivated
~~~

The deactivated suffix produces a dotted line. bilateral adds a reverse arrowhead.

Connection statuses are:

~~~js
NOT_USED: "not-used"
USED: "used"
REPEATED_USED: "repeated-used"
~~~

not-used is the default. used and repeated-used color lines and arrows green and dark green respectively. Labels use a readable theme-aware label treatment and receive the focus color when selected. Connection status is independent of connection type.

Scene Connections can be created through context menus or by dragging with the middle mouse button. The right inspector edits the title/label, connection type, connection status, description, and object assignments.

### 6.2 Chapter Connections

board.chapterConnections is separate from board.connections. A Chapter Connection may connect only an Exit node in one chapter to an Entry node in a different chapter:

~~~text
EXIT(chapter A) -> ENTRY(chapter B)
~~~

createChapterConnection() validates node types and chapter identity. Context menus create the link. Double-clicking a linked node calls #jumpToLinkedNode(), switches to the other chapter, centers the target node, and briefly highlights it.

### 6.3 Edge geometry

connectionGeometry() in scripts/domain/geometry.js calculates:

- source point;
- target point;
- main arrow;
- optional reverse arrow;
- label midpoint.

edgeDistance() accounts for rectangles, Event parallelograms, and Compact Decision diamonds. Connections therefore end at the visible shape boundary rather than at the bounding box.

## 7. Data model

### 7.1 Board root

The World setting contains an object with this structure:

~~~js
{
  schemaVersion: 5,
  id: "uuid",
  createdAt: "ISO timestamp",
  updatedAt: "ISO timestamp",
  templates: [],
  chapters: [],
  scenes: [],
  elements: [],
  connections: [],
  chapterConnections: [],
  objects: []
}
~~~

Domain and visual data are intentionally separate:

- scenes contains content and domain status;
- elements contains position, size, and visual settings;
- connections references elements or chapter nodes;
- objects contains each Foundry reference once;
- objectAssignments connect objects to a scene or connection.

### 7.2 Chapter

~~~js
{
  id: "uuid",
  displayId: "C-001",
  title: "Chapter 1",
  description: "Foundry rich-text HTML",
  status: "OFFEN",
  archived: false,
  nodes: [],
  createdAt: "ISO timestamp",
  updatedAt: "ISO timestamp"
}
~~~

### 7.3 Chapter Node

~~~js
{
  id: "uuid",
  displayId: "IN-001" | "OUT-001",
  nodeType: "ENTRY" | "EXIT",
  title: "Entry" | "Exit",
  position: { x: Number, y: Number },
  createdAt: "ISO timestamp",
  updatedAt: "ISO timestamp"
}
~~~

### 7.4 Scene

~~~js
{
  id: "uuid",
  displayId: "S-001",
  chapterId: "chapter uuid",
  parentId: null,
  title: "Scene 1",
  description: "Foundry rich-text HTML",
  sceneShape: "STANDARD",
  iconType: "NONE",
  notes: "",
  status: "OFFEN",
  templateId: "template uuid | null",
  templateVersion: 1,
  fieldValues: {},
  actorAssignments: [],
  objectAssignments: [],
  createdAt: "ISO timestamp",
  updatedAt: "ISO timestamp"
}
~~~

sceneShape is normalized to a value from SCENE_SHAPES. iconType contains the language-independent key from Foundry's note-icon configuration or NONE.

### 7.5 Scene Element

~~~js
{
  id: "uuid",
  sceneId: "scene uuid",
  elementType: "SCENE",
  title: "Scene 1",
  position: { x: Number, y: Number },
  size: { width: Number, height: Number },
  zIndex: Number,
  visualConfig: {
    sizeLocked: Boolean
  },
  createdAt: "ISO timestamp",
  updatedAt: "ISO timestamp"
}
~~~

Position and size use board coordinates. visualConfig.sizeLocked marks a manually resized card.

### 7.6 Board Object and assignment

~~~js
{
  id: "uuid",
  displayId: "O-001",
  objectType: "JOURNAL",
  title: "Journal title",
  description: "",
  foundryUuid: "JournalEntry...#anchor",
  foundryDocumentType: "JournalEntryPage",
  visualConfig: { image: "path-or-data-url" },
  createdAt: "ISO timestamp",
  updatedAt: "ISO timestamp"
}
~~~

An assignment in a scene or connection has this structure:

~~~js
{
  id: "assignment uuid",
  objectId: "object uuid",
  role: "",
  notes: "Foundry rich-text HTML",
  createdAt: "ISO timestamp",
  updatedAt: "ISO timestamp"
}
~~~

The same Board Object can be assigned to multiple owners; each assignment note remains independent. An object is not assigned twice to the same owner.

The OBJECT_TYPES constant contains:

~~~text
PLAYER_CHARACTER, NPC, GROUP, FACTION, PLACE, ITEM, INFORMATION,
EVENT, JOURNAL, FOUNDRY_SCENE, ROLLABLE_TABLE, MACRO, PLAYLIST,
PLAYLIST_SOUND
~~~

The current Foundry drop mapping creates PLAYER_CHARACTER or NPC for Actors, ITEM for Items, FOUNDRY_SCENE for Scenes, JOURNAL for Journals and Journal Pages, and the specific types for RollTables, Macros, Playlists, and PlaylistSounds.

### 7.7 Scene Connection

~~~js
{
  id: "uuid",
  sourceElementId: "element uuid | null",
  targetElementId: "element uuid | null",
  sourceNodeId: "node uuid | null",
  targetNodeId: "node uuid | null",
  sourceType: "SCENE" | "CHAPTER_NODE",
  targetType: "SCENE" | "CHAPTER_NODE",
  connectionType: "unilateral",
  connectionStatus: "not-used",
  label: "",
  description: "Foundry rich-text HTML",
  objectAssignments: [],
  visualConfig: {},
  createdAt: "ISO timestamp",
  updatedAt: "ISO timestamp"
}
~~~

When sourceType is SCENE, sourceElementId must be set; when it is CHAPTER_NODE, sourceNodeId must be set. The same rule applies to the target.

### 7.8 Chapter Connection

~~~js
{
  id: "uuid",
  sourceNodeId: "exit node uuid",
  targetNodeId: "entry node uuid",
  label: "",
  description: "",
  createdAt: "ISO timestamp",
  updatedAt: "ISO timestamp"
}
~~~

Chapter Connections currently have no Object Assignments and no Connection Status. They are allowed only between different chapters and only from Exit to Entry.

### 7.9 Templates

The board contains a default template structure and may contain additional template records:

~~~js
{
  id: "uuid",
  nameKey: "MEL_STORYBOARD.TEMPLATES.GENERAL.Name",
  name: "",
  scope: "global" | "board",
  sourceTemplateId: null,
  targetType: "SCENE",
  version: 1,
  active: true,
  fields: []
}
~~~

createBoardTemplate(), createTemplateVersion(), previewTemplateMigration(), and migrateSceneTemplate() are available in the domain module. A template-management application and template are present in the repository, but are not registered as an active Settings menu or main Storyboard workflow by scripts/main.js. The structure remains available for board compatibility and existing template data.
## 8. Normalization, validation, and persistence

### 8.1 Normalization

normalizeSceneBoard(stored, options) in scene-board-store.js:

1. clones the input;
2. migrates schema version 2 and its former status names to the current internal values;
3. accepts versions 3, 4, and 5 as normalizable board versions;
4. adds default templates, chapters, nodes, scenes, elements, connections, and assignments;
5. normalizes positions and sizes to numbers;
6. replaces unknown Scene Shapes with STANDARD;
7. replaces unknown Connection Types with unilateral;
8. replaces unknown Connection Status values with not-used;
9. removes invalid Scene Connections that cross chapter boundaries or violate endpoint rules;
10. sets the resulting schemaVersion to 5.

If no chapter exists, Chapter 1 is created automatically. During normal loading (resetInvalid: true), an unsupported board is replaced by an empty default board. During import (resetInvalid: false), an unsupported board is reported as an error.

### 8.2 Validation

validateSceneBoard(board) runs before every save. It checks:

- schemaVersion === 5 and a valid board ID;
- unique IDs for templates, objects, chapters, nodes, scenes, and elements;
- allowed Object Types and Chapter Node Types;
- existing chapter, scene, element, node, template, and object references;
- valid Connection Status and Connection Type values;
- no Scene Connection crossing a chapter boundary;
- only SCENE -> SCENE, ENTRY -> SCENE, and SCENE -> EXIT;
- only EXIT -> ENTRY between different chapters;
- existing Object Assignments.

Validation prevents an invalid board from being written to the World setting.

### 8.3 SceneBoardStore

SceneBoardStore is the normal persistence layer for board data:

~~~js
game.melStoryboard.store
~~~

Important properties include:

- hasStorage: World storage was read or initialized successfully;
- hasBoardData: the cached value contains the expected board arrays;
- isReadyForEditing: storage and board are ready;
- canWrite: the board is ready and the user is the designated active full GM;
- storageError: the last read/write error.

initialize() first reads game.settings.get(MODULE_ID, "sceneBoard"). For compatibility with worlds containing the module's private Journal storage, it also searches for a Journal record with:

~~~text
flags.mel-storyboard.privateBoardStorage === true
flags.mel-storyboard.sceneBoard
~~~

A valid Journal board is normalized by the designated active full GM and copied into the World setting. The World setting then remains the runtime source. If no board exists, only the designated active full GM may write an empty default board.

read() returns a copy of the normalized cache. save(board) checks write access, validates, updates the schema version and updatedAt, writes with game.settings.set(), and updates the cache. import(board) normalizes with strict error handling, validates, and delegates to save().

## 9. Import and export

### 9.1 JSON

sceneBoardToJson(board) serializes the complete board. sceneBoardFromJson(json) parses JSON; normalization and validation are then performed by the application and Store.

The import dialog offers:

1. Replace entire storyboard: save the imported board as the new shared board;
2. Add as new chapter: append all imported chapters as new chapters;
3. Add to existing chapter: merge the first imported chapter into a selected target chapter.

During a merge, #mergeImportedChapters() and #mergeImportedChapterInto() create new UUIDs for chapters, scenes, elements, nodes, objects, and templates. Maps then rewrite internal references in Scene Connections, Chapter Connections, and assignments. Display IDs are assigned again in sequence.

### 9.2 Scope selection

Before every export, the user selects:

- entire Storyboard;
- current chapter;
- selected chapters.

scopeSceneBoard(board, chapterIds) filters chapters, scenes, elements, Scene Connections, and Chapter Connections. A connection remains only if both endpoints are inside the selected scope.

### 9.3 SVG, PNG, and PDF

sceneBoardToSvg() is the central graphic renderer. It uses the same Scene Card presentation as the live canvas, so shapes, text wrapping, status, icons, Player Character tokens, connections, and nodes are rendered consistently.

- downloadSceneBoardSvg() downloads SVG directly;
- downloadSceneBoardPng() renders the SVG to a canvas and downloads PNG;
- printSceneBoardAsPdf() and printSceneBoardsAsPdf() open the Foundry/browser print preview;
- multiple chapters are exported as separate SVG and PNG files;
- multiple chapters are exported as separate PDF pages.

embedSceneIcons() embeds Scene Icon files and Player Character artwork as data URLs where possible. This keeps images available in SVG, PNG, and PDF. The export theme is derived from the CSS variables of the current mel-storyboard element.

## 10. Foundry interfaces

| Foundry interface | Use |
|---|---|
| Hooks.once("init") | register settings, Settings menu, keybinding, and game.melStoryboard |
| Hooks.once("ready") | initialize board storage |
| Hooks.on("getSceneControlButtons") | add Storyboard tool to Scene Controls |
| Hooks.on("updateUser") | refresh editor access after role/user changes |
| Hooks.on("userConnected") | refresh editor access after connection changes |
| Hooks.on("updateSetting") | reread the read-only board after a World setting change |
| game.settings.register() | register World board and global module options |
| game.settings.registerMenu() | open Storyboard through Foundry Settings |
| game.keybindings.register() | register Alt+S toggle |
| ApplicationV2 | native Foundry application base |
| HandlebarsApplicationMixin | Handlebars part rendering |
| ApplicationV2._canDetach(), detachWindow(), attachWindow() | native detached-window support |
| ApplicationV2._onDetach(), _onAttach() | rebind Storyboard listeners after a window move |
| fromUuid() | resolve Foundry documents from UUIDs |
| Scene.view() | open a Foundry Scene link |
| document.sheet.render() | open Journal, Item, Actor, and other standard sheets |
| ui.playlists | show Playlist and PlaylistSound in the native sidebar |
| CONFIG.JournalEntry.noteIcons | Scene Icon keys and paths |
| foundry.applications.ux.ProseMirrorEditor | description and assignment-note editors |
| foundry.applications.ux.DragDrop | drag Foundry documents onto Scenes and Connections |
| foundry.applications.ux.TextEditor | create links, enrich content, and create text previews |

### PlaylistSound links

#openFoundryDocument() handles PlaylistSound before the general sheet fallback:

1. fromUuid() resolves the track.
2. The parent Playlist is determined.
3. ui.playlists is activated.
4. The parent Playlist is added to _expanded.
5. The native PlaylistDirectory is rendered.
6. The element with data-sound-id is found, scrolled into view, and briefly highlighted.

The track configuration sheet is not opened.

### Journal links with pages and headings

parseFoundryLinkValue() and parseFoundryDropData() preserve the complete UUID, including #anchor. splitFoundryUuid() separates the document UUID and fragment. For JournalEntryPage, the parent Journal sheet is rendered with pageId; an existing anchor is forwarded as anchor.

A stored value can look like:

~~~text
JournalEntry.hS70xLgbM69RW99I.JournalEntryPage.ktQMVpgbM0KkB7JU#uberschrift-1
~~~

The module does not change Foundry documents and does not extend document permissions. It stores board metadata, UUIDs, titles, types, and artwork paths.
## 11. Settings and localization

### 11.1 Registered settings

| Key | Scope | Visible | Default | Function |
|---|---|---:|---|---|
| sceneBoard | world | no | {} | shared board storage |
| statusColors | world | yes, GM-restricted | false | status colors for cards and status displays |
| showSceneIcons | world | yes, GM-restricted | false | Scene Icons on cards and exports |
| sceneDisplayMode | world | yes, GM-restricted | DETAILED | Detailed or Compact Scene Cards |

openDesigner is also registered as a GM-restricted Settings menu. Visible text is stored below MEL_STORYBOARD.SETTINGS.

Each setting has an onChange handler that rerenders a connected Storyboard application. sceneBoard is not shown in the normal Foundry settings UI (config: false).

### 11.2 Language files

module.json loads:

~~~text
lang/en.json
lang/de.json
lang/fr.json
lang/es.json
lang/nl.json
~~~

English is the reference key set used by tools/check.mjs. Every visible key must exist in all language files. Translated content includes:

- settings and keybindings;
- actions and context menus;
- statuses, connection types, and connection statuses;
- scene shapes and Scene Icon types;
- object types;
- dialogs, save/import/export text, and error messages.

User-authored titles, descriptions, and notes are not translated automatically. Scene Icon keys remain stored as Foundry keys; only the visible label is localized.

## 12. Project structure

| File | Responsibility |
|---|---|
| module.json | manifest, version, compatibility, entry point, styles, and languages |
| scripts/main.js | Foundry hooks, settings, keybinding, Scene Control tool, global API |
| scripts/domain/constants.js | module ID, storage key, schema, statuses, shapes, object/connection types |
| scripts/domain/ids.js | UUIDs and sequential display IDs |
| scripts/domain/model.js | pure board operations and domain rules |
| scripts/domain/permissions.js | full-GM and designated active-GM checks |
| scripts/domain/scene-board-store.js | normalization, compatibility migration, validation integration, and persistence |
| scripts/domain/validation.js | board consistency and connection rules |
| scripts/domain/history.js | undo/redo snapshots |
| scripts/domain/scene-card.js | text processing, card layout, sizes, shapes, and icon/token positions |
| scripts/domain/geometry.js | connection edge geometry and arrow points |
| scripts/domain/export.js | JSON, SVG, PNG, and PDF functions |
| scripts/ui/application.js | main window, interactions, Details, drag and drop, import/export |
| scripts/ui/object-details.js | Object Details and assignment notes |
| scripts/ui/template-management.js | existing, unregistered template management |
| templates/storyboard.hbs | main layout, tree, canvas, and inspector |
| templates/object-details.hbs | Object Details markup |
| templates/template-management.hbs | template-management markup |
| styles/module.css | layout, theme, tree, canvas, inspector, and export-related styles |
| lang/*.json | localization |
| tests/domain.test.mjs | automated domain and export tests |
| tools/check.mjs | syntax, manifest, JSON, and localization-key checks |

The runtime contains no shell or server component. npm scripts are used only for development and verification.

## 13. Important domain functions

The central domain API in scripts/domain/model.js includes:

| Function | Responsibility |
|---|---|
| createSceneBoard() | create an empty board with the default template and Chapter 1 |
| createChapter() | create and insert a chapter before archived chapters |
| archiveChapter() / restoreChapter() | change archive state and ordering |
| createScene() | create a domain scene with status, shape, and defaults |
| createSceneElement() | create a visual Scene Element |
| createBoardObject() | create a Foundry object reference |
| assignObjectToScene() / assignObjectToConnection() | create an Object Assignment |
| removeObjectAssignment() / removeObjectFromConnection() | remove an assignment |
| moveObjectAssignment() | move a Player Character between scenes |
| createConnection() | create a validated Scene Connection |
| updateConnection() / removeConnection() | modify or delete a Scene Connection |
| createChapterNode() / updateChapterNode() / removeChapterNode() | manage Entry and Exit nodes |
| createChapterConnection() / removeChapterConnection() | manage Exit-to-Entry Chapter Connections |
| moveSceneToChapter() | move a scene and remove invalid connections |
| reorderScenes() / reorderChapters() | change order |
| removeChapter() | delete a chapter and dependent data |
| duplicateSceneElements() | duplicate scenes and internal Scene Connections |
| copySceneElements() / pasteSceneElements() | copy and paste Scene Elements in the current application |
| removeSceneElements() | delete selected scenes, elements, and local connections |
| normalizeConnectionType() / normalizeConnectionStatus() | apply safe defaults |

The UI invokes these functions against a board copy and saves only after a successful domain operation through SceneBoardStore.

## 14. Maintenance and extension

### Adding a setting

1. Add the constant in constants.js.
2. Register the setting in main.js.
3. Add name, hint, and choice labels to every language file.
4. Read the setting in _prepareContext().
5. Update the template, CSS, and export labels where necessary.
6. Verify the default, read-only behavior, and onChange handling.
7. Update tests and README.

### Adding a status

1. Add the value to STATUS.
2. Add localization entries to en, de, fr, es, and nl.
3. Define the mapping in STATUS_COLOR_CLASSES.
4. Add live CSS and SVG export colors.
5. Check icon contrast in neutral and status-based rendering.
6. Test the tree, inspector, Scene Card, PDF, PNG, and SVG.

### Adding a Scene Shape

1. Add the value to SCENE_SHAPES.
2. Add the option in application.js and every language file.
3. Define the frame in sceneShapeFrame().
4. Add edge calculation in geometry.js.
5. Connect live template, DOM update, and export through the shared presentation.
6. Manually verify status colors, resize, icons, tokens, and connection endpoints.

### Adding an Object Type

1. Add the value to OBJECT_TYPES.
2. Add Foundry drop mapping in #onFoundryDrop().
3. Add icon/label mapping and localization entries.
4. Check whether #openFoundryDocument() needs a special case.
5. Test assignment, Object Details, notes, delete, and export.

### Changing the schema

1. Increase STORE_SCHEMA_VERSION.
2. Add explicit normalization/migration in normalizeSceneBoard().
3. Update validateSceneBoard().
4. Test JSON replace, merge, undo/redo, archive, and connection references.
5. Test import data from the previous and new versions.
6. Update README and this document.

New rendering behavior should preferably be added to sceneElementPresentation(). Live DOM rendering and export must not introduce separate layout rules for the same Scene Card.

## 15. Quality assurance

Automated repository checks are:

~~~text
npm test
npm run check
git diff --check
~~~

npm test runs tests/domain.test.mjs and covers, among other things:

- board, chapter, scene, and node creation;
- archive, restore, ordering, and chapter changes;
- Scene and Chapter Connection endpoints;
- cross-chapter cleanup;
- status, shape, compact, and Scene Icon presentation;
- Player Character and PlaylistSound objects;
- JSON, SVG, and chapter-scoped export.

npm run check runs node --check for JavaScript files and verifies manifest paths, JSON files, and localization completeness against lang/en.json.

### Manual Foundry test matrix

After a behavior change, at least verify:

1. Load the module and inspect game.melStoryboard in the console.
2. Test with the designated active full GM, another full GM, an Assistant GM, and a player.
3. Test Settings, Scene Controls, and Alt+S for opening and closing.
4. Detach the Storyboard with the native window control, use canvas interactions and Foundry links in the detached window, then attach it again and verify that the same state and listeners remain active.
5. Close and reopen the window with position, size, zoom, active chapter, selection, and sidebars changed; then restart Foundry.
6. Create, reorder, archive, restore, and delete chapters.
7. Create, reorder, move, resize, duplicate, copy/paste, and delete scenes.
8. Create, move, rename, delete, and connect Entry/Exit nodes to scenes.
9. Test all three valid Scene Connection endpoint combinations and bilateral/deactivated types.
10. Create Chapter Connections between different chapters and jump with a double-click.
11. Move a scene to another chapter and verify the warning and connection cleanup.
12. Save and discard Scene Details, Chapter Details, Connection Details, and assignment notes.
13. Link a Journal Entry, Journal Page with a heading, Actor, Item, Scene, RollTable, Macro, Playlist, and PlaylistSound.
14. Open a PlaylistSound link and verify that the Playlist expands without opening the track configuration.
15. Test status coloring, neutral mode, Scene Icons, and both Scene Display modes.
16. Test every Scene Shape on the canvas, during resize, in connections, and in SVG/PNG/PDF.
17. Test JSON replace, add as new chapters, and merge into an existing chapter.
18. Check statuses, shapes, icons, settings, and context menus in all five language files.

## 16. Current boundaries

- Only Foundry's designated active full GM can write.
- Scene Connections cannot cross chapter boundaries.
- Chapter Connections are only Exit-to-Entry between different chapters.
- Only chapters can be archived; scenes have no independent archive state.
- Foundry document links require the document to remain available to the current user.
- Detached mode requires a browser window permission and Foundry support for the ApplicationV2 detach control.
- Template management is not registered as an active main workflow.
- The module does not manage users, roles, sessions, or document permissions.
- No external media is bundled; artwork and audio come from Foundry documents.

## 17. Sources and license

- Repository: <https://github.com/melnari/mel-storyboard>
- Issues: <https://github.com/melnari/mel-storyboard/issues>
- Foundry API v14: <https://foundryvtt.com/api/v14/>
- License: [Apache License 2.0](LICENSE)

If this document differs from the source code, the source code is authoritative. Update this document together with the tests and README when the current implementation changes.
