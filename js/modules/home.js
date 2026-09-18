import { money } from '../utils/currency.js';
import { formatDateEs, isToday } from '../utils/dates.js';
import { navigate } from '../router.js';
import { getFinanceSummary, getFinanceInsights } from './finance.js';
import { getReminderSummary } from './reminders.js';
import { $, esc } from '../utils/dom.js';

let initialized = false;

function greeting() {
  const h = new Date().getHours();
  if (h < 6) return 'Buenas noches';
  if (h < 12) return 'Buenos días';
  if (h < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

function renderWidgets() {
  const fin = getFinanceSummary();
  const rem = getReminderSummary();

  $('home-greeting').textContent = greeting();

  $('widget-balance').textContent = money(fin.totalBalance);
  $('widget-expenses').textContent = money(fin.expenses);
  $('widget-savings').textContent = `${fin.savingsRate}%`;

  $('widget-reminders-count').textContent = `${rem.pendingCount} pendiente${rem.pendingCount === 1 ? '' : 's'}`;
  $('widget-reminders-list').innerHTML = rem.todayItems.length
    ? rem.todayItems.map(r => `<li>${esc(r.title)}${r.time ? ` · ${r.time}` : ''}</li>`).join('')
    : '<li class="empty-copy-inline">No hay recordatorios para hoy.</li>';

  if (rem.next) {
    $('widget-next-title').textContent = rem.next.title;
    $('widget-next-meta').textContent = `${isToday(rem.next.date) ? 'Hoy' : formatDateEs(rem.next.date)}${rem.next.time ? ' · ' + rem.next.time : ''}`;
  } else {
    $('widget-next-title').textContent = 'Sin próximos eventos';
    $('widget-next-meta').textContent = 'Creá un recordatorio para verlo acá.';
  }

  const insights = getFinanceInsights();
  if (rem.todayCount > 0) insights.push(`Tenés ${rem.todayCount} recordatorio${rem.todayCount === 1 ? '' : 's'} pendiente${rem.todayCount === 1 ? '' : 's'} hoy.`);
  $('home-insights-list').innerHTML = insights.length ? insights.map(i => `<li>${esc(i)}</li>`).join('') : '<li class="empty-copy-inline">Cargá movimientos y recordatorios para ver insights acá.</li>';
}

function bindEvents() {
  document.querySelectorAll('[data-nav]').forEach(el => {
    el.addEventListener('click', () => navigate(el.dataset.nav));
  });
}

export function initHome() {
  if (initialized) return;
  initialized = true;
  bindEvents();
}

export function showHome() {
  renderWidgets();
}
