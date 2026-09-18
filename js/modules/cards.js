import { getState, persist } from '../state.js';
import { uid } from '../utils/id.js';
import { money, moneyText, parseNum } from '../utils/currency.js';
import { today } from '../utils/dates.js';
import { showToast } from '../components/toast.js';
import { confirmAction } from '../components/confirm.js';
import { $, esc } from '../utils/dom.js';
import { getCardConsumption, recordCardPayment, refreshFinanceAll } from './finance.js';

let initialized = false;

function finance() {
  return getState().finance;
}
function cards() {
  return finance().creditCards;
}

// Kept as a thin wrapper so this module's call sites read naturally;
// the actual balance math lives once in finance.js to avoid two copies drifting apart.
function consumption(cardId) {
  return getCardConsumption(cardId);
}

function populateAccountSelects() {
  const opts = finance().accounts.map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join('');
  $('card-account').innerHTML = opts;
  $('card-payment-account').innerHTML = opts;
}

function cardCardHTML(c) {
  const used = consumption(c.id);
  const available = Math.max(0, c.limit - used);
  const pct = c.limit ? Math.min(100, Math.round((used / c.limit) * 100)) : 0;
  return `<article class="card-tile ${used > c.limit && c.limit ? 'budget-over' : ''}" data-card-id="${c.id}">
    <div class="card-tile-head">
      <div><strong>${esc(c.name)}</strong><span class="helper">${esc(c.bank || 'Sin banco')}</span></div>
      <button class="mini-btn" data-delete-card="${c.id}" aria-label="Eliminar tarjeta ${esc(c.name)}">Eliminar</button>
    </div>
    <div class="budget-progress"><span style="width:${pct}%"></span></div>
    <div class="card-tile-stats">
      <div><span>Consumo actual</span><strong>${money(used)}</strong></div>
      <div><span>Disponible</span><strong>${money(available)}</strong></div>
    </div>
    <div class="card-tile-meta">
      <span>Cierre día ${c.closingDay}</span>
      <span>Vencimiento día ${c.dueDay}</span>
    </div>
    <button class="btn btn-secondary" type="button" data-pay-card="${c.id}">Pagar tarjeta</button>
  </article>`;
}

function render() {
  const list = cards();
  $('cards-list').innerHTML = list.length ? list.map(cardCardHTML).join('') : '<p class="empty-copy">Todavía no agregaste ninguna tarjeta de crédito. Creá la primera para empezar a registrar consumos.</p>';
  populateAccountSelects();
}

function resetForm() {
  $('card-form').reset();
}

function bindEvents() {
  $('add-card').onclick = () => {
    resetForm();
    $('card-dialog').showModal();
  };

  $('card-form').addEventListener('submit', e => {
    e.preventDefault();
    const name = $('card-name').value.trim();
    if (!name) return;
    const limit = parseNum($('card-limit').value);
    const closingDay = Math.min(31, Math.max(1, parseInt($('card-closing-day').value, 10) || 1));
    const dueDay = Math.min(31, Math.max(1, parseInt($('card-due-day').value, 10) || 1));
    cards().push({ id: uid(), name, bank: $('card-bank').value.trim(), limit, closingDay, dueDay, accountId: $('card-account').value });
    persist();
    $('card-dialog').close();
    render();
    refreshFinanceAll();
    showToast('Tarjeta creada.');
  });

  $('cards-list').addEventListener('click', async e => {
    const delId = e.target.dataset.deleteCard;
    const payId = e.target.dataset.payCard;

    if (delId) {
      const used = consumption(delId);
      if (used > 0) return showToast('No podés eliminar una tarjeta con consumo pendiente.');
      const ok = await confirmAction({ title: 'Eliminar tarjeta', message: '¿Eliminar esta tarjeta de crédito?', confirmText: 'Eliminar' });
      if (!ok) return;
      const idx = cards().findIndex(c => c.id === delId);
      const removed = cards()[idx];
      finance().creditCards = cards().filter(c => c.id !== delId);
      persist();
      render();
      refreshFinanceAll();
      showToast(`Tarjeta "${removed.name}" eliminada.`, {
        undo: () => {
          finance().creditCards.splice(idx, 0, removed);
          persist();
          render();
          refreshFinanceAll();
        },
      });
      return;
    }

    if (payId) {
      const card = cards().find(c => c.id === payId);
      if (!card) return;
      $('card-payment-card-id').value = payId;
      $('card-payment-title').textContent = `Pagar ${card.name}`;
      $('card-payment-amount').value = moneyText(consumption(payId));
      $('card-payment-date').value = today();
      if (card.accountId) $('card-payment-account').value = card.accountId;
      $('card-payment-dialog').showModal();
    }
  });

  $('card-payment-form').addEventListener('submit', e => {
    e.preventDefault();
    const cardId = $('card-payment-card-id').value;
    const amount = parseNum($('card-payment-amount').value);
    if (!amount) return;
    recordCardPayment({ cardId, accountId: $('card-payment-account').value, amount, date: $('card-payment-date').value || today() });
    $('card-payment-dialog').close();
    render();
    refreshFinanceAll();
    showToast('Pago registrado.');
  });
}

export function initCards() {
  if (initialized) return;
  initialized = true;
  bindEvents();
  render();
}

export function showCards() {
  render();
}

export function getAllCards() {
  return cards();
}

export function getCardConsumptionById(id) {
  return consumption(id);
}
