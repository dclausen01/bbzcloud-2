/* eslint-disable default-case */
import React, { useRef, useEffect, useState, forwardRef, useCallback } from 'react';
import {
  Box,
  Flex,
  Progress,
  Spinner,
  VStack,
  useToast,
  useColorMode,
  Image as ChakraImage,
  Text,
  Button,
} from '@chakra-ui/react';
import { useSettings } from '../context/SettingsContext';
import { useViewBoundsBinding } from '../hooks/useWebContentsView';

// Apps migrated to WebContentsView. Add more IDs here as migration progresses.
//
// Phase 0:  moodle (simple form-fill login)
// Phase 2a: wiki, fobizz, taskcards (no auto-login), bbb (simple form-fill)
// Phase 2b: cryptpad (popup override only), schulportal (periodic form check),
//           nextcloud (multi-step ADFS/SAML)
// Phase 2c: outlook (ADFS + clearHistory), schulcloud/BBZ Chat (multi-step +
//           encryption password), webuntis (React-fiber valueTracker injection)
const WCV_APPS = new Set([
  'moodle', 'wiki', 'fobizz', 'taskcards', 'bbb',
  'cryptpad', 'schulportal', 'nextcloud',
  'outlook', 'schulcloud', 'webuntis',
]);

// Force a fresh navigation for a WCV — needed for apps where
// webContents.reload() is unreliable (e.g. Outlook/OWA, which can stay on
// its offline overlay even after a reload). Uses the configured URL so
// SPA deep-links don't get stuck on error pages.
function forceReloadWcv(id, standardApps, currentUrl) {
  const url = standardApps?.[id]?.url;
  // Outlook/OWA und WebUntis sind beides SPAs, die nach einem abgelaufenen
  // Login auf einer toten Huelle stehenbleiben koennen. Ein reload() laedt
  // genau diese Huelle erneut; erst eine frische Navigation auf die
  // konfigurierte URL bringt die Loginmaske zurueck.
  if ((id === 'outlook' || id === 'webuntis') && url) {
    window.electron.view.clearHistory(id)
      .then(() => window.electron.view.navigate(id, url))
      .catch(() => window.electron.view.navigate(id, url));
    return;
  }

  // Steht die View auf einem anderen Dienst als konfiguriert (BBZ Chat vs.
  // schul.cloud), muss neu navigiert werden — ein reload() laedt sonst nur
  // die aktuelle, also die falsche URL erneut. Nur fuer schulcloud, weil dort
  // die konfigurierte URL zur Laufzeit wechselt; bei Apps mit externem Login
  // (Nextcloud/Outlook) waere so ein Abgleich gefaehrlich.
  if (id === 'schulcloud' && url && currentUrl) {
    try {
      if (new URL(url).origin !== new URL(currentUrl).origin) {
        window.electron.view.navigate(id, url);
        return;
      }
    } catch (_) { /* ungueltige URL -> normaler reload */ }
  }

  window.electron.view.reload(id);
}

// ---------------------------------------------------------------------------
// Fokus-Schutz für Credential-Injection
// ---------------------------------------------------------------------------

// Im Seitenkontext ausgewertet: Tippt der Nutzer gerade irgendwo?
// "Gerade dabei" heißt: ein editierbares Element hat den Fokus UND enthält
// bereits Text. Ein leeres, automatisch fokussiertes Loginfeld zählt nicht,
// damit der Auto-Login auf frisch geladenen Loginseiten weiterhin greift.
const USER_IS_TYPING_JS = `(function() {
  try {
    const el = document.activeElement;
    if (!el || el === document.body) return false;
    if (el.isContentEditable) return true;
    const tag = el.tagName;
    if (tag === 'TEXTAREA') return !!el.value;
    if (tag === 'INPUT') {
      const type = (el.getAttribute('type') || 'text').toLowerCase();
      const editable = ['text', 'email', 'password', 'search', 'tel', 'url', 'number'];
      return editable.includes(type) && !!el.value;
    }
    return false;
  } catch (e) {
    return false;
  }
})()`;

async function isUserTyping(webview) {
  try {
    return !!(await webview.executeJavaScript(USER_IS_TYPING_JS));
  } catch (_) {
    return false;
  }
}

// Steht auf der Seite ungespeicherter Text (z. B. eine halb geschriebene
// E-Mail in OWA)? Wird vor automatischen Reloads geprueft.
async function hasUnsavedText(webview) {
  try {
    return !!(await webview.executeJavaScript(HAS_UNSAVED_TEXT_JS));
  } catch (_) {
    return false;
  }
}

// Wird in injizierte Snippets eingebettet: fokussiert ein Feld nur dann, wenn
// der Nutzer nicht gerade in einem anderen Eingabefeld schreibt.
const SAFE_FOCUS_HELPER_JS = `
  const __bbzSafeFocus = (el) => {
    try {
      const active = document.activeElement;
      const busy = active && active !== el && (
        active.isContentEditable ||
        ((active.tagName === 'INPUT' || active.tagName === 'TEXTAREA') && !!active.value)
      );
      if (!busy) el.focus();
    } catch (e) { /* ignore */ }
  };
`;


// ---------------------------------------------------------------------------
// Login-Wächter
// ---------------------------------------------------------------------------

// Wie oft geprüft wird, ob eine App eine Loginmaske zeigt.
const LOGIN_WATCHER_INTERVAL_MS = 2500;

// Nach dieser Zeit gilt eine laufende Injection als haengengeblieben und die
// Sperre wird freigegeben. Laengster regulaerer Durchlauf liegt bei ~15 s.
const INJECTION_STALE_MS = 45000;

// Apps, deren Loginmaske asynchron erscheint oder mehrstufig ist. Der Wächter
// prüft mit diesen Snippets im Seitenkontext, ob noch eine Anmeldung aussteht.
//
// Diese Prüfungen liefen früher in fünf einzelnen Intervallen, die erst im
// dom-ready-Handler gestartet wurden. Wurde dieses Ereignis verpasst oder lief
// die erste Injection zu früh, existierte überhaupt kein Wiederholungs-
// mechanismus — der Login blieb bis zum nächsten ausdrücklichen Reload liegen.
const LOGIN_WATCHERS = {
  schulportal: `(function() {
                const u = document.querySelector('input#username');
                const p = document.querySelector('input#password');
                const s = document.querySelector('input#kc-login[type="submit"]');
                return !!(u && p && s);
              })()`,
  nextcloud: `(function() {
                const adfs = document.querySelector('a[href*="user_saml/saml/login"]') ||
                             Array.from(document.querySelectorAll('a')).find(a => a.textContent.trim() === 'BBZ ADFS');
                const u = document.querySelector('#userNameInput');
                const p = document.querySelector('#passwordInput');
                const ja = document.querySelector('input[type="submit"]#idSIButton9[value="Ja"]');
                const ok = document.querySelector('#header') || document.querySelector('.app-navigation') ||
                           document.querySelector('#nextcloud') || window.location.href.includes('/apps/');
                return (adfs || u || p || ja) && !ok;
              })()`,
  schulcloud: `(async function() {
                const isBbzChat = window.location.href.includes('chat.bbz-rd-eck.com');
                if (isBbzChat) {
                  const loginForm = document.querySelector('input[type="email"]');
                  if (!loginForm) return false;
                  const token = localStorage.getItem('schulchat_token');
                  if (!token) return true;
                  // Validate token; remove if expired so re-login proceeds
                  try {
                    const r = await fetch('/api/me', { headers: { 'Authorization': 'Bearer ' + token } });
                    if (!r.ok) {
                      localStorage.removeItem('schulchat_token');
                      return true;
                    }
                    return false;
                  } catch (_) {
                    return false; // network error — assume valid
                  }
                }
                // Die Verschlüsselungsseite wird an konkreten Elementen erkannt,
                // nicht mehr an document.body.textContent auf 'Verschlüsselungskennwort'
                // — dieser Text steht in der eingeloggten App auch in Einstellungen
                // und Chatnachrichten. Dadurch lief die Injection alle 5 s dauerhaft
                // weiter und riss den Cursor aus dem Eingabefeld.
                //
                // Bewusst ohne Sichtbarkeitsprüfung: ein zu enger Test kann das
                // Zeitfenster verpassen, in dem der Login noch möglich wäre.
                const emailInput = document.querySelector('input#username[type="text"]');
                const passwordInputs = document.querySelectorAll('input[type="password"]');
                const encryptionButton = Array.from(document.querySelectorAll('button.row, div.row')).find(btn => btn.textContent.includes('Durch dein Verschlüsselungskennwort'));
                const loggedIn = document.querySelector('.user-menu') || document.querySelector('.dashboard') || document.querySelector('.main-content');
                if (loggedIn) return false;
                return !!emailInput || passwordInputs.length > 0 || !!encryptionButton;
              })()`,
  // Outlook/OWA verliert seine Sitzung still: die SPA feuert dabei kein
  // dom-ready, also gab es bisher ueberhaupt keinen Ausloeser mehr und die
  // Oberflaeche stand nur noch da, ohne zu aktualisieren. Die ADFS-Elemente
  // sind eindeutig — sie existieren in der angemeldeten OWA-Oberflaeche nicht.
  outlook: `(function() {
                const u = document.querySelector('#userNameInput');
                const p = document.querySelector('#passwordInput');
                const s = document.querySelector('#submitButton');
                const ja = document.querySelector('input[type="submit"]#idSIButton9[value="Ja"]');
                return !!((u && p && s) || ja);
              })()`,
  // Moodle hat weder einen dom-ready-Reset noch bisher einen Waechter: lief
  // die erste Injection auf eine bereits angemeldete Seite, blieb der Login
  // fuer den Rest der Sitzung aus, sobald die Moodle-Sitzung ablief.
  moodle: `(function() {
                const u = document.querySelector('input[name="username"][id="username"]');
                const p = document.querySelector('input[name="password"][id="password"]');
                const s = document.querySelector('button[type="submit"][id="loginbtn"]');
                return !!(u && p && s);
              })()`,
  webuntis: `(function() {
                // Passwortfeld ODER die WebUntis-Loginmaske verlangen. Vorher
                // genügte ein beliebiges <form> — das trifft auch die eingeloggte
                // Oberfläche und liess die Injection alle 2 s weiterlaufen.
                //
                // Bewusst OHNE Sichtbarkeitsprüfung: die Maske wird asynchron
                // eingeblendet, und ein zu enger Test verpasst genau das Zeitfenster,
                // in dem der Login noch möglich wäre.
                const passInput = document.querySelector('input[type="password"]');
                const loginForm = document.querySelector('.un2-login-form');
                if (!passInput && !loginForm) return false;
                const authLabel = document.querySelector('.un-input-group__label');
                return !authLabel || authLabel.textContent !== 'Bestätigungscode';
              })()`,
};

// ---------------------------------------------------------------------------
// Selbstheilung der WebContentsViews
// ---------------------------------------------------------------------------

// Abstand zwischen den Ladevorgaengen beim Start.
//
// Vorher liefen alle elf Ansichten gleichzeitig los. Wer zuerst drankam,
// gewann; die schwereren SPAs (schul.cloud) blieben dabei gelegentlich auf
// halber Strecke stehen — genau das "laedt nicht zuverlaessig, nach einem
// Reload dann schon". Der Versatz kostet hoechstens zwei Sekunden.
const WCV_CREATE_STAGGER_MS = 250;

// Wie oft geprueft wird, ob eine Ansicht noch mit ihrem Server spricht.
const HEALTH_CHECK_INTERVAL_MS = 60 * 1000;

// Wie lange nach did-stop-loading gewartet wird, bevor auf eine leer
// gebliebene Seite geprueft wird. Muss reichen, damit eine SPA booten kann.
const BLANK_CHECK_DELAY_MS = 6000;

// Ab welchem Alter eine Ansicht als abgestanden gilt und neu geladen wird.
//
// Betrifft nur Apps, deren Oberflaeche bei abgelaufener Sitzung einfach
// stehenbleibt, OHNE eine Loginmaske zu zeigen: der Login-Waechter sieht dort
// nichts, und ohne diesen Zusatz bleibt die Seite bis zu einem ausdruecklichen
// Reload durch den Nutzer taub. Gezaehlt wird ab dem letzten erfolgreichen
// Laden (did-finish-load / did-navigate); reine Hash-Navigation innerhalb der
// SPA zaehlt bewusst nicht mit, die beweist keine lebende Verbindung.
//
// Bewusst nur Outlook: dort ist der stille Sitzungsverlust belegt. WebUntis
// wird beim Aufwachen ohnehin ausdruecklich neu geladen (Resume-Handler) und
// haette hier ein echtes Risiko — ein Hintergrund-Reload waehrend der Eingabe
// des Bestaetigungscodes wuerde die Anmeldung abwuergen. Weitere Apps sind ein
// Einzeiler, aber eine bewusste Entscheidung.
const WCV_MAX_AGE_MS = {
  outlook: 20 * 60 * 1000,
};

// Mindestabstand zwischen zwei automatischen Reloads derselben App. Bremst
// Reload-Schleifen, falls eine Pruefung faelschlich "tot" meldet.
const AUTO_RELOAD_COOLDOWN_MS = 5 * 60 * 1000;

// Kuerzerer Abstand fuer den Sonderfall "Seite ist leer geblieben": dort hilft
// ein zweiter Anlauf sofort, und ein 5-Minuten-Fenster waere beim Start zu
// traege. Zusaetzlich begrenzt MAX_BLANK_RELOADS die Wiederholungen.
const BLANK_RELOAD_COOLDOWN_MS = 30 * 1000;
const MAX_BLANK_RELOADS = 3;

// Wartezeiten nach did-fail-load, ansteigend. Der letzte Wert wiederholt sich:
// ein Server in der Wartung oder ein laenger fehlendes WLAN soll sich von
// selbst wieder einrenken, ohne dass der Nutzer eingreifen muss.
const LOAD_RETRY_DELAYS_MS = [3000, 10000, 30000, 60000, 300000];

// Fehlercodes ohne Wiederholung: 0 = kein Fehler, -3 = ABORTED (kommt von
// unseren eigenen Navigationen).
const IGNORED_LOAD_ERROR_CODES = new Set([0, -3]);

// Gesundheitspruefungen, die im Seitenkontext laufen.
//
// Outlook/OWA verliert seine Sitzung still: die Oberflaeche bleibt stehen und
// aktualisiert nichts mehr, zeigt aber keine Loginmaske — der Login-Waechter
// findet also nichts, worauf er reagieren koennte. Eine HEAD-Anfrage an den
// eigenen Ursprung verraet den Zustand dagegen eindeutig: eine abgelaufene
// OWA-Sitzung antwortet mit 401/403/440 oder leitet auf logon.aspx bzw. den
// ADFS um (redirect: 'manual' macht daraus eine opaqueredirect-Antwort).
const WCV_HEALTH_PROBES = {
  outlook: `(async function() {
    try {
      // Nur pruefen, wenn die Seite wirklich OWA zeigt. Waehrend des
      // ADFS-Logins liegt ein fremder Ursprung vor — dort waere '/owa/' die
      // falsche Adresse, und um die Loginmaske kuemmert sich der Waechter.
      if (!location.pathname.toLowerCase().startsWith('/owa')) return 'UNKNOWN';
      const r = await fetch('/owa/', {
        method: 'HEAD',
        cache: 'no-store',
        credentials: 'include',
        redirect: 'manual',
      });
      if (r.type === 'opaqueredirect') return 'SESSION_DEAD';
      if (r.status === 401 || r.status === 403 || r.status === 440) return 'SESSION_DEAD';
      return 'ALIVE';
    } catch (e) {
      // Netzwerkfehler koennen auch nur eine kurze Stoerung sein — nicht als
      // Sitzungsverlust werten, sonst laedt jeder WLAN-Wackler die Seite neu.
      return 'UNKNOWN';
    }
  })()`,
};

// Erkennt eine leer gebliebene Seite: die SPA hat nicht gebootet, das Dokument
// steht praktisch leer da. Chromium-Fehlerseiten haben Text und fallen hier
// nicht hinein — die deckt did-fail-load ab.
const BLANK_PAGE_PROBE_JS = `(function() {
  try {
    const body = document.body;
    if (!body) return 'BLANK';
    // Erst die Elementzahl, dann erst der Text: innerText erzwingt ein Layout,
    // und das jede Minute auf einem vollen Posteingang waere unnoetige Last.
    if (body.querySelectorAll('*').length >= 5) return 'OK';
    return (body.innerText || '').trim() ? 'OK' : 'BLANK';
  } catch (e) {
    return 'OK';
  }
})()`;

// Hat der Nutzer irgendwo einen laengeren, ungespeicherten Text stehen?
// Bewusst nur contenteditable und <textarea>: das trifft eine offene
// E-Mail in OWA, nicht aber ein Suchfeld, in dem ein Wort steht — sonst
// wuerde ein einziges getipptes Zeichen den Reload dauerhaft blockieren.
const HAS_UNSAVED_TEXT_JS = `(function() {
  try {
    const editables = document.querySelectorAll('[contenteditable="true"], [contenteditable=""], textarea');
    for (const el of editables) {
      const value = el.tagName === 'TEXTAREA' ? el.value : el.innerText;
      if ((value || '').trim().length > 0) return true;
    }
    return false;
  } catch (e) {
    return false;
  }
})()`;

// Nach so langer Zeit wird der BBZ-Chat-Spinner ausgeblendet, damit der Nutzer
// die Seite darunter sieht und selbst handeln kann.
const BBZ_CHAT_OVERLAY_TIMEOUT_MS = 30 * 1000;

// Hoechstzahl tatsaechlich abgeschickter /api/login-Aufrufe fuer BBZ Chat.
//
// Bewusst niedrig: jeder Aufruf legt serverseitig ein neues Geraet in
// schul.cloud an. Bei falschem Verschluesselungskennwort lief das frueher alle
// 2,5 s weiter und hat dutzende Geraete erzeugt.
const MAX_BBZCHAT_LOGIN_CALLS = 3;

const WebViewContainer = forwardRef(({ activeWebView, onNavigate, standardApps }, ref) => {
  // Expose navigation methods through ref
  React.useImperativeHandle(ref, () => ({
    goBack: () => {
      if (!activeWebView) return;
      const id = activeWebView.id;
      if (WCV_APPS.has(id)) {
        window.electron.view.goBack(id);
        return;
      }
      const webview = webviewRefs.current[id]?.current ||
        document.querySelector(`#wv-${id}`);
      if (webview && webview.src && webview.getWebContentsId) {
        try {
          if (typeof webview.canGoBack === 'function' && webview.canGoBack()) webview.goBack();
        } catch (error) {
          console.warn('Error navigating back:', error);
        }
      }
    },
    goForward: () => {
      if (!activeWebView) return;
      const id = activeWebView.id;
      if (WCV_APPS.has(id)) {
        window.electron.view.goForward(id);
        return;
      }
      const webview = webviewRefs.current[id]?.current ||
        document.querySelector(`#wv-${id}`);
      if (webview && webview.src && webview.getWebContentsId) {
        try {
          if (typeof webview.canGoForward === 'function' && webview.canGoForward()) webview.goForward();
        } catch (error) {
          console.warn('Error navigating forward:', error);
        }
      }
    },
    reload: () => {
      if (!activeWebView) return;
      const id = activeWebView.id;
      // Reset login state so a fresh credential-injection cycle can run
      // (multi-step ADFS chains otherwise hit MAX_LOGIN_ATTEMPTS quickly).
      loginAttempts.current[id] = 0;
      failedLogins.current[id] = false;
      credsAreSet.current[id] = false;
      // Auch Sperrzeiten aufheben — sonst wirkt ein manuelles Reload bei
      // aktiver Cooldown (z. B. WebUntis) wie ein Nichtstun: die Injection
      // bricht dann sofort und stillschweigend ab (siehe injectCredentialsImpl).
      // Nur Keys dieser App betreffen, nicht die anderer Apps.
      Object.keys(loginCooldownRef.current).forEach((key) => {
        if (key.startsWith(`${id}_`)) delete loginCooldownRef.current[key];
      });
      submitAttempts.current[id] = 0;
      submitLimitNotified.current[id] = false;
      // Selbstheilungs-Zaehler mit freigeben: ein Reload von Hand ist eine
      // ausdrueckliche Nutzeraktion und soll nicht an einer Cooldown oder an
      // einem verbrauchten Versuchsbudget haengenbleiben.
      autoReloadAtRef.current[id] = 0;
      blankReloadsRef.current[id] = 0;
      healthStrikeRef.current[id] = 0;
      clearTimeout(loadRetryRef.current[id]?.timer);
      loadRetryRef.current[id] = { attempt: 0, timer: null };
      if (id === 'schulcloud') {
        bbzChatLoginCallsRef.current = 0;
        bbzChatOverlayGaveUpRef.current = false;
      }
      if (WCV_APPS.has(id)) {
        forceReloadWcv(id, standardApps, wcvUrlsRef.current[id]);
        return;
      }
      const webview = webviewRefs.current[id]?.current ||
        document.querySelector(`#wv-${id}`);
      if (webview && webview.src) {
        try {
          if (typeof webview.reload === 'function') webview.reload();
        } catch (error) {
          console.warn('Error reloading webview:', error);
        }
      }
    },
    reloadAll: () => {
      // Reset login state for every app so re-login can happen after the reload.
      loginAttempts.current = {};
      failedLogins.current = {};
      credsAreSet.current = {};
      submitAttempts.current = {};
      submitLimitNotified.current = {};
      // Sperrzeiten mit aufheben — ein ausdrueckliches Reload ist eine
      // Nutzeraktion und soll nicht an einer Cooldown haengenbleiben.
      loginCooldownRef.current = {};
      // Dasselbe fuer die Selbstheilung.
      autoReloadAtRef.current = {};
      blankReloadsRef.current = {};
      healthStrikeRef.current = {};
      Object.values(loadRetryRef.current).forEach((state) => clearTimeout(state?.timer));
      loadRetryRef.current = {};
      bbzChatLoginCallsRef.current = 0;
      bbzChatOverlayGaveUpRef.current = false;
      // Reload each WCV individually so per-app reload quirks (e.g. Outlook
      // needing a full clearHistory+navigate) are honored.
      for (const id of WCV_APPS) {
        if (!standardApps?.[id]?.visible) continue;
        try { forceReloadWcv(id, standardApps, wcvUrlsRef.current[id]); } catch (_) {}
      }
      // Also reload any legacy <webview> elements (dropdown apps)
      const webviews = document.querySelectorAll('webview');
      webviews.forEach((wv) => {
        try { wv.reload(); } catch (_) {}
      });
    },
    print: () => {
      if (!activeWebView) return;
      const id = activeWebView.id;
      if (WCV_APPS.has(id)) {
        window.electron.view.print(id);
        return;
      }
      const webview = webviewRefs.current[id]?.current ||
        document.querySelector(`#wv-${id}`);
      if (webview && webview.src && webview.getWebContentsId) {
        try {
          if (typeof webview.print === 'function') webview.print();
        } catch (error) {
          console.warn('Error printing webview:', error);
        }
      }
    }
  }));
  const webviewRefs = useRef({});
  // anchor refs for WCV apps — the <div> whose bounds we report to the main process
  const wcvAnchorRefs = useRef({});
  // last known URL per WCV app (updated via view:event)
  const wcvUrlsRef = useRef({});
  // Tracks the last *configured* URL per WCV app to detect setting changes
  // (e.g. useBbzChat toggle) and navigate the view to the new URL.
  const wcvConfigUrlsRef = useRef({});
  // Ziel einer laufenden Umschaltung — verhindert, dass der Selbstheilungs-
  // Abgleich dieselbe Navigation bei jedem Render erneut anstösst, solange
  // die Seite noch lädt.
  const wcvNavigationTargetRef = useRef({});
  // periodic login-check intervals for WCV apps that need them
  const wcvIntervalsRef = useRef({});
  // ID der aktuell sichtbaren WebContentsView-App (null bei Dropdown-Apps).
  // Bewusst nur die ID statt des activeWebView-Objekts: das Objekt bekommt bei
  // jeder Navigation eine neue Identität und würde Effekte unnötig neu laufen
  // lassen (show/hide-Zyklen setzen den Fokus im WebView zurück).
  const activeWcvId = activeWebView && WCV_APPS.has(activeWebView.id) ? activeWebView.id : null;
  // Dieselbe ID als Ref, damit Effekte mit leerer Dependency-Liste (z. B. der
  // Gesundheitscheck) wissen, welche App der Nutzer gerade ansieht.
  const activeWcvIdRef = useRef(activeWcvId);
  activeWcvIdRef.current = activeWcvId;
  const [isLoading, setIsLoading] = useState({});
  const [downloadProgress, setDownloadProgress] = useState(null);
  const [overviewImagePath, setOverviewImagePath] = useState('');
  const [imageError, setImageError] = useState(false);
  // BBZ Chat (chat.bbz-rd-eck.com) auto-login state — drives a large overlay
  // that masks the login form while credentials are being injected, so the
  // user sees a single smooth loading state instead of a brief login screen.
  const [bbzChatLoginActive, setBbzChatLoginActive] = useState(false);
  const [hasBbzChatCredentials, setHasBbzChatCredentials] = useState(false);
  // Use a ref (not state) so reads inside useCallback closures always see the latest value
  // immediately — React state batching would cause stale reads otherwise.
  const credsAreSet = useRef({});
  const [isStartupPeriod, setIsStartupPeriod] = useState(true);
  const loginAttempts = useRef({}); // Track login attempts per app (max 3 per session)
  const failedLogins = useRef({}); // Track fatal login failures (e.g. invalid credentials)
  // Läuft für diese App gerade eine Injection? Die periodischen Checks (alle
  // 2-5 s) können sonst eine noch laufende Injection überholen — das führt zu
  // doppelten Klicks und mehrfachem Fokus-Setzen im selben Formular.
  const injectionInFlight = useRef({});
  // Auslöser, die während einer laufenden Injection kamen und danach
  // nachgezogen werden müssen (siehe injectCredentials weiter unten).
  const injectionRerunRef = useRef({});
  // Laufende Generation pro App — nur der aktuelle Durchlauf darf die Sperre
  // wieder freigeben (siehe injectCredentials).
  const injectionRunSeq = useRef({});
  // Sperrzeiten pro Host, nur im Speicher (siehe WebUntis-Handler)
  const loginCooldownRef = useRef({});
  // Diagnose des Login-Wächters: Tick-Zähler und letzter berichteter Zustand
  const watcherTickRef = useRef(0);
  const watcherLastRef = useRef({});

  // --- Selbstheilung der WebContentsViews -----------------------------------
  // Zeitpunkt des letzten erfolgreich abgeschlossenen Ladevorgangs pro App
  const wcvLastLoadRef = useRef({});
  // Laufende Wiederholungen nach did-fail-load: { attempt, timer }
  const loadRetryRef = useRef({});
  // Verzoegerte Pruefungen auf leer gebliebene Seiten
  const blankCheckTimersRef = useRef({});
  // Zeitpunkt des letzten automatischen Reloads (Cooldown gegen Schleifen)
  const autoReloadAtRef = useRef({});
  // Wie oft die Gesundheitspruefung hintereinander "tot" gemeldet hat
  const healthStrikeRef = useRef({});
  // Wie oft wegen einer leeren Seite bereits neu geladen wurde
  const blankReloadsRef = useRef({});

  // --- BBZ Chat -------------------------------------------------------------
  // Tatsaechlich abgeschickte /api/login-Aufrufe (jeder legt ein Geraet an)
  const bbzChatLoginCallsRef = useRef(0);
  // Wurde der Spinner aufgegeben? Verhindert, dass der Login-Waechter ihn
  // 2,5 s spaeter wieder einblendet und er dauerhaft flackert.
  const bbzChatOverlayGaveUpRef = useRef(false);
  const MAX_LOGIN_ATTEMPTS = 3;

  // Tatsaechlich abgeschickte Anmeldungen pro App.
  //
  // `loginAttempts` zaehlt jeden Durchlauf mit, auch die, die gar kein Formular
  // vorgefunden haben — und der Waechter setzt den Zaehler bei sichtbarer
  // Loginmaske jeden Tick zurueck. Damit greift MAX_LOGIN_ATTEMPTS fuer
  // waechter-ueberwachte Apps nie, und bei falschem Passwort feuert die App
  // alle 2,5 s eine Anmeldung — das sperrt bei Keycloak (Schulportal) und ADFS
  // schnell das Konto.
  //
  // Dieser Zaehler wird deshalb NUR erhoeht, wenn wirklich abgeschickt wurde,
  // und NICHT vom Waechter zurueckgesetzt. Zurueckgesetzt wird er, wenn die
  // Loginmaske verschwunden ist (also der Login geklappt hat) und bei
  // ausdruecklichen Nutzeraktionen (Reload, Resume).
  const submitAttempts = useRef({});
  const MAX_SUBMIT_ATTEMPTS = 5;
  // Damit die Warnung pro App nur einmal erscheint
  const submitLimitNotified = useRef({});

  // Immer der aktuelle standardApps-Stand, auch in Effekten/Callbacks mit
  // leerer Dependency-Liste (Login-Waechter, Resume-Handler, Injection).
  const standardAppsRef = useRef(standardApps);
  standardAppsRef.current = standardApps;

  // Translate error codes to user-friendly German messages
  const getErrorMessage = (error) => {
    switch (error.errorCode) {
      case -2:
        return 'Die Verbindung wurde unterbrochen';
      case -3:
        return 'Der Server konnte nicht gefunden werden';
      case -6:
        return 'Die Verbindung wurde zurückgesetzt';
      case -7:
        return 'Die Serververbindung ist fehlgeschlagen';
      case -21:
        return 'Die Netzwerkverbindung wurde getrennt';
      case -105:
        return 'Die Server-Adresse konnte nicht aufgelöst werden';
      case -106:
        return 'Das Internet ist nicht verfügbar';
      case -109:
        return 'Die Serververbindung wurde abgelehnt';
      case -201:
        return 'Die Webseite konnte nicht sicher aufgerufen werden';
      case -202:
        return 'Die Verbindung ist nicht sicher';
      default:
        return 'Die Seite konnte nicht geladen werden';
    }
  };

  // Disable error toasts for first 15 seconds after startup
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsStartupPeriod(false);
    }, 15000);
    return () => clearTimeout(timer);
  }, []);

  // Retry loading a specific webview
  const handleRetryWebview = (id) => {
    const webview = webviewRefs.current[id]?.current;
    if (webview) {
      webview.reload();
    }
  };
  const toast = useToast();
  const { colorMode, setColorMode } = useColorMode();
  const { settings, isLoading: isSettingsLoading } = useSettings();
  const notificationCheckIntervalRef = useRef(null);

  // Apply zoom level to a webview or WCV
  const applyZoom = useCallback(async (webview, id) => {
    try {
      const zoomFactor = settings.globalZoom;
      if (WCV_APPS.has(id)) {
        await window.electron.view.setZoomFactor(id, zoomFactor);
        return;
      }
      if (!webview) return;
      const webContentsId = await webview.getWebContentsId();
      if (webContentsId) {
        await window.electron.setZoomFactor(webContentsId, zoomFactor);
      }
    } catch (error) {
      console.error(`Error setting zoom for ${id}:`, error);
    }
  }, [settings.globalZoom]);

  // Update zoom levels when settings change or finish loading
  useEffect(() => {
    if (!isSettingsLoading) {  // Only apply zoom when settings are loaded
      Object.entries(webviewRefs.current).forEach(([id, ref]) => {
        if (ref.current) {
          applyZoom(ref.current, id);
        }
      });
    }
  }, [settings.globalZoom, applyZoom, isSettingsLoading, standardApps]);

  // Listen for theme changes from main process
  useEffect(() => {
    if (!window.electron || !window.electron.onThemeChanged) {
      return;
    }
    
    try {
      const unsubscribe = window.electron.onThemeChanged((theme) => {
        setColorMode(theme);
      });
      return () => unsubscribe();
    } catch (error) {
      console.warn('Error setting up theme change listener:', error);
    }
  }, [setColorMode]);

  // Check whether all credentials needed for BBZ Chat auto-login are stored.
  // Re-check periodically so that saving credentials in Settings takes effect
  // without an app restart.
  useEffect(() => {
    if (!window.electron || !window.electron.getCredentials) return;

    let cancelled = false;
    const refresh = async () => {
      try {
        const [emailResult, passwordResult, encResult] = await Promise.all([
          window.electron.getCredentials({ service: 'bbzcloud', account: 'email' }),
          window.electron.getCredentials({ service: 'bbzcloud', account: 'password' }),
          window.electron.getCredentials({ service: 'bbzcloud', account: 'schulcloudEncryptionPassword' }),
        ]);
        const ok = !!(
          emailResult?.success && emailResult.password?.trim() &&
          passwordResult?.success && passwordResult.password?.trim() &&
          encResult?.success && encResult.password?.trim()
        );
        if (!cancelled) setHasBbzChatCredentials(ok);
      } catch (error) {
        if (!cancelled) setHasBbzChatCredentials(false);
      }
    };

    refresh();
    const interval = setInterval(refresh, 10000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Listen for download progress
  useEffect(() => {
    if (!window.electron || !window.electron.onDownloadProgress) {
      return;
    }
    
    try {
      const unsubscribe = window.electron.onDownloadProgress((progress) => {
        if (progress === 'completed' || progress === 'failed' || progress === 'interrupted') {
          setDownloadProgress(null);
        } else if (progress === 'paused') {
          setDownloadProgress('paused');
        } else if (typeof progress === 'number') {
          setDownloadProgress(progress);
        }
      });
      return () => unsubscribe();
    } catch (error) {
      console.warn('Error setting up download progress listener:', error);
    }
  }, []);

  // Zugangsdaten einmal vorab laden, noch bevor die ersten Injections starten.
  //
  // Der erste Schlüsselbund-Zugriff öffnet auf macOS einen Systemdialog und
  // wartet auf die Bestätigung. Läuft das erst innerhalb der ersten Injection,
  // hängt diese mit — und in dieser Zeit kommen die Loginseiten der Apps hoch,
  // ohne dass jemand sie ausfüllt. Vorab geladen liegen die Daten im Cache des
  // Main-Prozesses, und alle Injections greifen ohne Wartezeit darauf zu.
  useEffect(() => {
    if (!window.electron?.getCredentials) return;
    window.electron.getCredentials({ service: 'bbzcloud', account: 'email' })
      .then(() => console.log('[Credentials] Schlüsselbund vorgeladen'))
      .catch((error) => console.warn('[Credentials] Vorladen fehlgeschlagen:', error?.message));
  }, []);

  // -------------------------------------------------------------------------
  // WebContentsView lifecycle
  // -------------------------------------------------------------------------

  // Create WCV apps on mount (mirroring the webview preload logic).
  useEffect(() => {
    if (!standardApps) return;
    // Gestaffelt erzeugen statt alle Ansichten im selben Tick.
    //
    // Vorher startete jeder Ladevorgang gleichzeitig. Elf parallele
    // Erstaufrufe — darunter mehrere schwere SPAs und zwei ADFS-Ketten —
    // haben sich gegenseitig ausgebremst; einzelne blieben auf halber Strecke
    // stehen und standen dann bis zu einem Reload durch den Nutzer leer da.
    // Die erste App (im Normalfall die sichtbare) startet unveraendert sofort.
    let createIndex = 0;
    for (const [id, config] of Object.entries(standardApps)) {
      if (!WCV_APPS.has(id) || !config.visible) continue;
      const delay = createIndex * WCV_CREATE_STAGGER_MS;
      createIndex += 1;
      const create = () =>
        window.electron.view.create({ appId: id, url: config.url }).catch((err) =>
          console.error(`[WCV] Failed to create view for ${id}:`, err)
        );
      // Nicht abgebrochen beim Unmount: create() ist idempotent, und ein
      // Neuaufbau der Komponente waehrend des Starts (siehe unten) darf die
      // noch ausstehenden Ansichten nicht verschlucken.
      if (delay === 0) create();
      else setTimeout(create, delay);
    }
    // Cleanup: NUR die Timer stoppen — die Views bleiben bestehen.
    //
    // Vorher wurden hier alle WebContentsViews zerstoert. Wird die Komponente
    // waehrend des Starts neu aufgebaut (der SettingsProvider haengt den
    // gesamten Baum ab, sobald er die Einstellungen nachlaedt), riss das
    // mitten im Laden alle Seiten weg — samt der laufenden Anmeldungen.
    // Je nachdem, wann das passierte, klappte der Login oder eben nicht.
    //
    // Die Views gehoeren ohnehin zur Lebensdauer der App und werden beim
    // Beenden vom Main-Prozess abgeraeumt. Ein erneutes create() ist ein
    // No-op, solange die View existiert — der Neuaufbau ist damit harmlos.
    return () => {
      for (const id of WCV_APPS) {
        clearInterval(wcvIntervalsRef.current[id]);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Navigate a WCV to its new configured URL when the setting changes at runtime
  // (e.g. the useBbzChat toggle switching schulcloud ↔ BBZ Chat).
  useEffect(() => {
    if (!standardApps) return;

    const originOf = (url) => {
      try {
        return new URL(url).origin;
      } catch (_) {
        return null;
      }
    };

    const startNavigation = (id, url) => {
      // Reset login state so credential injection runs fresh on the new URL.
      credsAreSet.current[id] = false;
      loginAttempts.current[id] = 0;
      failedLogins.current[id] = false;
      wcvNavigationTargetRef.current[id] = url;
      window.electron.view.navigate(id, url);
    };

    for (const [id, config] of Object.entries(standardApps)) {
      if (!WCV_APPS.has(id) || !config.visible) continue;
      const prev = wcvConfigUrlsRef.current[id];
      if (prev && prev !== config.url) {
        startNavigation(id, config.url);
      }
      wcvConfigUrlsRef.current[id] = config.url;

      // Selbstheilung für den BBZ-Chat-Schalter.
      //
      // Der Vergleich oben stützt sich auf mitgeführte Buchführung. Läuft die
      // aus dem Tritt, bleibt der Webview auf dem alten Dienst stehen und
      // liess sich nur per Neustart korrigieren. Deshalb zusätzlich der
      // Abgleich mit dem, was die View tatsächlich anzeigt.
      //
      // Bewusst NUR für schulcloud: dort wechselt die URL zur Laufzeit, und
      // beide Dienste bleiben auf ihrem eigenen Origin. Bei Nextcloud/Outlook
      // würde so eine Prüfung den ADFS-Login abwürgen, weil der Login
      // zwischendurch auf einem fremden Origin läuft.
      if (id !== 'schulcloud') continue;

      const wantOrigin = originOf(config.url);
      const haveOrigin = originOf(wcvUrlsRef.current[id]);
      if (!wantOrigin || !haveOrigin) continue;

      if (wantOrigin === haveOrigin) {
        // Ziel erreicht — Sperre lösen, damit ein späterer Wechsel wieder greift
        wcvNavigationTargetRef.current[id] = null;
      } else if (wcvNavigationTargetRef.current[id] !== config.url) {
        // Falscher Dienst und noch keine Navigation dorthin unterwegs
        console.log(`[${id}] Zeigt ${haveOrigin}, konfiguriert ist ${wantOrigin} — navigiere neu`);
        startNavigation(id, config.url);
      }
    }
  }, [standardApps]);

  // Show/hide WCV views when the active app changes; apply zoom on show.
  //
  // Bewusst nur an der App-ID hängen, nicht am ganzen activeWebView-Objekt:
  // App.js erzeugt bei jedem onNavigate ein neues Objekt ({...activeWebView, url}).
  // Mit dem Objekt als Dependency lief bei jeder Navigation ein hide()/show()-
  // Zyklus, der den Fokus im WebView zurücksetzt — der Cursor sprang dann aus
  // dem gerade benutzten Textfeld heraus.
  useEffect(() => {
    if (!activeWcvId) return;
    window.electron.view.show(activeWcvId);
    // Apply current zoom to the newly visible view
    applyZoom(null, activeWcvId);
    return () => {
      window.electron.view.hide(activeWcvId);
    };
  }, [activeWcvId, applyZoom]);

  // Notbremse gegen den Dauer-Spinner.
  //
  // Bleibt die BBZ-Chat-Anmeldung haengen — Server antwortet nicht, Token laesst
  // sich nicht pruefen, Zugangsdaten passen nicht —, blieb bisher nur der
  // Ladekreis stehen. Nach dieser Zeit wird das Overlay ausgeblendet, damit der
  // Nutzer die Seite darunter sieht und sich selbst anmelden kann.
  useEffect(() => {
    if (!bbzChatLoginActive) return;
    const timer = setTimeout(() => {
      console.warn('[BBZ Chat] Anmeldung dauert zu lange - Overlay wird ausgeblendet');
      bbzChatOverlayGaveUpRef.current = true;
      setBbzChatLoginActive(false);
    }, BBZ_CHAT_OVERLAY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [bbzChatLoginActive]);

  // Hide the schulcloud WCV while the BBZ Chat spinner is shown so the React
  // overlay is visible (WCV is a native layer composited above the renderer).
  // Nur bei echtem Wechsel umschalten — ein wiederholtes show() würde den
  // Fokus im WebView zurücksetzen.
  const schulcloudVisibilityRef = useRef(null);
  useEffect(() => {
    if (activeWcvId !== 'schulcloud') {
      schulcloudVisibilityRef.current = null;
      return;
    }
    // Ohne vollstaendige Zugangsdaten wird gar kein Overlay gezeigt — dann muss
    // die Ansicht sichtbar sein.
    //
    // Vorher stieg der Effekt bei fehlenden Zugangsdaten sofort aus. War die
    // Ansicht in dem Moment gerade ausgeblendet (Overlay stand noch) und fiel
    // hasBbzChatCredentials danach auf false, blieb sie fuer den Rest der
    // Sitzung unsichtbar: schul.cloud zeigte nur noch eine leere Flaeche, und
    // auch ein Reload half nicht, weil das Problem gar nicht die Seite war.
    const shouldBeVisible = !(bbzChatLoginActive && hasBbzChatCredentials);
    if (schulcloudVisibilityRef.current === shouldBeVisible) return;
    schulcloudVisibilityRef.current = shouldBeVisible;
    if (shouldBeVisible) {
      window.electron.view.show('schulcloud');
    } else {
      window.electron.view.hide('schulcloud');
    }
  }, [bbzChatLoginActive, hasBbzChatCredentials, activeWcvId]);

  // Track navigation URL for WCV apps (used by getWcvProxy); also drive the
  // BBZ Chat loading overlay state when the schulcloud WCV navigates.
  useEffect(() => {
    const unsubscribe = window.electron.view.onEvent((event) => {
      if (!WCV_APPS.has(event.appId)) return;
      if (event.type === 'did-navigate' || event.type === 'did-navigate-in-page') {
        const previousUrl = wcvUrlsRef.current[event.appId] || '';
        wcvUrlsRef.current[event.appId] = event.url;

        // BBB/Greenlight 3 ist eine SPA: Ab-/Anmelden wechselt die Route ohne
        // erneutes dom-ready. Beim Wechsel auf /signin den Login-State
        // zurücksetzen und einen Auto-Login-Versuch starten.
        if (event.appId === 'bbb' && event.url && previousUrl !== event.url) {
          const onSignInPage = /\/(signin|b\/signin)(\?|#|$)/.test(event.url);
          if (onSignInPage) {
            credsAreSet.current.bbb = false;
            loginAttempts.current.bbb = 0;
            failedLogins.current.bbb = false;
            injectCredentials(getWcvProxy('bbb'), 'bbb');
          }
        }

        if (event.appId === 'schulcloud' && event.type === 'did-navigate') {
          if (event.url && event.url.includes('chat.bbz-rd-eck.com')) {
            // Frische Navigation = frischer Anlauf, auch fuer das Overlay.
            bbzChatOverlayGaveUpRef.current = false;
            if (!failedLogins.current.schulcloud) {
              setBbzChatLoginActive(true); // refined to false once login is confirmed
            }
          } else if (event.url) {
            setBbzChatLoginActive(false);
          }
        }
      } else if (event.type === 'dom-ready' && event.appId === 'schulcloud') {
        // Also catch initial load / reload where did-navigate fires before dom-ready
        const url = wcvUrlsRef.current['schulcloud'] || '';
        if (url.includes('chat.bbz-rd-eck.com') &&
            !failedLogins.current.schulcloud &&
            !bbzChatOverlayGaveUpRef.current) {
          setBbzChatLoginActive(true);
        }
      }
    });
    return unsubscribe;
  // setBbzChatLoginActive is a stable React setState setter
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Loading state for WCV apps — mirrors what the webview events do for regular apps
  useEffect(() => {
    const unsubscribe = window.electron.view.onEvent((event) => {
      if (!WCV_APPS.has(event.appId)) return;
      if (event.type === 'did-start-loading') {
        setIsLoading(prev => ({ ...prev, [event.appId]: true }));
      } else if (event.type === 'did-stop-loading') {
        setIsLoading(prev => ({ ...prev, [event.appId]: false }));
      } else if (event.type === 'dom-ready') {
        console.log(`[${event.appId}] dom-ready`);
        const appId = event.appId;
        const proxy = getWcvProxy(appId);
        applyZoom(null, appId);

        if (appId === 'cryptpad') {
          // No credential injection; just suppress the "popups blocked" warning
          proxy.executeJavaScript(`
            window.open = new Proxy(window.open, {
              apply(target, thisArg, args) {
                const result = Reflect.apply(target, thisArg, args);
                return result || { closed: false };
              }
            });
            const warn = document.querySelector('.cp-popup-warning');
            if (warn) warn.remove();
          `).catch(() => {});

        } else if (appId === 'schulportal') {
          // Reset on each dom-ready so session-expiry triggers re-injection
          credsAreSet.current[appId] = false;
          injectCredentials(proxy, appId);

        } else if (appId === 'nextcloud') {
          // Multi-step ADFS chain: reset on every dom-ready so each step can inject
          credsAreSet.current[appId] = false;
          injectCredentials(proxy, appId);

        } else if (appId === 'outlook') {
          // Each ADFS navigation step fires dom-ready — reset so every step can inject
          credsAreSet.current[appId] = false;
          injectCredentials(proxy, appId);

        } else if (appId === 'schulcloud') {
          // schulcloud never sets credsAreSet = true (multi-step login manages its own state)
          injectCredentials(proxy, appId);

        } else if (appId === 'webuntis') {
          credsAreSet.current[appId] = false;
          injectCredentials(proxy, appId);

        } else if (appId === 'wiki') {
          // Reset on each dom-ready so session-expiry/logout triggers re-injection
          credsAreSet.current[appId] = false;
          injectCredentials(proxy, appId);

        } else {
          injectCredentials(proxy, appId);
        }
      }
    });
    return unsubscribe;
  // injectCredentials and applyZoom are stable useCallbacks; getWcvProxy too
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -------------------------------------------------------------------------
  // Bounds binding for the active WCV anchor div
  // -------------------------------------------------------------------------

  // Anchor ref for the currently active WCV app (activeWcvId siehe oben)
  const activeWcvAnchorRef = useRef(null);

  // Keep activeWcvAnchorRef in sync with the active WCV anchor div
  useEffect(() => {
    if (activeWcvId) {
      activeWcvAnchorRef.current = wcvAnchorRefs.current[activeWcvId] || null;
    } else {
      activeWcvAnchorRef.current = null;
    }
  }, [activeWcvId]);

  useViewBoundsBinding(activeWcvAnchorRef, activeWcvId);

  // Forward badge-count updates sent by ViewManager (via page-title-updated for
  // BBZ Chat) to the main-process tray icon via the existing update-badge channel.
  useEffect(() => {
    if (!window.electron?.view?.onBadgeUpdate) return;
    const unsubscribe = window.electron.view.onBadgeUpdate(({ count }) => {
      window.electron.send('update-badge', count);
    });
    return unsubscribe;
  }, []);

  // -------------------------------------------------------------------------

  // Returns a proxy object for WCV apps so injectCredentials can work unmodified.
  // executeJavaScript is routed through IPC; getURL reads the cached URL.
  const getWcvProxy = useCallback((id) => ({
    executeJavaScript: (code, userGesture) =>
      window.electron.view.executeJavaScript(id, code, userGesture),
    getURL: () => wcvUrlsRef.current[id] || '',
    reload: () => window.electron.view.reload(id),
  }), []);

  // -------------------------------------------------------------------------
  // Selbstheilung: Ladefehler, leere Seiten und stille Sitzungsverluste
  // -------------------------------------------------------------------------

  // Ein automatischer Reload — im Gegensatz zum Reload per Tastendruck eine
  // Massnahme der App selbst, deshalb mit Cooldown gegen Endlosschleifen.
  //
  // Bewusst NICHT zurueckgesetzt wird `failedLogins` und `submitAttempts`: sind
  // die Zugangsdaten falsch, soll ein automatischer Reload nicht die naechste
  // Runde Anmeldeversuche freigeben. Nur ausdrueckliche Nutzeraktionen
  // (Reload-Taste, Aufwachen aus dem Standby) duerfen das.
  const autoReloadWcv = useCallback((id, reason, cooldownMs = AUTO_RELOAD_COOLDOWN_MS) => {
    const last = autoReloadAtRef.current[id] || 0;
    if (Date.now() - last < cooldownMs) {
      return false;
    }
    autoReloadAtRef.current[id] = Date.now();
    console.warn(`[${id}] Automatischer Reload: ${reason}`);

    credsAreSet.current[id] = false;
    loginAttempts.current[id] = 0;
    injectionInFlight.current[id] = null;
    injectionRerunRef.current[id] = null;

    try {
      forceReloadWcv(id, standardAppsRef.current, wcvUrlsRef.current[id]);
    } catch (error) {
      console.warn(`[${id}] Automatischer Reload fehlgeschlagen:`, error);
      return false;
    }
    return true;
  }, []);

  // Nach einem Ladefehler mit wachsendem Abstand erneut versuchen.
  const scheduleLoadRetry = useCallback((id) => {
    const state = loadRetryRef.current[id] || { attempt: 0, timer: null };
    loadRetryRef.current[id] = state;
    if (state.timer) return;
    const step = Math.min(state.attempt, LOAD_RETRY_DELAYS_MS.length - 1);
    const delay = LOAD_RETRY_DELAYS_MS[step];
    state.attempt += 1;
    const attemptNo = state.attempt;
    state.timer = setTimeout(() => {
      state.timer = null;
      console.log(`[${id}] Ladeversuch ${attemptNo} nach Fehler`);
      try {
        forceReloadWcv(id, standardAppsRef.current, wcvUrlsRef.current[id]);
      } catch (_) {
        // Naechster Versuch kommt ueber das naechste did-fail-load
      }
    }, delay);
  }, []);

  // Leer gebliebene Seite erkennen und einmal nachladen.
  const checkBlankPage = useCallback(async (id) => {
    const url = wcvUrlsRef.current[id] || '';
    if (!url || url.startsWith('about:')) return;
    if ((blankReloadsRef.current[id] || 0) >= MAX_BLANK_RELOADS) return;

    let result;
    try {
      result = await window.electron.view.executeJavaScript(id, BLANK_PAGE_PROBE_JS);
    } catch (_) {
      return; // View existiert nicht oder navigiert gerade
    }
    if (result !== 'BLANK') {
      blankReloadsRef.current[id] = 0;
      return;
    }

    console.warn(`[${id}] Seite ist leer geblieben`);
    if (autoReloadWcv(id, 'leere Seite', BLANK_RELOAD_COOLDOWN_MS)) {
      blankReloadsRef.current[id] = (blankReloadsRef.current[id] || 0) + 1;
    }
  }, [autoReloadWcv]);

  // Ladefehler, Abstuerze und erfolgreiche Ladevorgaenge auswerten.
  //
  // ViewManager schickt did-fail-load und render-process-gone schon lange an
  // den Renderer, ausgewertet hat sie bisher niemand: schlug der erste
  // Ladeversuch fehl (Netz beim Start noch nicht oben, kurzer Aussetzer,
  // ueberlasteter Server), stand die Ansicht bis zu einem Reload durch den
  // Nutzer auf der Chromium-Fehlerseite.
  useEffect(() => {
    const unsubscribe = window.electron.view.onEvent((event) => {
      if (!WCV_APPS.has(event.appId)) return;
      const id = event.appId;

      if (event.type === 'did-finish-load' || event.type === 'did-navigate') {
        wcvLastLoadRef.current[id] = Date.now();
        healthStrikeRef.current[id] = 0;
        const state = loadRetryRef.current[id];
        if (state) {
          clearTimeout(state.timer);
          loadRetryRef.current[id] = { attempt: 0, timer: null };
        }
        return;
      }

      if (event.type === 'did-fail-load') {
        // isMainFrame kann bei aelteren Ereignissen fehlen -> nur ein
        // ausdrueckliches false gilt als Unterrahmen.
        if (event.isMainFrame === false) return;
        if (IGNORED_LOAD_ERROR_CODES.has(event.errorCode)) return;
        console.warn(`[${id}] Laden fehlgeschlagen:`, event.errorCode, event.errorDescription, event.validatedURL);
        scheduleLoadRetry(id);
        return;
      }

      if (event.type === 'render-process-gone') {
        console.warn(`[${id}] Renderer beendet:`, event.details);
        scheduleLoadRetry(id);
        return;
      }

      if (event.type === 'did-stop-loading') {
        clearTimeout(blankCheckTimersRef.current[id]);
        blankCheckTimersRef.current[id] = setTimeout(() => checkBlankPage(id), BLANK_CHECK_DELAY_MS);
      }
    });

    return () => {
      unsubscribe();
      Object.values(blankCheckTimersRef.current).forEach(clearTimeout);
      Object.values(loadRetryRef.current).forEach((state) => clearTimeout(state?.timer));
    };
  }, [scheduleLoadRetry, checkBlankPage]);

  // Kommt das Netz zurueck, sofort erneut laden statt den naechsten
  // Backoff-Schritt abzuwarten.
  useEffect(() => {
    const handleOnline = () => {
      console.log('[Netz] Verbindung zurueck');
      for (const id of WCV_APPS) {
        if (!standardAppsRef.current?.[id]?.visible) continue;
        const state = loadRetryRef.current[id];
        if (!state || (!state.attempt && !state.timer)) continue;
        clearTimeout(state.timer);
        loadRetryRef.current[id] = { attempt: 0, timer: null };
        try {
          forceReloadWcv(id, standardAppsRef.current, wcvUrlsRef.current[id]);
        } catch (_) { /* naechster Versuch ueber did-fail-load */ }
      }
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  // Gesundheitscheck: stille Sitzungsverluste und abgestandene Ansichten.
  //
  // Outlook/OWA ist der Grund dafuer. Laeuft die Sitzung ab oder reisst die
  // Verbindung (Standby, Netzwechsel, langer Sperrbildschirm), bleibt die
  // Oberflaeche stehen und "wird taub": sie zeigt weiter den alten Stand,
  // aktualisiert aber nichts mehr und zeigt auch keine Loginmaske, auf die der
  // Login-Waechter reagieren koennte. Ohne diesen Check half nur ein Reload
  // von Hand.
  useEffect(() => {
    const tick = async () => {
      for (const id of WCV_APPS) {
        if (!standardAppsRef.current?.[id]?.visible) continue;
        if (!wcvUrlsRef.current[id]) continue;
        // Waehrend eine Wiederholung nach Ladefehler laeuft, nicht dazwischenfunken
        const retry = loadRetryRef.current[id];
        if (retry && retry.timer) continue;

        // 1) Leer gebliebene Seite (Sicherheitsnetz zur Sofortpruefung nach
        //    did-stop-loading, falls dieses Ereignis ausgeblieben ist)
        await checkBlankPage(id);

        const proxy = getWcvProxy(id);

        // 2) Stiller Sitzungsverlust
        const probe = WCV_HEALTH_PROBES[id];
        if (probe) {
          try {
            const result = await window.electron.view.executeJavaScript(id, probe);
            if (result === 'SESSION_DEAD') {
              healthStrikeRef.current[id] = (healthStrikeRef.current[id] || 0) + 1;
              console.warn(`[${id}] Server lehnt die Sitzung ab (${healthStrikeRef.current[id]}/2)`);
              // Erst beim zweiten Mal handeln: eine einzelne abgelehnte
              // Anfrage kann auch ein Aussetzer sein.
              if (healthStrikeRef.current[id] >= 2 && !(await hasUnsavedText(proxy))) {
                if (autoReloadWcv(id, 'Sitzung abgelaufen')) {
                  healthStrikeRef.current[id] = 0;
                }
              }
              continue;
            }
            if (result === 'ALIVE') healthStrikeRef.current[id] = 0;
          } catch (_) {
            // View nicht erreichbar — naechster Durchlauf
          }
        }

        // 3) Abgestandene Ansicht auffrischen.
        //
        //    Im Hintergrund nach WCV_MAX_AGE_MS, waehrend der Nutzer die App
        //    ansieht erst nach der doppelten Zeit. Ein Reload vor der Nase des
        //    Nutzers ist aufdringlich — aber gar nicht auffrischen ist keine
        //    Loesung: bleibt Outlook den ganzen Vormittag die aktive App und
        //    schlaeft der Rechner zwischendurch, faengt sonst niemand den
        //    stillen Verbindungsverlust ab.
        const maxAge = WCV_MAX_AGE_MS[id];
        if (!maxAge) continue;
        const threshold = activeWcvIdRef.current === id ? maxAge * 2 : maxAge;
        const lastLoad = wcvLastLoadRef.current[id];
        if (!lastLoad || Date.now() - lastLoad < threshold) continue;
        if (await hasUnsavedText(proxy)) {
          console.log(`[${id}] Auffrischen verschoben - ungespeicherter Text auf der Seite`);
          continue;
        }
        autoReloadWcv(id, `seit ${Math.round((Date.now() - lastLoad) / 60000)} min nicht neu geladen`);
      }
    };

    const timer = setInterval(tick, HEALTH_CHECK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [checkBlankPage, autoReloadWcv, getWcvProxy]);

  // Beim Wechsel auf eine App pruefen, ob sie zu lange nicht geladen wurde.
  //
  // Deckt den haeufigsten Fall im Alltag ab: der Rechner war im Standby oder
  // der Bildschirm lange gesperrt, und beim Zurueckkommen soll die App nicht
  // erst nach dem naechsten Gesundheitscheck wieder leben.
  useEffect(() => {
    if (!activeWcvId) return;
    const maxAge = WCV_MAX_AGE_MS[activeWcvId];
    if (!maxAge) return;
    const lastLoad = wcvLastLoadRef.current[activeWcvId];
    if (!lastLoad || Date.now() - lastLoad < maxAge) return;
    autoReloadWcv(activeWcvId, 'beim Wechsel abgestanden');
  }, [activeWcvId, autoReloadWcv]);

  // Automatische BBZ-Chat-Anmeldung endgueltig stoppen und den Nutzer
  // informieren. `failedLogins` haelt den Login-Waechter an, das Overlay wird
  // ausgeblendet und bleibt es auch (bbzChatOverlayGaveUpRef) — sonst blendet
  // der Waechter 2,5 s spaeter wieder einen Spinner ein, hinter dem nichts
  // mehr passiert.
  const stopBbzChatAutoLogin = useCallback((id, title, description) => {
    failedLogins.current[id] = true;
    credsAreSet.current[id] = false;
    bbzChatOverlayGaveUpRef.current = true;
    setBbzChatLoginActive(false);
    console.warn(`[BBZ Chat] ${title}: ${description}`);
    toast({
      title,
      description,
      status: 'error',
      duration: null,
      isClosable: true,
    });
  // toast ist stabil, setBbzChatLoginActive ist ein React-Setter
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Eine tatsaechlich abgeschickte Anmeldung verbuchen. Siehe submitAttempts.
  const noteSubmit = useCallback((id) => {
    submitAttempts.current[id] = (submitAttempts.current[id] || 0) + 1;
    console.log(`[${id}] Anmeldung abgeschickt (${submitAttempts.current[id]}/${MAX_SUBMIT_ATTEMPTS})`);
  }, []);

  // Function to inject credentials based on webview ID
  // (nicht direkt aufrufen — der Wrapper injectCredentials weiter unten
  // serialisiert die Aufrufe pro App)
  const injectCredentialsImpl = useCallback(async (webview, id) => {
    if (!webview || credsAreSet.current[id]) {
      return;
    }

    // Stop if we already had a fatal login failure for this app
    if (failedLogins.current[id]) {
      console.log(`[${id}] Previous login failed - stopping auto-login`);
      return;
    }

    // Harte Obergrenze fuer wirklich abgeschickte Anmeldungen. Schuetzt vor
    // Kontosperren, wenn die Zugangsdaten falsch sind und die App keine eigene
    // Fehlererkennung hat (alles ausser WebUntis).
    if ((submitAttempts.current[id] || 0) >= MAX_SUBMIT_ATTEMPTS) {
      if (!submitLimitNotified.current[id]) {
        submitLimitNotified.current[id] = true;
        console.warn(`[${id}] ${MAX_SUBMIT_ATTEMPTS} Anmeldungen ohne Erfolg - Auto-Login gestoppt`);
        toast({
          title: `${standardAppsRef.current?.[id]?.title || id}: Automatische Anmeldung gestoppt`,
          description: 'Mehrere Anmeldeversuche blieben ohne Erfolg. Bitte Zugangsdaten in den Einstellungen prüfen und die App neu laden.',
          status: 'warning',
          duration: null,
          isClosable: true,
        });
      }
      return;
    }

    // Niemals injizieren, während der Nutzer gerade tippt.
    //
    // Die Login-Handler setzen Feldwerte, klicken Buttons und rufen teilweise
    // .focus() auf — läuft das während einer Eingabe, springt der Cursor aus
    // dem Textfeld. Weil mehrere Apps alle 2-5 s einen periodischen Login-Check
    // fahren, kann eine fehlerhafte "eingeloggt?"-Erkennung dazu führen, dass
    // das dauerhaft passiert und Eingaben praktisch unmöglich werden.
    //
    // Ein leeres, fokussiertes Feld gilt nicht als "tippt gerade" — sonst
    // würde der Autofocus vieler Loginseiten (z. B. BBB/Greenlight) die
    // Anmeldung dauerhaft blockieren.
    if (await isUserTyping(webview)) {
      console.log(`[${id}] Skipping credential injection - user is typing`);
      return;
    }

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    try {
      // Get credentials from keytar using the correct service/account names
      const emailResult = await window.electron.getCredentials({
        service: 'bbzcloud',
        account: 'email'
      });

      const passwordResult = await window.electron.getCredentials({
        service: 'bbzcloud',
        account: 'password'
      });

      const bbbPasswordResult = id === 'bbb' ? await window.electron.getCredentials({
        service: 'bbzcloud',
        account: 'bbbPassword'
      }) : null;

      if (!emailResult.success || !passwordResult.success || (id === 'bbb' && !bbbPasswordResult?.success)) {
        console.log(`[${id}] Abbruch: Zugangsdaten nicht lesbar (email/password/bbbPassword)`);
        return;
      }

      const emailAddress = emailResult.password;
      const password = passwordResult.password;
      const bbbPassword = bbbPasswordResult?.password;

      // Skip injection if credentials are empty or whitespace-only
      if (!emailAddress?.trim() || !password?.trim() || (id === 'bbb' && !bbbPassword?.trim())) {
        console.log(`[${id}] Skipping credential injection - empty credentials`);
        return;
      }

      // Check login attempt limit (except for Outlook, WebUntis, and schulcloud)
      // schulcloud has a multi-step login process (email -> password -> encryption)
      // and the periodic check may trigger multiple times during this process
      // Zaehler-Limit gilt nur fuer Apps mit einstufigem Login. Die Log-Zeile
      // laeuft aber fuer ALLE — sonst sind ausgerechnet die mehrstufigen Apps
      // (outlook, webuntis, schulcloud, nextcloud) im Log unsichtbar, und man
      // kann nicht unterscheiden, ob eine Injection lief oder nie startete.
      const countsAttempts =
        id !== 'outlook' && id !== 'webuntis' && id !== 'schulcloud' && id !== 'nextcloud';

      if (countsAttempts) {
        if (!loginAttempts.current[id]) {
          loginAttempts.current[id] = 0;
        }
        if (loginAttempts.current[id] >= MAX_LOGIN_ATTEMPTS) {
          console.log(`[${id}] Max login attempts (${MAX_LOGIN_ATTEMPTS}) reached - stopping auto-login`);
          return;
        }
        loginAttempts.current[id]++;
        console.log(`[${id}] Login attempt ${loginAttempts.current[id]}/${MAX_LOGIN_ATTEMPTS}`);
      } else {
        console.log(`[${id}] Injection gestartet (ohne Versuchslimit)`);
      }

      // Von einzelnen Handlern gesetzt, wenn die Anmeldung noch nicht
      // abgeschlossen ist und weitere Ausloeser injizieren duerfen muessen.
      let keepInjectionOpen = false;

      switch (id.toLowerCase()) {
        case 'webuntis':
          try {
            // Sperre gegen zu haeufige Loginversuche (schuetzt den 2FA-Ablauf).
            // Frueher 15 Minuten und in localStorage — damit ueberlebte sie den
            // App-Neustart und blockierte den Auto-Login selbst dann, wenn
            // gerade eine frische Loginmaske dastand. Jetzt kuerzer und nur im
            // Speicher, ein Neustart raeumt sie also auf.
            const COOLDOWN_MINUTES_WEBUNTIS = 3;
            
            // Use hostname-specific key to allow testing on new URLs without waiting
            let hostname = 'unknown';
            try {
              hostname = new URL(webview.getURL()).hostname;
            } catch (e) { console.warn('Could not get hostname for cooldown key'); }
            
            const cooldownKey = `webuntis_${hostname}`;
            const lastLoginAttemptWebuntis = loginCooldownRef.current[cooldownKey];
            const nowWebuntis = Date.now();
            
            if (lastLoginAttemptWebuntis) {
              const timeSinceLastAttempt = nowWebuntis - parseInt(lastLoginAttemptWebuntis, 10);
              const cooldownPeriod = COOLDOWN_MINUTES_WEBUNTIS * 60 * 1000;
              
              if (timeSinceLastAttempt < cooldownPeriod) {
                const remainingMinutes = Math.ceil((cooldownPeriod - timeSinceLastAttempt) / (60 * 1000));
                console.log(`WebUntis login cooldown active for ${hostname}. ${remainingMinutes} minutes remaining.`);
                return;
              }
            }

            // Get WebUntis-specific credentials
            const webuntisEmailResult = await window.electron.getCredentials({
              service: 'bbzcloud',
              account: 'webuntisEmail'
            });
            const webuntisPasswordResult = await window.electron.getCredentials({
              service: 'bbzcloud',
              account: 'webuntisPassword'
            });

            if (!webuntisEmailResult.success || !webuntisPasswordResult.success) {
              return;
            }

            const webuntisEmail = webuntisEmailResult.password;
            const webuntisPassword = webuntisPasswordResult.password;

            if (!webuntisEmail || !webuntisPassword) {
              return;
            }

            const loginAttemptResult = await webview.executeJavaScript(`
              (async () => {
                try {
                  // Auf die tatsächlich benötigten Felder warten, nicht auf ein
                  // beliebiges <form>. WebUntis rendert die Loginmaske asynchron;
                  // die SPA-Hülle enthält oft schon vorher ein <form>. Wer darauf
                  // wartet, läuft sofort weiter, findet die Felder nicht und bricht
                  // ab — der Login blieb dann liegen.
                  const findFields = () => ({
                    form: document.querySelector('.un2-login-form form') || document.querySelector('form'),
                    usernameField: document.querySelector('input[type="text"].un-input-group__input') || document.querySelector('input[type="text"]'),
                    passwordField: document.querySelector('input[type="password"].un-input-group__input') || document.querySelector('input[type="password"]'),
                    submitButton: document.querySelector('button[type="submit"]'),
                  });

                  let fields = findFields();
                  for (let i = 0; i < 100 && !(fields.usernameField && fields.passwordField && fields.submitButton); i++) {
                    await new Promise((resolve) => setTimeout(resolve, 100));
                    fields = findFields();
                  }

                  const { form, usernameField, passwordField, submitButton } = fields;

                  if (!usernameField || !passwordField || !submitButton) {
                    // Loginmaske nach 10 s nicht da -> als "nicht erledigt" melden,
                    // damit der periodische Check es erneut versuchen darf.
                    return 'NO_FORM';
                  }

                  // React-Fiber-Zugriff (bleibt als Zusatzweg erhalten)
                  const getFiberNode = (element) => {
                    const key = Object.keys(element).find(key =>
                      key.startsWith('__reactFiber$') ||
                      key.startsWith('__reactInternalInstance$')
                    );
                    return element[key];
                  };

                  const getReactProps = (element) => {
                    const fiberNode = getFiberNode(element);
                    if (!fiberNode) return null;
                    let current = fiberNode;
                    while (current) {
                      if (current.memoizedProps?.onChange) {
                        return current.memoizedProps;
                      }
                      current = current.return;
                    }
                    return null;
                  };

                  // Wert setzen — nativer Setter plus gebubbeltes input-Event.
                  //
                  // Das ist der Weg, der ohne React-Interna auskommt: React
                  // erkennt die Aenderung ueber den value-Tracker. Der
                  // Fiber-Weg bleibt als Zusatz erhalten, ist aber nicht mehr
                  // Voraussetzung — er scheiterte beim ersten Laden, weil
                  // React zu diesem Zeitpunkt noch nicht am Feld haengt.
                  const setFieldValue = (el, value) => {
                    const setter = Object.getOwnPropertyDescriptor(
                      window.HTMLInputElement.prototype, 'value'
                    ).set;
                    setter.call(el, value);
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));

                    const props = getReactProps(el);
                    if (props?.onChange) {
                      try {
                        props.onChange({
                          target: el, currentTarget: el, type: 'change',
                          bubbles: true, cancelable: true, defaultPrevented: false,
                          preventDefault: () => {}, stopPropagation: () => {},
                          isPropagationStopped: () => false, persist: () => {}
                        });
                      } catch (e) { /* Zusatzweg darf scheitern */ }
                    }
                  };

                  // Setzen und GEGENPRUEFEN. Solange React die Felder noch als
                  // kontrollierte Komponenten zuruecksetzt, bleiben sie leer —
                  // dann wird erneut versucht statt blind abzuschicken.
                  const USER = ${JSON.stringify(webuntisEmail)};
                  const PASS = ${JSON.stringify(webuntisPassword)};

                  let filled = false;
                  for (let attempt = 0; attempt < 20 && !filled; attempt++) {
                    setFieldValue(usernameField, USER);
                    setFieldValue(passwordField, PASS);
                    await new Promise(resolve => setTimeout(resolve, 150));
                    filled = usernameField.value === USER && passwordField.value === PASS;
                  }

                  if (!filled) {
                    // Nichts abschicken! Ein leeres Formular wurde frueher als
                    // Erfolg gewertet, setzte die Sperre und blockierte damit
                    // jede Wiederholung — genau daran scheiterte der erste Login.
                    return 'NOT_FILLED';
                  }

                  // Warten, bis der Button freigegeben ist
                  for (let i = 0; i < 20 && submitButton.disabled; i++) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                  }

                  if (submitButton.disabled) {
                    return 'SUBMIT_DISABLED';
                  }

                  const formProps = getReactProps(form);
                  if (formProps?.onSubmit) {
                    formProps.onSubmit({
                      preventDefault: () => {},
                      stopPropagation: () => {},
                      target: form,
                      currentTarget: form,
                      nativeEvent: new Event('submit')
                    });
                  } else {
                    submitButton.click();
                  }

                  // Wait 2 seconds for response
                  await new Promise(resolve => setTimeout(resolve, 2000));

                  const bodyText = document.body.innerText || '';
                  if (bodyText.includes('Ungültiger Benutzername und/oder Passwort')) {
                    return 'INVALID_CREDENTIALS';
                  }

                  // Auf der 2FA-Seite ist der Login aus unserer Sicht erledigt.
                  const authLabel = document.querySelector('.un-input-group__label');
                  if (authLabel?.textContent === 'Bestätigungscode') {
                    return 'SUCCESS';
                  }

                  // Kein window.location.reload() mehr an dieser Stelle.
                  //
                  // Zwei Gruende: Erstens rennt der Reload dem return-Wert davon —
                  // wird das Dokument abgeraeumt, bevor executeJavaScript aufloest,
                  // haengt die Injection bis INJECTION_STALE_MS (45 s) und alle
                  // Wiederholungen in dieser Zeit laufen ins Leere. Zweitens kann
                  // ein Reload die gerade erst aufgebaute Sitzung wieder wegwerfen.
                  //
                  // Stattdessen wird geprueft, ob die Loginmaske verschwunden ist.
                  // Nur dann gilt der Versuch als gelungen und setzt die Sperre.
                  const stillOnLogin = !!(document.querySelector('.un2-login-form') ||
                                          document.querySelector('input[type="password"]'));
                  return stillOnLogin ? 'STILL_ON_LOGIN' : 'SUCCESS';
                } catch (error) {
                  return false;
                }
              })();
            `);

            if (loginAttemptResult === 'NO_FORM' ||
                loginAttemptResult === 'NOT_FILLED' ||
                loginAttemptResult === 'SUBMIT_DISABLED' ||
                loginAttemptResult === 'STILL_ON_LOGIN' ||
                loginAttemptResult === false) {
              // Es wurde nichts abgeschickt oder die Loginmaske steht noch ->
              // weder als erledigt markieren noch die Sperre setzen. Sonst
              // verbrennt ein fehlgeschlagener Versuch drei Minuten, in denen
              // gar nichts mehr passiert — genau das liess den WebUntis-Login
              // nach dem Standby "einfach nie" greifen.
              //
              // STILL_ON_LOGIN heisst aber sehr wohl, dass abgeschickt wurde:
              // das zaehlt gegen das Submit-Limit, sonst laeuft die Schleife
              // bei falschem Passwort ewig.
              if (loginAttemptResult === 'STILL_ON_LOGIN') noteSubmit('webuntis');
              console.log(`[webuntis] Kein erfolgreicher Loginversuch (${loginAttemptResult}) - wird wiederholt`);
              return;
            }

            if (loginAttemptResult === 'SUCCESS' || loginAttemptResult === true) {
              noteSubmit('webuntis');
            }

            if (loginAttemptResult === 'INVALID_CREDENTIALS') {
              failedLogins.current['webuntis'] = true;
              console.log('WebUntis login failed: Invalid credentials. Stopping auto-login.');
              toast({
                title: 'WebUntis Login fehlgeschlagen',
                description: 'Ungültiger Benutzername und/oder Passwort. Automatische Anmeldung gestoppt.',
                status: 'error',
                duration: null,
                isClosable: true,
              });
              return;
            }

            // Store timestamp only if login button was actually clicked (success or unknown state)
            if (loginAttemptResult === 'SUCCESS' || loginAttemptResult === true) {
              loginCooldownRef.current[cooldownKey] = nowWebuntis;
              console.log(`WebUntis login attempted for ${hostname}. ${COOLDOWN_MINUTES_WEBUNTIS}-minute cooldown started.`);
            }

          } catch (error) {
            console.error('Error during WebUntis login:', error);
          }
          break;

        case 'outlook': {
          // Alle drei Felder in einem Durchlauf und mit Null-Prüfung.
          //
          // Vorher wurde direkt auf querySelector(...).value zugegriffen: fehlt
          // ein Feld (ADFS-Zwischenseite, bereits angemeldet), wirft das eine
          // TypeError, executeJavaScript lehnt ab und der gesamte Handler
          // bricht mit "Error injecting credentials for outlook" ab — noch
          // bevor irgendetwas anderes passieren konnte.
          const outlookResult = await webview.executeJavaScript(`
            (function() {
              const user = document.querySelector('#userNameInput');
              const pass = document.querySelector('#passwordInput');
              const submit = document.querySelector('#submitButton');
              if (!user || !pass || !submit) {
                return 'NO_FORM:' + [!!user, !!pass, !!submit].join(',');
              }
              user.value = ${JSON.stringify(emailAddress)};
              pass.value = ${JSON.stringify(password)};
              submit.click();
              return 'SUBMITTED';
            })()
          `);

          console.log('[outlook] Login injection result:', outlookResult);

          if (outlookResult === 'SUBMITTED') noteSubmit(id);

          if (outlookResult !== 'SUBMITTED') {
            // Kein Formular -> nichts als erledigt markieren, damit der
            // nächste Schritt der ADFS-Kette es erneut versuchen darf
            keepInjectionOpen = true;
            break;
          }

          // Save credentials after successful login
          await window.electron.saveCredentials({
            service: 'bbzcloud',
            account: 'email',
            password: emailAddress
          });
          await window.electron.saveCredentials({
            service: 'bbzcloud',
            account: 'password',
            password: password
          });

          await sleep(5000);
          webview.reload();
          break;
        }

        case 'moodle': {
          // Ebenfalls mit Null-Prüfung: auf der bereits angemeldeten
          // Moodle-Startseite gibt es kein Loginformular, und der direkte
          // Zugriff auf .value warf dort einen Fehler.
          const moodleResult = await webview.executeJavaScript(`
            (function() {
              const user = document.querySelector('input[name="username"][id="username"]');
              const pass = document.querySelector('input[name="password"][id="password"]');
              const submit = document.querySelector('button[type="submit"][id="loginbtn"]');
              if (!user || !pass || !submit) {
                return 'NO_FORM:' + [!!user, !!pass, !!submit].join(',');
              }
              user.value = ${JSON.stringify(emailAddress.toLowerCase())};
              pass.value = ${JSON.stringify(password)};
              submit.click();
              return 'SUBMITTED';
            })()
          `);
          console.log('[moodle] Login injection result:', moodleResult);
          if (moodleResult === 'SUBMITTED') noteSubmit(id);
          if (moodleResult !== 'SUBMITTED') {
            // Kein Formular vorgefunden: das war kein Loginversuch. Zaehler
            // zuruecknehmen UND die Injection offen lassen, damit ein spaeter
            // ablaufender Moodle-Login wieder befuellt werden kann. Vorher
            // blieb credsAreSet fuer den Rest der Sitzung auf true stehen —
            // Moodle hat sich danach nie wieder selbst angemeldet.
            loginAttempts.current[id] = Math.max(0, (loginAttempts.current[id] || 1) - 1);
            keepInjectionOpen = true;
          }
          break;
        }

        case 'bbb': {
          // Greenlight 3 (React + react-hook-form) statt Greenlight 2 (Rails-Form).
          // Feld-IDs: #signInFormEmail / #signInFormPwd, Submit-Button im Formular.
          // Die alten Greenlight-2-Selektoren (#session_email/#session_password/
          // .signin-button) bleiben als Fallback erhalten.
          //
          // react-hook-form registriert einen React-onChange-Handler; ein direkt
          // gesetztes .value wird von React ignoriert. Deshalb der native Setter
          // plus ein gebubbletes 'input'-Event.
          const bbbResult = await webview.executeJavaScript(`
            (async function() {
              try {
                ${SAFE_FOCUS_HELPER_JS}
                const findFields = () => ({
                  emailInput: document.querySelector('#signInFormEmail') ||
                              document.querySelector('#session_email'),
                  passwordInput: document.querySelector('#signInFormPwd') ||
                                 document.querySelector('#session_password'),
                });

                // Greenlight 3 rendert das Formular clientseitig. Auf der
                // Loginroute kurz auf die Felder warten, sonst sofort abbrechen.
                const onSignInRoute = /\\/(signin)\\/?$/.test(window.location.pathname);
                let { emailInput, passwordInput } = findFields();
                if (onSignInRoute) {
                  for (let i = 0; i < 50 && !(emailInput && passwordInput); i++) {
                    await new Promise((r) => setTimeout(r, 100));
                    ({ emailInput, passwordInput } = findFields());
                  }
                }

                if (!emailInput || !passwordInput) {
                  // Kein Loginformular -> entweder bereits angemeldet oder
                  // gerade auf einer anderen Greenlight-Seite (/rooms, /rooms/<id>/join)
                  return 'NO_FORM';
                }

                const setValue = (el, value) => {
                  const setter = Object.getOwnPropertyDescriptor(
                    window.HTMLInputElement.prototype, 'value'
                  ).set;
                  setter.call(el, value);
                  el.dispatchEvent(new Event('input', { bubbles: true }));
                  el.dispatchEvent(new Event('change', { bubbles: true }));
                };

                __bbzSafeFocus(emailInput);
                setValue(emailInput, ${JSON.stringify(emailAddress)});
                setValue(passwordInput, ${JSON.stringify(bbbPassword)});

                const form = emailInput.closest('form');
                const submitButton =
                  (form && form.querySelector('button[type="submit"], input[type="submit"]')) ||
                  document.querySelector('.signin-button');

                if (submitButton) {
                  submitButton.click();
                  return 'SUBMITTED';
                }
                if (form && typeof form.requestSubmit === 'function') {
                  form.requestSubmit();
                  return 'SUBMITTED';
                }
                return 'NO_SUBMIT_BUTTON';
              } catch (err) {
                return 'ERROR: ' + err.message;
              }
            })()
          `);

          console.log('[bbb] Login injection result:', bbbResult);

          if (bbbResult === 'NO_FORM') {
            // Kein Loginformular sichtbar (bereits angemeldet oder andere
            // Greenlight-Seite). Das war kein Loginversuch — Zähler
            // zurücknehmen, damit ein späteres Abmelden wieder einen
            // Auto-Login erlaubt.
            loginAttempts.current[id] = Math.max(0, (loginAttempts.current[id] || 1) - 1);
            keepInjectionOpen = true;
            break;
          }

          if (bbbResult === 'SUBMITTED') {
            noteSubmit(id);
            // Save credentials after successful login
            await window.electron.saveCredentials({
              service: 'bbzcloud',
              account: 'bbbPassword',
              password: bbbPassword
            });
          }
          break;
        }

        case 'wiki': {
          const wikiState = await webview.executeJavaScript(`
            (function() {
              const userInput = document.querySelector('input[name="u"]');
              const passInput = document.querySelector('input[name="p"]');
              if (userInput && passInput) return 'form';
              const loginBtn = document.querySelector('a.login.btn');
              if (loginBtn) return 'login-btn';
              return 'logged-in';
            })()
          `);

          if (wikiState === 'logged-in') {
            credsAreSet.current[id] = true;
            break;
          }

          if (wikiState === 'login-btn') {
            // Navigate to the login page; next dom-ready will fill the form
            await webview.executeJavaScript(
              `document.querySelector('a.login.btn').click();`
            );
            break;
          }

          if (wikiState === 'form') {
            await webview.executeJavaScript(
              `document.querySelector('input[name="u"]').value = ${JSON.stringify(emailAddress)}; void(0);`
            );
            await webview.executeJavaScript(
              `document.querySelector('input[name="p"]').value = ${JSON.stringify(password)}; void(0);`
            );
            await webview.executeJavaScript(
              `(function() { const cb = document.querySelector('input[name="r"]'); if (cb) cb.checked = true; })(); void(0);`
            );
            await webview.executeJavaScript(
              `document.querySelector('button[type="submit"][data-dw-icon="mdi:lock"]').click();`
            );
            credsAreSet.current[id] = true;
          }
          break;
        }

        case 'schulcloud':
          try {
            console.log('[schul.cloud] === Starting credential injection ===');
            
            // Get encryption password for schul.cloud / BBZ Chat
            const schulcloudEncryptionResult = await window.electron.getCredentials({
              service: 'bbzcloud',
              account: 'schulcloudEncryptionPassword'
            });
            const schulcloudEncryptionPassword = schulcloudEncryptionResult.success ? schulcloudEncryptionResult.password : null;
            console.log('[schul.cloud] Encryption password loaded:', schulcloudEncryptionPassword ? 'YES' : 'NO');

            // Check if we're on BBZ Chat (chat.bbz-rd-eck.com)
            const currentUrl = webview.getURL();
            const isBbzChat = currentUrl.includes('chat.bbz-rd-eck.com');
            console.log('[schul.cloud] Current URL:', currentUrl);
            console.log('[schul.cloud] Is BBZ Chat:', isBbzChat);

            // If BBZ Chat, bypass the React login form entirely by calling
            // the API directly. This avoids all React internals / controlled input issues.
            // stashcat-chat's POST /api/login returns {token, user}, and the app
            // reads the token from localStorage('schulchat_token') on startup.
            if (isBbzChat) {
              // Jeder /api/login-Aufruf legt serverseitig ein neues Geraet in
              // schul.cloud an. Deshalb hier eine eigene, sehr enge Obergrenze
              // — und nicht erst MAX_SUBMIT_ATTEMPTS.
              //
              // Vorher wurde jede Fehlerantwort als "voruebergehend" behandelt
              // und der Login-Waechter stiess sie alle 2,5 s erneut an. Bei
              // falschem Verschluesselungskennwort hiess das: Spinner bleibt
              // stehen, und in schul.cloud stapeln sich dutzende Geraete.
              if (bbzChatLoginCallsRef.current >= MAX_BBZCHAT_LOGIN_CALLS) {
                stopBbzChatAutoLogin(
                  id,
                  'BBZ Chat: Automatische Anmeldung gestoppt',
                  `Nach ${MAX_BBZCHAT_LOGIN_CALLS} Versuchen hat der Server die Anmeldung nicht angenommen. ` +
                  'Bitte E-Mail, Passwort und Verschlüsselungskennwort in den Einstellungen prüfen und die App danach neu laden.'
                );
                break;
              }

              const loginResult = await webview.executeJavaScript(`
                (async function() {
                  try {
                    // Check if token exists in localStorage and validate it
                    const existingToken = localStorage.getItem('schulchat_token');
                    if (existingToken) {
                      try {
                        const me = await fetch('/api/me', {
                          headers: { 'Authorization': 'Bearer ' + existingToken }
                        });
                        if (me.ok) {
                          console.log('[BBZ Chat] Token validated via /api/me');
                          return { state: 'ALREADY_LOGGED_IN' };
                        }
                        // Token expired/invalid — remove and fall through to fresh login
                        console.log('[BBZ Chat] Existing token invalid, removing and re-logging in');
                        localStorage.removeItem('schulchat_token');
                      } catch (e) {
                        // Network error — trust the token to avoid logging the user out unnecessarily
                        console.log('[BBZ Chat] Token validation network error, trusting token');
                        return { state: 'ALREADY_LOGGED_IN' };
                      }
                    }

                    console.log('[BBZ Chat] No token, calling /api/login...');
                    const response = await fetch('/api/login', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        email: ${JSON.stringify(emailAddress)},
                        password: ${JSON.stringify(password)},
                        securityPassword: ${JSON.stringify(schulcloudEncryptionPassword || password)}
                      })
                    });

                    // Antworttext einmal lesen und mitgeben: nur damit laesst
                    // sich im Renderer ein falsches Kennwort von einer
                    // Serverstoerung unterscheiden.
                    let bodyText = '';
                    try { bodyText = (await response.text()).slice(0, 500); } catch (e) { /* egal */ }

                    if (!response.ok) {
                      console.error('[BBZ Chat] Login API error:', response.status, bodyText);
                      return { state: 'API_ERROR', status: response.status, body: bodyText };
                    }

                    let data = null;
                    try { data = JSON.parse(bodyText); } catch (e) { /* kein JSON */ }

                    if (data && data.token) {
                      localStorage.setItem('schulchat_token', data.token);
                      console.log('[BBZ Chat] Token stored, reloading...');
                      return { state: 'TOKEN_STORED' };
                    }

                    console.error('[BBZ Chat] No token in response:', bodyText);
                    return { state: 'NO_TOKEN', status: response.status, body: bodyText };
                  } catch (err) {
                    console.error('[BBZ Chat] Login fetch error:', err && err.message);
                    return { state: 'FETCH_ERROR', message: err && err.message };
                  }
                })()
              `);

              console.log('[BBZ Chat] Login result:', loginResult);

              // executeJavaScript liefert undefined, wenn die View
              // zwischenzeitlich verschwunden ist — dann nichts weiter tun.
              const loginState = loginResult && loginResult.state;
              if (!loginState) break;

              if (loginState === 'ALREADY_LOGGED_IN') {
                credsAreSet.current[id] = true;
                bbzChatLoginCallsRef.current = 0;
                setBbzChatLoginActive(false);
                break;
              }

              // Ab hier ist der Aufruf tatsaechlich rausgegangen (oder koennte
              // es sein) — also zaehlen, egal wie er ausgegangen ist.
              bbzChatLoginCallsRef.current += 1;
              noteSubmit(id);

              if (loginState === 'TOKEN_STORED') {
                // Token saved — reload the page so the app picks it up.
                //
                // Der Zaehler wird hier bewusst NICHT zurueckgesetzt: ein
                // gespeicherter Token ist noch kein geglueckter Login. Verwirft
                // die App ihn beim Start wieder (etwa weil sich der private
                // Schluessel mit dem angegebenen Verschluesselungskennwort
                // nicht entsperren laesst), stuende sonst wieder ein volles
                // Budget bereit — und die Geraeteliste in schul.cloud waechst
                // in Endlosschleife weiter. Zurueckgesetzt wird erst, wenn der
                // Login-Waechter keine Anmeldemaske mehr sieht.
                credsAreSet.current[id] = true;
                webview.reload();
                break;
              }

              // Falsche Zugangsdaten von einer Serverstoerung unterscheiden.
              // 4xx (ausser 408/429) und eine Antwort ohne Token heissen: der
              // Server hat die Daten abgelehnt — ein Wiederholen erzeugt nur
              // weitere Geraete.
              const status = typeof loginResult.status === 'number' ? loginResult.status : 0;
              const rejected =
                loginState === 'NO_TOKEN' ||
                (status >= 400 && status < 500 && status !== 408 && status !== 429);

              if (rejected) {
                stopBbzChatAutoLogin(
                  id,
                  'BBZ Chat: Anmeldedaten abgelehnt',
                  'Der Server hat die Anmeldung zurückgewiesen — meist stimmt das Verschlüsselungskennwort nicht. ' +
                  'Bitte in den Einstellungen prüfen und die App danach neu laden. ' +
                  'Die automatische Anmeldung wurde gestoppt, damit nicht laufend neue Geräte in schul.cloud angelegt werden.'
                );
                break;
              }

              // Serverstoerung oder Netzproblem: noch einmal versuchen, aber
              // nur innerhalb von MAX_BBZCHAT_LOGIN_CALLS.
              console.warn('[BBZ Chat] Anmeldung vorerst fehlgeschlagen:', loginState, status,
                `(Versuch ${bbzChatLoginCallsRef.current}/${MAX_BBZCHAT_LOGIN_CALLS})`);
              break;
            }

            // Fall back to schul.cloud logic
            console.log('[schul.cloud] Using schul.cloud login logic');
            
            // Detect login state using exact schul.cloud selectors
            const loginState = await webview.executeJavaScript(`
              (function() {
                console.log('[schul.cloud] Detecting login state...');
                
                // Look for specific schul.cloud elements
                const emailInput = document.querySelector('input#username[type="text"]');
                const passwordInputs = document.querySelectorAll('input[type="password"]');
                const weiterButton = document.querySelector('button[type="submit"].btn.btn-contained');
                const loginButton = Array.from(document.querySelectorAll('span.header')).find(el => el.textContent.includes('Anmelden mit Passwort')) ||
                                  Array.from(document.querySelectorAll('button')).find(el => el.textContent.includes('Anmelden mit Passwort')) ||
                                  document.querySelector('[title*="Anmelden"]');

                // Check for remember login checkbox (input#stayLoggedInCheck)
                const rememberCheckbox = document.querySelector('input#stayLoggedInCheck');

                // Find encryption password field
                let encryptionInput = null;
                for (const input of passwordInputs) {
                  const parentAppLabel = input.closest('app-label-input');
                  const hasEncryptionTestId = parentAppLabel && parentAppLabel.getAttribute('data-test-id') === 'set-private-key-password_pass_if';
                  const hasEncryptionLabel = parentAppLabel && parentAppLabel.textContent.includes('Verschlüsselungskennwort');
                  if (hasEncryptionTestId || hasEncryptionLabel) {
                    encryptionInput = input;
                    break;
                  }
                }

                // Check if already logged in or on encryption/auth page
                // IMPORTANT: Only check actual DOM elements for logged-in state
                // Do NOT check textContent for 'Logout' or 'Abmelden' - these appear in
                // script tags and cause false positives on the login page!
                const loggedIn = document.querySelector('.user-menu') ||
                               document.querySelector('.dashboard') ||
                               document.querySelector('.main-content');

                // Verschlüsselungsseite an konkreten Elementen erkennen, nicht am
                // Seitentext: 'Verschlüsselungskennwort'/'Smartphone' kommen auch
                // in der eingeloggten App vor (Einstellungen, Chatnachrichten) und
                // haben die Injection dauerhaft weiterlaufen lassen.
                const encryptionButton = Array.from(document.querySelectorAll('button.row, div.row')).find(btn =>
                  btn.textContent.includes('Durch dein Verschlüsselungskennwort')
                );
                const onEncryptionPage = !!encryptionButton || !!encryptionInput;

                const state = {
                  emailInput: !!emailInput,
                  // Ist das E-Mail-Feld schon befuellt? Ohne diese Information
                  // laesst sich "E-Mail-Schritt noch offen" nicht von "E-Mail
                  // steht bereits, jetzt kommt das Passwort" unterscheiden.
                  emailFilled: !!(emailInput && emailInput.value && emailInput.value.trim()),
                  passwordInputs: passwordInputs.length,
                  weiterButton: !!weiterButton,
                  loginButton: !!loginButton,
                  rememberCheckbox: !!rememberCheckbox,
                  hasEncryptionInput: !!encryptionInput,
                  encryptionInputIndex: encryptionInput ? Array.from(passwordInputs).indexOf(encryptionInput) : -1,
                  loggedIn: !!loggedIn,
                  onEncryptionPage: !!onEncryptionPage,
                  url: window.location.href,
                  title: document.title,
                  bodyText: document.body.textContent.substring(0, 200) // First 200 chars for debugging
                };
                
                console.log('[schul.cloud] Login state:', JSON.stringify(state, null, 2));
                return state;
              })()
            `);

            console.log('[schul.cloud] Login state detected:', JSON.stringify(loginState, null, 2));

            if (loginState.loggedIn) {
              // Already logged in or on post-login page, no action needed
              return;
            }

            if (loginState.emailInput && !loginState.emailFilled) {
              // E-Mail-Schritt: leeres E-Mail-Feld sichtbar.
              //
              // Vorher lautete die Bedingung `emailInput && !passwordInputs`.
              // Rendert schul.cloud auf der E-Mail-Seite ein (auch verstecktes)
              // Passwortfeld mit, ist passwordInputs > 0 — die Bedingung war
              // dann falsch, der E-Mail-Zweig wurde uebersprungen und statt-
              // dessen sofort der Passwort-Zweig ausgefuehrt. Ergebnis: alles
              // wurde befuellt ausser der E-Mail-Adresse.
              console.log('[schul.cloud] Email page detected - filling email field');
              
              const result = await webview.executeJavaScript(`
                (async function() {
                  try {
                    ${SAFE_FOCUS_HELPER_JS}
                    const EMAIL = ${JSON.stringify(emailAddress)};
                    const emailInput = document.querySelector('input#username[type="text"]');
                    if (!emailInput) return 'NO_ELEMENTS';

                    // Wert setzen und GEGENPRUEFEN.
                    //
                    // Angular fuehrt das Feld als kontrollierte Komponente und
                    // setzt einen direkt zugewiesenen Wert wieder zurueck. Ohne
                    // Gegenpruefung wurde trotzdem 'SUCCESS' gemeldet und auf
                    // "Weiter" geklickt — mit leerem Feld.
                    const setValue = (el, value) => {
                      const setter = Object.getOwnPropertyDescriptor(
                        window.HTMLInputElement.prototype, 'value'
                      ).set;
                      setter.call(el, value);
                      // Kein 'blur'/'focus' mehr: das markiert das Feld in
                      // Angular als "touched" und loeste die Validierung aus,
                      // bevor der Wert uebernommen war.
                      el.dispatchEvent(new Event('input', { bubbles: true }));
                      el.dispatchEvent(new Event('change', { bubbles: true }));
                    };

                    __bbzSafeFocus(emailInput);

                    let filled = false;
                    for (let attempt = 0; attempt < 20 && !filled; attempt++) {
                      setValue(emailInput, EMAIL);
                      await new Promise(r => setTimeout(r, 150));
                      filled = emailInput.value === EMAIL;
                    }

                    if (!filled) return 'NOT_FILLED';

                    // Den Button erst JETZT suchen, nicht vor dem Befuellen:
                    // Angular tauscht ihn beim Rendern aus, eine frueh
                    // gemerkte Referenz zeigt dann ins Leere.
                    const findWeiter = () =>
                      document.querySelector('button[type="submit"].btn.btn-contained') ||
                      Array.from(document.querySelectorAll('button')).find(b =>
                        b.textContent.trim() === 'Weiter' || b.textContent.trim() === 'Anmelden');

                    let weiterButton = findWeiter();
                    for (let i = 0; i < 20 && (!weiterButton || weiterButton.disabled); i++) {
                      await new Promise(r => setTimeout(r, 100));
                      weiterButton = findWeiter();
                    }

                    if (!weiterButton) return 'NO_SUBMIT_BUTTON';
                    if (weiterButton.disabled) return 'SUBMIT_DISABLED';

                    weiterButton.click();
                    return 'SUCCESS';
                  } catch (err) {
                    console.error('[schul.cloud] Error filling email:', err);
                    return 'ERROR: ' + err.message;
                  }
                })()
              `);

              console.log('[schul.cloud] Email injection result:', result);
              
            } else if (loginState.passwordInputs && !loginState.onEncryptionPage &&
                       (!loginState.emailInput || loginState.emailFilled)) {
              // Password page - fill password, check remember me, and submit
              console.log('[schul.cloud] Password page detected - filling password');
              
              const result = await webview.executeJavaScript(`
                (function() {
                  try {
                    ${SAFE_FOCUS_HELPER_JS}
                    // Find password input but exclude encryption password field
                    const allPasswordInputs = document.querySelectorAll('input[type="password"]');
                    let passwordInput = null;

                    console.log('[schul.cloud] Found', allPasswordInputs.length, 'password input(s)');

                    // Filter out encryption password field
                    for (const input of allPasswordInputs) {
                      const parentAppLabel = input.closest('app-label-input');
                      const hasEncryptionTestId = parentAppLabel && parentAppLabel.getAttribute('data-test-id') === 'set-private-key-password_pass_if';
                      const hasEncryptionLabel = parentAppLabel && parentAppLabel.textContent.includes('Verschlüsselungskennwort');

                      // Skip if this is the encryption password field
                      if (hasEncryptionTestId || hasEncryptionLabel) {
                        console.log('[schul.cloud] Skipping encryption password field');
                        continue;
                      }

                      // This should be the regular login password
                      passwordInput = input;
                      console.log('[schul.cloud] Using login password input at index', Array.from(allPasswordInputs).indexOf(input));
                      break;
                    }

                    const rememberCheckbox = document.querySelector('input#stayLoggedInCheck');
                    const loginButton = Array.from(document.querySelectorAll('span.header')).find(el => el.textContent.includes('Anmelden mit Passwort')) ||
                                      Array.from(document.querySelectorAll('button')).find(el => el.textContent.includes('Anmelden mit Passwort'));

                    if (passwordInput) {
                      console.log('[schul.cloud] Filling login password (not encryption password)');
                      
                      // Use native setter to bypass Angular control
                      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                      nativeInputValueSetter.call(passwordInput, ${JSON.stringify(password)});
                      
                      // Also set directly as fallback
                      passwordInput.value = ${JSON.stringify(password)};

                      __bbzSafeFocus(passwordInput);

                      // Kein 'blur'/'focus': das markiert das Feld in Angular
                      // als "touched" und stoesst die Validierung an, bevor der
                      // Wert uebernommen ist.
                      passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
                      passwordInput.dispatchEvent(new Event('change', { bubbles: true }));

                      // Click remember login checkbox if available
                      if (rememberCheckbox) {
                        console.log('[schul.cloud] Clicking remember login checkbox');
                        rememberCheckbox.click();
                      }

                      // Wait then click login button
                      setTimeout(() => {
                        if (loginButton) {
                          console.log('[schul.cloud] Clicking login button');
                          loginButton.click();
                        } else {
                          // Try to find the parent button element
                          const parentButton = document.querySelector('button[type="submit"]');
                          if (parentButton) {
                            console.log('[schul.cloud] Clicking parent login button');
                            parentButton.click();
                          } else {
                            console.log('[schul.cloud] No submit button found!');
                          }
                        }
                      }, 1000);

                      return 'SUCCESS';
                    } else {
                      console.log('[schul.cloud] No valid login password field found (encryption password excluded)');
                      return 'NO_PASSWORD_FIELD';
                    }
                  } catch (err) {
                    console.error('[schul.cloud] Error filling password:', err);
                    return 'ERROR: ' + err.message;
                  }
                })()
              `);

              console.log('[schul.cloud] Password injection result:', result);
              
            } else if (loginState.onEncryptionPage && schulcloudEncryptionPassword) {
              // Encryption password page - need to click "Durch dein Verschlüsselungskennwort" first, then fill password
              console.log('[schul.cloud] Encryption page detected - handling encryption password');
              
              const pageState = await webview.executeJavaScript(`
                (function() {
                  console.log('[schul.cloud] Checking encryption page state...');
                  
                  // Check for "Durch dein Verschlüsselungskennwort" button (with data-icon="password")
                  const encryptionButton = Array.from(document.querySelectorAll('button.row, div.row')).find(btn =>
                    btn.textContent.includes('Durch dein Verschlüsselungskennwort')
                  );

                  const passwordInputs = document.querySelectorAll('input[type="password"]');
                  const weiterButton = Array.from(document.querySelectorAll('button')).find(btn =>
                    btn.textContent.includes('Weiter')
                  );

                  const state = {
                    hasEncryptionButton: !!encryptionButton,
                    passwordInputCount: passwordInputs.length,
                    hasWeiterButton: !!weiterButton,
                    // Check if password field is already visible (after clicking encryption button)
                    passwordInputVisible: passwordInputs.length > 0 && passwordInputs[0].offsetParent !== null
                  };
                  
                  console.log('[schul.cloud] Encryption page state:', JSON.stringify(state, null, 2));
                  return state;
                })()
              `);

              console.log('[schul.cloud] Encryption page state:', JSON.stringify(pageState, null, 2));

              // Wait a bit for the page to settle
              await new Promise(resolve => setTimeout(resolve, 500));

              // Check if we need to click the encryption button first
              if (pageState.hasEncryptionButton) {
                console.log('[schul.cloud] Clicking encryption button first');
                
                // Click "Durch dein Verschlüsselungskennwort" button
                const clicked = await webview.executeJavaScript(`
                  (function() {
                    const encryptionButton = Array.from(document.querySelectorAll('button.row, div.row')).find(btn =>
                      btn.textContent.includes('Durch dein Verschlüsselungskennwort')
                    );
                    if (encryptionButton) {
                      console.log('[schul.cloud] Clicking encryption button');
                      encryptionButton.click();
                      return true;
                    }
                    console.log('[schul.cloud] Encryption button not found!');
                    return false;
                  })()
                `);

                console.log('[schul.cloud] Encryption button clicked:', clicked);
                
                // Wait for password field to appear
                await new Promise(resolve => setTimeout(resolve, 1500));
              }

              // Now fill encryption password and click Weiter
              const result = await webview.executeJavaScript(`
                (function() {
                  try {
                    ${SAFE_FOCUS_HELPER_JS}
                    const passwordInputs = document.querySelectorAll('input[type="password"]');
                    const weiterButton = Array.from(document.querySelectorAll('button')).find(btn =>
                      btn.textContent.includes('Weiter')
                    );

                    console.log('[schul.cloud] Found', passwordInputs.length, 'password input(s) on encryption page');

                    // Find the visible password input
                    let encryptionInput = null;
                    for (const input of passwordInputs) {
                      if (input.offsetParent !== null) {
                        encryptionInput = input;
                        console.log('[schul.cloud] Found visible encryption input');
                        break;
                      }
                    }

                    if (!encryptionInput && passwordInputs.length > 0) {
                      encryptionInput = passwordInputs[0];
                      console.log('[schul.cloud] Using first password input as fallback');
                    }

                    if (encryptionInput && ${JSON.stringify(schulcloudEncryptionPassword)}) {
                      console.log('[schul.cloud] Filling encryption password');
                      
                      // Use native setter
                      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                      nativeInputValueSetter.call(encryptionInput, ${JSON.stringify(schulcloudEncryptionPassword)});
                      
                      __bbzSafeFocus(encryptionInput);

                      // Kein 'blur'/'focus' (siehe E-Mail-/Passwort-Zweig).
                      encryptionInput.dispatchEvent(new Event('input', { bubbles: true }));
                      encryptionInput.dispatchEvent(new Event('change', { bubbles: true }));

                      console.log('[schul.cloud] Encryption password filled, waiting then clicking Weiter...');

                      // Wait then click Weiter button
                      setTimeout(() => {
                        if (weiterButton) {
                          console.log('[schul.cloud] Clicking Weiter button');
                          weiterButton.click();
                        } else {
                          console.log('[schul.cloud] No Weiter button found!');
                        }
                      }, 1000);

                      return 'SUCCESS';
                    } else {
                      console.log('[schul.cloud] No encryption password field or password set');
                      return 'NO_FIELD_OR_PASSWORD';
                    }
                  } catch (err) {
                    console.error('[schul.cloud] Error filling encryption password:', err);
                    return 'ERROR: ' + err.message;
                  }
                })()
              `);

              console.log('[schul.cloud] Encryption password injection result:', result);
            } else {
              // No login state matched - log detailed info for debugging
              console.log('[schul.cloud] No login action taken - state does not match any condition');
              console.log('[schul.cloud] Conditions:');
              console.log('  - emailInput:', loginState.emailInput);
              console.log('  - passwordInputs:', loginState.passwordInputs);
              console.log('  - onEncryptionPage:', loginState.onEncryptionPage);
              console.log('  - loggedIn:', loginState.loggedIn);
              console.log('  - hasEncryptionInput:', loginState.hasEncryptionInput);
              console.log('  - schulcloudEncryptionPassword:', schulcloudEncryptionPassword ? 'SET' : 'NOT SET');
            }
          } catch (error) {
            console.error('[schul.cloud] Error during schul.cloud login:', error);
            console.error('[schul.cloud] Error stack:', error.stack);
          }
          break;

        case 'schulportal':
          try {
            // Get Schulportal credentials
            const schulportalEmailResult = await window.electron.getCredentials({
              service: 'bbzcloud',
              account: 'schulportalEmail'
            });
            const schulportalPasswordResult = await window.electron.getCredentials({
              service: 'bbzcloud',
              account: 'schulportalPassword'
            });

            if (!schulportalEmailResult.success || !schulportalPasswordResult.success) {
              return;
            }

            const schulportalEmail = schulportalEmailResult.password;
            const schulportalPassword = schulportalPasswordResult.password;

            if (!schulportalEmail || !schulportalPassword) {
              return;
            }

            // Inject credentials into Schulportal login form
            const schulportalResult = await webview.executeJavaScript(`
              (async () => {
                try {
                  // Wait for form to be ready
                  await new Promise((resolve) => {
                    const checkForm = () => {
                      const usernameField = document.querySelector('input#username');
                      const passwordField = document.querySelector('input#password');
                      if (usernameField && passwordField) {
                        resolve();
                      } else {
                        setTimeout(checkForm, 100);
                      }
                    };
                    checkForm();
                  });

                  const usernameField = document.querySelector('input#username');
                  const passwordField = document.querySelector('input#password');
                  const submitButton = document.querySelector('input#kc-login[type="submit"]');

                  if (usernameField && passwordField && submitButton) {
                    usernameField.value = ${JSON.stringify(schulportalEmail)};
                    usernameField.dispatchEvent(new Event('input', { bubbles: true }));
                    usernameField.dispatchEvent(new Event('change', { bubbles: true }));
                    
                    passwordField.value = ${JSON.stringify(schulportalPassword)};
                    passwordField.dispatchEvent(new Event('input', { bubbles: true }));
                    passwordField.dispatchEvent(new Event('change', { bubbles: true }));
                    
                    setTimeout(() => {
                      submitButton.click();
                    }, 500);
                    
                    return true;
                  }
                  return false;
                } catch (error) {
                  return false;
                }
              })();
            `);
            console.log('[schulportal] Login injection result:', schulportalResult);
            if (schulportalResult === true) noteSubmit(id);
          } catch (error) {
            console.error('Error during Schulportal login:', error);
          }
          break;

        case 'nextcloud':
          try {
            const ncLoginState = await webview.executeJavaScript(`
              (function() {
                // Step 1: BBZ ADFS button on Nextcloud login page
                const adfsButton = document.querySelector('a[href*="user_saml/saml/login"]') ||
                                   Array.from(document.querySelectorAll('a')).find(a => a.textContent.trim() === 'BBZ ADFS');

                // Step 2: ADFS login form (same as Outlook)
                const userNameInput = document.querySelector('#userNameInput');
                const passwordInput = document.querySelector('#passwordInput');
                const submitButton = document.querySelector('#submitButton');

                // Step 3: "Stay signed in?" page
                const jaButton = document.querySelector('input[type="submit"]#idSIButton9[value="Ja"]');

                // Already logged in to Nextcloud
                const loggedIn = document.querySelector('#header') ||
                                 document.querySelector('.app-navigation') ||
                                 document.querySelector('#nextcloud') ||
                                 window.location.href.includes('/apps/');

                return {
                  adfsButton: !!adfsButton,
                  userNameInput: !!userNameInput,
                  passwordInput: !!passwordInput,
                  submitButton: !!submitButton,
                  jaButton: !!jaButton,
                  loggedIn: !!loggedIn,
                  url: window.location.href
                };
              })()
            `);

            console.log('Nextcloud login state:', ncLoginState);

            if (ncLoginState.loggedIn) {
              return;
            }

            if (ncLoginState.adfsButton) {
              // Click the BBZ ADFS button to initiate SAML login
              console.log('[Nextcloud] ADFS button found - initiating SAML login');
              
              const result = await webview.executeJavaScript(`
                (function() {
                  try {
                    const adfsButton = document.querySelector('a[href*="user_saml/saml/login"]') ||
                                       Array.from(document.querySelectorAll('a')).find(a => a.textContent.trim() === 'BBZ ADFS');
                    
                    if (adfsButton) {
                      console.log('[Nextcloud] Found ADFS button, clicking');
                      adfsButton.click();
                      return 'CLICKED';
                    }
                    
                    console.log('[Nextcloud] ADFS button not found!');
                    return 'BUTTON_NOT_FOUND';
                  } catch (err) {
                    console.error('[Nextcloud] Error clicking ADFS button:', err);
                    return 'ERROR: ' + err.message;
                  }
                })()
              `);
              
              console.log('[Nextcloud] ADFS button click result:', result);
            } else if (ncLoginState.userNameInput && ncLoginState.passwordInput && ncLoginState.submitButton) {
              // ADFS login form - fill credentials (same form as Outlook)
              console.log('[Nextcloud] ADFS login form detected - filling credentials');
              
              const result = await webview.executeJavaScript(`
                (function() {
                  try {
                    const userNameInput = document.querySelector('#userNameInput');
                    const passwordInput = document.querySelector('#passwordInput');
                    const submitButton = document.querySelector('#submitButton');

                    console.log('[Nextcloud] Filling ADFS credentials');
                    console.log('[Nextcloud] Username:', ${JSON.stringify(emailAddress)});

                    // Fill username with native setter
                    if (userNameInput) {
                      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                      nativeInputValueSetter.call(userNameInput, ${JSON.stringify(emailAddress)});
                      userNameInput.value = ${JSON.stringify(emailAddress)};
                      
                      // Trigger events
                      userNameInput.dispatchEvent(new Event('input', { bubbles: true }));
                      userNameInput.dispatchEvent(new Event('change', { bubbles: true }));
                      console.log('[Nextcloud] Username filled');
                    }

                    // Fill password with native setter
                    if (passwordInput) {
                      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                      nativeInputValueSetter.call(passwordInput, ${JSON.stringify(password)});
                      passwordInput.value = ${JSON.stringify(password)};
                      
                      // Trigger events
                      passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
                      passwordInput.dispatchEvent(new Event('change', { bubbles: true }));
                      console.log('[Nextcloud] Password filled');
                    }

                    // Click submit button after a short delay
                    if (submitButton) {
                      setTimeout(() => {
                        console.log('[Nextcloud] Clicking submit button');
                        submitButton.click();
                      }, 500);
                    }

                    return 'SUCCESS';
                  } catch (err) {
                    console.error('[Nextcloud] Error filling ADFS credentials:', err);
                    return 'ERROR: ' + err.message;
                  }
                })()
              `);
              
              console.log('[Nextcloud] ADFS credential injection result:', result);
              if (result === 'SUCCESS') noteSubmit(id);
            } else if (ncLoginState.jaButton) {
              // "Stay signed in?" page - click Ja
              console.log('[Nextcloud] "Stay signed in?" page detected - clicking Ja');
              
              const result = await webview.executeJavaScript(`
                (function() {
                  try {
                    const jaButton = document.querySelector('input[type="submit"]#idSIButton9[value="Ja"]');
                    
                    if (jaButton) {
                      console.log('[Nextcloud] Found Ja button, clicking in 500ms');
                      setTimeout(() => {
                        jaButton.click();
                        console.log('[Nextcloud] Ja button clicked');
                      }, 500);
                      return 'SUCCESS';
                    }
                    
                    console.log('[Nextcloud] Ja button not found!');
                    return 'BUTTON_NOT_FOUND';
                  } catch (err) {
                    console.error('[Nextcloud] Error clicking Ja button:', err);
                    return 'ERROR: ' + err.message;
                  }
                })()
              `);
              
              console.log('[Nextcloud] Ja button click result:', result);
            } else {
              // No login state matched - log for debugging
              console.log('[Nextcloud] No login action taken - state does not match any condition');
              console.log('[Nextcloud] Conditions:');
              console.log('  - adfsButton:', ncLoginState.adfsButton);
              console.log('  - userNameInput:', ncLoginState.userNameInput);
              console.log('  - passwordInput:', ncLoginState.passwordInput);
              console.log('  - submitButton:', ncLoginState.submitButton);
              console.log('  - jaButton:', ncLoginState.jaButton);
              console.log('  - loggedIn:', ncLoginState.loggedIn);
              console.log('  - url:', ncLoginState.url);
            }
          } catch (error) {
            console.error('[Nextcloud] Error during Nextcloud login:', error);
            console.error('[Nextcloud] Error stack:', error.stack);
          }
          break;

        // NOTE: BBZ Chat uses the 'schulcloud' webview ID (not 'bbzchat').
        // BBZ Chat credential injection is handled in the 'schulcloud' case above,
        // which detects the URL containing 'chat.bbz-rd-eck.com' and uses the
        // direct API login approach (POST /api/login).
      }

      // IMPORTANT: For schulcloud, DON'T set credsAreSet to true automatically.
      // schulcloud has a multi-step login (email -> password -> encryption) and we need
      // the periodic check to keep triggering until fully logged in.
      // Only set credsAreSet for other apps that complete login in one shot.
      //
      // Ein Handler, der erkannt hat, dass noch ein weiterer Schritt folgt
      // (z. B. Outlook auf einer ADFS-Zwischenseite ohne Formular), setzt
      // keepInjectionOpen. Vorher setzte dieser Block das dort gesetzte
      // credsAreSet = false drei Zeilen spaeter stumpf wieder auf true und
      // hob den Reset damit auf.
      if (id !== 'schulcloud' && !keepInjectionOpen) {
        credsAreSet.current[id] = true;
      }
    } catch (error) {
      console.error(`Error injecting credentials for ${id}:`, error);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Pro App immer nur eine Injection gleichzeitig.
  //
  // Mehrere Auslöser (dom-ready, did-navigate, periodischer 2-5s-Check) können
  // sonst parallel laufen. Da die Login-Handler zwischendurch warten (sleep,
  // setTimeout vor dem Klick), überholen sich die Läufe, klicken doppelt und
  // setzen wiederholt den Fokus — genau das reisst den Cursor aus Textfeldern.
  // Ein überholter Auslöser wird NICHT verworfen, sondern vorgemerkt und nach
  // dem laufenden Versuch einmal nachgezogen.
  //
  // Wichtig, weil ein Versuch lange hängen kann: der erste Zugriff auf den
  // Schlüsselbund öffnet auf macOS einen Systemdialog und wartet, bis der
  // Nutzer bestätigt. Wurden Auslöser in dieser Zeit einfach verworfen, ging
  // die gesamte Wiederholungskette verloren — der Auto-Login blieb dann bis
  // zum nächsten ausdrücklichen Reload liegen.
  //
  // Die Sperre verfaellt nach INJECTION_STALE_MS von selbst. Geht das Geraet in
  // den Standby, waehrend eine Injection laeuft, wird der Renderer der View
  // angehalten und das executeJavaScript-Promise loest nie auf — die Sperre
  // blieb dann fuer immer gesetzt und ALLE weiteren Auslöser wurden verworfen.
  // Genau daran scheiterte die erneute Anmeldung nach dem Aufwachen.
  const injectCredentials = useCallback(async (webview, id) => {
    if (!webview) return;

    const startedAt = injectionInFlight.current[id];
    if (startedAt) {
      if (Date.now() - startedAt < INJECTION_STALE_MS) {
        injectionRerunRef.current[id] = webview;
        return;
      }
      console.warn(`[${id}] Vorherige Injection haengt seit ${Math.round((Date.now() - startedAt) / 1000)}s - Sperre wird freigegeben`);
    }

    // Generations-Token.
    //
    // Bei der Uebernahme einer haengenden Sperre laeuft der alte Durchlauf
    // weiter. Loeste sein Promise doch noch auf, raeumte sein finally die
    // Sperre und die Vormerkung des NACHFOLGERS ab — danach konnten wieder
    // mehrere Injections parallel laufen, also genau der Zustand, den die
    // Sperre verhindern soll. Aufraeumen darf nur, wer die Sperre haelt.
    const myRun = (injectionRunSeq.current[id] || 0) + 1;
    injectionRunSeq.current[id] = myRun;
    injectionInFlight.current[id] = Date.now();

    try {
      let target = webview;
      // Begrenzt, damit sich nichts endlos im Kreis dreht
      for (let round = 0; round < 3; round++) {
        injectionRerunRef.current[id] = null;
        await injectCredentialsImpl(target, id);
        if (injectionRunSeq.current[id] !== myRun) return;
        const pending = injectionRerunRef.current[id];
        if (!pending) break;
        console.log(`[${id}] Auslöser während laufender Injection - ziehe nach`);
        target = pending;
      }
    } finally {
      if (injectionRunSeq.current[id] === myRun) {
        injectionRerunRef.current[id] = null;
        injectionInFlight.current[id] = null;
      }
    }
  }, [injectCredentialsImpl]);

  // -------------------------------------------------------------------------
  // Login-Wächter — ein Timer für alle Apps, ab dem Mount
  // -------------------------------------------------------------------------
  //
  // Läuft bewusst unabhängig von dom-ready. Vorher hing jede Wiederholung an
  // diesem Ereignis: wurde es verpasst oder lief die erste Injection zu früh
  // (Loginmaske noch nicht gerendert), gab es überhaupt keinen Wiederholungs-
  // mechanismus mehr. Genau daher kam "läuft, aber oft erst nach manuellem
  // Reload".
  useEffect(() => {
    const tick = async () => {
      watcherTickRef.current += 1;
      const tickNo = watcherTickRef.current;

      for (const [appId, check] of Object.entries(LOGIN_WATCHERS)) {
        if (!WCV_APPS.has(appId)) continue;
        // Nur Apps pruefen, fuer die tatsaechlich eine View existiert.
        // Sonst laeuft der Waechter alle 2,5 s in Fehler — fuer Schueler
        // etwa fuer die halbe Leiste, weil deren App-Liste eingeschraenkt ist.
        if (!standardAppsRef.current?.[appId]?.visible) continue;
        // Bei falschen Zugangsdaten nicht weiter hämmern
        if (failedLogins.current[appId]) {
          // Der Spinner darf nicht stehenbleiben, nur weil wir hier
          // aussteigen — sonst schaut der Nutzer endlos auf einen Ladekreis,
          // hinter dem gar nichts mehr passiert.
          if (appId === 'schulcloud') setBbzChatLoginActive(false);
          continue;
        }

        try {
          // Die Prüfung wird eingebettet ausgeführt und zusätzlich ein kleines
          // Abbild der Seite mitgeliefert. Ohne das lässt sich nicht
          // unterscheiden, ob die Loginmaske fehlt, die Seite noch lädt oder
          // die Selektoren nicht mehr passen.
          const probe = await window.electron.view.executeJavaScript(appId, `
            (async function() {
              const needsLogin = await (${check});
              return {
                needsLogin: !!needsLogin,
                url: location.href,
                title: document.title,
                inputs: document.querySelectorAll('input').length,
                passwords: document.querySelectorAll('input[type="password"]').length,
                forms: document.querySelectorAll('form').length,
                iframes: document.querySelectorAll('iframe').length,
                ready: document.readyState,
              };
            })()
          `);

          const needsLogin = probe && probe.needsLogin;

          // Bei jeder Änderung berichten, sonst als Lebenszeichen alle ~30 s
          const fingerprint = JSON.stringify(probe);
          if (fingerprint !== watcherLastRef.current[appId] || tickNo % 12 === 0) {
            watcherLastRef.current[appId] = fingerprint;
            console.log(`[watcher] ${appId}`, probe);
          }

          if (appId === 'schulcloud') {
            const onChat = (wcvUrlsRef.current[appId] || '').includes('chat.bbz-rd-eck.com');
            // Wurde der Spinner bereits aufgegeben, nicht erneut einblenden.
            const showOverlay = !!(onChat && needsLogin) && !bbzChatOverlayGaveUpRef.current;
            setBbzChatLoginActive(showOverlay);
            if (!onChat || !needsLogin) bbzChatOverlayGaveUpRef.current = false;
          }

          if (!needsLogin) {
            // Keine Loginmaske mehr -> die Anmeldung hat geklappt. Das Budget
            // fuer abgeschickte Anmeldungen wieder freigeben, damit ein
            // spaeterer Sitzungsablauf erneut bedient werden kann.
            if (submitAttempts.current[appId]) {
              submitAttempts.current[appId] = 0;
              submitLimitNotified.current[appId] = false;
            }
            // Das gleiche Budget fuer BBZ Chat: wer angemeldet ist, darf beim
            // naechsten Sitzungsablauf wieder von vorn anfangen.
            if (appId === 'schulcloud') bbzChatLoginCallsRef.current = 0;
            continue;
          }

          // Solange eine Loginmaske sichtbar ist, wird weiter versucht.
          //
          // Der Versuchszähler wird mit zurückgesetzt: sonst brauchen drei
          // Läufe, die gar kein Formular vorgefunden haben (Seite noch nicht
          // fertig), das Budget von MAX_LOGIN_ATTEMPTS auf — und die App gibt
          // für den Rest der Sitzung auf, obwohl nie ein echter Loginversuch
          // stattgefunden hat.
          //
          // Die Bremse gegen echtes Dauerfeuer ist NICHT dieser Zaehler,
          // sondern submitAttempts: der zaehlt nur tatsaechlich abgeschickte
          // Anmeldungen und wird hier bewusst nicht angefasst.
          credsAreSet.current[appId] = false;
          loginAttempts.current[appId] = 0;
          injectCredentials(getWcvProxy(appId), appId);
        } catch (_) {
          // View existiert noch nicht oder die Seite lädt gerade — nächster Tick
        }
      }
    };

    const timer = setInterval(tick, LOGIN_WATCHER_INTERVAL_MS);
    return () => clearInterval(timer);
  // injectCredentials und getWcvProxy sind stabile useCallbacks
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for system resume events — reload webviews with special handling per app
  useEffect(() => {
    if (!window.electron || !window.electron.onSystemResumed) {
      return;
    }

    const handleSystemResume = () => {
      console.log('[System Resume] Handling webview reloads');

      // Reset all credsAreSet so periodic checks can re-authenticate if needed
      Object.keys(credsAreSet.current).forEach(id => {
        credsAreSet.current[id] = false;
      });

      // Injection-Zustand aufräumen. Alles, was beim Einschlafen noch lief, ist
      // jetzt wertlos: der Renderer der View war angehalten, das zugehörige
      // executeJavaScript-Promise löst womöglich nie auf. Bliebe die Sperre
      // stehen, würden alle Auslöser nach dem Aufwachen verworfen und die
      // erneute Anmeldung fände nie statt.
      injectionInFlight.current = {};
      injectionRerunRef.current = {};
      loginAttempts.current = {};
      // Budget fuer abgeschickte Anmeldungen wieder freigeben: nach dem
      // Aufwachen ist ein frischer Anlauf legitim.
      submitAttempts.current = {};
      submitLimitNotified.current = {};

      // Sperrzeiten verfallen lassen — nach dem Aufwachen ist ein frischer
      // Loginversuch legitim, auch wenn kurz zuvor einer lief.
      loginCooldownRef.current = {};

      // Selbstheilung ebenfalls zuruecksetzen: die Cooldowns stammen aus der
      // Zeit vor dem Standby und wuerden einen jetzt noetigen Reload blockieren.
      autoReloadAtRef.current = {};
      blankReloadsRef.current = {};
      healthStrikeRef.current = {};
      Object.values(loadRetryRef.current).forEach((state) => clearTimeout(state?.timer));
      loadRetryRef.current = {};
      bbzChatLoginCallsRef.current = 0;
      bbzChatOverlayGaveUpRef.current = false;

      // Reload dropdown app webviews
      Object.keys(webviewRefs.current).forEach(id => {
        const webview = webviewRefs.current[id]?.current;
        if (!webview) return;
        try {
          console.log('[System Resume] webview', id + ': reloading');
          webview.reload();
        } catch (error) {
          console.warn('[System Resume] Error reloading webview', id, error);
        }
      });

      // Reload WCV apps with special handling
      for (const id of WCV_APPS) {
        if (!standardAppsRef.current?.[id]?.visible) continue;
        try {
          if (id === 'outlook') {
            console.log('[System Resume] WCV outlook: forcing complete reload');
            forceReloadWcv(id, standardAppsRef.current, wcvUrlsRef.current[id]);
          } else if (id === 'webuntis') {
            window.electron.view.executeJavaScript(id, `(function() {
              const authLabel = document.querySelector('.un-input-group__label');
              return authLabel?.textContent === 'Bestätigungscode';
            })()`).then(isAuthPage => {
              if (isAuthPage) {
                console.log('[System Resume] WCV webuntis: skipping (auth page active)');
              } else {
                // Erzwungene Navigation statt reload(): nach dem Standby steht
                // die SPA sonst auf ihrer alten, abgelaufenen Huelle.
                console.log('[System Resume] WCV webuntis: forcing complete reload');
                forceReloadWcv(id, standardAppsRef.current, wcvUrlsRef.current[id]);
              }
            }).catch(() => forceReloadWcv(id, standardAppsRef.current, wcvUrlsRef.current[id]));
          } else {
            console.log('[System Resume] WCV', id + ': reloading');
            window.electron.view.reload(id);
          }
        } catch (error) {
          console.warn('[System Resume] Error reloading WCV', id, error);
        }
      }
    };

    try {
      const unsubscribe = window.electron.onSystemResumed(handleSystemResume);
      return () => unsubscribe();
    } catch (error) {
      console.warn('Error setting up system resume listener:', error);
    }
  }, []);

  useEffect(() => {
    const loadOverviewImage = async () => {
      try {
        const imagePath = await window.electron.resolveAssetPath('uebersicht.png');
        setOverviewImagePath(imagePath);
        setImageError(false);
      } catch (error) {
        setImageError(true);
      }
    };

    loadOverviewImage();
  }, []);

  useEffect(() => {
    // Cleanup old dynamic webview refs when switching apps
    if (activeWebView && !Object.keys(standardApps).includes(activeWebView.id.toLowerCase())) {
      Object.keys(webviewRefs.current).forEach(id => {
        if (!Object.keys(standardApps).includes(id.toLowerCase()) && id !== activeWebView.id) {
          delete webviewRefs.current[id];
        }
      });
    }
  }, [standardApps, activeWebView]);

  // Helper function to check if favicon indicates new messages
  const checkForNotifications = (base64Image) => {
    return new Promise((resolve, reject) => {
      const img = new window.Image();
      img.onload = function () {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, img.width, img.height);
        
        // Get lower right quadrant
        const imageData = ctx.getImageData(
          Math.floor(img.width * 0.5),  // Start at 60% of width
          Math.floor(img.height * 0.5), // Start at 60% of height
          Math.floor(img.width * 0.5),  // Check remaining 40%
          Math.floor(img.height * 0.5)  // Check remaining 40%
        ).data;
        
        let redPixelCount = 0;
        let totalPixels = 0;
        
        // Check each pixel in the lower right quadrant
        for (let i = 0; i < imageData.length; i += 4) {
          const red = imageData[i];
          const green = imageData[i + 1];
          const blue = imageData[i + 2];
          const alpha = imageData[i + 3];
          
          // Only count non-transparent pixels
          if (alpha > 200) { // More strict alpha threshold
            totalPixels++;
            // Check if pixel is in the red range (more lenient)
            // Original color is rgb(234, 109, 132)
            if (red > 200 && // High red value
                green > 80 && green < 190 && // Medium green value
                blue > 100 && blue < 190) { // Medium blue value
              redPixelCount++;
            }
          }
        }
        
        // Calculate percentage of matching pixels
        const redPercentage = totalPixels > 0 ? redPixelCount / totalPixels : 0;
        resolve(redPercentage > 0.4); // More lenient threshold (40% instead of 50%)
      };
      
      img.onerror = function (error) {
        reject(new Error('Failed to load favicon'));
      };
      
      img.src = base64Image;
    });
  };

  // Set up SchulCloud / BBZ Chat notification checking.
  // For BBZ Chat (useBbzChat=true): ViewManager already detects the "(N) BBZ Chat"
  //   title pattern and sends view:badge-update → forwarded to update-badge above.
  //   No renderer polling needed.
  // For schul.cloud (useBbzChat=false): favicon red-dot pixel analysis every 8s.
  useEffect(() => {
    const isBbzChat = settings.useBbzChat;

    if (notificationCheckIntervalRef.current) {
      clearInterval(notificationCheckIntervalRef.current);
    }

    if (isBbzChat) {
      // BBZ Chat badge is handled by ViewManager → onBadgeUpdate useEffect above.
      return;
    }

    // schul.cloud: favicon pixel analysis via WCV
    const checkNotifications = async () => {
      try {
        const faviconData = await window.electron.view.executeJavaScript('schulcloud',
          `document.querySelector('link[rel="icon"][type="image/png"]')?.href`
        );
        if (!faviconData) return;
        const hasNotification = await checkForNotifications(faviconData);
        window.electron.send('update-badge', hasNotification ? 1 : 0);
      } catch (_) {}
    };

    notificationCheckIntervalRef.current = setInterval(checkNotifications, 8000);
    checkNotifications();

    // Restart interval on each WCV page load
    const unsubWcvEvent = window.electron.view.onEvent((event) => {
      if (event.appId === 'schulcloud' && event.type === 'dom-ready') {
        clearInterval(notificationCheckIntervalRef.current);
        notificationCheckIntervalRef.current = setInterval(checkNotifications, 8000);
        checkNotifications();
      }
    });

    return () => {
      unsubWcvEvent();
      if (notificationCheckIntervalRef.current) clearInterval(notificationCheckIntervalRef.current);
    };
  }, [settings.useBbzChat]); // Re-run when switching between BBZ Chat and schul.cloud

  // Event listener setup for dropdown (custom) app webviews only.
  // All standard apps are handled via WebContentsView.
  useEffect(() => {
    const eventCleanups = new Map();

    const addWebviewListener = (webview, event, handler) => {
      webview.addEventListener(event, handler);
      const cleanups = eventCleanups.get(webview) || [];
      cleanups.push(() => webview.removeEventListener(event, handler));
      eventCleanups.set(webview, cleanups);
    };

    const setupWebviewListeners = (webview) => {
      const id = webview.id.replace('wv-', '').toLowerCase();

      addWebviewListener(webview, 'did-start-loading', () => {
        setIsLoading(prev => ({ ...prev, [id]: true }));
      });

      addWebviewListener(webview, 'did-stop-loading', () => {
        setIsLoading(prev => ({ ...prev, [id]: false }));
      });

      addWebviewListener(webview, 'dom-ready', async () => {
        if (activeWebView && activeWebView.id === id) {
          onNavigate(webview.getURL());
        }
        setTimeout(async () => {
          await applyZoom(webview, id);
        }, 1000);
        await injectCredentials(webview, id);
      });

      let errorTimeouts = {};
      addWebviewListener(webview, 'did-fail-load', (error) => {
        setIsLoading(prev => ({ ...prev, [id]: false }));
        if (!isStartupPeriod && error.errorCode < -3) {
          if (errorTimeouts[id]) clearTimeout(errorTimeouts[id]);
          errorTimeouts[id] = setTimeout(async () => {
            try {
              webview.reload();
              await new Promise(resolve => setTimeout(resolve, 5000));
              const isWorking = await webview.executeJavaScript('true').catch(() => false);
              if (!isWorking) {
                const errorMessage = getErrorMessage(error);
                const toastId = `error-${id}-${Date.now()}`;
                toast({
                  id: toastId,
                  title: `Fehler beim Laden von ${standardApps[id]?.title || id}`,
                  description: (
                    <Flex direction="column" gap={2}>
                      <Text>{errorMessage}</Text>
                      <Button
                        size="sm"
                        onClick={() => {
                          handleRetryWebview(id);
                          toast.close(toastId);
                        }}
                      >
                        Erneut versuchen
                      </Button>
                    </Flex>
                  ),
                  status: 'error',
                  duration: null,
                  isClosable: true,
                });
              }
            } catch (e) {
              console.error('Error in retry mechanism:', e);
            }
          }, 3000);
        }
        return () => {
          Object.values(errorTimeouts).forEach(timeout => clearTimeout(timeout));
        };
      });
    };

    // Set up listeners for existing webviews
    const webviews = document.querySelectorAll('webview');
    webviews.forEach(setupWebviewListeners);

    // Cleanup function
    return () => {
      eventCleanups.forEach((cleanups, webview) => {
        cleanups.forEach(cleanup => cleanup());
      });
      eventCleanups.clear();
    };
  }, [activeWebView, applyZoom, injectCredentials, onNavigate, toast, isStartupPeriod, standardApps]);

  if (!activeWebView && !Object.keys(standardApps).length) {
    return (
      <Flex
        h="100%"
        w="100%"
        align="center"
        justify="center"
        bg={colorMode === 'light' ? 'gray.50' : 'gray.800'}
        overflow="hidden"
      >
        {!imageError && overviewImagePath && (
          <Box
            w="100%"
            h="100%"
            display="flex"
            alignItems="center"
            justifyContent="center"
            overflow="hidden"
          >
            <ChakraImage
              src={overviewImagePath}
              alt="Übersicht"
              maxH="90%"
              maxW="90%"
              objectFit="contain"
              borderRadius="md"
              boxShadow="lg"
              onError={() => {
                setImageError(true);
                toast({
                  title: 'Fehler beim Laden des Übersichtsbildes',
                  status: 'error',
                  duration: 5000,
                  isClosable: true,
                });
              }}
            />
          </Box>
        )}
        {imageError && (
          <Text color="gray.500">
            Willkommen bei BBZCloud
          </Text>
        )}
      </Flex>
    );
  }

  // Helper to check if an app is from the dropdown (not in standardApps)
  const isDropdownApp = (id) => {
    return !Object.keys(standardApps).includes(id.toLowerCase());
  };

  return (
    <Box h="100%" w="100%" position="relative" overflow="hidden">
      {/* Download Progress */}
      {downloadProgress !== null && (
        <Box
          position="fixed"
          bottom="4"
          right="4"
          width="300px"
          bg={colorMode === 'light' ? 'white' : 'gray.700'}
          color={colorMode === 'light' ? 'gray.800' : 'white'}
          boxShadow="lg"
          borderRadius="md"
          p="3"
          zIndex={9999}
        >
          <Text mb="2" fontSize="sm">
            {downloadProgress === 'paused' ? 'Download pausiert' : 'Download läuft...'}
          </Text>
          <Progress
            value={downloadProgress === 'paused' ? 0 : downloadProgress}
            size="sm"
            colorScheme="blue"
            isIndeterminate={downloadProgress === -1}
          />
        </Box>
      )}
      {/* Preloaded Views for Navigation Apps */}
      {Object.entries(standardApps).map(([id, config]) => {
        if (!config.visible) return null;
        const isActive = activeWebView?.id === id;

        // WCV apps: render an anchor <div> whose bounds are reported to main
        if (WCV_APPS.has(id)) {
          return (
            <Box
              key={id}
              ref={(el) => { wcvAnchorRefs.current[id] = el; }}
              position="absolute"
              top="0"
              left="0"
              right="0"
              bottom="0"
              // Keep in DOM so bounds are observable; pointer-events stay off
              // because the WebContentsView (composited above) receives real input.
              visibility={isActive ? 'visible' : 'hidden'}
              pointerEvents="none"
              zIndex={isActive ? 1 : 0}
            >
              {isLoading[id] && (
                <Progress
                  size="xs"
                  isIndeterminate
                  position="absolute"
                  top="0"
                  left="0"
                  right="0"
                  zIndex="1"
                />
              )}
              {id === 'schulcloud' && bbzChatLoginActive && hasBbzChatCredentials && (
                <Flex
                  position="absolute"
                  top="0"
                  left="0"
                  right="0"
                  bottom="0"
                  bg={colorMode === 'light' ? 'white' : 'gray.800'}
                  zIndex="2"
                  align="center"
                  justify="center"
                  pointerEvents="none"
                >
                  <VStack spacing="6">
                    <Spinner
                      size="xl"
                      thickness="4px"
                      speed="0.8s"
                      color="blue.500"
                      emptyColor={colorMode === 'light' ? 'gray.200' : 'gray.600'}
                    />
                    <Text fontSize="lg" color={colorMode === 'light' ? 'gray.700' : 'gray.200'}>
                      BBZ Chat wird geladen...
                    </Text>
                  </VStack>
                </Flex>
              )}
            </Box>
          );
        }

        return null;
      })}

      {/* Dynamic Webview for Dropdown Apps */}
      {activeWebView && isDropdownApp(activeWebView.id) && (
        <Box
          position="absolute"
          top="0"
          left="0"
          right="0"
          bottom="0"
          display="block"
          visibility="visible"
          zIndex={1}
        >
          {isLoading[activeWebView.id] && (
            <Progress
              size="xs"
              isIndeterminate
              position="absolute"
              top="0"
              left="0"
              right="0"
              zIndex="1"
            />
          )}
          <webview
            ref={(el) => {
              if (el) {
                webviewRefs.current[activeWebView.id] = { current: el };
              }
            }}
            id={`wv-${activeWebView.id}`}
            src={activeWebView.url}
            preload={`${window.location.origin}/webview-preload.js`}
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
            }}
            allowpopups="true"
            partition="persist:main"
            webpreferences="nativeWindowOpen=yes,javascript=yes,plugins=yes,contextIsolation=no,devTools=yes"
            useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
          />
        </Box>
      )}
    </Box>
  );
});

WebViewContainer.displayName = 'WebViewContainer';

export default WebViewContainer;