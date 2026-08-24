'use strict';

/**
 * Zentrale Regeln für Links, die NICHT in der App bleiben dürfen, sondern an
 * den System-Browser übergeben werden.
 *
 * BigBlueButton:
 *   Greenlight selbst bleibt in der App — Loginseite (`/signin`), Raumliste
 *   (`/rooms`), Raum-/Warteseite (`/rooms/<friendly-id>/join`) und die alten
 *   Greenlight-2-Pfade (`/b/...`). Nur die Übergabe an die eigentliche
 *   Konferenz wird extern geöffnet, damit Kamera, Mikrofon und vor allem die
 *   Bildschirmfreigabe funktionieren — die ist im eingebetteten WebView nicht
 *   zuverlässig nutzbar.
 *
 *   Greenlight 2 hat diese Übergabe per Server-Redirect gemacht (Event
 *   `will-redirect`), Greenlight 3 macht sie im React-Client per
 *   `window.location.replace(joinUrl)` — das ist eine renderer-initiierte
 *   Navigation und feuert `will-navigate`. Beide Events werden geprüft.
 *
 *   WICHTIG — hostunabhängig prüfen: Die Konferenz-Pfade werden bewusst ohne
 *   Hostnamen gematcht. Der Konferenzserver muss nicht derselbe Host sein wie
 *   Greenlight (getrennte oder mehrere BBB-Server sind der Normalfall), und
 *   eine an `bbb.bbz-rd-eck.de` gebundene Prüfung greift dann nicht mehr —
 *   die Konferenz landete im eingebetteten WebView und die Bildschirmfreigabe
 *   war unbrauchbar.
 */

const BBB_HOST = 'bbb.bbz-rd-eck.de';

// Bekannte Hosts der Schulinstanz. Nur für Zusatzregeln und Diagnose genutzt,
// NICHT als Voraussetzung für die Pfad-Erkennung.
const BBB_HOSTS = [BBB_HOST];

// Pfade, die eine laufende Konferenz bedeuten — auf jedem Host.
const CONFERENCE_PATH_PATTERNS = [
  // Übergabe Greenlight -> BigBlueButton (Greenlight 2 und 3, BBB 2.x und 3.x)
  '/bigbluebutton/api/join?',
  // BBB-HTML5-Client (Ziel des Redirects bzw. direkter Link mit sessionToken)
  '/html5client/',
];

// Weitere Dienste, deren Konferenzen extern gehören
const OTHER_EXTERNAL_PATTERNS = [
  // Stashcat-/schul.cloud-Videokonferenzen
  'meet.stashcat.com',
  'stash.cat/l/',
];

function isBbbHost(url) {
  return BBB_HOSTS.some((host) => url.includes(host));
}

/**
 * @param {string} url
 * @returns {boolean} true, wenn der Link im System-Browser geöffnet werden soll
 */
function shouldOpenExternally(url) {
  if (typeof url !== 'string' || !url) return false;

  if (CONFERENCE_PATH_PATTERNS.some((pattern) => url.includes(pattern))) return true;
  if (OTHER_EXTERNAL_PATTERNS.some((pattern) => url.includes(pattern))) return true;

  // Auffangregel: Ein sessionToken auf einem BBB-Host ist immer eine Konferenz,
  // auch wenn der Client-Pfad in einer künftigen BBB-Version anders heisst.
  // Greenlight-Seiten tragen keinen sessionToken.
  if (isBbbHost(url) && url.includes('sessionToken=')) return true;

  return false;
}

/**
 * Nur für Diagnose: Navigation auf einem BBB-Host, die NICHT als Konferenz
 * erkannt wurde. Damit lässt sich im Log sehen, ob eine unbekannte URL-Form
 * durchrutscht, statt raten zu müssen.
 * @param {string} url
 */
function isUnmatchedBbbNavigation(url) {
  if (typeof url !== 'string' || !url) return false;
  return isBbbHost(url) && !shouldOpenExternally(url);
}

module.exports = {
  shouldOpenExternally,
  isUnmatchedBbbNavigation,
  CONFERENCE_PATH_PATTERNS,
  OTHER_EXTERNAL_PATTERNS,
  BBB_HOSTS,
  BBB_HOST,
};
