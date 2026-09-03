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

### Login-Wächter (`LOGIN_WATCHERS` in `WebViewContainer.js`)
**Ein** Timer prüft ab dem Mount alle 2,5 s, ob eine App noch eine Loginmaske
zeigt, und stösst dann die Injection an. Er läuft bewusst unabhängig von
`dom-ready`.

Vorher gab es fünf einzelne Intervalle, die erst *im* `dom-ready`-Handler
gestartet wurden. Wurde das Ereignis verpasst oder lief die erste Injection zu
früh (Maske noch nicht gerendert), existierte überhaupt kein Wiederholungs-
mechanismus — der Login blieb bis zum nächsten ausdrücklichen Reload liegen.
Das war die Ursache von „läuft, aber oft erst nach manuellem Reload".

Beim Ändern beachten:
- **`loginAttempts` mit zurücksetzen**, solange eine Loginmaske sichtbar ist.
  Sonst brauchen Läufe, die gar kein Formular vorgefunden haben, das Budget
  von `MAX_LOGIN_ATTEMPTS` (3) auf, und die App gibt für den Rest der Sitzung
  auf, ohne je einen echten Loginversuch gemacht zu haben.
- **`failedLogins` stoppt den Wächter** — nur so hört er bei tatsächlich
  falschen Zugangsdaten auf.
- **`submitAttempts` ist die eigentliche Bremse.** `loginAttempts` wird vom
  Wächter jeden Tick genullt, `MAX_LOGIN_ATTEMPTS` greift für überwachte Apps
  also nie. `submitAttempts` zählt nur *tatsächlich abgeschickte* Anmeldungen,
  wird vom Wächter nicht angefasst und stoppt nach `MAX_SUBMIT_ATTEMPTS` (5).
  Ohne das feuert die App bei falschem Passwort alle 2,5 s eine Anmeldung —
  Keycloak (Schulportal) und ADFS sperren dann das Konto.
  Zurückgesetzt wird der Zähler, wenn die Loginmaske verschwunden ist, sowie
  bei Reload und System-Resume.
- **Ein überholter Auslöser wird vorgemerkt, nicht verworfen**
  (`injectionRerunRef`). Der erste Schlüsselbund-Zugriff kann auf macOS
  minutenlang am Systemdialog hängen; verworfene Auslöser in dieser Zeit
  bedeuten verlorene Loginversuche.
- **Sperrzeiten gehören in den Speicher, nicht in `localStorage`.** Die
  WebUntis-Sperre lag früher dort und überlebte den App-Neustart — sie
  blockierte den Auto-Login dann selbst bei frisch dastehender Loginmaske.
- **Eine Sperre darf nur nach einem ERFOLGREICHEN Versuch gesetzt werden.**
  Das WebUntis-Skript meldete `SUCCESS`, sobald der Button geklickt war — ein
  fehlgeschlagener Login verbrannte damit drei Minuten, in denen gar nichts
  passierte. Jetzt wird geprüft, ob die Loginmaske verschwunden ist
  (`STILL_ON_LOGIN`), und ein ausdrückliches Reload hebt die Sperre auf.
- **Kein `window.location.reload()` im injizierten Skript.** Der Reload rennt
  dem Rückgabewert davon: wird das Dokument abgeräumt, bevor
  `executeJavaScript` auflöst, hängt die Injection bis `INJECTION_STALE_MS`
  (45 s) und alle Wiederholungen in dieser Zeit laufen ins Leere.

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

### Selbstheilung der WebContentsViews (`WebViewContainer.js`)
Drei Mechanismen, die alle ohne Zutun des Nutzers laufen. Sie ersetzen das,
wofür man vorher von Hand neu laden musste.

1. **Ladefehler wiederholen.** `did-fail-load` und `render-process-gone` kamen
   vom `ViewManager` schon immer im Renderer an, ausgewertet hat sie niemand:
   schlug der erste Ladeversuch fehl (Netz beim Start noch nicht oben, kurzer
   Aussetzer, überlasteter Server), stand die Ansicht bis zu einem Reload durch
   den Nutzer auf der Chromium-Fehlerseite. Jetzt wird nach 3 s / 10 s / 30 s /
   60 s und danach alle 5 Minuten erneut geladen; das `online`-Ereignis zieht
   den nächsten Versuch sofort vor. Unterrahmen (`isMainFrame === false`) und
   `ERR_ABORTED` (-3, kommt von eigenen Navigationen) zählen nicht.
2. **Leer gebliebene Seiten.** 6 s nach `did-stop-loading` wird geprüft, ob das
   Dokument praktisch leer ist (kein Text, < 5 Elemente) — das passiert, wenn
   eine SPA nicht gebootet hat. Höchstens `MAX_BLANK_RELOADS` (3) Anläufe mit
   30 s Abstand. Chromium-Fehlerseiten fallen hier *nicht* hinein, die haben
   Text; um die kümmert sich Punkt 1.
3. **Stille Sitzungsverluste (Outlook).** OWA verliert seine Sitzung, ohne eine
   Loginmaske zu zeigen: die Oberfläche bleibt stehen, aktualisiert nichts mehr
   und der Login-Wächter findet nichts, worauf er reagieren könnte. Jede Minute
   fragt deshalb ein `HEAD /owa/` (`redirect: 'manual'`) den Server: eine
   abgelaufene Sitzung antwortet mit 401/403/440 oder einer Umleitung
   (`opaqueredirect`). Zwei Treffer hintereinander lösen einen Reload aus.
   Zusätzlich wird Outlook nach `WCV_MAX_AGE_MS` (20 min) ohne erfolgreichen
   Ladevorgang aufgefrischt — im Hintergrund nach 20 min, als aktive App erst
   nach 40 min, und beim Wechsel auf die App wird das Alter ebenfalls geprüft.

4. **Weisse Seite nach einem Reload im Verborgenen.** `_applyBounds()`
   überspringt unveränderte Bounds (Schutz gegen den springenden Cursor). Wird
   das Dokument einer *unsichtbaren* View ersetzt, bekommt der neue Renderer
   beim Sichtbarwerden deshalb weder Bounds noch Resize und liefert nie ein
   Bild — die App stand als weisse Fläche da, bis der Nutzer von Hand neu lud.
   Beim allerersten `show()` fiel das nie auf, weil `appliedBounds` dort noch
   `null` ist und `setBounds()` damit erzwungen wird.
   `ViewManager.show()` setzt die Bounds jetzt bei jedem Wechsel von unsichtbar
   auf sichtbar neu; wurde das Dokument im Verborgenen ersetzt
   (`_markDocumentReplaced` aus `navigate`/`reload`/`reloadAll`), erzwingt
   `_forceRepaint()` zusätzlich eine echte Grössenänderung — ein `setBounds()`
   mit identischem Rechteck kann intern folgenlos bleiben.
   Zusätzlich prüft der Renderer 1,2 s nach dem Wechsel auf eine App, ob
   wirklich etwas zu sehen ist, und lädt sonst sofort nach.

Beim Ändern beachten:
- **Automatische Reloads unsichtbarer Ansichten sind heikel.** Bei „leere
  Seite" wird deshalb nur vorgemerkt (`pendingReloadRef`) und beim Wechsel auf
  die App nachgeholt: Chromium darf Hintergrundseiten verwerfen und stellt sie
  beim Sichtbarwerden selbst wieder her — ein Reload von aussen nimmt ihm das
  aus der Hand und bringt nichts, gesehen wird die Seite ohnehin erst beim
  Wechsel.
- **Der Leer-Test muss `document.readyState` prüfen.** Ohne das würde der
  Wechsel auf eine gerade ladende App deren Ladevorgang abschiessen.
- **Alter zählt ab `did-finish-load`/`did-navigate`, nicht ab
  `did-navigate-in-page`.** Eine Hash-Navigation innerhalb der SPA beweist
  keine lebende Verbindung — würde sie mitzählen, gälte ein toter Outlook als
  frisch, solange der Nutzer darin herumklickt.
- **`hasUnsavedText` prüft nur `contenteditable` und `<textarea>`.** Das trifft
  eine offene E-Mail in OWA. Nähme man auch `<input>` dazu, würde ein einziges
  Zeichen im Suchfeld den Reload dauerhaft blockieren.
- **`autoReloadWcv` setzt `failedLogins` und `submitAttempts` NICHT zurück.**
  Sonst gäbe ein automatischer Reload bei falschen Zugangsdaten alle 20 Minuten
  die nächste Runde Anmeldeversuche frei. Nur ausdrückliche Nutzeraktionen
  (Reload-Taste, Aufwachen aus dem Standby) dürfen das.
- **`WCV_MAX_AGE_MS` enthält bewusst nur Outlook.** WebUntis wird beim Aufwachen
  ohnehin ausdrücklich neu geladen, und ein Hintergrund-Reload während der
  Eingabe des Bestätigungscodes würde die Anmeldung abwürgen.
- **Die Ansichten werden gestaffelt erzeugt** (`WCV_CREATE_STAGGER_MS`, 250 ms).
  Vorher starteten alle elf Ladevorgänge im selben Tick und bremsten sich
  gegenseitig aus — einzelne blieben auf halber Strecke stehen. Das war die
  Ursache von „schul.cloud lädt nicht zuverlässig, nach einem Reload dann schon".

### BBZ Chat: falsches Verschlüsselungskennwort
Jeder `POST /api/login` legt serverseitig **ein neues Gerät in schul.cloud** an.
Vorher galt jede Fehlerantwort als „vorübergehend" und der Login-Wächter stiess
sie alle 2,5 s erneut an — bei falschem Verschlüsselungskennwort hiess das:
Spinner bleibt stehen, und in schul.cloud stapeln sich dutzende Geräte.

- Der injizierte Code liefert jetzt `{state, status, body}` statt eines Strings.
  Nur so lässt sich ein abgelehntes Kennwort von einer Serverstörung
  unterscheiden.
- **4xx (ausser 408/429) und „Antwort ohne Token" sind endgültig.**
  `stopBbzChatAutoLogin` setzt `failedLogins`, blendet das Overlay aus und zeigt
  einen dauerhaften Hinweis auf das Verschlüsselungskennwort.
- **`MAX_BBZCHAT_LOGIN_CALLS` (3) begrenzt auch die vorübergehenden Fälle.**
  Absichtlich viel niedriger als `MAX_SUBMIT_ATTEMPTS` — der Preis eines
  Fehlversuchs ist hier ein Geräteeintrag, kein blosser Log-Eintrag.
  Zurückgesetzt wird er erst, wenn der Login-Wächter keine Anmeldemaske mehr
  sieht — **nicht** schon beim Speichern des Tokens. Verwirft die App den Token
  beim Start wieder (privater Schlüssel lässt sich mit dem angegebenen Kennwort
  nicht entsperren), stünde sonst wieder ein volles Budget bereit und die
  Geräteliste wüchse in Endlosschleife weiter. Ausserdem zurückgesetzt bei
  Reload und beim Aufwachen aus dem Standby.
- **`bbzChatOverlayGaveUpRef` gegen den Dauer-Spinner.** Nach
  `BBZ_CHAT_OVERLAY_TIMEOUT_MS` (30 s) wird das Overlay ausgeblendet, damit der
  Nutzer die Seite darunter sieht. Ohne das Merkzeichen blendet der Wächter es
  2,5 s später wieder ein und es flackert dauerhaft.
- **Der Wächter blendet das Overlay auch dann aus, wenn er wegen
  `failedLogins` aussteigt.** Sonst schaut der Nutzer auf einen Ladekreis,
  hinter dem gar nichts mehr passiert.
- **Der schul.cloud-Sichtbarkeitseffekt darf bei fehlenden Zugangsdaten nicht
  vorzeitig aussteigen.** War die Ansicht gerade ausgeblendet (Overlay stand
  noch) und fiel `hasBbzChatCredentials` danach auf false, blieb sie für den
  Rest der Sitzung unsichtbar — und ein Reload half nicht, weil das Problem gar
  nicht die Seite war.

### Besondere "Quirks" & Workarounds
- **Session-Reloads**: Webseiten wie **Outlook (OWA)** und **WebUntis** benötigen einen expliziten Reload nach System-Resume (Sleep/Wake), da ihre Sessions sonst ablaufen oder einfrieren. Dies wird im Main Process (`powerMonitor`) behandelt.
  - **Nur `resume` löst den Reload aus, nicht `unlock-screen`.** Beide Ereignisse
    schickten früher dasselbe `system-resumed`. Jedes Entsperren des Bildschirms
    — auch ohne Standby — lud damit alle Apps neu und verwarf Formulareingaben
    und Scroll-Positionen. `unlock-screen` korrigiert jetzt nur noch die
    Fensterposition (Monitorwechsel während der Sperre).
  - Läuft eine Sitzung während eines langen Sperrbildschirms *ohne* Standby ab,
    fängt das der Login-Wächter ab: er prüft alle 2,5 s auf eine sichtbare
    Loginmaske — seit dem Outlook-Eintrag auch dort — und injiziert von sich aus.
  - **Zeigt die Seite gar keine Loginmaske, greift der Login-Wächter nicht.**
    Genau das ist bei OWA der Fall; dafür gibt es den Gesundheitscheck (siehe
    „Selbstheilung der WebContentsViews"). Auf `resume` allein ist ebenfalls
    kein Verlass: Windows-Modern-Standby meldet nicht immer ein `resume`.
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

**Nicht (mehr) unterstützt:** Für `handbook`, `antraege` und `office` existierten
Handler, die nie erreichbar waren — die Dropdown-App „Handbuch" hat die ID
`Handbuch` (also `handbuch`, nicht `handbook`), `antraege` gibt es gar nicht, und
`office` ist kein Navigationsbutton (die Dropdown-App heißt `MSOffice`). Die
Handler wurden entfernt. Soll das Handbuch tatsächlich automatisch angemeldet
werden, ist das eine bewusste Entscheidung: es würde erstmals ADFS-Zugangsdaten
an `viflow.bbz-rd-eck.de` senden.

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
