// Rappels : bandeaux discrets dans l'application + notifications système
// facultatives. Jamais de message culpabilisant.
//
// Limite de la plateforme : une PWA ne peut pas programmer de notification
// locale sans serveur de push. Les notifications système sont donc émises
// lorsque l'application est ouverte ou revient au premier plan. Aucun
// serveur, aucun envoi de données.

import { state } from './core/store.js';
import { dayKey, addDays, hm, weekday, diffDays } from './core/dates.js';
import { openNightForm, openQuickAdd } from './ui/forms.js';

const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };

export function pendingReminders() {
  const n = state.settings.notifications;
  if (!n?.inApp) return [];
  return computeReminders(n).filter((r) => !isDismissed(r.id));
}

function computeReminders(n) {
  const out = [];
  const today = dayKey();
  const m = nowMin();
  if (n.sleep?.on && m >= (hm(n.sleep.time) ?? 0) && m < 20 * 60) {
    const night = state.nights.find((x) => x.date === addDays(today, -1));
    if (!night && state.entries.length) {
      out.push({ id: `sleep-${today}`, icon: 'moon', title: 'Ta nuit', text: 'Quelques secondes pour noter comment tu as dormi ?', action: () => openNightForm() });
    }
  }
  if (n.journal?.on && m >= (hm(n.journal.time) ?? 1290)) {
    out.push({ id: `journal-${today}`, icon: 'journal', title: 'Journal du jour', text: 'Tout est bien noté pour aujourd’hui ? Un oubli se corrige facilement.', action: () => openQuickAdd() });
  }
  if (n.weekly?.on && weekday(today) === n.weekly.weekday && m >= (hm(n.weekly.time) ?? 0)) {
    out.push({ id: `weekly-${today}`, icon: 'stats', title: 'Bilan de la semaine', text: 'Ton bilan des 7 derniers jours est prêt.', action: () => { location.hash = '#/stats/overview'; } });
  }
  if (n.monthly?.on && Number(today.slice(8, 10)) <= 3 && state.entries.length) {
    out.push({ id: `monthly-${today.slice(0, 7)}`, icon: 'wallet', title: 'Bilan financier du mois', text: 'Découvre tes dépenses du mois écoulé.', action: () => { location.hash = '#/stats/finance'; } });
  }
  if (n.goals?.on && state.goals.some((g) => g.active) && m >= (hm(n.goals.time) ?? 720)) {
    out.push({ id: `goals-${today}`, icon: 'goals', title: 'Tes objectifs', text: 'Un coup d’œil à ta progression ?', action: () => { location.hash = '#/goals'; } });
  }
  const last = state.settings.lastExportAt?.slice(0, 10);
  if (state.mode === 'main' && state.entries.length >= 30 && (!last || diffDays(last, today) >= 30)) {
    out.push({ id: `backup-${today.slice(0, 7)}`, icon: 'download', title: 'Sauvegarde', text: 'Pense à exporter une sauvegarde de tes données.', action: () => { location.hash = '#/profile/data'; } });
  }
  return out;
}

const DISMISS_KEY = 'tts-dismissed-reminders';
function isDismissed(id) {
  try { return JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]').includes(id); } catch { return false; }
}
export function dismissReminder(id) {
  const list = JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]');
  list.push(id);
  localStorage.setItem(DISMISS_KEY, JSON.stringify(list.slice(-50)));
}

/** Notifications système (si autorisées), au plus une fois par rappel. */
const SENT_KEY = 'tts-sent-notifications';
export async function notifyPending() {
  const n = state.settings.notifications;
  if (!n?.enabled || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const sent = JSON.parse(localStorage.getItem(SENT_KEY) || '[]');
  const reg = await navigator.serviceWorker?.getRegistration?.();
  for (const r of computeReminders(n)) {
    if (sent.includes(r.id)) continue;
    sent.push(r.id);
    const opts = { body: r.text, tag: r.id, icon: 'assets/icons/icon-192.png', badge: 'assets/icons/icon-192.png' };
    try { if (reg) await reg.showNotification(r.title, opts); else new Notification(r.title, opts); } catch { /* ignoré */ }
  }
  localStorage.setItem(SENT_KEY, JSON.stringify(sent.slice(-100)));
}
