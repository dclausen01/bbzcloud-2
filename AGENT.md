# BBZ Cloud - Agent Documentation

## 1. Projektübersicht

**BBZ Cloud** ist eine Electron-basierte Desktop-Anwendung, die als Unified Interface für verschiedene Bildungswebanwendungen (Moodle, Schul.cloud, Nextcloud, Office 365, etc.) dient. Sie bietet eine zentrale Navigation, integriertes Fenstermanagement und zusätzliche Produktivitäts-Tools für Lehrer und Schüler des BBZ Rendsburg-Eckernförde.

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
- **Benutzer-Filterung**: In `App.js` (`filterNavigationButtons`) wird anhand der E-Mail-Domain (`@bbz-rd-eck.de`) unterschieden, ob der Nutzer Lehrer (alle Apps) oder Schüler (eingeschränkte Apps) ist. Schüler erhalten Zugriff auf: `schulcloud`, `moodle`, `nextcloud`, `cryptpad`, `webuntis`, `wiki`.
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
- **`src/context/SettingsContext.js`**: Definiert die Standard-Apps (`standardApps`) und Navigationsbuttons (`defaultSettings.navigationButtons`) mit deren Sichtbarkeit und Button-Varianten. Die `standardApps` erscheinen im "Apps"-Dropdown-Menü (`CustomAppsMenu.js`).
- **`src/theme.js`**: Definiert Farb-Paletten und Button-Varianten für Chakra UI. Jeder Navigationsbutton hat eine passende Farb-Variante (z.B. `nextcloud`, `moodle`, `blue`).
- **`src/components/AppIcon.js`**: Mappt Button-IDs auf SVG-Dateien in `assets/icons/`. Icons ohne Eintrag fallen auf `link.svg` zurück.
- **`package.json`**: Definiert Build-Konfigurationen für Electron Builder (Icons, AppIds, File Associations).

### Navigationsbuttons vs. Apps-Dropdown
- **Navigationsbuttons** (definiert in `SettingsContext.js` → `defaultSettings.navigationButtons`): Hauptleiste, immer sichtbar, haben WebViews im Hauptfenster mit Credential-Injection. Schlüssel: `schulcloud` (auch BBZ Chat via `useBbzChat`-Toggle), `moodle`, `bbb`, `outlook`, `nextcloud`, `cryptpad`, `taskcards`, `webuntis`, `fobizz`, `wiki`, `schulportal`.
- **Apps-Dropdown** (`standardApps` + Custom Apps): Öffnen in separatem Fenster, keine automatische Credential-Injection. Enthält u.a. `MS Office` (https://m365.cloud.microsoft/apps/?auth=2).

## 5. Entwicklung

### Scripts
- `npm start`: Startet React im Browser (für UI-Dev).
- `npm run electron-dev`: Startet React und Electron parallel.
- `npm run build`: Baut die React-App.
- `npm run dist`: Erstellt Installationspakete für das aktuelle OS.
- `npm run release`: Baut und veröffentlicht (via GitHub Actions).

### Assets
Icons und Bilder liegen unter `assets/`. Es gibt spezifische Logiken für Tray-Icons (Windows vs. macOS/Linux) und Badges (Benachrichtigungs-Indikatoren).

## 6. Credential-Injection (Auto-Login)

Die automatische Anmeldung ist in `WebViewContainer.js` implementiert und wird an drei Stellen ausgelöst:
1. **`dom-ready`**: Initiale Prüfung + periodischer 5s-Intervall-Check.
2. **`did-navigate`**: Prüfung nach jeder Seitennavigation.
3. **`injectCredentials()`**: Der eigentliche Injection-Code (Switch-Statement nach Button-ID).

### Unterstützte Dienste und Login-Flows

| Dienst | Ablauf |
|--------|--------|
| **Outlook** | `#userNameInput` + `#passwordInput` → `#submitButton` (ADFS) |
| **Nextcloud** | Klick auf `a[href*="user_saml/saml/login"]` ("BBZ ADFS") → dann wie Outlook (ADFS) |
| **Moodle** | `input#username` + `input#password` → `button#loginbtn` |
| **schul.cloud** | `input#username` + `input[type="password"]` |
| **BBZ Chat** | React-Fiber-Injection: `getReactProps`→`onChange` für `input[type=email]` + 2× `input[type=password]`, Form-Submit via React `onSubmit`-Handler. Die stashcat-chat App (https://github.com/dclausen01/stashcat-chat) übernimmt API-Aufruf und Token-Verwaltung. Webview-ID ist `schulcloud` (URL-Erkennung via `chat.bbz-rd-eck.com`). |
| **WebUntis** | Periodenbasiert, eigene Selektor-Logik |
| **Schulportal** | Keycloak: `input#username` + `input#password` → `input#kc-login` |
| **Handbuch/Anträge** | ADFS-Login analog Outlook |

Die Credentials (E-Mail, Passwort) werden aus dem System-Keychain (`keytar`) geladen. Nextcloud verwendet dieselben Zugangsdaten wie Outlook (ADFS-Domain-Login). BBZ Chat nutzt zusätzlich das `schulcloudEncryptionPassword` (Fallback: Hauptpasswort).

### BBZ Chat / schul.cloud Umschaltung
Der `schulcloud`-Navigationsbutton kann zwischen schul.cloud und BBZ Chat umgeschaltet werden (`useBbzChat`-Toggle in Einstellungen). Die Webview-ID bleibt `schulcloud`, die URL wird über `URLS.BBZ_CHAT` / `URLS.SCHULCLOUD` gesteuert. Die Credential-Injection erkennt den aktiven Dienst über `webview.getURL().includes('chat.bbz-rd-eck.com')`.

**BBZ Chat Credential-Injection (React-Fiber-Ansatz):**
Die stashcat-chat LoginPage verwendet React Controlled Inputs. Direkte `.value`-Zuweisung funktioniert nicht. Stattdessen wird der React Fiber-Tree traversiert, um den `onChange`-Handler direkt aufzurufen — identisch zum WebUntis-Ansatz. Die stashcat-chat App übernimmt danach den API-Aufruf (`POST /api/login`), Token-Speicherung und State-Update.

## 7. Bekannte Probleme / ToDos
- Die Erkennung von Benachrichtigungs-Badges ("Red Dot") in WebViews basiert auf Pixel-Analyse (siehe `NOTIFICATION_CONFIG` in constants.js) und kann je nach Webseiten-Update fragil sein.
- PDF-Handling innerhalb von WebViews erfordert oft spezielle Konfiguration in `electron.js` (Plugins aktiviert).
