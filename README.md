# BBZ Cloud Desktop Application

Die Desktop-App für die BBZ Cloud - eine All-in-One-Plattform für Unterricht und Zusammenarbeit.

## 🌟 Features

### 📚 Integrierte Dienste
- **Webbasierte Dienste**: Nahtlose Integration von BBZ-Cloud-Diensten in einer Desktop-Anwendung
- **Sichere Anmeldung**: Verschlüsselte Speicherung von Anmeldeinformationen
- **Offline-Zugriff**: Verfügbarkeit wichtiger Funktionen auch ohne Internetverbindung

### 📝 Todo-Liste
- Aufgabenverwaltung mit Ordnerorganisation
- Erinnerungsfunktion für wichtige Aufgaben
- Flexible Sortieroptionen (manuell, Datum, Status)
- Drag & Drop Unterstützung

### 🔒 Sichere Dokumente
- Verschlüsselte Dokumentenspeicherung
- Automatische Verschlüsselung beim Speichern
- Sichere Dokumentenbearbeitung

### ⚙️ Anpassbare Einstellungen
- Dunkelmodus / Hellmodus
- Autostart-Optionen
- Minimierter Start
- Anpassbare Datenbankposition, z. B., um Synchronisation mehrerer Geräte per Cloud-Speicher zu ermöglichen

### 🔄 System-Integration
- System Tray Integration
- Desktop-Benachrichtigungen
- Automatische Updates
- Cross-Platform Unterstützung (Windows, macOS, Linux)

## 🛠 Technische Details

### Systemanforderungen
- Windows 10/11
- macOS 10.13 oder neuer
- Linux (moderne Distributionen)

### Technologie-Stack
- **Frontend**: React, Chakra UI
- **Backend**: Electron
- **Datenbank**: SQLite
- **Zusätzliche Technologien**:
  - electron-store für Konfigurationsspeicherung
  - keytar für sichere Credential-Verwaltung
  - electron-updater für automatische Updates

## 🚀 Installation

### Windows
1. Laden Sie die neueste `.exe` Datei von der Release-Seite herunter
2. Führen Sie die Installation aus
3. Die Anwendung startet automatisch nach der Installation

### macOS
1. Laden Sie die `.dmg` Datei herunter
2. Öffnen Sie die DMG-Datei
3. Ziehen Sie die Anwendung in den Applications-Ordner
4. Starten Sie die Anwendung aus dem Applications-Ordner

### Linux
#### Debian/Ubuntu
```bash
sudo dpkg -i bbzcloud_x.x.x_amd64.deb
```

#### Arch Linux
```bash
sudo pacman -U bbzcloud-x.x.x.pacman
```

## 💻 Entwicklung

### Voraussetzungen
- Node.js (LTS Version)
- npm oder yarn
- Git

### Setup
```bash
# Repository klonen
git clone https://github.com/dclausen01/bbzcloud-2.git
cd bbz-cloud

# Abhängigkeiten installieren
npm install

# Entwicklungsserver starten
npm run electron-dev
```

### Build
```bash
# Für alle Plattformen
npm run dist

# Plattform-spezifisch
npm run dist:win    # Windows
npm run dist:mac    # macOS
npm run dist:linux  # Linux
```

## 🤝 Mitwirken

Beiträge sind willkommen! Bitte beachten Sie folgende Schritte:

1. Fork des Repositories
2. Feature Branch erstellen (`git checkout -b feature/AmazingFeature`)
3. Änderungen committen (`git commit -m 'Add some AmazingFeature'`)
4. Branch pushen (`git push origin feature/AmazingFeature`)
5. Pull Request erstellen

## 📝 Lizenz

Dieses Projekt ist unter der MIT-Lizenz lizenziert - siehe die [LICENSE](LICENSE) Datei für Details.

## 🙏 Danksagung

- [Leonie](https://koyu.space/) für die BBZ Cloud 1, die Zusammenarbeit und gemeinsames Herumnerden
- Alle sonstigen Mitwirkenden und Unterstützer des Projekts
- Das BBZ-Kollegium
- Alle verwendeten Open-Source-Projekte

## 📧 Kontakt

Bei Fragen oder Problemen:
- Issues: [GitHub Issues](https://github.com/koyuawsmbrtn/bbz-cloud/issues)
