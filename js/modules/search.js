import { money } from '../utils/currency.js';
import { formatDateEs } from '../utils/dates.js';
import { navigate } from '../router.js';
import { getAccountsList, getAllTransactionsFlat } from './finance.js';
import { getAllCards } from './cards.js';
import { getAllSubscriptions } from './subscriptions.js';
import { getAllReminders } from './reminders.js';
import { getAllDebts } from './debts.js';
import { $, esc } from '../utils/dom.js';

const KIND_META = {
  account: { label: 'Cuenta' },
  card: { label: 'Tarjeta' },
  subscription: { label: 'Suscripción' },
  transaction: { label: 'Movimiento' },
  reminder: { label: 'Recordatorio' },
  debt: { label: 'Deuda' },
};

let debounceTimer = null;

function buildIndex() {
  const results = [];
  getAccountsList().forEach(a => results.push({ kind: 'account', title: a.name, subtitle: 'Cuenta', nav: 'finanzas' }));
  getAllCards().forEach(c => results.push({ kind: 'card', title: c.name, subtitle: `Tarjeta${c.bank ? ' · ' + c.bank : ''}`, nav: 'finanzas', tab: 'tarjetas' }));
  getAllSubscriptions().forEach(s => results.push({ kind: 'subscription', title: s.name, subtitle: `Suscripción · ${money(s.amount)}`, nav: 'finanzas', tab: 'suscripciones' }));
  getAllTransactionsFlat().forEach(t => results.push({ kind: 'transaction', title: t.description, subtitle: `${money(t.amount)} · ${formatDateEs(t.date)}`, nav: 'finanzas' }));
  getAllReminders().forEach(r => results.push({ kind: 'reminder', title: r.title, subtitle: `Recordatorio · ${formatDateEs(r.date)}`, nav: 'recordatorios' }));
  getAllDebts().forEach(d => results.push({ kind: 'debt', title: d.person, subtitle: `${d.description || 'Deuda'} · ${money(d.remainingAmount)}`, nav: 'finanzas', tab: 'deudas' }));
  return results;
}

function search(query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return buildIndex()
    .filter(r => r.title.toLowerCase().includes(q) || r.subtitle.toLowerCase().includes(q))
    .slice(0, 40);
}

function renderResults(query) {
  const results = search(query);
  if (!query.trim()) {
    $('search-results').innerHTML = '<p class="empty-copy">Escribí para buscar en cuentas, tarjetas, suscripciones, movimientos, recordatorios y deudas.</p>';
    return;
  }
  if (!results.length) {
    $('search-results').innerHTML = '<p class="empty-copy">Sin resultados.</p>';
    return;
  }
  $('search-results').innerHTML = results
    .map(
      (r, i) =>
        `<button type="button" class="search-result" data-search-result="${i}">
          <span class="search-result-main"><strong>${esc(r.title)}</strong><small>${esc(r.subtitle)}</small></span>
          <span class="chip chip-cat">${KIND_META[r.kind].label}</span>
        </button>`
    )
    .join('');
  $('search-results').dataset.results = JSON.stringify(results.map(r => ({ nav: r.nav, tab: r.tab })));
}

function closeDialog() {
  $('search-dialog').close();
}

function openDialog() {
  $('search-input').value = '';
  renderResults('');
  $('search-dialog').showModal();
  setTimeout(() => $('search-input').focus(), 50);
}

function bindEvents() {
  ['search-trigger', 'search-trigger-mobile'].forEach(id => {
    const el = $(id);
    if (el) el.addEventListener('click', openDialog);
  });

  $('search-input').addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const value = $('search-input').value;
    debounceTimer = setTimeout(() => renderResults(value), 120);
  });

  $('search-results').addEventListener('click', e => {
    const btn = e.target.closest('[data-search-result]');
    if (!btn) return;
    const results = JSON.parse($('search-results').dataset.results || '[]');
    const picked = results[btn.dataset.searchResult];
    if (!picked) return;
    closeDialog();
    navigate(picked.nav);
    if (picked.tab) {
      setTimeout(() => document.querySelector(`[data-finance-tab="${picked.tab}"]`)?.click(), 0);
    }
  });
}

export function initSearch() {
  bindEvents();
}
