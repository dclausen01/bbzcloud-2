# BBZ Cloud - Agent Documentation

## 1. Projektübersicht

**BBZ Cloud** ist eine Electron-basierte Desktop-Anwendung, die als Unified Interface für verschiedene Bildungswebanwendungen (Moodle, Schul.cloud, Office 365, etc.) dient. Sie bietet eine zentrale Navigation, integriertes Fenstermanagement und zusätzliche Produktivitäts-Tools für Lehrer und Schüler des BBZ Rendsburg-Eckernförde.

### Tech Stack
- **Framework**: Electron (v33.2.0)
- **Frontend**: React (v18.3.1)
- **UI Library**: Chakra UI
- **Build Tool**: Electron Builder
- **State/Storage**:
  - `electron-store`: Fenstereinstellungen, Basiskonfiguration
  - `sqlite3`: Komplexe Daten (Todos, Custom Apps, Dokumenten-Metadaten)
  - `keytar`: Sichere Speicherung von Anmeldeinformationen
  - `fs-extra` & `zlib`: Dateisystemoperationen und Kompression

## 2. Architektur

### Main Process (`public/electron.js`)
Der Main Process steuert den Lebenszyklus der Anwendung und native Funktionen:
- **Fenstermanagement**: Hauptfenster, Splash Screen, Tray-Icon und separate WebView-Fenster.
- **IPC Kommunikation**: Umfangreiche Handler für Datenbankzugriffe, Dateisystemoperationen und Systeminteraktionen.
- **Auto-Update**: Integration von `electron-updater`.
- **Power Monitor**: Reagiert auf System-Suspend/Resume (wichtig für Session-Erhalt).
- **macOS Optimierungen**: Spezifische Garbage Collection und Cache-Bereinigung für WebViews.

### Renderer Process (`src/`)
Die Benutzeroberfläche basiert auf React und ist modular aufgebaut:
- **`App.js`**: Hauptkomponente, verwaltet den globalen State, Shortcuts und WebViews.
- **`SettingsContext.js`**: Verwaltet App-Einstellungen, Navigations-Buttons und Custom Apps.
- **`WebViewContainer.js`**: Wrapper für die Electron `<webview>` Tags mit Zoom- und Navigationssteuerung.
- **`DatabaseService.js`** (via IPC): Schnittstelle zur SQLite-Datenbank.

### Datenhaltung
1.  **Settings**: Gespeichert in `electron-store` (JSON) und SQLite.
2.  **Credentials**: E-Mail, Passwörter für Dienste werden sicher im System-Keychain via `node-keytar` abgelegt.
3.  **Secure Storage**: Verschlüsselte Speicherung von Dokumenten (AES-Verschlüsselung mit komprimierten Inhalten).

## 3. Kernfunktionen & Besonderheiten

### WebView-Architektur
- **Partitionierung**: Nutzt `persist:main` um Sessions (Cookies, LocalStorage) über App-Neustarts hinweg zu erhalten.
- **Injection**: Injeziert `webview-preload.js` um Webseiten-Shortcuts abzufangen und an den Main Process zu senden.
- **Zoom-Steuerung**: Individueller Zoom pro WebView, globaler Zoom und Navbar-Zoom.

### Besondere "Quirks" & Workarounds
- **Session-Reloads**: Webseiten wie **Outlook (OWA)** und **WebUntis** benötigen einen expliziten Reload nach System-Resume (Sleep/Wake), da ihre Sessions sonst ablaufen oder einfrieren. Dies wird im Main Process (`powerMonitor`) behandelt.
- **Benutzer-Filterung**: In `App.js` (`filterNavigationButtons`) wird anhand der E-Mail-Domain (`@bbz-rd-eck.de`) unterschieden, ob der Nutzer Lehrer (alle Apps) oder Schüler (eingeschränkte Apps) ist.
- **macOS Memory Management**: Implementiert eine aggressive Cache-Bereinigung für Bilder und WebViews, um Speicherlecks unter macOS zu verhindern.
- **Fenster-Sichtbarkeit**: `ensureWindowBoundsVisible` stellt sicher, dass Fenster nicht außerhalb des sichtbaren Bildschirmbereichs wiederhergestellt werden (z.B. bei Monitorwechsel).

### Sicherheit
- **Secure Delete**: Dateien werden vor dem Löschen mehrfach überschrieben (`secureDelete` in `electron.js`).
- **Verschlüsselte Dokumente**: Dateien können importiert, komprimiert, verschlüsselt und lokal gespeichert werden. Beim Öffnen werden sie temporär entschlüsselt und überwacht.

### UI & UX
- **Command Palette** (`Ctrl+Shift+P`): Schnellzugriff auf alle Funktionen.
- **Todo-System**: Integrierte Todo-Liste mit Kontextmenü-Support ("Als Todo hinzufügen").
- **Custom Apps**: Nutzer können eigene URLs als "Apps" hinzufügen.
- **Keyboard Shortcuts**: Umfangreiches System, das globale Shortcuts (`Ctrl+Shift+...`) und WebView-spezifische Shortcuts (`Ctrl+F`, `F5`) vereinheitlicht.

## 4. Konfiguration

Wichtige Konfigurationsdateien:
- **`src/utils/constants.js`**: Enthält alle statischen URLs, Fehlermeldungen, Timeouts und Konfigurationsobjekte. Hier sollten URL-Änderungen vorgenommen werden.
- **`src/context/SettingsContext.js`**: Definiert die Standard-Apps und deren Sichtbarkeit sowie Varianten der Buttons.
- **`package.json`**: Definiert Build-Konfigurationen für Electron Builder (Icons, AppIds, File Associations).

## 5. Entwicklung

### Scripts
- `npm start`: Startet React im Browser (für UI-Dev).
- `npm run electron-dev`: Startet React und Electron parallel.
- `npm run build`: Baut die React-App.
- `npm run dist`: Erstellt Installationspakete für das aktuelle OS.
- `npm run release`: Baut und veröffentlicht (via GitHub Actions).

### Assets
Icons und Bilder liegen unter `assets/`. Es gibt spezifische Logiken für Tray-Icons (Windows vs. macOS/Linux) und Badges (Benachrichtigungs-Indikatoren).

## 6. Bekannte Probleme / ToDos
- Die Erkennung von Benachrichtigungs-Badges ("Red Dot") in WebViews basiert auf Pixel-Analyse (siehe `NOTIFICATION_CONFIG` in constants.js) und kann je nach Webseiten-Update fragil sein.
- PDF-Handling innerhalb von WebViews erfordert oft spezielle Konfiguration in `electron.js` (Plugins aktiviert).
