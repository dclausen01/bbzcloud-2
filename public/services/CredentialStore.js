'use strict';

const keytar = require('keytar');

/**
 * Zentraler Zugriff auf die Zugangsdaten im System-Schlüsselbund.
 *
 * WARUM ES DAS GIBT
 * -----------------
 * Bis v2.5.4 lag jedes Feld in einem eigenen Keychain-Eintrag ('email',
 * 'password', 'bbbPassword', …). macOS fragt die Freigabe pro Eintrag ab —
 * bei acht Feldern also acht Dialoge. Verschärft wurde das dadurch, dass
 * mehrere Stellen ihre Felder per Promise.all parallel laden: die Dialoge
 * stapelten sich dann gleichzeitig auf dem Bildschirm.
 *
 * Jetzt liegen alle Felder eines Service als JSON in EINEM Eintrag
 * (Account 'credentials'). Damit bleibt höchstens eine Abfrage übrig, und
 * dank Cache auch nur eine pro App-Start.
 *
 * WAS DAS NICHT LÖST
 * ------------------
 * Dass die Abfrage überhaupt erscheint, liegt an der fehlenden Code-Signatur
 * des macOS-Builds: ohne stabile Developer-ID sieht macOS nach jedem Update
 * eine andere App und die Keychain-ACL greift nicht mehr — auch „Immer
 * erlauben" hält dann nicht. Das lässt sich nur mit Signierung und
 * Notarisierung beheben, nicht hier im Code.
 */

// Alle Felder eines Service liegen unter diesem einen Keychain-Account.
const BUNDLE_ACCOUNT = 'credentials';

// Feldnamen, die vor der Zusammenlegung je einen eigenen Eintrag hatten.
// Nur für die einmalige Migration bestehender Installationen relevant.
const LEGACY_ACCOUNTS = [
  'email',
  'password',
  'bbbPassword',
  'webuntisEmail',
  'webuntisPassword',
  'schulportalEmail',
  'schulportalPassword',
  'schulcloudEncryptionPassword',
];

class CredentialStore {
  constructor() {
    /** @type {Map<string, Record<string, string>>} */
    this.cache = new Map();
    /** @type {Map<string, Promise<Record<string, string>>>} */
    this.inFlight = new Map();
    /** @type {Map<string, Promise<void>>} Schreibvorgänge pro Service, verkettet */
    this.writeQueue = new Map();
  }

  /**
   * Bündel eines Service laden — aus dem Cache, sonst aus dem Schlüsselbund.
   *
   * Parallele Aufrufe werden auf EINEN Keychain-Zugriff zusammengefasst.
   * Ohne das würde ein Promise.all über mehrere Felder erneut mehrere
   * Dialoge gleichzeitig auslösen, weil keiner der Aufrufe den Cache des
   * anderen abwartet.
   */
  async _load(service) {
    if (this.cache.has(service)) return this.cache.get(service);
    if (this.inFlight.has(service)) return this.inFlight.get(service);

    const pending = this._loadUncached(service)
      .then((bundle) => {
        this.cache.set(service, bundle);
        this.inFlight.delete(service);
        return bundle;
      })
      .catch((error) => {
        this.inFlight.delete(service);
        throw error;
      });

    this.inFlight.set(service, pending);
    return pending;
  }

  async _loadUncached(service) {
    let raw = null;
    try {
      raw = await keytar.getPassword(service, BUNDLE_ACCOUNT);
    } catch (error) {
      console.error('[CredentialStore] Keychain-Zugriff fehlgeschlagen:', error.message);
      return {};
    }

    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed;
        }
        console.warn('[CredentialStore] Bündel hat unerwartetes Format — wird ignoriert');
      } catch (error) {
        // Kaputtes JSON nicht überschreiben: sonst wären die Daten endgültig weg.
        // Stattdessen auf die Alt-Einträge zurückfallen.
        console.error('[CredentialStore] Bündel nicht lesbar:', error.message);
      }
    }

    return this._migrateLegacy(service);
  }

  /**
   * Einmalige Übernahme der alten Einzel-Einträge in ein Bündel.
   *
   * Die Alt-Einträge werden bewusst NICHT gelöscht: Sie kosten nichts, dienen
   * als Sicherheitsnetz, falls das Bündel verloren geht, und ein Löschen
   * könnte bei teilweise verweigerter Freigabe Daten vernichten.
   */
  async _migrateLegacy(service) {
    const bundle = {};

    // Bewusst sequenziell: parallele Zugriffe würden die Alt-Dialoge
    // gleichzeitig aufpoppen lassen — genau das, was wir abschaffen wollen.
    for (const account of LEGACY_ACCOUNTS) {
      try {
        const value = await keytar.getPassword(service, account);
        if (value) bundle[account] = value;
      } catch (error) {
        console.warn(`[CredentialStore] Alt-Eintrag '${account}' nicht lesbar:`, error.message);
      }
    }

    const migratedCount = Object.keys(bundle).length;
    if (migratedCount > 0) {
      try {
        await keytar.setPassword(service, BUNDLE_ACCOUNT, JSON.stringify(bundle));
        console.log(
          `[CredentialStore] ${migratedCount} Zugangsdaten in einen Keychain-Eintrag zusammengefasst`
        );
      } catch (error) {
        // Schreiben fehlgeschlagen -> im Speicher weiterarbeiten, beim
        // nächsten Start wird die Migration erneut versucht.
        console.error('[CredentialStore] Bündel konnte nicht geschrieben werden:', error.message);
      }
    }

    return bundle;
  }

  /**
   * Bündel zurückschreiben und Cache aktualisieren.
   *
   * Die Schreibvorgänge eines Service werden verkettet, weil der Renderer
   * mehrere Felder per Promise.all gleichzeitig speichert. Parallele
   * setPassword-Aufrufe könnten sich sonst überholen und ein älteres Bündel
   * als letztes festschreiben — einzelne Felder wären damit verloren.
   *
   * Geschrieben wird bewusst der Cache-Stand zum Ausführungszeitpunkt, nicht
   * der Schnappschuss von vorhin: so enthält der letzte Schreibvorgang immer
   * den vollständigen Endzustand.
   */
  async _persist(service, bundle) {
    this.cache.set(service, bundle);

    const previous = this.writeQueue.get(service) || Promise.resolve();
    const next = previous
      .catch(() => { /* Fehler des Vorgängers hier nicht erneut werfen */ })
      .then(() => {
        const current = this.cache.get(service) || {};
        return keytar.setPassword(service, BUNDLE_ACCOUNT, JSON.stringify(current));
      });

    this.writeQueue.set(service, next);
    try {
      await next;
    } finally {
      // Abgearbeitete Kette freigeben, damit die Map nicht endlos wächst
      if (this.writeQueue.get(service) === next) this.writeQueue.delete(service);
    }
  }

  /**
   * @returns {Promise<string|null>} Wert des Feldes oder null
   */
  async get(service, account) {
    const bundle = await this._load(service);
    const value = bundle[account];
    return value === undefined ? null : value;
  }

  /**
   * Aktuellen Stand aus dem Cache holen — NACH dem Laden und synchron.
   *
   * Wichtig: nicht den von `_load` awaiteten Wert weiterverwenden. Bei
   * parallelen Aufrufen (App.js speichert alle Felder per Promise.all)
   * bekommen alle Aufrufer dasselbe Objekt aus dem gemeinsamen Ladevorgang.
   * Wer darauf aufbaut, überschreibt die Felder der anderen — am Ende
   * überlebt nur das zuletzt gespeicherte Feld.
   */
  _snapshot(service) {
    return { ...(this.cache.get(service) || {}) };
  }

  async set(service, account, value) {
    await this._load(service);
    // Ab hier synchron bis in _persist hinein — kein await dazwischen!
    const bundle = this._snapshot(service);
    bundle[account] = value;
    await this._persist(service, bundle);
  }

  /** Mehrere Felder in einem Schreibvorgang setzen. */
  async setMany(service, values) {
    await this._load(service);
    const bundle = Object.assign(this._snapshot(service), values);
    await this._persist(service, bundle);
  }

  async remove(service, account) {
    await this._load(service);
    const bundle = this._snapshot(service);
    const wasPresent = account in bundle;
    delete bundle[account];
    if (wasPresent) await this._persist(service, bundle);

    // Auch den Alt-Eintrag entfernen. Sonst würde die Migration den gelöschten
    // Wert wiederbeleben, falls das Bündel einmal verloren geht.
    if (LEGACY_ACCOUNTS.includes(account)) {
      try {
        await keytar.deletePassword(service, account);
      } catch (error) {
        console.warn(`[CredentialStore] Alt-Eintrag '${account}' nicht löschbar:`, error.message);
      }
    }
  }

  /** Cache verwerfen (z. B. nach externem Wechsel der Zugangsdaten). */
  invalidate(service) {
    if (service) {
      this.cache.delete(service);
      this.inFlight.delete(service);
    } else {
      this.cache.clear();
      this.inFlight.clear();
    }
  }
}

module.exports = new CredentialStore();
module.exports.BUNDLE_ACCOUNT = BUNDLE_ACCOUNT;
module.exports.LEGACY_ACCOUNTS = LEGACY_ACCOUNTS;
