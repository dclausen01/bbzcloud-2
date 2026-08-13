'use strict';

/**
 * Zentrale Regeln für Links, die NICHT in der App bleiben dürfen, sondern an
 * den System-Browser übergeben werden.
 *
 * BigBlueButton (Greenlight 3):
 *   Greenlight selbst bleibt in der App — Loginseite (`/signin`), Raumliste
 *   (`/rooms`), Raum-/Warteseite (`/rooms/<friendly-id>/join`) und die alten
 *   Greenlight-2-Pfade (`/b/...`). Nur die Übergabe an die eigentliche
 *   Konferenz wird extern geöffnet, damit Kamera, Mikrofon und Bildschirm-
 *   freigabe in einem echten Browser laufen.
 *
 *   Wichtig: Greenlight 2 hat diese Übergabe per Server-Redirect gemacht
 *   (Event `will-redirect`), Greenlight 3 macht sie im React-Client per
 *   `window.location.replace(joinUrl)` — das ist eine renderer-initiierte
 *   Navigation und feuert `will-navigate`, NICHT `will-redirect`. Deshalb
 *   müssen beide Events geprüft werden.
 */

const BBB_HOST = 'bbb.bbz-rd-eck.de';

const EXTERNAL_URL_PATTERNS = [
  // Übergabe Greenlight -> BigBlueButton (Greenlight 2 und 3)
  `${BBB_HOST}/bigbluebutton/api/join?`,
  // Direkter Einstieg in den BBB-HTML5-Client (Link mit sessionToken)
  `${BBB_HOST}/html5client/`,
  // Stashcat-/schul.cloud-Videokonferenzen
  'meet.stashcat.com',
  'stash.cat/l/',
];

/**
 * @param {string} url
 * @returns {boolean} true, wenn der Link im System-Browser geöffnet werden soll
 */
function shouldOpenExternally(url) {
  if (typeof url !== 'string' || !url) return false;
  return EXTERNAL_URL_PATTERNS.some((pattern) => url.includes(pattern));
}

module.exports = { shouldOpenExternally, EXTERNAL_URL_PATTERNS, BBB_HOST };
