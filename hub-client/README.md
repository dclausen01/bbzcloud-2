# BBZ Cloud Hub

Ein **schlanker, fokussierter Desktop-Client für den Nextcloud Hub** der BBZ
Rendsburg-Eckernförde. Statt vieler Einzeldienste lädt diese App nur den Hub
(`cloud.bbz-rd-eck.de`) – alles Weitere (Talk, BigBlueButton, Moodle, Files,
Deck …) lebt innerhalb von Nextcloud.

Ziel: Es soll sich wie eine native App anfühlen – schneller Start, persistente
Session (kein erneutes Anmelden), eigenes Fenster ohne Browser-Ballast.

## Funktionen

- **Ein Fenster, nur Hub** – kein Multi-Service-Launcher.
- **Automatischer ADFS/SAML-Login** – Anmeldedaten aus dem System-Schlüsselbund
  (geteilt mit der „großen" BBZCloud-App, Service `bbzcloud`).
- **„Warm" gehaltene Session** – `persist:bbzhub`, `backgroundThrottling: false`,
  Schließen minimiert in den Tray statt zu beenden.
- **System-Tray + Badge** – ungelesene Talk-Nachrichten als Zähler/Overlay.
- **Auto-Update** über GitHub-Releases (`electron-updater`).
- **BBB-Meetings** öffnen in einem eigenen Fenster (Kamera/Mikrofon erlaubt),
  externe Links im Standardbrowser.

## Tastaturkürzel

| Kürzel              | Aktion          |
|---------------------|-----------------|
| `Alt` + `←` / `→`   | Zurück / Vor    |
| `Strg`+`R` / `F5`   | Neu laden       |
| `Alt` + `Pos1`      | Zur Hub-Startseite |
| `Strg` + `,`        | Anmeldedaten    |

## Entwicklung

```bash
cd hub-client
npm install
npm start
```

Beim ersten Start (oder über Tray → „Anmeldedaten …") E-Mail und Passwort
eingeben. Sie werden im System-Schlüsselbund gespeichert; danach meldet sich die
App automatisch am Hub an.

## Build

```bash
npm run dist:linux   # AppImage + deb
npm run dist:win     # NSIS
npm run dist:mac     # dmg
```

## Architektur (Kurz)

| Datei                   | Zweck                                            |
|-------------------------|--------------------------------------------------|
| `main.js`               | Electron-Hauptprozess: Fenster, Login, Tray, Update |
| `splash.html`           | Ladebildschirm beim Start                        |
| `settings.html` / `settings-renderer.js` | UI für Anmeldedaten             |
| `preload-settings.js`   | Sichere Bridge (keytar via IPC)                  |

Der Client teilt sich die Keychain-Einträge (`bbzcloud` / `email`, `password`)
mit der bestehenden BBZCloud-App – wer dort schon angemeldet ist, ist hier
sofort eingeloggt.
