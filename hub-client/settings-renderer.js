'use strict';

const emailEl = document.getElementById('email');
const passwordEl = document.getElementById('password');
const statusEl = document.getElementById('status');

// Vorhandene E-Mail vorbelegen (Passwort wird aus Sicherheitsgründen nicht geladen).
window.hub.getCredentials().then(({ email }) => {
  if (email) emailEl.value = email;
  (email ? passwordEl : emailEl).focus();
});

document.getElementById('cancel').addEventListener('click', () => window.hub.close());

document.getElementById('save').addEventListener('click', async () => {
  const email = emailEl.value.trim();
  const password = passwordEl.value;
  if (!email || !password) {
    statusEl.style.color = '#fc8181';
    statusEl.textContent = 'Bitte E-Mail und Passwort eingeben.';
    return;
  }
  statusEl.style.color = '#68d391';
  statusEl.textContent = 'Speichere …';
  const res = await window.hub.saveCredentials({ email, password });
  if (res.success) {
    statusEl.textContent = 'Gespeichert. Anmeldung läuft …';
    setTimeout(() => window.hub.close(), 700);
  } else {
    statusEl.style.color = '#fc8181';
    statusEl.textContent = 'Fehler: ' + (res.error || 'unbekannt');
  }
});

// Enter im Passwortfeld löst Speichern aus.
passwordEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('save').click();
});
