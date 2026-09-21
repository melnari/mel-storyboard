# Mel-Storyboard – technische Dokumentation

## 1. Zweck und Geltungsbereich

Mel-Storyboard ist ein natives Foundry-VTT-Add-on-Modul für Game Master. Es stellt eine interaktive Szenenübersicht bereit, in der Szenen in Kapiteln angeordnet, beschrieben und über gerichtete oder bilaterale Verbindungen verknüpft werden können.

Diese Dokumentation beschreibt den Stand `v0.2.0` und den für das Projekt festgelegten Zielstand:

- Foundry Virtual Tabletop 14.x, gegen `14.368` verifiziert;
- Foundry-nativ, ohne separate Anmeldung oder externen Dienst;
- GM-zentrierte Bearbeitung innerhalb einer World;
- JavaScript/ES-Module für den Runtime-Code;
- englische Basissprache mit Deutsch, Französisch, Spanisch und Niederländisch;
- Speicherung als Foundry-World-Setting;
- Import und Export als JSON, SVG, PNG und PDF.

Die frühere Storyline-Ebene und die aktive Template-Verwaltung gehören nicht mehr zur sichtbaren Oberfläche. Template-Daten und zugehörige Domain-Funktionen bleiben im Datenmodell erhalten, damit bestehende Boards importiert und migriert werden können.

## 2. Aktueller Funktionsumfang

### Kapitel und Archiv

- Das Root-Element `Story` enthält aktive Kapitel.
- Das Root-Element `Archive` enthält archivierte Kapitel.
- Kapitel enthalten Szenen, Szenelemente, Entry-/Exit-Knoten und deren interne Verbindungen.
- Kapitel können im Baum auf- und zugeklappt sowie per Drag & Drop sortiert werden.
- Szenen können innerhalb eines Kapitels sortiert oder in ein anderes Kapitel verschoben werden.
- Beim Verschieben einer Szene zwischen Kapiteln werden ungültige Cross-Chapter-Verbindungen automatisch entfernt und gemeldet.
- Neue Kapitel heißen automatisch `Chapter 1`, `Chapter 2` usw.
- Neue Szenen heißen automatisch `Scene 1`, `Scene 2` usw.
- Kapitel können archiviert, wiederhergestellt oder nach Bestätigung gelöscht werden.
- Beim Löschen eines Kapitels werden alle enthaltenen Szenen, Elemente, lokalen Verbindungen, Knoten und Kapitelverbindungen gelöscht.

### Canvas und Scene Cards

- Das ausgewählte Kapitel wird als Canvas dargestellt.
- Scene Cards sind mit der linken Maustaste verschiebbar.
- Entry- und Exit-Knoten verhalten sich beim Verschieben wie Scene Cards.
- Ein Linksklick auf den Canvas-Hintergrund hebt die Auswahl auf.
- Ziehen mit gedrückter linker Maustaste auf dem Canvas verschiebt den sichtbaren Ausschnitt.
- Mausrad sowie `+` und `-` in der Titelleiste ändern den Zoom.
- Die Zoomstufe liegt zwischen `0.4` und `2.5` und wird in Schritten von `0.1` verändert.
- Scene Cards zeigen Titel, Beschreibung als reinen Text, ID, Status, optionale Scene-Icons und Player-Character-Tokens.
- Die Kartenbeschreibung nutzt die volle innere Breite, hat links und rechts denselben Rand und wird auf maximal zehn gerenderte Zeilen gekürzt. Wird eine Karte kleiner als der natürliche Beschreibungstext gezogen, wird zusätzlich auf die sichtbaren Zeilen gekürzt und die letzte sichtbare Zeile mit `...` abgeschlossen. Die Beschreibung in `Scene Details` bleibt vollständig.
- Titel werden anhand der verfügbaren Kartenbreite in mehrere Zeilen umgebrochen. Das gilt auch nach dem manuellen Verkleinern; die Kartenhöhe berücksichtigt die zusätzliche Titelzeilen.
- HTML-Tags werden in der kompakten Beschreibung entfernt; Zeilenumbrüche bleiben erhalten.
- Karten passen ihre automatische Größe an den Inhalt an und können manuell vergrößert/verkleinert werden.
- Manuell veränderte Kartengrößen werden über `visualConfig.sizeLocked` geschützt.

### Verbindungen

Scene-Verbindungen entstehen über:

1. das Kontextmenü einer Szene mit anschließender Zielauswahl;
2. Ziehen mit gedrückter mittlerer Maustaste von einem Endpunkt auf einen anderen.

Erlaubte Scene-Connection-Endpunkte innerhalb eines Kapitels sind:

- Szene → Szene;
- Entry → Szene;
- Szene → Exit.

Eine Verbindung besitzt ein Label, eine Beschreibung und einen Darstellungstyp:

- `unilateral` – Pfeil von Quelle zu Ziel;
- `unilateral deactivated` – gepunktete Linie mit Pfeil von Quelle zu Ziel;
- `bilateral` – Pfeile in beide Richtungen;
- `bilateral deactivated` – gepunktete Linie mit Pfeilen in beide Richtungen.

Zusätzlich besitzt jede Verbindung einen Verbindungsstatus:

- `not-used` – Standarddarstellung (Default);
- `used` – grüne Linie, Pfeile und Beschriftung;
- `repeated-used` – dunkelgrüne Linie, Pfeile und Beschriftung.

Der Verbindungsstatus ist unabhängig vom Verbindungstyp; bei deaktivierten Typen bleibt die Linie gepunktet.
Das Connection-Label bleibt unabhängig vom Verbindungsstatus in der neutralen Standardfarbe.

Kapitelverbindungen sind davon getrennt. Sie verbinden ausschließlich Exit-Knoten eines Kapitels mit Entry-Knoten eines anderen Kapitels. Ein Doppelklick auf einen Knoten springt zum jeweils verknüpften Knoten im anderen Kapitel.

### Foundry-Objekte

Foundry-Dokumente können per Drag & Drop auf eine Scene Card oder eine Connection gezogen werden. Unterstützt werden:

- Actors, einschließlich Player Characters und NPCs;
- Items;
- Journals, Journal Pages und Links auf Überschriften innerhalb von Journal Pages;
- Scenes;
- Rollable Tables;
- Macros;
- Playlists;
- einzelne Playlist-Tracks als `PlaylistSound`.

Ein Objekt wird nur einmal je Szene bzw. Connection zugeordnet. Jede Zuordnung besitzt eigene Notizen, die nicht automatisch mit anderen Zuordnungen desselben Foundry-Dokuments geteilt werden.

Der Objektname wird als Foundry-Link dargestellt. Für Journals können vorhandene Foundry-Content-Links per Drag & Drop übernommen werden. Die vollständige UUID inklusive optionalem Fragment hinter `#` wird gespeichert, beispielsweise `JournalEntry...JournalEntryPage...#heading-id`. Beim Öffnen wird die Dokument-UUID ohne Fragment aufgelöst; anschließend öffnet das Modul die native Journal-Ansicht und fokussiert die Seite beziehungsweise den Anker, sofern dieser im gerenderten Journal vorhanden ist. Für Foundry Scenes wird für den GM die native `Scene.view()`-Funktion verwendet. Bei einzelnen Playlist-Tracks wird die native Playlist-Seitenleiste geöffnet, die übergeordnete Playlist ausgeklappt und der Track sichtbar gemacht. Die separate Track-Konfiguration wird nicht geöffnet.

Player Characters werden mit ihrem Artwork als kleine Tokens am unteren Rand einer Scene Card dargestellt. Ein Token kann mit gedrückter linker Maustaste auf eine andere Scene Card gezogen werden; dadurch wird die Zuordnung von der ursprünglichen Szene entfernt und der Zielszene zugeordnet.

### Details und Editor

Der rechte Inspector zeigt je nach Auswahl:

- `Scene Details` mit Titel, Status, Scene-Form, optionalem Scene-Icon, Beschreibung, Objektzuordnungen und Verbindungsübersicht;
- `Chapter Details` mit Titel, Status, Beschreibung und Entry-/Exit-Knoten;
- `Connection Details` mit Label, Connection Type, Connection Status, Beschreibung und direkt zugeordneten Objekten.

Beschreibungen und Objekt-Notizen verwenden Foundrys ProseMirror-/Rich-Text-Editor. Der Editor arbeitet für Board-Daten lokal und benötigt keine Foundry-Dokument-UUID. Speichern erfolgt über den jeweiligen `Save`-Button oder das Speichern im Editor-Menü.

Die Scene-Form wird als `sceneShape` auf der Scene gespeichert. Unterstützte Werte sind `STANDARD`, `DECISION`, `EVENT` und `CHALLENGE`. Fehlende oder unbekannte Werte werden bei der Normalisierung als `STANDARD` behandelt. Die gemeinsame Präsentationslogik in `scripts/domain/scene-card.js` liefert die Geometrie für Canvas und Exporte; `scripts/domain/geometry.js` verwendet für Rauten und Parallelogramme die tatsächliche Formkante als Verbindungsgrenze.

### Statusfärbung und Scene-Icons

Die World-Einstellung `Use status-based coloring` ist standardmäßig deaktiviert. Bei Aktivierung werden Karten und der aktive Kapitelstatus pastellfarben dargestellt. Die Baumstruktur links behält unabhängig davon ihr neutrales Standardfarbschema.

Verwendete interne Statuswerte:

| Interner Wert | Bedeutung |
|---|---|
| `OFFEN` | Open |
| `WAITING` | Waiting |
| `AKTIV` | Active |
| `ERFOLG` | Success |
| `TEILERFOLG` | Partial Success |
| `FEHLSCHLAG` | Failure |
| `UEBERSPRUNGEN` | Skipped |
| `ABGESCHLOSSEN` | Completed; verwendet die Waiting-Farbe |
| `UNERLEDIGT` | Unfinished; verwendet die Skipped-Farbe |

Die World-Einstellung `Show Icons on Scene` ist ebenfalls standardmäßig deaktiviert. Bei Aktivierung kann in `Scene Details` ein Foundry-Map-Notes-Icon ausgewählt werden. Die Liste stammt aus `CONFIG.JournalEntry.noteIcons` und enthält zusätzlich den Eintrag `None`, jedoch keinen Custom-Eintrag. Das gewählte Icon wird unten rechts auf der Scene Card angezeigt und in grafische Exporte eingebettet. Der gespeicherte Schlüssel bleibt sprachunabhängig; nur die Anzeige wird lokalisiert.

## 3. Projektstruktur

| Datei/Bereich | Aufgabe |
|---|---|
| `module.json` | Foundry-Manifest, Version, Kompatibilität, Einstiegspunkt und Sprachen |
| `scripts/main.js` | Foundry-Initialisierung, Settings, Keybinding und Scene-Control-Integration |
| `scripts/domain/constants.js` | IDs, Schema-Version, Status, Objekt- und Verbindungstypen |
| `scripts/domain/ids.js` | UUID-Erzeugung und fortlaufende Anzeige-IDs |
| `scripts/domain/model.js` | Reine Operationen auf Board, Kapitel, Szenen, Knoten, Verbindungen und Objekten |
| `scripts/domain/scene-board-store.js` | Normalisierung, Persistenz und GM-Prüfung |
| `scripts/domain/validation.js` | Konsistenz- und Endpunktprüfung vor dem Speichern/Importieren |
| `scripts/domain/scene-card.js` | Textaufbereitung, Kartenlayout, automatische Größe und Status-/Icon-Daten |
| `scripts/domain/geometry.js` | Geometrie von Linien und Pfeilspitzen |
| `scripts/domain/export.js` | JSON, SVG, PNG, PDF und kapitelweise Export-Schranken |
| `scripts/domain/history.js` | Undo-/Redo-Snapshot-Stack |
| `scripts/ui/application.js` | Hauptfenster, Interaktion, Kontextmenüs, Drag & Drop und Inspector |
| `scripts/ui/object-details.js` | Objekt-Details und lokaler Rich-Text-Editor für Zuordnungsnotizen |
| `scripts/ui/template-management.js` | Erhaltene, aktuell nicht verknüpfte Template-Verwaltung |
| `templates/storyboard.hbs` | Hauptlayout und Inspector-Markup |
| `templates/object-details.hbs` | Objekt-Details-Markup |
| `templates/template-management.hbs` | Markup der nicht aktiven Template-Verwaltung |
| `styles/module.css` | Layout, Farben, Canvas, Baum und Inspector |
| `lang/*.json` | Lokalisierte Benutzeroberfläche |
| `tests/domain.test.mjs` | Automatisierte Domain- und Exporttests |
| `tools/check.mjs` | Syntax-, Manifest-, JSON- und Localization-Key-Prüfung |

Der Runtime-Code enthält keine Perl- oder Shell-Komponente. Shell-Befehle existieren nur als optionale Entwicklungsaufrufe über `npm` und sind keine Modul-Schnittstelle.

## 4. Architektur und Lebenszyklus

Der zentrale Datenfluss ist:

```text
Foundry init
  └─ scripts/main.js
       ├─ World Settings und Keybinding registrieren
       ├─ Scene-Control-Button registrieren
       └─ game.melStoryboard.store/application bereitstellen

StoryboardApplication
  ├─ liest Board über SceneBoardStore
  ├─ bereitet View-Model für Handlebars vor
  ├─ bindet Pointer-, Maus-, Tastatur- und Drag-&-Drop-Ereignisse
  ├─ ändert Board über Domain-Funktionen
  └─ validiert und speichert über SceneBoardStore
```

### `scripts/main.js`

In `Hooks.once("init")` werden registriert:

- das interne World-Setting `sceneBoard`;
- die World-Einstellung `statusColors`;
- die World-Einstellung `showSceneIcons`;
- das GM-restricted Settings-Menü zum Öffnen des Storyboards;
- das GM-restricted Keybinding `Ctrl+Alt+S`.

Der Hook `getSceneControlButtons` fügt den Storyboard-Button in Foundrys Token-Control ein. In Foundry 14 ist `control.tools` ein Objekt und kein Array; neue Tools werden deshalb über `control.tools["mel-storyboard"]` hinzugefügt.

### `StoryboardApplication`

Die Hauptanwendung basiert auf:

```js
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
```

Sie verwendet das Template `modules/mel-storyboard/templates/storyboard.hbs`. Das Fenster ist resizable und `_canDetach()` liefert `false`. Der Zustand der Anwendung enthält unter anderem:

- `board` – aktuell bearbeitete Board-Kopie;
- `activeChapterId`;
- `selectedElementIds` und `selectedConnectionId`;
- `expandedChapterIds` und `archiveExpanded`;
- `zoom`;
- temporäre Drag-, Resize-, Pan- und Editor-Zustände;
- `HistoryStack` für Undo/Redo.

Nach einem vollständigen Render werden alle interaktiven DOM-Elemente neu gebunden. Bewegungen von Scene Cards, Knoten und Canvas werden während des Pointer-Move über `requestAnimationFrame` aktualisiert; die persistente Speicherung erfolgt erst beim Loslassen.

## 5. Datenmodell

### 5.1 Board-Wurzel

Das Board wird als Object im Foundry-Setting `mel-storyboard.sceneBoard` gespeichert:

```js
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
```

Die Listen nutzen absichtlich getrennte Datensätze:

- `scenes` enthält fachliche Szenendaten;
- `elements` enthält die visuelle Darstellung und Position einer Szene;
- `connections` referenziert Scene Elements oder Chapter Nodes;
- `objects` enthält Foundry-Dokumente genau einmal;
- Zuordnungen in Szenen und Connections referenzieren Objekte über eine Assignment-ID.

### 5.2 Kapitel

```js
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
```

Aktive Kapitel stehen in der Kapitelreihenfolge vor archivierten Kapiteln. `archiveChapter` verschiebt ein Kapitel an das Ende und setzt `archived` auf `true`. `restoreChapter` setzt den Wert zurück und fügt das Kapitel vor dem ersten archivierten Kapitel ein.

### 5.3 Entry- und Exit-Knoten

```js
{
  id: "uuid",
  displayId: "IN-001" | "OUT-001",
  nodeType: "ENTRY" | "EXIT",
  title: "Entry" | "Exit",
  position: { x: 80, y: 80 },
  createdAt: "ISO timestamp",
  updatedAt: "ISO timestamp"
}
```

Knoten liegen im Array `chapter.nodes`. Ihre Position ist eine Canvas-Position in der Board-Koordinate. Entry- und Exit-Knoten werden als Kreise gerendert.

### 5.4 Szene

```js
{
  id: "uuid",
  displayId: "S-001",
  chapterId: "chapter uuid",
  parentId: null,
  title: "Scene 1",
  description: "Foundry rich-text HTML",
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
```

`description` ist die aktuell sichtbare Beschreibung. `notes`, `templateId`, `templateVersion`, `fieldValues` und `actorAssignments` bleiben für Datenkompatibilität erhalten. Neue UI-Funktionen sollten für Foundry-Verknüpfungen `objectAssignments` verwenden.

### 5.5 Scene Element

```js
{
  id: "uuid",
  sceneId: "scene uuid",
  elementType: "SCENE",
  title: "Scene 1",
  position: { x: 120, y: 120 },
  size: { width: 180, height: 80 },
  zIndex: 0,
  visualConfig: {
    sizeLocked: false
  },
  createdAt: "ISO timestamp",
  updatedAt: "ISO timestamp"
}
```

`sceneId` verbindet das visuelle Element mit der fachlichen Szene. Scene Connections referenzieren die `id` des Elements, nicht direkt die Scene-ID.

Die fachliche Scene enthält zusätzlich:

```js
sceneShape: "STANDARD" // STANDARD | DECISION | EVENT | CHALLENGE
```

### 5.6 Board Object

```js
{
  id: "uuid",
  displayId: "O-001",
  objectType: "NPC",
  title: "Name from Foundry",
  description: "",
  foundryUuid: "Actor.xxxxx",
  foundryDocumentType: "Actor",
  visualConfig: {
    image: "path or URL"
  },
  createdAt: "ISO timestamp",
  updatedAt: "ISO timestamp"
}
```

`foundryUuid` may contain a Journal-Fragment hinter `#`. Für die Auflösung wird nur der Dokumentteil verwendet; das Fragment bleibt für den Foundry-Link und den Ziel-Sprung erhalten.

Unterstützte interne `objectType`-Werte sind:

```text
PLAYER_CHARACTER, NPC, GROUP, FACTION, PLACE, ITEM,
INFORMATION, EVENT, JOURNAL, FOUNDRY_SCENE, ROLLABLE_TABLE,
MACRO, PLAYLIST, PLAYLIST_SOUND
```

Für Actors mit `PLAYER_CHARACTER`, `NPC`, `GROUP` oder `FACTION` verlangt `createBoardObject` eine Foundry-UUID. Bei Player Characters wird das Artwork bevorzugt dynamisch aus dem aufgelösten Actor gelesen.

### 5.7 Objektzuordnung

Szenen und Connections besitzen jeweils ein eigenes Assignment-Array:

```js
{
  id: "uuid",
  objectId: "board object uuid",
  role: "",
  notes: "Foundry rich-text HTML",
  createdAt: "ISO timestamp",
  updatedAt: "ISO timestamp"
}
```

Die Assignment-Notiz ist bewusst nicht Bestandteil des globalen Board Objects. Dadurch kann dasselbe Foundry-Dokument an verschiedenen Stellen unterschiedliche Notizen haben.

### 5.8 Scene Connections

```js
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
```

Die Seite mit `sourceType: "CHAPTER_NODE"` darf nur ein Entry sein, wenn das Ziel eine Szene ist. Die Seite mit `targetType: "CHAPTER_NODE"` darf nur ein Exit sein, wenn die Quelle eine Szene ist. Beide Endpunkte müssen zum selben Kapitel gehören.

### 5.9 Kapitelverbindungen

```js
{
  id: "uuid",
  sourceNodeId: "exit node uuid",
  targetNodeId: "entry node uuid",
  label: "",
  description: "",
  createdAt: "ISO timestamp",
  updatedAt: "ISO timestamp"
}
```

Kapitelverbindungen dürfen nur `EXIT → ENTRY` zwischen unterschiedlichen Kapiteln abbilden. Sie liegen in `board.chapterConnections` und nicht in `board.connections`.

### 5.10 Templates als erhaltene Kompatibilitätsstruktur

Ein Template enthält unter anderem:

```js
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
```

Die Funktionen `createBoardTemplate`, `createTemplateVersion`, `previewTemplateMigration` und `migrateSceneTemplate` sind weiterhin im Domain-Modul vorhanden. Die Template-Verwaltung wird im aktuellen Hauptfenster jedoch nicht angeboten. Eine Reaktivierung müsste zuerst mit den aktuellen Produktanforderungen abgestimmt werden.

## 6. Konsistenzregeln und Speicherung

### Normalisierung

`normalizeSceneBoard` ergänzt fehlende Default-Werte, migriert ältere Formen und setzt `schemaVersion` auf die aktuelle Version. Alte Boards ohne Kapitel erhalten automatisch `Chapter 1`. Fehlende Scene- oder Connection-Felder werden mit sicheren Defaults ergänzt.

Akzeptierte gespeicherte Zwischenstände sind die Schema-Versionen `3`, `4` und `5`. Schema-Version `2` wird zunächst in die neue Statusdarstellung überführt. Andere Versionen werden beim normalen Lesen zurückgesetzt bzw. beim Import mit Fehler abgelehnt (`resetInvalid: false`).

### Validierung

`validateSceneBoard` prüft unter anderem:

- Schema-Version und Board-ID;
- eindeutige IDs für Templates, Objekte, Kapitel, Knoten, Szenen und Elemente;
- gültige Referenzen zwischen Szenen, Elementen, Kapiteln und Objekten;
- gültige Connection-Endpunkte;
- keine Scene Connections über Kapitelgrenzen;
- gültige `EXIT → ENTRY`-Kapitelverbindungen;
- gültige Objekttypen und Template-Referenzen.

### Persistenz

`SceneBoardStore.save(board)`:

1. prüft, ob `game.user.isGM` gesetzt ist;
2. validiert das Board;
3. setzt Schema-Version und `updatedAt`;
4. schreibt eine Kopie über `game.settings.set`;
5. liefert eine weitere Kopie zurück.

Der Store verwendet Kopien (`structuredClone`), damit UI-Änderungen nicht unkontrolliert das Setting mutieren. Nicht-GM-Benutzer dürfen den gespeicherten Stand lesen, aber nicht speichern oder importieren.

## 7. Import, Export und IDs

### JSON

`sceneBoardToJson` serialisiert das komplette Board einschließlich Kapitelreihenfolge, Archivstatus, Kartenpositionen, Knoten, Verbindungen, Objekten und Notizen. `sceneBoardFromJson` parst nur das JSON; Normalisierung und Validierung erfolgen anschließend durch den Store bzw. die Anwendung.

Beim Import kann gewählt werden:

- gesamtes Storyboard ersetzen;
- importierte Kapitel als neue Kapitel hinzufügen;
- das erste importierte Kapitel in ein bestehendes Kapitel einfügen.

Beim Zusammenführen werden neue UUIDs für Kapitel, Szenen, Elemente, Knoten, Objekte und Templates erzeugt. Anschließend werden alle internen Referenzen über Maps auf die neuen IDs umgeschrieben. Anzeige-IDs werden fortlaufend neu vergeben.

### Grafische Exporte

`sceneBoardToSvg` ist die zentrale Renderquelle für SVG, PNG und PDF. Das ist wichtig: Layout, Beschreibungstext, Statusfarben, Pfeile, Icons und Kapitelknoten sollen nicht in drei unabhängigen Renderern auseinanderlaufen.

- SVG wird direkt aus dem erzeugten Markup heruntergeladen.
- PNG rendert das SVG in ein Canvas und erstellt daraus ein PNG.
- PDF erzeugt ein Druckvorschaufenster mit einem Kapitel pro Seite.
- Werden mehrere Kapitel exportiert, erzeugen SVG und PNG eine Datei pro Kapitel; PDF erzeugt eine Seite pro Kapitel.
- `scopeSceneBoard` filtert Kapitel, Szenen, Elemente, Scene Connections und Kapitelverbindungen auf den Exportumfang.
- Scene-Icons werden vor dem Grafikexport nach Möglichkeit als Data-URL eingebettet, damit das SVG selbstständig bleibt und PNG/PDF die Icons übernehmen.

### Anzeige-IDs

`nextDisplayId(items, prefix)` sucht die kleinste freie Nummer. Aktuelle Prefixe sind:

- `C-###` für Kapitel;
- `S-###` für Szenen;
- `O-###` für Objekte;
- `IN-###` für Entry-Knoten;
- `OUT-###` für Exit-Knoten.

Die UUID ist die technische Identität. Anzeige-IDs und Titel sind nicht als stabile Referenz zu verwenden.

## 8. Rendering und Koordinaten

### Scene Cards

`sceneElementPresentation` berechnet aus Szene, Element und Anzeigeoptionen:

- bereinigten Titel;
- HTML-freie Beschreibung;
- Beschreibungslinien und Zeilenumbruch;
- maximal zehn Beschreibungslinien für die Scene Card mit `...` als Kürzungszeichen;
- Statuslabel und Status-Badge-Breite;
- Mindest- und Inhaltsbreite;
- Player-Character-Token-Größe und -Position;
- Scene-Icon-Größe und -Position;
- Resize-Handle-Position.

Die Funktion wird vom Live-UI und vom SVG-Export gemeinsam verwendet. Änderungen am Layout sollten deshalb zuerst dort umgesetzt werden.

### Verbindungsgeometrie

`connectionGeometry(sourceElement, targetElement, { bilateral })` arbeitet mit den Mittelpunkt- und Randkoordinaten der Endpunkte. Die Linie beginnt und endet am Rand der Scene Card. Bei bilateralen Verbindungen wird auch am Quellende Platz für eine rückwärts gerichtete Pfeilspitze gelassen.

Beim Verschieben werden die SVG-Attribute von Linie, Pfeilspitzen und Label direkt aktualisiert. Ein vollständiger Render und eine Speicherung erfolgen erst nach Ende des Drags.

### Pan und Zoom

Der sichtbare Ausschnitt wird über den Scroll-Container verschoben. Der Zoom verändert die SVG-Breite und -Höhe gleichmäßig. Beim Zoom über dem Mauszeiger wird ein Ankerpunkt berechnet, damit der Inhalt unter dem Mauszeiger möglichst an derselben Stelle bleibt.

## 9. Foundry-Schnittstellen

Die wichtigsten genutzten Foundry-Schnittstellen sind:

| Schnittstelle | Verwendung |
|---|---|
| `Hooks.once("init")` | Einstellungen, Menüs und Keybinding registrieren |
| `Hooks.on("getSceneControlButtons")` | Storyboard-Button in den Token-Controls |
| `game.settings.register` | World-Daten und World-Optionen |
| `game.settings.registerMenu` | Öffnen über die Foundry-Settings |
| `game.keybindings.register` | `Ctrl+Alt+S` |
| `foundry.applications.api.ApplicationV2` | native Application-Basis |
| `HandlebarsApplicationMixin` | Handlebars-Part-Rendering |
| `fromUuid` | Foundry-Dokumente aus Links und Drops auflösen |
| `Scene.view()` | native Scene-Anzeige für GM-Scene-Links |
| `document.sheet.render()` | native Dokument-Sheets für Standarddokumente |
| `ui.playlists` | native Playlist-Seitenleiste für `PlaylistSound` |
| `foundry.applications.ux.ProseMirrorEditor` | lokale Rich-Text-Editoren |
| `foundry.applications.ux.DragDrop` | Foundry-Dokument-Drag-&-Drop |
| `foundry.applications.ux.TextEditor` | HTML-Anreicherung und Vorschauen |
| `CONFIG.JournalEntry.noteIcons` | Map-Notes-Icon-Liste und Pfade |

Foundry-Dokumente dürfen nur über ihre native API angesprochen werden. Das Modul kopiert für persistente Board-Objekte nur Metadaten wie UUID, Titel, Typ und Artwork-Pfad; es übernimmt keine Foundry-Dokumente.

### PlaylistSound-Link

Der Sonderfall liegt in `StoryboardApplication.#openFoundryDocument` vor dem allgemeinen Sheet-Fallback:

1. `fromUuid` löst den `PlaylistSound` auf.
2. Der Parent `Playlist` wird gelesen.
3. `ui.playlists` wird aktiviert.
4. Die Playlist-ID wird in `ui.playlists._expanded` ergänzt.
5. Die native PlaylistDirectory-Ansicht wird gerendert.
6. Das Element `[data-sound-id="..."]` wird gesucht, in den sichtbaren Bereich gescrollt und kurz hervorgehoben.

Der Zugriff auf `_expanded` ist ein gezielter Foundry-14-Kompatibilitätszugriff auf den dokumentierten Zustand der nativen PlaylistDirectory. Es darf dort nicht wieder das `PlaylistSound`-Sheet geöffnet werden.

## 10. Lokalisierung

Die Basissprache ist `en`. Die Sprachdateien liegen in `lang/` und werden über `module.json` geladen:

```json
{
  "lang": "en",
  "name": "English",
  "path": "lang/en.json"
}
```

Benutzertexte werden über Schlüssel unter `MEL_STORYBOARD` lokalisiert. Neue sichtbare Texte müssen in `en.json` und in allen derzeit unterstützten Dateien ergänzt werden:

- `lang/en.json`;
- `lang/de.json`;
- `lang/fr.json`;
- `lang/es.json`;
- `lang/nl.json`.

Für Scene-Icon-Typen wird der gespeicherte Foundry-Schlüssel nicht übersetzt. Die Anzeige versucht zuerst einen Modulschlüssel unter `MEL_STORYBOARD.SCENE_ICON_TYPES` und fällt anschließend auf den Foundry-Schlüssel zurück. Das verhindert, dass ein Sprachwechsel die gespeicherte Bedeutung ändert.

## 11. Undo und Redo

`HistoryStack` speichert vollständige Board-Kopien:

- `capture(state)` legt den aktuellen Stand auf den Past-Stack und leert Future;
- `undo(currentState)` verschiebt den aktuellen Stand nach Future und liefert den letzten Past-Stand;
- `redo(currentState)` verschiebt den aktuellen Stand nach Past und liefert den nächsten Future-Stand;
- Standardlimit: 100 Snapshots.

Die Anwendung ruft `capture` vor mutierenden Operationen auf. Während Pointer-Move werden keine Snapshots pro Pixel erzeugt. Nach Undo/Redo wird der resultierende Stand erneut über den Store gespeichert und gerendert.

## 12. Berechtigungen und Mehrbenutzerverhalten

- Board-Schreibzugriffe sind ausschließlich GM-Benutzern erlaubt.
- Settings-Menü, Keybinding und Scene-Control-Button sind GM-restricted bzw. GM-gefiltert.
- Drag & Drop von Foundry-Dokumenten wird nur für GMs akzeptiert.
- Foundry-Dokumente werden weiterhin nach den normalen Foundry-Berechtigungen aufgelöst.
- Ein nicht verfügbares oder gelöschtes Foundry-Dokument kann aus dem Board nicht geöffnet werden.
- Die Board-Daten liegen in der World und sind damit für Benutzer derselben World grundsätzlich gemeinsam gespeichert.
- Objekte, Bilder und Dokument-Sheets werden nicht durch das Modul für andere Benutzer freigeschaltet; Foundrys eigene Sichtbarkeits- und Ownership-Regeln bleiben maßgeblich.

## 13. Wartung durch Junior Developer

### Eine neue Einstellung hinzufügen

1. Konstante in `scripts/domain/constants.js` ergänzen.
2. Einstellung in `scripts/main.js` über `game.settings.register` registrieren.
3. Schlüssel für Name und Hint in allen Sprachdateien ergänzen.
4. Einstellung in `_prepareContext` lesen.
5. View-Model und Template/CSS anpassen.
6. Bei sichtbarer Änderung README ergänzen.
7. `npm test`, `npm run check` und manuelle Foundry-Prüfung durchführen.

### Einen neuen Objekt-Typ hinzufügen

1. Internen Wert in `OBJECT_TYPES` ergänzen.
2. Mapping von Foundry `documentName` in `#onFoundryDrop` ergänzen.
3. Drag-&-Drop-Unterstützung in `supportedTypes` ergänzen.
4. Icon in `OBJECT_ICONS` ergänzen.
5. Typ in allen Sprachdateien ergänzen.
6. Öffnungslogik in `#openFoundryDocument` prüfen. Sonderfälle müssen vor dem allgemeinen Sheet-Fallback behandelt werden.
7. README, Tests und manuelle Testmatrix aktualisieren.

### Einen Status hinzufügen

1. Wert in `STATUS` ergänzen.
2. Lokalisierung in allen Sprachdateien ergänzen.
3. Klasse in `STATUS_COLOR_CLASSES` ergänzen.
4. CSS-Farben in `styles/module.css` ergänzen.
5. SVG-Statusregeln in `sceneBoardToSvg` ergänzen.
6. Icon-Kontrast für den neuen Status prüfen.
7. Scene Card, Inspector, Export und Übersetzungen manuell prüfen.

### Schema ändern

1. `STORE_SCHEMA_VERSION` erhöhen.
2. `normalizeSceneBoard` um eine explizite Migration erweitern.
3. `validateSceneBoard` anpassen.
4. Neue und alte Daten mit Tests abdecken.
5. Import, Merge, Export und Undo/Redo prüfen.
6. Abwärtskompatibilität und Migrationsverhalten in README und Release Notes dokumentieren.

### Lebenszyklus- und Event-Regeln

- Keine teuren Vollrenders in `pointermove`-Handlern.
- Temporäre globale Listener bei `pointerup`, `pointercancel` und beim Schließen entfernen.
- Rich-Text-Editoren vor jedem Render und beim Schließen zerstören.
- Für DOM-Änderungen `data-*`-Attribute als stabile Bindungspunkte verwenden.
- Keine direkte Mutation von Foundry-Dokumenten, wenn nur Board-Metadaten geändert werden sollen.
- Bei einem neuen Foundry-API-Zugriff zuerst prüfen, ob es sich um eine öffentliche API oder einen bewusst dokumentierten Kompatibilitätszugriff handelt.

## 14. Tests und Qualitätssicherung

Automatisierte Prüfungen:

```text
npm test
npm run check
git diff --check
```

`npm test` führt die Node-Test-Suite in `tests/domain.test.mjs` aus. Sie deckt unter anderem ab:

- Board-Erzeugung und Defaultwerte;
- Kapitel-, Szenen- und Knotenoperationen;
- Archivieren und Wiederherstellen;
- Sortieren und Verschieben zwischen Kapiteln;
- Entfernen ungültiger Cross-Chapter-Verbindungen;
- Player-Character- und PlaylistSound-Objekte;
- Connection-Endpunktregeln;
- bilaterale und deaktivierte Darstellung;
- JSON-/SVG-Daten und Scene-Icon-Export;
- kapitelweise Export-Schranken.

`npm run check` prüft JavaScript-Syntax, Manifest-Pfade, JSON-Dateien und die Vollständigkeit der Lokalisierungsschlüssel.

### Manuelle Foundry-Prüfung

Nach einer Änderung sollte mindestens geprüft werden:

1. Modul laden und Foundry-Konsole auf Fehler prüfen.
2. Storyboard über Settings, Scene Controls und `Ctrl+Alt+S` öffnen.
3. Kapitel, Szene, Entry-/Exit-Knoten und Verbindungen anlegen, verschieben und löschen.
4. Szene in ein anderes Kapitel ziehen und die automatische Connection-Bereinigung prüfen.
5. Scene Details, Chapter Details und Connection Details speichern.
6. Objekte aller unterstützten Foundry-Typen per Drag & Drop verknüpfen.
7. Playlist-Track-Link öffnen und sicherstellen, dass kein Track-Konfigurationsfenster erscheint.
8. Statusfärbung und Scene-Icons jeweils aktiviert und deaktiviert prüfen.
9. JSON importieren/exportieren sowie SVG, PNG und PDF mit mehreren Kapiteln prüfen.
10. Deutsche und englische Anzeige einschließlich langer Titel und Labels prüfen.

## 15. Bekannte Grenzen

- Scene Connections bleiben auf ein Kapitel beschränkt.
- Kapitelverbindungen sind ausschließlich Exit → Entry zwischen unterschiedlichen Kapiteln.
- Nur Kapitel können archiviert werden; einzelne Szenen besitzen keinen Archivstatus.
- Das Modul enthält keine eigene Benutzer- oder Anmeldeverwaltung.
- Das Modul bundelt keine Drittanbieter-Artworks oder Audio-Dateien.
- Nicht erreichbare Foundry-Dokumente können nicht aus dem Board geöffnet werden.
- Template-Management ist im aktuellen UI nicht aktiv, obwohl die Datenstruktur und Domain-Funktionen aus Kompatibilitätsgründen vorhanden sind.
- Die Anwendung ist nicht detachbar.

## 16. Release- und Änderungsregeln

Bei einer user-sichtbaren Änderung müssen mindestens angepasst werden:

- Code und Tests;
- relevante Sprachdateien;
- `README.md`;
- Versionsnummer in `module.json` nach der festgelegten Release-Entscheidung;
- englische Release Notes.

Das Manifest verwendet SemVer ohne führendes `v`, beispielsweise `0.1.1`. Das `v` wird nur für Git-Tags und Release-URLs verwendet. Die `compatibility.verified`-Angabe darf nur geändert werden, wenn die betreffende Foundry-Version tatsächlich getestet wurde.

## 17. Support und Quellen

- Repository: <https://github.com/melnari/mel-storyboard>
- Issues: <https://github.com/melnari/mel-storyboard/issues>
- Foundry API: <https://foundryvtt.com/api/v14/>
- Lizenz: [Apache License 2.0](LICENSE)

Die technische Dokumentation beschreibt den aktuellen Repository-Stand. Bei Abweichungen zwischen Dokumentation und Code ist zunächst der Code zu prüfen und anschließend diese Datei zusammen mit README und Release Notes zu aktualisieren.
