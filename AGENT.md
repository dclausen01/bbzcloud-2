# BBZ Cloud - Agent Documentation

## 1. Projektübersicht

**BBZ Cloud** ist eine Electron-basierte Desktop-Anwendung, die als Unified Interface für verschiedene Bildungswebanwendungen (Moodle, Schul.cloud, Nextcloud, Office 365, etc.) dient. Sie bietet eine zentrale Navigation, integriertes Fenstermanagement und zusätzliche Produktivitäts-Tools für Lehrer und Schüler des BBZ Rendsburg-Eckernförde.

### Tech Stack
- **Framework**: Electron (v42)
- **Frontend**: React (v18.3.1)
- **UI Library**: Chakra UI (v2)
- **Build Tool**: Vite (Renderer-Bundling) + Electron Builder (Packaging)
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

### BigBlueButton / Greenlight 3
Der BBB-Server läuft auf Greenlight 3 (React-SPA) statt Greenlight 2 (Rails):
- Loginseite: `https://bbb.bbz-rd-eck.de/signin` (vorher `/b/signin`) — `URLS.BBB_SIGNIN`.
- Räume: `https://bbb.bbz-rd-eck.de/rooms/<friendly-id>` bzw. `/rooms/<friendly-id>/join` (vorher `/b/<friendly-id>`).
- **Greenlight bleibt in der App**, nur die Übergabe an die eigentliche Konferenz
  (`/bigbluebutton/api/join?…`, `/html5client/…`) wird im System-Browser geöffnet,
  damit Kamera/Mikrofon/Bildschirmfreigabe funktionieren. Regeln zentral in
  `public/services/externalLinks.js` (`shouldOpenExternally`), genutzt von
  `electron.js` und `ViewManager.js`.
- **Wichtig:** Greenlight 2 hat per Server-Redirect übergeben (`will-redirect`),
  Greenlight 3 macht das im Client per `window.location.replace(joinUrl)` —
  das feuert `will-navigate`. Beide Events werden in `electron.js` behandelt.
- Weil Greenlight 3 eine SPA ist, feuert beim Ab-/Anmelden kein `dom-ready`.
  Der Auto-Login wird deshalb zusätzlich bei `did-navigate`/`did-navigate-in-page`
  auf die `/signin`-Route ausgelöst (`WebViewContainer.js`).

### Zugangsdaten im Schlüsselbund (`CredentialStore.js`)
Alle Felder eines Service liegen in **einem** Keychain-Eintrag als JSON
(Account `credentials`), nicht mehr in acht Einzel-Einträgen. Grund: macOS
fragt die Freigabe pro Eintrag ab — vorher also bis zu acht Dialoge, die sich
durch parallele `Promise.all`-Ladevorgänge auch noch gleichzeitig stapelten.

- `public/services/CredentialStore.js` ist der **einzige** Ort, der `keytar`
  direkt benutzt. Alles andere (electron.js, DatabaseService) geht darüber.
- Die IPC-Schnittstelle (`{service, account}`) bleibt unverändert — im
  Renderer musste nichts angepasst werden.
- **Migration**: Fehlt das Bündel, werden die Alt-Einträge einmalig
  sequenziell gelesen und zusammengefasst. Sie werden bewusst *nicht*
  gelöscht (Sicherheitsnetz); nur `remove()` räumt den jeweiligen Alt-Eintrag
  mit weg, damit gelöschte Zugangsdaten nicht wieder auftauchen.
- **Zwei Fallstricke**, die beim Ändern leicht wieder reinrutschen:
  1. Lesen–Ändern–Cache-Schreiben muss **ohne `await` dazwischen** ablaufen.
     Bei parallelen `set()`-Aufrufen bekommen sonst alle denselben Ausgangs-
     stand und überschreiben sich gegenseitig — am Ende überlebt nur das
     zuletzt gespeicherte Feld.
  2. Schreibvorgänge sind pro Service **verkettet** (`writeQueue`) und
     schreiben den Cache-Stand zum Ausführungszeitpunkt, nicht einen
     Schnappschuss. Sonst kann ein langsamer älterer Write einen neueren
     überholen.
- **Nicht gelöst**: Dass die Abfrage überhaupt erscheint, liegt an der
  fehlenden Code-Signatur des macOS-Builds (`build.mac` hat keine `identity`,
  kein `hardenedRuntime`, keine Notarisierung, keine `CSC_*`-Secrets in
  `release.yml`). Ohne stabile Developer-ID sieht macOS nach jedem Update
  eine andere App, die Keychain-ACL greift nicht mehr und selbst „Immer
  erlauben" hält nicht. Behebbar nur per Signierung + Notarisierung.

### Fokus-Schutz bei der Credential-Injection
Symptom, wenn das fehlt: Der Cursor springt in WebViews immer wieder aus
Textfeldern heraus, Eingaben sind praktisch unmöglich. Ursache sind die
periodischen Login-Checks (alle 2–5 s), die bei fehlerhafter „eingeloggt?"-
Erkennung dauerhaft weiterlaufen und dabei Felder befüllen und `focus()` rufen.
Schutzmechanismen:
1. `injectCredentials` bricht ab, wenn der Nutzer gerade tippt (`USER_IS_TYPING_JS`:
   fokussiertes editierbares Element **mit** Inhalt; ein leeres autofokussiertes
   Loginfeld zählt nicht, sonst blockiert es den Auto-Login).
2. `__bbzSafeFocus` (`SAFE_FOCUS_HELPER_JS`) fokussiert ein Feld nur, wenn nicht
   gerade woanders geschrieben wird.
3. Pro App läuft immer nur **eine** Injection gleichzeitig (`injectionInFlight`).
4. Login-Erkennung prüft **sichtbare** Elemente statt Seitentext. Konkret ersetzt:
   `document.body.textContent.includes('Verschlüsselungskennwort')` (schul.cloud)
   und `document.querySelector('form')` (WebUntis) — beide treffen auch die
   eingeloggte Oberfläche.
5. `ViewManager.show()` fokussiert die View nicht erneut, wenn sie bereits aktiv
   und sichtbar ist; `_applyBounds()` überspringt unveränderte Bounds. Der
   Renderer hängt den show/hide-Effekt nur an der App-ID, nicht am
   `activeWebView`-Objekt (das bei jeder Navigation neu erzeugt wird).

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
| **BigBlueButton** | Greenlight 3: `#signInFormEmail` + `#signInFormPwd` → `button[type="submit"]` im Formular. Werte über den nativen `value`-Setter + gebubbletes `input`-Event (react-hook-form ignoriert direkt gesetzte `.value`). Alte Greenlight-2-Selektoren (`#session_email`/`#session_password`/`.signin-button`) bleiben als Fallback. |
| **Outlook** | `#userNameInput` + `#passwordInput` → `#submitButton` (ADFS) |
| **Nextcloud** | Klick auf `a[href*="user_saml/saml/login"]` ("BBZ ADFS") → dann wie Outlook (ADFS) |
| **Moodle** | `input#username` + `input#password` → `button#loginbtn` |
| **schul.cloud** | `input#username` + `input[type="password"]` |
| **BBZ Chat** | Direkter API-Call: `fetch('/api/login', {email, password, securityPassword})` → Token in `localStorage('schulchat_token')` speichern → `webview.reload()`. Umgeht die React-19-Login-Form komplett. Webview-ID ist `schulcloud` (URL-Erkennung via `chat.bbz-rd-eck.com`). |
| **WebUntis** | Periodenbasiert, eigene Selektor-Logik |
| **Schulportal** | Keycloak: `input#username` + `input#password` → `input#kc-login` |
| **Handbuch/Anträge** | ADFS-Login analog Outlook |

Die Credentials (E-Mail, Passwort) werden aus dem System-Keychain (`keytar`) geladen. Nextcloud verwendet dieselben Zugangsdaten wie Outlook (ADFS-Domain-Login). BBZ Chat nutzt zusätzlich das `schulcloudEncryptionPassword` (Fallback: Hauptpasswort).

### BBZ Chat / schul.cloud Umschaltung
Der `schulcloud`-Navigationsbutton kann zwischen schul.cloud und BBZ Chat umgeschaltet werden (`useBbzChat`-Toggle in Einstellungen). Die Webview-ID bleibt `schulcloud`, die URL wird über `URLS.BBZ_CHAT` / `URLS.SCHULCLOUD` gesteuert. Die Credential-Injection erkennt den aktiven Dienst über `webview.getURL().includes('chat.bbz-rd-eck.com')`.

**BBZ Chat Credential-Injection (Direkter API-Ansatz):**
Statt die React-19-Login-Form zu manipulieren (Fiber-Traversal, `__reactProps$`, native setter — alles fragil bei React 19), wird `POST /api/login` direkt per `fetch()` im Webview-Kontext aufgerufen. Der zurückgegebene Token wird in `localStorage('schulchat_token')` gespeichert und die Seite neu geladen. Die stashcat-chat App (https://github.com/dclausen01/stashcat-chat) erkennt den Token beim Start via `restoreToken()` und überspringt die Login-Seite.

**Wichtig — Race Condition bei `dom-ready`:**
Der `schulcloud`-Webview ruft `injectCredentials` direkt beim `dom-ready`-Event auf (wie alle anderen Apps). Zusätzlich läuft ein periodischer Check (alle 5s) als Fallback für Multi-Step-Flows (schul.cloud Verschlüsselungsseite). Der direkte Aufruf ist notwendig, weil der `useEffect` in `WebViewContainer.js` Dependencies hat, deren Änderung den `setInterval` cleart — und `dom-ready` feuert nicht erneut.

## 7. Bekannte Probleme / ToDos
- Die Erkennung von Benachrichtigungs-Badges für **schul.cloud** basiert auf Pixel-Analyse des Favicons (siehe `NOTIFICATION_CONFIG` in constants.js) und kann je nach Webseiten-Update fragil sein.
- Für **BBZ Chat** wird stattdessen `document.title` geparst (Pattern: `(N) BBZ Chat`). Der `update-badge` IPC-Handler akzeptiert sowohl Zahlen (BBZ Chat: Anzahl ungelesener Nachrichten) als auch Booleans (schul.cloud Legacy). Auf macOS wird `app.dock.setBadge()` für die Dock-Badge-Anzeige genutzt.
- PDF-Handling innerhalb von WebViews erfordert oft spezielle Konfiguration in `electron.js` (Plugins aktiviert).
