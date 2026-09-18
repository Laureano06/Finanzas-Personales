import { MONTH_NAMES, WEEKDAY_SHORT, today, daysInMonth } from '../utils/dates.js';
import { money } from '../utils/currency.js';
import { getAllReminders, editReminderById } from './reminders.js';
import { getAllCards, getCardConsumptionById } from './cards.js';
import { getAllSubscriptions } from './subscriptions.js';
import { getAllDebts } from './debts.js';
import { navigate } from '../router.js';
import { $, esc } from '../utils/dom.js';

let viewYear, viewMonth; // month is 1-12
let selectedDate = today();
let initialized = false;

function pad(n) {
  return String(n).padStart(2, '0');
}

function dateStr(y, m, d) {
  return `${y}-${pad(m)}-${pad(d)}`;
}

function addEvent(map, date, event) {
  (map[date] ||= []).push(event);
}

function collectEventsForMonth(y, m) {
  const map = {};
  const monthPrefix = `${y}-${pad(m)}`;

  getAllReminders().forEach(r => {
    if (r.date.startsWith(monthPrefix)) addEvent(map, r.date, { kind: 'reminder', id: r.id, title: r.title, meta: r.time || 'Todo el día', priority: r.priority, completed: r.completed });
  });

  getAllCards().forEach(c => {
    const used = getCardConsumptionById(c.id);
    if (used <= 0) return;
    const day = Math.min(c.dueDay || 1, daysInMonth(y, m));
    addEvent(map, dateStr(y, m, day), { kind: 'card', id: c.id, title: `Vence ${c.name}`, meta: money(used) });
  });

  getAllSubscriptions().forEach(s => {
    if (!s.active) return;
    if (s.nextPaymentDate.startsWith(monthPrefix)) addEvent(map, s.nextPaymentDate, { kind: 'subscription', id: s.id, title: s.name, meta: `${money(s.amount)} · suscripción` });
  });

  getAllDebts().forEach(d => {
    if (d.status === 'paid' || !d.dueDate) return;
    if (d.dueDate.startsWith(monthPrefix)) addEvent(map, d.dueDate, { kind: 'debt', id: d.id, title: `${d.person} (${d.type === 'owe' ? 'deuda' : 'te deben'})`, meta: money(d.remainingAmount) });
  });

  return map;
}

function renderGrid() {
  $('calendar-month-label').textContent = `${MONTH_NAMES[viewMonth - 1]} ${viewYear}`;
  const events = collectEventsForMonth(viewYear, viewMonth);
  const firstWeekday = (new Date(viewYear, viewMonth - 1, 1).getDay() + 6) % 7; // Monday=0
  const total = daysInMonth(viewYear, viewMonth);

  let html = WEEKDAY_SHORT.map(d => `<div class="calendar-weekday">${d}</div>`).join('');
  for (let i = 0; i < firstWeekday; i++) html += `<div class="calendar-cell is-empty"></div>`;

  for (let d = 1; d <= total; d++) {
    const ds = dateStr(viewYear, viewMonth, d);
    const dayEvents = events[ds] || [];
    const isToday = ds === today();
    const isSelected = ds === selectedDate;
    html += `<button type="button" class="calendar-cell ${isToday ? 'is-today' : ''} ${isSelected ? 'is-selected' : ''}" data-day="${ds}">
      <span class="calendar-day-num">${d}</span>
      ${dayEvents.length ? `<span class="calendar-dot-row">${dayEvents.slice(0, 4).map(ev => `<span class="calendar-dot dot-${ev.kind}"></span>`).join('')}</span>` : ''}
    </button>`;
  }
  $('calendar-grid').innerHTML = html;
  renderSelectedDay();
}

function eventCardHTML(ev) {
  if (ev.kind === 'reminder') {
    return `<article class="reminder-card priority-${ev.priority} ${ev.completed ? 'is-completed' : ''}" data-open-reminder="${ev.id}">
      <div class="reminder-main">
        <strong>${esc(ev.title)}</strong>
        <div class="reminder-meta"><span>${esc(ev.meta)}</span><span class="chip chip-cat">Recordatorio</span></div>
      </div>
    </article>`;
  }
  const kindLabel = { card: 'Tarjeta', subscription: 'Suscripción', debt: 'Deuda' }[ev.kind];
  return `<article class="reminder-card event-${ev.kind}" data-open-finance="1">
    <div class="reminder-main">
      <strong>${esc(ev.title)}</strong>
      <div class="reminder-meta"><span>${esc(ev.meta)}</span><span class="chip chip-cat">${kindLabel}</span></div>
    </div>
  </article>`;
}

function renderSelectedDay() {
  const events = collectEventsForMonth(viewYear, viewMonth)[selectedDate] || [];
  const [y, m, d] = selectedDate.split('-');
  $('calendar-selected-label').textContent = `${d}/${m}/${y}`;
  $('calendar-day-events').innerHTML = events.length ? events.map(eventCardHTML).join('') : '<p class="empty-copy">No hay eventos para este día.</p>';
}

function bindEvents() {
  $('calendar-prev').addEventListener('click', () => {
    viewMonth--;
    if (viewMonth < 1) {
      viewMonth = 12;
      viewYear--;
    }
    renderGrid();
  });
  $('calendar-next').addEventListener('click', () => {
    viewMonth++;
    if (viewMonth > 12) {
      viewMonth = 1;
      viewYear++;
    }
    renderGrid();
  });
  $('calendar-grid').addEventListener('click', e => {
    const day = e.target.closest('[data-day]')?.dataset.day;
    if (!day) return;
    selectedDate = day;
    renderGrid();
  });
  $('calendar-day-events').addEventListener('click', e => {
    const reminderId = e.target.closest('[data-open-reminder]')?.dataset.openReminder;
    if (reminderId) return editReminderById(reminderId);
    if (e.target.closest('[data-open-finance]')) navigate('finanzas');
  });
}

export function initCalendar() {
  if (initialized) return;
  initialized = true;
  const d = new Date();
  viewYear = d.getFullYear();
  viewMonth = d.getMonth() + 1;
  bindEvents();
  renderGrid();
}

export function showCalendar() {
  renderGrid();
}
