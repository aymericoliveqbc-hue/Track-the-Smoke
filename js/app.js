// Point d'entrée : routage, barre de navigation, verrouillage, service worker.

import { h, $, clear, haptic, fill } from './ui/dom.js';
import { icon, logo } from './ui/icons.js';
import { toast, closeAllSheets } from './ui/components.js';
import { openQuickAdd } from './ui/forms.js';
import { init, state, subscribe, isDemo, autoBackup, switchMode } from './core/store.js';
import { hashPin, verifyBiometric } from './core/lock.js';
import { buildExport } from './domain/backup.js';
import { notifyPending } from './app-reminders.js';
import { renderHome } from './views/home.js';
import { renderJournal } from './views/journal.js';
import { renderStats } from './views/stats.js';
import { renderGoals } from './views/goals.js';
import { renderProfile } from './views/profile.js';
import { renderOnboarding } from './views/onboarding.js';
import { renderProgress } from './views/progress.js';

const NAV = [
  { id: 'home', label: 'Accueil', icon: 'home' },
  { id: 'journal', label: 'Journal', icon: 'journal' },
  { id: 'progress', label: 'Progrès', icon: 'stats' },
  { id: 'profile', label: 'Réglages', icon: 'settings' },
];
const VIEWS = ['home', 'journal', 'progress', 'stats', 'goals', 'profile'];
const TAB_OF = { stats: 'progress', goals: 'progress' };

let locked = false;
let lastRoute = '';

function parseRoute() {
  const [, view = 'home', sub = null] = (location.hash || '#/home').split('/');
  return { view: VIEWS.includes(view) ? view : 'home', sub };
}

function render() {
  const main = $('#main');
  if (locked) return;
  if (!state.settings.onboarded && !isDemo()) {
    // Ne jamais redessiner un accueil en cours : il garde son étape et ses saisies.
    if (main.querySelector(':scope > .onboarding')) return;
    document.body.classList.add('onboarding-mode');
    clear(main).append(renderOnboarding(() => { document.body.classList.remove('onboarding-mode'); location.hash = '#/home'; render(); }));
    return;
  }
  document.body.classList.remove('onboarding-mode');
  applyTheme();
  const { view, sub } = parseRoute();
  const route = `${view}/${sub || ''}`;
  const keepScroll = route === lastRoute;
  const y = window.scrollY;
  let node;
  try {
    node = { home: renderHome, journal: renderJournal, progress: () => renderProgress(sub || 'conso'), stats: () => renderStats(sub || 'overview'), goals: renderGoals, profile: () => renderProfile(sub) }[view]();
  } catch (err) {
    console.error(err);
    node = h('div', { class: 'view' }, h('div', { class: 'card' }, h('h3', null, 'Un problème est survenu'), h('p', { class: 'muted' }, 'Tes données ne sont pas affectées. Recharge l’application.'), h('pre', { class: 'muted small' }, String(err?.message || err))));
  }
  clear(main).append(node);
  if (!keepScroll) { window.scrollTo(0, 0); main.classList.remove('enter'); void main.offsetWidth; main.classList.add('enter'); }
  else window.scrollTo(0, y);
  lastRoute = route;
  for (const b of document.querySelectorAll('.tabbar a')) b.classList.toggle('on', b.dataset.id === (TAB_OF[view] || view));
  document.getElementById('demo-ribbon').hidden = !isDemo();
}

const THEME_BG = { light: '#F4F1E9', dark: '#0D1310' };
const darkQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
darkQuery?.addEventListener?.('change', () => { if (state.settings?.theme === 'auto') applyTheme(); });

/** Clair (par défaut), sombre, ou automatique selon le réglage de l'appareil. */
export function applyTheme() {
  const pref = state.settings?.theme || 'light';
  const mode = pref === 'auto' ? (darkQuery?.matches ? 'dark' : 'light') : pref === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = mode;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_BG[mode]);
}

function buildShell() {
  applyTheme();
  const tabbar = $('#tabbar');
  clear(tabbar).append(tab(NAV[0]), tab(NAV[1]),
    h('button', { class: 'tab-add', 'aria-label': 'Enregistrer', onclick: () => { haptic(10); openQuickAdd(); } }, icon('plus', 26, 'bold')),
    tab(NAV[2]), tab(NAV[3]));
  $('#demo-ribbon').replaceChildren(icon('demo', 14), h('span', null, 'Mode démo · données fictives'),
    h('button', { onclick: async () => { await switchMode('main'); toast('Retour à tes données'); } }, 'Quitter'));
}

function tab(n) {
  return h('a', { href: `#/${n.id}`, 'data-id': n.id, 'aria-label': n.label }, icon(n.icon, 22), h('span', null, n.label));
}

/* ----------------------------- Verrouillage ----------------------------- */

function needsLock() {
  return !isDemo() && state.settings.privacy?.lock !== 'none' && !!state.settings.privacy?.pinHash;
}

function showLock() {
  if (!needsLock()) return;
  locked = true;
  closeAllSheets();
  const p = state.settings.privacy;
  let pin = '';
  const dots = h('div', { class: 'pin-dots' });
  const msg = h('p', { class: 'lock-msg' }, 'Saisis ton code');
  const len = p.pinLength || 4;
  const paint = () => fill(dots, ...Array.from({ length: len }, (_, i) => h('i', { class: i < pin.length ? 'on' : '' })));
  const unlock = () => { locked = false; overlay.remove(); render(); };
  const tryPin = async () => {
    if (pin.length < len) return;
    if (await hashPin(pin, p.pinSalt) === p.pinHash) { unlock(); return; }
    msg.textContent = 'Code incorrect'; overlay.classList.add('shake'); setTimeout(() => overlay.classList.remove('shake'), 400); pin = ''; paint();
  };
  const key = (k) => h('button', { class: 'pin-key', onclick: async () => {
    haptic(5);
    if (k === '⌫') pin = pin.slice(0, -1); else if (pin.length < len) pin += k;
    paint(); await tryPin();
  } }, k);
  const bio = p.lock === 'biometric' && p.credentialId;
  const tryBio = async () => { try { if (await verifyBiometric(p.credentialId)) unlock(); } catch { msg.textContent = 'Utilise ton code'; } };
  const overlay = h('div', { class: 'lock' },
    logo(48), h('h2', null, 'TRACK THE SMOKE'), msg, dots,
    h('div', { class: 'pin-pad' }, ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(key),
      bio ? h('button', { class: 'pin-key pin-bio', 'aria-label': 'Face ID', onclick: tryBio }, icon('face', 26)) : h('span'),
      key('0'), key('⌫')));
  paint();
  document.body.append(overlay);
  if (bio) setTimeout(tryBio, 300);
}

/* ----------------------------- Démarrage ----------------------------- */

async function start() {
  try {
    await init();
  } catch (err) {
    console.error(err);
    $('#main').replaceChildren(h('div', { class: 'view' }, h('div', { class: 'card' }, h('h3', null, 'Stockage indisponible'),
      h('p', { class: 'muted' }, 'Le stockage local est bloqué (navigation privée ?). Ouvre l’application dans une fenêtre normale.'))));
    return;
  }
  buildShell();
  showLock();
  render();
  let pending = false;
  const schedule = () => { if (pending) return; pending = true; requestAnimationFrame(() => { pending = false; render(); }); };
  subscribe((reason) => { if (reason === 'init' || reason === 'import' || reason === 'demo-reset') buildShell(); schedule(); });
  window.addEventListener('hashchange', () => { closeAllSheets(); schedule(); });
  window.addEventListener('tts:render', schedule);

  // Verrouillage au retour après une minute en arrière-plan + rappels.
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    if (hiddenAt && Date.now() - hiddenAt > 60000 && !locked) showLock();
    schedule(); notifyPending();
  });
  setInterval(() => { notifyPending(); }, 60000);
  // Changement de date pendant que l'app est ouverte.
  let day = new Date().toDateString();
  setInterval(() => { const d = new Date().toDateString(); if (d !== day) { day = d; schedule(); } }, 30000);

  setTimeout(() => { autoBackup(buildExport).catch(() => {}); notifyPending(); }, 2000);

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    // Le service worker sert la version en ligne en priorité : pas de rechargement forcé.
    navigator.serviceWorker.register('./sw.js').then((reg) => reg.update?.()).catch(() => {});
  }
}

start();
