import { getState, persist } from '../state.js';
import { uid } from '../utils/id.js';
import { money, parseNum } from '../utils/currency.js';
import { today, formatDateEs } from '../utils/dates.js';
import { showToast } from '../components/toast.js';
import { confirmAction } from '../components/confirm.js';
import { $, esc } from '../utils/dom.js';

const STATUS_LABEL = { pending: 'Pendiente', partial: 'Parcial', paid: 'Pagada' };

let initialized = false;

function finance() {
  return getState().finance;
}
function debts() {
  return finance().debts;
}

function computeStatus(d) {
  if (d.remainingAmount <= 0) return 'paid';
  if (d.remainingAmount < d.originalAmount) return 'partial';
  return 'pending';
}

function debtRowHTML(d) {
  const pct = d.originalAmount ? Math.round(((d.originalAmount - d.remainingAmount) / d.originalAmount) * 100) : 0;
  return `<article class="debt-row status-${d.status}" data-debt-id="${d.id}">
    <div class="debt-main">
      <strong>${esc(d.person)}</strong>
      <p class="reminder-desc">${esc(d.description || '')}</p>
      <div class="reminder-meta">
        <span class="chip">${STATUS_LABEL[d.status]}</span>
        ${d.dueDate ? `<span>Vence ${formatDateEs(d.dueDate)}</span>` : ''}
      </div>
      <div class="progress"><span style="width:${pct}%"></span></div>
    </div>
    <div class="debt-side">
      <strong>${money(d.remainingAmount)}</strong>
      <span class="helper">de ${money(d.originalAmount)}</span>
      ${d.status !== 'paid' ? `<button class="btn btn-secondary" type="button" data-pay-debt="${d.id}">Registrar pago</button>` : ''}
      <button class="mini-btn" data-delete-debt="${d.id}" aria-label="Eliminar deuda con ${esc(d.person)}">Eliminar</button>
    </div>
  </article>`;
}

function render() {
  const owe = debts().filter(d => d.type === 'owe');
  const owed = debts().filter(d => d.type === 'owed');

  $('debts-owe-total').textContent = money(owe.reduce((s, d) => s + d.remainingAmount, 0));
  $('debts-owed-total').textContent = money(owed.reduce((s, d) => s + d.remainingAmount, 0));

  $('debts-owe-list').innerHTML = owe.length ? owe.map(debtRowHTML).join('') : '<p class="empty-copy">No registraste deudas propias.</p>';
  $('debts-owed-list').innerHTML = owed.length ? owed.map(debtRowHTML).join('') : '<p class="empty-copy">No te deben dinero por ahora.</p>';
}

function resetForm() {
  $('debt-form').reset();
}

function bindEvents() {
  $('add-debt').onclick = () => {
    resetForm();
    $('debt-dialog').showModal();
  };

  $('debt-form').addEventListener('submit', e => {
    e.preventDefault();
    const person = $('debt-person').value.trim();
    if (!person) return;
    const originalAmount = parseNum($('debt-amount').value);
    if (!originalAmount) return;
    debts().push({
      id: uid(),
      type: $('debt-type').value,
      person,
      description: $('debt-description').value.trim(),
      originalAmount,
      remainingAmount: originalAmount,
      dueDate: $('debt-due-date').value || '',
      status: 'pending',
      payments: [],
    });
    persist();
    $('debt-dialog').close();
    render();
    showToast('Deuda registrada.');
  });

  document.querySelectorAll('#debts-owe-list, #debts-owed-list').forEach(el => {
    el.addEventListener('click', async e => {
      const payId = e.target.dataset.payDebt;
      const delId = e.target.dataset.deleteDebt;

      if (payId) {
        const d = debts().find(x => x.id === payId);
        if (!d) return;
        $('debt-payment-debt-id').value = payId;
        $('debt-payment-title').textContent = `Registrar pago · ${d.person}`;
        $('debt-payment-amount').value = '';
        $('debt-payment-dialog').showModal();
        return;
      }

      if (delId) {
        const ok = await confirmAction({ title: 'Eliminar deuda', message: 'Se eliminará el registro y su historial de pagos.', confirmText: 'Eliminar' });
        if (!ok) return;
        const idx = debts().findIndex(d => d.id === delId);
        const removed = debts()[idx];
        finance().debts = debts().filter(d => d.id !== delId);
        persist();
        render();
        showToast(`Deuda con "${removed.person}" eliminada.`, {
          undo: () => {
            finance().debts.splice(idx, 0, removed);
            persist();
            render();
          },
        });
      }
    });
  });

  $('debt-payment-form').addEventListener('submit', e => {
    e.preventDefault();
    const id = $('debt-payment-debt-id').value;
    const d = debts().find(x => x.id === id);
    if (!d) return;
    const amount = Math.min(d.remainingAmount, parseNum($('debt-payment-amount').value));
    if (!amount) return;
    d.payments.push({ id: uid(), date: today(), amount });
    d.remainingAmount -= amount;
    d.status = computeStatus(d);
    persist();
    $('debt-payment-dialog').close();
    render();
    showToast('Pago registrado.');
  });
}

export function initDebts() {
  if (initialized) return;
  initialized = true;
  bindEvents();
  render();
}

export function showDebts() {
  render();
}

export function getAllDebts() {
  return debts();
}
