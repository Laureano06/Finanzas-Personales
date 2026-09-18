import { getState } from '../state.js';
import { StorageService } from '../storage.js';
import { today, daysInMonth } from '../utils/dates.js';
import { money } from '../utils/currency.js';
import { getAllReminders } from './reminders.js';
import { getAllCards, getCardConsumptionById } from './cards.js';
import { getAllSubscriptions } from './subscriptions.js';
import { getAllDebts } from './debts.js';

const CHECK_INTERVAL_MS = 60000;

function getNotified() {
  return new Set(StorageService.getNotifiedLog());
}

function saveNotified(set) {
  StorageService.saveNotifiedLog([...set]);
}

function daysUntil(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const target = new Date(y, m - 1, d);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((target - now) / 86400000);
}

export function checkDueNotifications() {
  const state = getState();
  if (!state.settings.notifications) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const notified = getNotified();
  let changed = false;
  const notify = (key, title, body) => {
    if (notified.has(key)) return;
    try {
      new Notification(title, { body });
    } catch {
      /* notification creation can fail silently on some platforms; app keeps working either way */
    }
    notified.add(key);
    changed = true;
  };

  const todayStr = today();

  getAllReminders().forEach(r => {
    if (r.completed) return;
    if (r.date === todayStr) notify(`reminder:${r.id}:${r.date}`, `Recordatorio: ${r.title}`, r.time ? `Hoy · ${r.time}` : 'Hoy');
  });

  getAllCards().forEach(c => {
    const used = getCardConsumptionById(c.id);
    if (used <= 0) return;
    const [y, m] = todayStr.split('-').map(Number);
    const dueDate = `${y}-${String(m).padStart(2, '0')}-${String(Math.min(c.dueDay || 1, daysInMonth(y, m))).padStart(2, '0')}`;
    const diff = daysUntil(dueDate);
    if (diff >= 0 && diff <= 2) notify(`card:${c.id}:${dueDate}`, `Vence ${c.name}`, `${money(used)} · vence en ${diff === 0 ? 'hoy' : diff + ' día(s)'}`);
  });

  getAllSubscriptions().forEach(s => {
    if (!s.active) return;
    const diff = daysUntil(s.nextPaymentDate);
    if (diff >= 0 && diff <= 1) notify(`subscription:${s.id}:${s.nextPaymentDate}`, `${s.name} vence pronto`, `${money(s.amount)} · ${diff === 0 ? 'hoy' : 'mañana'}`);
  });

  getAllDebts().forEach(d => {
    if (d.status === 'paid' || !d.dueDate) return;
    const diff = daysUntil(d.dueDate);
    if (diff >= 0 && diff <= 2) notify(`debt:${d.id}:${d.dueDate}`, `Deuda con ${d.person}`, `${money(d.remainingAmount)} · vence en ${diff === 0 ? 'hoy' : diff + ' día(s)'}`);
  });

  if (changed) saveNotified(notified);
}

export function initNotifications() {
  checkDueNotifications();
  setInterval(checkDueNotifications, CHECK_INTERVAL_MS);
}
