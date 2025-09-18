# Ausführen von BBZ Cloud auf Apple Silicon Macs

Aufgrund der Sicherheitsanforderungen von Apple kann die BBZ Cloud-App als "defekt" oder "beschädigt" gemeldet werden, wenn Sie sie zum ersten Mal auf Apple Silicon Macs (M1, M2, M3, M4 Chips) ausführen. Dies ist ein häufiges Problem bei unsignierten Anwendungen und bedeutet nicht, dass die App tatsächlich defekt ist.

## So führen Sie die App aus

### Methode 1: Rechtsklick (Empfohlen)

1. Suchen Sie die BBZ Cloud-App in Ihrem Download-Ordner oder Anwendungsordner
2. Klicken Sie mit der rechten Maustaste (oder Strg-Klick) auf das App-Symbol
3. Wählen Sie "Öffnen" aus dem Kontextmenü
4. Wenn die Sicherheitswarnung angezeigt wird, klicken Sie auf "Öffnen", um fortzufahren
5. Die App sollte jetzt normal starten

### Methode 2: Systemeinstellungen (wenn Methode 1 nicht funktioniert)

1. Versuchen Sie zunächst, die App normal zu öffnen (es wird ein Fehler angezeigt)
2. Gehen Sie zu Systemeinstellungen > Sicherheit und Datenschutz
3. Klicken Sie auf den Reiter "Allgemein"
4. Sie sollten eine Meldung über die Blockierung von BBZ Cloud sehen
5. Klicken Sie auf "Trotzdem öffnen"
6. Versuchen Sie, die App erneut zu öffnen

### Methode 3: Terminal-Befehl (Fortgeschrittene Benutzer)

Wenn die oben genannten Methoden nicht funktionieren, können Sie Gatekeeper über das Terminal umgehen:

1. Öffnen Sie das Terminal
2. Navigieren Sie zu dem Verzeichnis, das die App enthält:
   ```bash
   cd /Pfad/zu/BBZ\ Cloud.app
   ```
3. Führen Sie den folgenden Befehl aus:
   ```bash
   xattr -d com.apple.quarantine /Pfad/zu/BBZ\ Cloud.app
   ```
4. Jetzt sollten Sie die App normal öffnen können

## Warum passiert das?

Apple Silicon Macs verfügen über strengere Sicherheitsmaßnahmen als Intel Macs. Apps, die nicht mit einem Apple Developer-Zertifikat signiert sind, werden von Gatekeeper markiert, welches eine eingebaute Sicherheitsfunktion von macOS ist. Dies ist besonders häufig bei:

1. Von Einzelpersonen oder kleinen Organisationen erstellten Apps
2. Bildungssoftware
3. Open-Source-Anwendungen

Die App ist völlig sicher zu verwenden - die Warnung ist nur Apples Art sicherzustellen, dass Sie wissen, dass Sie Software ausführen, die nicht aus dem App Store stammt oder von einem registrierten Entwickler signiert wurde.

## Zukünftige Verbesserungen

Für zukünftige Versionen erwägen wir:

1. Beitreten zum Apple Developer Program, um die App ordnungsgemäß zu signieren
2. Verteilung über den Mac App Store
3. Bereitstellung sowohl signierter als auch unsignierter Versionen für verschiedene Anwendungsfälle

Wenn Sie Probleme beim Ausführen der App haben, wenden Sie sich bitte an das Entwicklungsteam.
