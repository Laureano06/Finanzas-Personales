import { getState, persist } from '../state.js';
import { uid } from '../utils/id.js';
import { money, parseNum } from '../utils/currency.js';
import { today, formatDateEs, addMonthsToDate, addYearsToDate } from '../utils/dates.js';
import { showToast } from '../components/toast.js';
import { confirmAction } from '../components/confirm.js';
import { addTransactionRecord, refreshFinanceAll } from './finance.js';
import { $, esc } from '../utils/dom.js';

const FREQ_LABEL = { monthly: 'Mensual', yearly: 'Anual' };
const MAX_CATCHUP_CYCLES = 24;

let initialized = false;

function finance() {
  return getState().finance;
}
function subs() {
  return finance().subscriptions;
}

function nextDate(dateStr, frequency) {
  return frequency === 'yearly' ? addYearsToDate(dateStr, 1) : addMonthsToDate(dateStr, 1);
}

function populateSelects() {
  const accOpts = finance().accounts.map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join('');
  const cardOpts = finance().creditCards.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  $('subscription-account').innerHTML = accOpts;
  $('subscription-card').innerHTML = cardOpts;
}

function updatePaymentMethodVisibility() {
  const isCard = $('subscription-payment-method').value === 'card';
  $('subscription-account-field').classList.toggle('hide', isCard);
  $('subscription-card-field').classList.toggle('hide', !isCard);
}

function subscriptionRowHTML(s) {
  const target = s.cardId ? finance().creditCards.find(c => c.id === s.cardId)?.name : finance().accounts.find(a => a.id === s.accountId)?.name;
  return `<article class="subscription-row ${s.active ? '' : 'is-inactive'}" data-sub-id="${s.id}">
    <div class="subscription-main">
      <strong>${esc(s.name)}</strong>
      <div class="reminder-meta">
        <span class="chip chip-cat">${esc(s.category || 'Sin categoría')}</span>
        <span>${FREQ_LABEL[s.frequency]}</span>
        <span>${esc(target || 'Sin medio de pago')}</span>
        <span>Próximo pago: ${formatDateEs(s.nextPaymentDate)}</span>
      </div>
    </div>
    <div class="subscription-side">
      <strong>${money(s.amount)}</strong>
      <label class="check-field"><input type="checkbox" data-toggle-sub="${s.id}" ${s.active ? 'checked' : ''} /><span>Activa</span></label>
      <button class="mini-btn" data-delete-sub="${s.id}" aria-label="Eliminar ${esc(s.name)}">Eliminar</button>
    </div>
  </article>`;
}

function render() {
  const list = subs();
  $('subscriptions-list').innerHTML = list.length ? list.map(subscriptionRowHTML).join('') : '<p class="empty-copy">No tenés suscripciones registradas.</p>';

  const monthlyTotal = list.filter(s => s.active).reduce((sum, s) => sum + (s.frequency === 'yearly' ? s.amount / 12 : s.amount), 0);
  $('subscriptions-monthly-total').textContent = money(monthlyTotal);

  const in30 = new Date();
  in30.setDate(in30.getDate() + 30);
  const upcoming = list
    .filter(s => s.active && s.nextPaymentDate <= in30.toISOString().slice(0, 10))
    .sort((a, b) => a.nextPaymentDate.localeCompare(b.nextPaymentDate));
  $('subscriptions-upcoming').innerHTML = upcoming.length
    ? upcoming.map(s => `<li>${esc(s.name)} · ${formatDateEs(s.nextPaymentDate)} · ${money(s.amount)}</li>`).join('')
    : '<li class="empty-copy-inline">No hay pagos próximos en los siguientes 30 días.</li>';

  populateSelects();
}

function resetForm() {
  $('subscription-form').reset();
  $('subscription-date').value = today();
  $('subscription-payment-method').value = 'account';
  updatePaymentMethodVisibility();
}

function bindEvents() {
  $('add-subscription').onclick = () => {
    resetForm();
    $('subscription-dialog').showModal();
  };

  $('subscription-payment-method').addEventListener('change', updatePaymentMethodVisibility);

  $('subscription-form').addEventListener('submit', e => {
    e.preventDefault();
    const name = $('subscription-name').value.trim();
    if (!name) return;
    const isCard = $('subscription-payment-method').value === 'card';
    if (isCard && !$('subscription-card').value) return showToast('Creá una tarjeta primero.');
    if (!isCard && !$('subscription-account').value) return showToast('Creá una cuenta primero.');
    subs().push({
      id: uid(),
      name,
      amount: parseNum($('subscription-amount').value),
      category: $('subscription-category').value.trim() || 'Suscripciones',
      accountId: isCard ? '' : $('subscription-account').value,
      cardId: isCard ? $('subscription-card').value : '',
      frequency: $('subscription-frequency').value,
      nextPaymentDate: $('subscription-date').value || today(),
      active: true,
    });
    persist();
    $('subscription-dialog').close();
    render();
    showToast('Suscripción creada.');
  });

  $('subscriptions-list').addEventListener('change', e => {
    const id = e.target.dataset.toggleSub;
    if (!id) return;
    const s = subs().find(x => x.id === id);
    if (!s) return;
    s.active = e.target.checked;
    persist();
    render();
  });

  $('subscriptions-list').addEventListener('click', async e => {
    const id = e.target.dataset.deleteSub;
    if (!id) return;
    const ok = await confirmAction({ title: 'Eliminar suscripción', message: 'Esto no elimina los movimientos ya generados.', confirmText: 'Eliminar' });
    if (!ok) return;
    const idx = subs().findIndex(s => s.id === id);
    const removed = subs()[idx];
    finance().subscriptions = subs().filter(s => s.id !== id);
    persist();
    render();
    showToast(`"${removed.name}" eliminada.`, {
      undo: () => {
        finance().subscriptions.splice(idx, 0, removed);
        persist();
        render();
      },
    });
  });
}

/**
 * Generates the expense movement for any subscription whose nextPaymentDate has
 * arrived, then advances it — so re-opening the app after several cycles catches
 * up without ever emitting the same payment twice.
 */
export function processDueSubscriptions() {
  const todayStr = today();
  let generated = 0;
  subs().forEach(s => {
    if (!s.active) return;
    let cycles = 0;
    while (s.nextPaymentDate <= todayStr && cycles < MAX_CATCHUP_CYCLES) {
      addTransactionRecord({
        id: uid(),
        type: 'expense',
        date: s.nextPaymentDate,
        description: s.name,
        amount: s.amount,
        category: s.category,
        account: s.cardId ? '' : s.accountId,
        toAccount: '',
        cardId: s.cardId || '',
        recurring: false,
        installmentGroupId: null,
        installmentIndex: null,
        installmentTotal: null,
        created: Date.now(),
      });
      s.nextPaymentDate = nextDate(s.nextPaymentDate, s.frequency);
      generated++;
      cycles++;
    }
  });
  if (generated) {
    persist();
    refreshFinanceAll();
  }
}

export function initSubscriptions() {
  if (initialized) return;
  initialized = true;
  bindEvents();
  processDueSubscriptions();
  render();
}

export function showSubscriptions() {
  processDueSubscriptions();
  render();
}

export function getAllSubscriptions() {
  return subs();
}
