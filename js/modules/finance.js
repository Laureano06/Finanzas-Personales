import { getState, persist } from '../state.js';
import { money, moneyText, parseNum, formatCurrencyInput } from '../utils/currency.js';
import { MONTH_NAMES, MONTH_SHORT, today, monthKey, currentMonthKeyNow, shiftMonthKey, addMonthsToDate } from '../utils/dates.js';
import { uid } from '../utils/id.js';
import { showToast } from '../components/toast.js';
import { $, esc } from '../utils/dom.js';

const MAX_INSTALLMENTS = 24;

let categoryChart = null;
let annualChart = null;
let annualSavingsChart = null;
let annualCategoryChart = null;
let annualAccountsChart = null;
let initialized = false;

function finance() {
  return getState().finance;
}

function ensureMonth(key) {
  const f = finance();
  if (!f.months[key]) f.months[key] = { baseIncome: 0, savingsGoal: 0, transactions: [] };
  return f.months[key];
}

// Read-only counterpart to ensureMonth: used by rendering/aggregation (e.g. the annual
// dashboard scans all 12 months) so simply looking at a month never persists an empty
// record for it — only actually writing to a month should create it.
function getMonth(key) {
  return finance().months[key] || { baseIncome: 0, savingsGoal: 0, transactions: [] };
}

const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function populateMonthPicker() {
  $('month-select-month').innerHTML = MONTH_NAMES.map((name, i) => `<option value="${String(i + 1).padStart(2, '0')}">${name}</option>`).join('');
  const y = new Date().getFullYear();
  const years = [];
  for (let i = y - 15; i <= y + 15; i++) years.push(i);
  $('month-select-year').innerHTML = years.map(i => `<option value="${i}">${i}</option>`).join('');
}

function setMonthKey(key) {
  const [y, m] = key.split('-');
  $('month-select-year').value = y;
  $('month-select-month').value = m;
}

function currentMonthKey() {
  return `${$('month-select-year').value}-${$('month-select-month').value}`;
}

function monthTransactions(key = currentMonthKey()) {
  return getMonth(key).transactions;
}

function totals(key = currentMonthKey()) {
  const m = getMonth(key);
  let income = m.baseIncome || 0;
  let expenses = 0;
  m.transactions.forEach(t => {
    if (t.type === 'income') income += t.amount;
    if (t.type === 'expense') expenses += t.amount;
  });
  return { income, expenses, balance: income - expenses, savingsRate: income ? ((income - expenses) / income) * 100 : 0 };
}

function accountBalance(id) {
  const f = finance();
  let bal = f.accounts.find(a => a.id === id)?.opening || 0;
  Object.values(f.months).forEach(m =>
    (m.transactions || []).forEach(t => {
      if (t.type === 'income' && t.account === id) bal += t.amount;
      if (t.type === 'expense' && t.account === id) bal -= t.amount;
      if (t.type === 'card_payment' && t.account === id) bal -= t.amount;
      if (t.type === 'transfer') {
        if (t.account === id) bal -= t.amount;
        if (t.toAccount === id) bal += t.amount;
      }
    })
  );
  return bal;
}

function expenseByCategory(key = currentMonthKey()) {
  const out = {};
  monthTransactions(key)
    .filter(t => t.type === 'expense')
    .forEach(t => (out[t.category] = (out[t.category] || 0) + t.amount));
  return out;
}

function accountName(id) {
  return finance().accounts.find(a => a.id === id)?.name || 'Cuenta';
}

function cardName(id) {
  return finance().creditCards.find(c => c.id === id)?.name || 'Tarjeta';
}

function movementCountForAccount(id) {
  let n = 0;
  Object.values(finance().months).forEach(m =>
    (m.transactions || []).forEach(t => {
      if (t.account === id || t.toAccount === id) n++;
    })
  );
  return n;
}

function showFormError(msg) {
  const el = $('transaction-error');
  el.textContent = msg;
  el.classList.remove('hide');
}
function clearFormError() {
  $('transaction-error').classList.add('hide');
}

function renderKPIs() {
  const t = totals();
  $('kpi-income').textContent = money(t.income);
  $('kpi-expenses').textContent = money(t.expenses);
  $('kpi-balance').textContent = money(t.balance);
  $('kpi-balance').className = t.balance < 0 ? 'amount-negative' : 'amount-positive';
  $('kpi-savings').textContent = `${Math.round(t.savingsRate)}%`;
  const goal = ensureMonth(currentMonthKey()).savingsGoal || 0;
  if (goal) {
    const pct = Math.max(0, Math.min(100, (t.balance / goal) * 100));
    $('goal-progress').style.width = pct + '%';
    $('goal-text').textContent = `${money(Math.max(0, t.balance))} de ${money(goal)} · ${Math.round(pct)}%`;
    $('kpi-savings-note').textContent = `Meta ${money(goal)}`;
  } else {
    $('goal-progress').style.width = '0%';
    $('goal-text').textContent = 'Sin objetivo definido';
    $('kpi-savings-note').textContent = 'Objetivo no definido';
  }
}

function renderAccounts() {
  const f = finance();
  const list = $('accounts-list');
  list.innerHTML = f.accounts
    .map(
      a =>
        `<article class="account-card"><div class="account-head"><strong>${esc(a.name)}</strong>${
          f.accounts.length > 1 ? `<button class="mini-btn" data-delete-account="${a.id}" aria-label="Eliminar cuenta ${esc(a.name)}">Eliminar</button>` : ''
        }</div><strong class="account-balance">${money(accountBalance(a.id))}</strong><div class="account-meta"><span>Saldo inicial ${money(a.opening)}</span><span>${movementCountForAccount(
          a.id
        )} mov.</span></div></article>`
    )
    .join('');
  if (!f.accounts.length) list.innerHTML = '<p class="empty-copy">Todavía no creaste ninguna cuenta.</p>';
  const opts = f.accounts.map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join('');
  $('transaction-account').innerHTML = opts;
  $('transaction-to-account').innerHTML = opts;
  $('filter-account').innerHTML = '<option value="all">Todas las cuentas</option>' + opts;

  $('transaction-card').innerHTML = f.creditCards.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  updatePaymentMethodVisibility();
}

function paymentMethodAvailable() {
  return finance().creditCards.length > 0;
}

function updatePaymentMethodVisibility() {
  const isExpense = $('transaction-type').value === 'expense';
  const hasCards = paymentMethodAvailable();
  $('payment-method-field').classList.toggle('hide', !isExpense || !hasCards);
  const isCard = isExpense && hasCards && $('transaction-payment-method').value === 'card';
  $('card-field').classList.toggle('hide', !isCard);
  $('account-field').classList.toggle('hide', isCard);
}

function renderMovements() {
  const q = $('search-movements').value.toLowerCase();
  const type = $('filter-type').value;
  const acc = $('filter-account').value;
  let arr = [...monthTransactions()].sort((a, b) => b.date.localeCompare(a.date) || b.created - a.created);
  arr = arr.filter(t => (type === 'all' || t.type === type) && (acc === 'all' || t.account === acc || t.toAccount === acc) && `${t.description} ${t.category || ''}`.toLowerCase().includes(q));
  $('movement-count').textContent = `${arr.length} movimiento${arr.length === 1 ? '' : 's'}`;
  if (!arr.length) {
    const noFilters = !q && type === 'all' && acc === 'all';
    $('movement-list').innerHTML = `<p class="empty-copy">${noFilters ? 'Todavía no cargaste movimientos este mes. Agregá el primero arriba ↑' : 'No encontramos movimientos con esos filtros.'}</p>`;
    return;
  }
  $('movement-list').innerHTML = arr
    .map(t => {
      const from = t.account ? accountName(t.account) : '';
      const to = t.toAccount ? accountName(t.toAccount) : '';
      const sign = t.type === 'income' ? '+' : t.type === 'expense' || t.type === 'card_payment' ? '−' : '↔';
      const cls = t.type === 'income' ? 'amount-positive' : t.type === 'expense' || t.type === 'card_payment' ? 'amount-negative' : 'amount-neutral';
      let meta;
      if (t.type === 'transfer') meta = `${from} → ${to}`;
      else if (t.type === 'card_payment') meta = `Pago tarjeta ${cardName(t.cardId)} · ${from}`;
      else if (t.cardId) meta = `${t.category || 'Ingreso'} · Tarjeta ${cardName(t.cardId)}`;
      else meta = `${t.category || 'Ingreso'} · ${from}`;
      const installmentBadge = t.installmentTotal ? ` · Cuota ${t.installmentIndex}/${t.installmentTotal}` : '';
      const actions = t.installmentGroupId
        ? `<button class="mini-btn" data-delete-installment="${t.id}" aria-label="Eliminar esta cuota">Eliminar cuota</button><button class="mini-btn" data-delete-group="${t.installmentGroupId}" aria-label="Eliminar todas las cuotas">Eliminar todas</button>`
        : `<button class="mini-btn" data-edit="${t.id}" aria-label="Editar ${esc(t.description)}">Editar</button><button class="mini-btn" data-delete="${t.id}" aria-label="Eliminar ${esc(t.description)}">Eliminar</button>`;
      return `<article class="movement-item ${t.type}"><div class="movement-icon">${sign}</div><div class="movement-main"><strong>${esc(t.description)}</strong><small>${t.date
        .split('-')
        .reverse()
        .join('/')} · ${esc(meta)}${t.recurring ? ' · ♻' : ''}${installmentBadge}</small></div><div class="movement-side"><strong class="${cls}">${sign === '↔' ? '' : sign}${money(
        t.amount
      )}</strong><div class="movement-actions">${actions}</div></div></article>`;
    })
    .join('');
}

function budgetRowHTML(k) {
  const f = finance();
  const spent = expenseByCategory();
  const limit = f.budgets[k] || 0;
  const use = spent[k] || 0;
  const pct = limit ? Math.round((use / limit) * 100) : 0;
  const canDelete = Object.keys(f.budgets).length > 0;
  return `<article class="budget-row ${limit && use > limit ? 'budget-over' : ''}" data-budget-row="${esc(k)}"><div class="budget-head"><strong>${esc(
    k
  )}</strong><input class="currency-input budget-limit" data-budget="${esc(k)}" value="${limit ? moneyText(limit) : ''}" placeholder="Sin límite" aria-label="Límite mensual para ${esc(
    k
  )}"></div><div class="budget-progress"><span style="width:${Math.min(pct, 100)}%"></span></div><div class="budget-meta"><span>${money(use)} usados</span><span>${
    limit ? `${pct}% de ${money(limit)}` : 'Sin límite'
  } ${canDelete ? `· <button class="mini-btn" data-delete-budget="${esc(k)}" aria-label="Eliminar categoría ${esc(k)}">Eliminar</button>` : ''}</span></div></article>`;
}

function renderBudgets() {
  const f = finance();
  const keys = Object.keys(f.budgets);
  $('budget-list').innerHTML = keys.length ? keys.map(budgetRowHTML).join('') : '<p class="empty-copy">Todavía no creaste categorías de presupuesto.</p>';
  const categorySelect = $('transaction-category');
  const selected = categorySelect.value;
  categorySelect.innerHTML = keys.map(k => `<option>${esc(k)}</option>`).join('');
  if (keys.includes(selected)) categorySelect.value = selected;
}

function updateBudgetRow(key) {
  const row = $('budget-list').querySelector(`[data-budget-row="${CSS.escape(key)}"]`);
  if (!row) return;
  const f = finance();
  const spent = expenseByCategory();
  const limit = f.budgets[key] || 0;
  const use = spent[key] || 0;
  const pct = limit ? Math.round((use / limit) * 100) : 0;
  const canDelete = Object.keys(f.budgets).length > 0;
  row.classList.toggle('budget-over', !!(limit && use > limit));
  row.querySelector('.budget-progress span').style.width = Math.min(pct, 100) + '%';
  row.querySelector('.budget-meta').innerHTML = `<span>${money(use)} usados</span><span>${limit ? `${pct}% de ${money(limit)}` : 'Sin límite'} ${
    canDelete ? `· <button class="mini-btn" data-delete-budget="${esc(key)}" aria-label="Eliminar categoría ${esc(key)}">Eliminar</button>` : ''
  }</span>`;
}

function renderCharts() {
  const cats = expenseByCategory();
  const entries = Object.entries(cats).filter(([, v]) => v > 0);
  $('category-empty').classList.toggle('hide', entries.length > 0);
  $('category-chart').classList.toggle('hide', entries.length === 0);
  $('category-breakdown').innerHTML = entries.map(([k, v]) => `<div class="category-row"><span>${esc(k)}</span><span>${money(v)} · ${Math.round((v / (totals().expenses || 1)) * 100)}%</span></div>`).join('');
  if (categoryChart) categoryChart.destroy();
  if (window.Chart && entries.length) {
    categoryChart = new Chart($('category-chart'), {
      type: 'doughnut',
      data: { labels: entries.map(x => x[0]), datasets: [{ data: entries.map(x => x[1]), borderWidth: 0 }] },
      options: { animation: !prefersReducedMotion(), plugins: { legend: { display: false } }, cutout: '70%', maintainAspectRatio: false },
    });
  }
  renderAnnual();
}

function renderAnnual() {
  const year = currentMonthKey().slice(0, 4);
  $('annual-year').textContent = year;
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
  const data = months.map(k => totals(k));
  const ai = data.reduce((s, x) => s + x.income, 0);
  const ae = data.reduce((s, x) => s + x.expenses, 0);
  $('annual-income').textContent = money(ai);
  $('annual-expenses').textContent = money(ae);
  $('annual-savings').textContent = money(ai - ae);
  $('annual-average').textContent = money(ae / 12);
  $('annual-savings-rate').textContent = ai ? `${Math.round(((ai - ae) / ai) * 100)}%` : '0%';
  let maxIdx = -1,
    max = -1,
    minIdx = -1,
    min = Infinity;
  data.forEach((x, i) => {
    if (x.expenses > max) {
      max = x.expenses;
      maxIdx = i;
    }
    if (x.expenses > 0 && x.expenses < min) {
      min = x.expenses;
      minIdx = i;
    }
  });
  $('annual-highest').textContent = max > 0 ? `${MONTH_SHORT[maxIdx]} · ${money(max)}` : '—';
  $('annual-lowest').textContent = minIdx >= 0 ? `${MONTH_SHORT[minIdx]} · ${money(min)}` : '—';
  const catTotals = {};
  months.forEach(k => Object.entries(expenseByCategory(k)).forEach(([c, v]) => (catTotals[c] = (catTotals[c] || 0) + v)));
  const top = Object.entries(catTotals).sort((a, b) => b[1] - a[1])[0];
  $('annual-top-category').textContent = top ? `${top[0]} · ${money(top[1])}` : '—';
  const muted2 = getComputedStyle(document.documentElement).getPropertyValue('--muted2').trim();

  if (annualChart) annualChart.destroy();
  if (window.Chart) {
    annualChart = new Chart($('annual-chart'), {
      type: 'bar',
      data: { labels: MONTH_SHORT, datasets: [{ label: 'Ingresos', data: data.map(x => x.income) }, { label: 'Gastos', data: data.map(x => x.expenses) }] },
      options: {
        animation: !prefersReducedMotion(),
        maintainAspectRatio: false,
        scales: { y: { beginAtZero: true } },
        plugins: { legend: { labels: { color: muted2 } } },
      },
    });
  }

  if (annualSavingsChart) annualSavingsChart.destroy();
  if (window.Chart) {
    const savings = data.map(x => x.income - x.expenses);
    annualSavingsChart = new Chart($('annual-savings-chart'), {
      type: 'bar',
      data: { labels: MONTH_SHORT, datasets: [{ label: 'Ahorro', data: savings, backgroundColor: savings.map(v => (v >= 0 ? 'rgba(52,211,153,.65)' : 'rgba(251,113,133,.65)')) }] },
      options: { animation: !prefersReducedMotion(), maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } },
    });
  }

  const catEntries = Object.entries(catTotals).filter(([, v]) => v > 0);
  $('annual-category-empty').classList.toggle('hide', catEntries.length > 0);
  $('annual-category-chart').classList.toggle('hide', catEntries.length === 0);
  if (annualCategoryChart) annualCategoryChart.destroy();
  if (window.Chart && catEntries.length) {
    annualCategoryChart = new Chart($('annual-category-chart'), {
      type: 'doughnut',
      data: { labels: catEntries.map(x => x[0]), datasets: [{ data: catEntries.map(x => x[1]), borderWidth: 0 }] },
      options: { animation: !prefersReducedMotion(), maintainAspectRatio: false, cutout: '65%', plugins: { legend: { position: 'bottom', labels: { color: muted2, boxWidth: 10, font: { size: 10 } } } } },
    });
  }

  const accounts = finance().accounts;
  $('annual-accounts-empty').classList.toggle('hide', accounts.length > 0);
  $('annual-accounts-chart').classList.toggle('hide', accounts.length === 0);
  if (annualAccountsChart) annualAccountsChart.destroy();
  if (window.Chart && accounts.length) {
    const balances = accounts.map(a => accountBalance(a.id));
    annualAccountsChart = new Chart($('annual-accounts-chart'), {
      type: 'bar',
      data: {
        labels: accounts.map(a => a.name),
        datasets: [{ label: 'Saldo', data: balances, backgroundColor: balances.map(v => (v >= 0 ? 'rgba(139,92,246,.65)' : 'rgba(251,113,133,.65)')) }],
      },
      options: {
        animation: !prefersReducedMotion(),
        maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: { legend: { display: false } },
        scales: { x: { ticks: { color: muted2 } }, y: { ticks: { color: muted2 } } },
      },
    });
  }
}

function renderComparison() {
  const prev = shiftMonthKey(currentMonthKey(), -1);
  const f = finance();
  if (!f.months[prev]) {
    $('month-comparison').textContent = 'Sin datos del mes anterior';
    $('month-comparison').className = 'comparison-chip';
    return;
  }
  const a = totals();
  const b = totals(prev);
  const diff = a.expenses - b.expenses;
  const pct = b.expenses ? Math.round((Math.abs(diff) / b.expenses) * 100) : 0;
  $('month-comparison').textContent = diff === 0 ? 'Mismo gasto que el mes anterior' : `${diff > 0 ? '▲' : '▼'} ${pct}% ${diff > 0 ? 'más' : 'menos'} gasto que el mes anterior`;
  $('month-comparison').className = `comparison-chip ${diff > 0 ? 'comparison-bad' : 'comparison-good'}`;
}

function renderAll() {
  renderKPIs();
  renderAccounts();
  renderMovements();
  renderBudgets();
  renderCharts();
  renderComparison();
}

function resetTransactionForm() {
  $('transaction-form').reset();
  $('editing-id').value = '';
  $('transaction-date').value = today();
  $('transaction-installments').value = '1';
  $('transaction-payment-method').value = 'account';
  $('save-transaction').textContent = 'Agregar movimiento';
  $('cancel-edit').classList.add('hide');
  clearFormError();
  $('transaction-type').dispatchEvent(new Event('change'));
}

function loadMonth() {
  const m = ensureMonth(currentMonthKey());
  $('base-income').value = m.baseIncome ? moneyText(m.baseIncome) : '';
  $('savings-goal').value = m.savingsGoal ? moneyText(m.savingsGoal) : '';
  const [y, mo] = currentMonthKey().split('-').map(Number);
  $('transaction-date').value = `${currentMonthKey()}-${String(Math.min(new Date().getDate(), new Date(y, mo, 0).getDate())).padStart(2, '0')}`;
  renderAll();
}

function inheritRecurring() {
  const key = currentMonthKey();
  const f = finance();
  if (f.months[key]) return;
  const prev = shiftMonthKey(key, -1);
  const inherited = (f.months[prev]?.transactions || [])
    .filter(t => t.recurring && t.type !== 'transfer')
    .map(t => ({ ...t, id: uid(), date: `${key}-${t.date.slice(8, 10)}`, created: Date.now() }));
  f.months[key] = { baseIncome: f.months[prev]?.baseIncome || 0, savingsGoal: f.months[prev]?.savingsGoal || 0, transactions: inherited };
  persist();
}

function shiftMonth(delta) {
  setMonthKey(shiftMonthKey(currentMonthKey(), delta));
  inheritRecurring();
  loadMonth();
}

function removeInstallmentGroup(groupId) {
  const f = finance();
  const removed = [];
  Object.values(f.months).forEach(m => {
    m.transactions = m.transactions.filter(t => {
      if (t.installmentGroupId === groupId) {
        removed.push(t);
        return false;
      }
      return true;
    });
  });
  persist();
  return removed;
}

function restoreTransactions(list) {
  list.forEach(t => ensureMonth(monthKey(t.date)).transactions.push(t));
  persist();
}

function bindEvents() {
  document.addEventListener('input', e => {
    if (e.target.classList.contains('currency-input')) formatCurrencyInput(e.target);
  });

  $('transaction-type').addEventListener('change', () => {
    const tr = $('transaction-type').value === 'transfer';
    const isExpense = $('transaction-type').value === 'expense';
    $('category-field').classList.toggle('hide', tr);
    $('to-account-field').classList.toggle('hide', !tr);
    $('recurring-field').classList.toggle('hide', tr);
    $('installments-field').classList.toggle('hide', !isExpense);
    $('account-label').textContent = tr ? 'Cuenta origen' : 'Cuenta';
    updatePaymentMethodVisibility();
  });
  $('transaction-payment-method').addEventListener('change', updatePaymentMethodVisibility);

  $('transaction-form').addEventListener('submit', e => {
    e.preventDefault();
    clearFormError();
    const type = $('transaction-type').value;
    const amount = parseNum($('transaction-amount').value);
    if (!amount) return showFormError('Ingresá un monto válido.');
    if (type === 'transfer' && $('transaction-account').value === $('transaction-to-account').value) return showFormError('Elegí dos cuentas distintas.');

    const isExpense = type === 'expense';
    const usesCard = isExpense && !$('card-field').classList.contains('hide');
    if (usesCard && !$('transaction-card').value) return showFormError('Creá una tarjeta primero.');

    const description = $('transaction-description').value.trim();
    if (!description) return showFormError('Ingresá una descripción.');

    const category = type === 'transfer' ? '' : $('transaction-category').value;
    const accountId = usesCard ? '' : $('transaction-account').value;
    const cardId = usesCard ? $('transaction-card').value : '';
    if (!usesCard && type !== 'transfer' && !accountId) return showFormError('Creá una cuenta primero.');
    if (type === 'transfer' && !$('transaction-account').value) return showFormError('Creá una cuenta primero.');

    const editingId = $('editing-id').value;
    const baseDate = $('transaction-date').value;
    const installments = isExpense ? Math.max(1, Math.min(MAX_INSTALLMENTS, parseInt($('transaction-installments').value, 10) || 1)) : 1;

    if (editingId) {
      const tx = {
        id: editingId,
        type,
        date: baseDate,
        description,
        amount,
        category,
        account: type === 'transfer' ? $('transaction-account').value : accountId,
        toAccount: type === 'transfer' ? $('transaction-to-account').value : '',
        recurring: type !== 'transfer' && $('transaction-recurring').checked,
        cardId,
        installmentGroupId: null,
        installmentIndex: null,
        installmentTotal: null,
        created: Date.now(),
      };
      const m = ensureMonth(monthKey(tx.date));
      const idx = m.transactions.findIndex(t => t.id === tx.id);
      if (idx >= 0) m.transactions[idx] = tx;
      else m.transactions.push(tx);
      persist();
      resetTransactionForm();
      renderAll();
      showToast('Movimiento actualizado.');
      return;
    }

    if (installments > 1) {
      const groupId = uid();
      const per = Math.round(amount / installments);
      let allocated = 0;
      for (let i = 1; i <= installments; i++) {
        const amt = i === installments ? amount - allocated : per;
        allocated += amt;
        const date = addMonthsToDate(baseDate, i - 1);
        const tx = {
          id: uid(),
          type: 'expense',
          date,
          description: `${description} (${i}/${installments})`,
          amount: amt,
          category,
          account: accountId,
          toAccount: '',
          recurring: false,
          cardId,
          installmentGroupId: groupId,
          installmentIndex: i,
          installmentTotal: installments,
          created: Date.now(),
        };
        ensureMonth(monthKey(tx.date)).transactions.push(tx);
      }
      persist();
    } else {
      const tx = {
        id: uid(),
        type,
        date: baseDate,
        description,
        amount,
        category,
        account: type === 'transfer' ? $('transaction-account').value : accountId,
        toAccount: type === 'transfer' ? $('transaction-to-account').value : '',
        recurring: type !== 'transfer' && $('transaction-recurring').checked,
        cardId,
        installmentGroupId: null,
        installmentIndex: null,
        installmentTotal: null,
        created: Date.now(),
      };
      ensureMonth(monthKey(tx.date)).transactions.push(tx);
      persist();
    }
    resetTransactionForm();
    renderAll();
    showToast(installments > 1 ? `Compra en ${installments} cuotas guardada.` : 'Movimiento guardado.');
  });

  $('cancel-edit').onclick = resetTransactionForm;

  $('movement-list').addEventListener('click', e => {
    const editId = e.target.dataset.edit;
    const delId = e.target.dataset.delete;
    const delInstallmentId = e.target.dataset.deleteInstallment;
    const delGroupId = e.target.dataset.deleteGroup;

    if (delGroupId) {
      const removed = removeInstallmentGroup(delGroupId);
      renderAll();
      showToast(`${removed.length} cuotas eliminadas.`, {
        undo: () => {
          restoreTransactions(removed);
          renderAll();
        },
      });
      return;
    }

    if (delInstallmentId) {
      let removed = null;
      Object.values(finance().months).forEach(m => {
        const idx = m.transactions.findIndex(t => t.id === delInstallmentId);
        if (idx >= 0) removed = m.transactions.splice(idx, 1)[0];
      });
      if (!removed) return;
      persist();
      renderAll();
      showToast('Cuota eliminada.', {
        undo: () => {
          restoreTransactions([removed]);
          renderAll();
        },
      });
      return;
    }

    const id = delId || editId;
    if (!id) return;
    const tx = monthTransactions().find(t => t.id === id);
    if (!tx) return;
    if (delId) {
      const monthK = currentMonthKey();
      ensureMonth(monthK).transactions = monthTransactions().filter(t => t.id !== id);
      persist();
      renderAll();
      showToast(`"${tx.description}" eliminado.`, {
        undo: () => {
          ensureMonth(monthK).transactions.push(tx);
          persist();
          renderAll();
        },
      });
      return;
    }
    $('editing-id').value = tx.id;
    $('transaction-type').value = tx.type;
    $('transaction-type').dispatchEvent(new Event('change'));
    $('transaction-date').value = tx.date;
    $('transaction-description').value = tx.description;
    $('transaction-amount').value = moneyText(tx.amount);
    $('transaction-category').value = tx.category;
    $('transaction-payment-method').value = tx.cardId ? 'card' : 'account';
    $('transaction-payment-method').dispatchEvent(new Event('change'));
    if (tx.cardId) $('transaction-card').value = tx.cardId;
    else $('transaction-account').value = tx.account;
    $('transaction-to-account').value = tx.toAccount || finance().accounts[0]?.id;
    $('transaction-recurring').checked = tx.recurring;
    $('transaction-installments').value = '1';
    $('save-transaction').textContent = 'Guardar cambios';
    $('cancel-edit').classList.remove('hide');
    $('transaction-form').scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  });

  ['search-movements', 'filter-type', 'filter-account'].forEach(id => $(id).addEventListener('input', renderMovements));

  $('budget-list').addEventListener('input', e => {
    if (e.target.dataset.budget) {
      formatCurrencyInput(e.target);
      finance().budgets[e.target.dataset.budget] = parseNum(e.target.value);
      persist();
      updateBudgetRow(e.target.dataset.budget);
    }
  });
  $('budget-list').addEventListener('click', e => {
    const key = e.target.dataset.deleteBudget;
    if (!key) return;
    const value = finance().budgets[key];
    delete finance().budgets[key];
    persist();
    renderAll();
    showToast(`Categoría "${key}" eliminada.`, {
      undo: () => {
        finance().budgets[key] = value;
        persist();
        renderAll();
      },
    });
  });

  $('add-account').onclick = () => $('account-dialog').showModal();
  $('add-budget-category').onclick = () => $('category-dialog').showModal();
  document.querySelectorAll('[data-close]').forEach(b => (b.onclick = () => $(b.dataset.close).close()));

  $('account-form').addEventListener('submit', e => {
    e.preventDefault();
    const name = $('account-name').value.trim();
    if (!name) return;
    finance().accounts.push({ id: uid(), name, opening: parseNum($('account-opening').value) });
    $('account-form').reset();
    $('account-dialog').close();
    persist();
    renderAll();
    showToast('Cuenta creada.');
  });

  $('category-form').addEventListener('submit', e => {
    e.preventDefault();
    const name = $('category-name').value.trim();
    if (!name) return;
    finance().budgets[name] = parseNum($('category-limit').value);
    $('category-form').reset();
    $('category-dialog').close();
    persist();
    renderAll();
    showToast('Categoría agregada.');
  });

  $('accounts-list').addEventListener('click', e => {
    const id = e.target.dataset.deleteAccount;
    if (!id) return;
    const used = Object.values(finance().months).some(m => (m.transactions || []).some(t => t.account === id || t.toAccount === id));
    if (used) return showToast('No podés eliminar una cuenta que tiene movimientos.');
    const idx = finance().accounts.findIndex(a => a.id === id);
    const removed = finance().accounts[idx];
    finance().accounts = finance().accounts.filter(a => a.id !== id);
    persist();
    renderAll();
    showToast(`Cuenta "${removed.name}" eliminada.`, {
      undo: () => {
        finance().accounts.splice(idx, 0, removed);
        persist();
        renderAll();
      },
    });
  });

  $('base-income').addEventListener('change', () => {
    ensureMonth(currentMonthKey()).baseIncome = parseNum($('base-income').value);
    persist();
    renderAll();
  });
  $('savings-goal').addEventListener('change', () => {
    ensureMonth(currentMonthKey()).savingsGoal = parseNum($('savings-goal').value);
    persist();
    renderAll();
  });

  $('clear-month').onclick = () => {
    const key = currentMonthKey();
    const removed = finance().months[key];
    finance().months[key] = { baseIncome: 0, savingsGoal: 0, transactions: [] };
    persist();
    loadMonth();
    showToast('Mes actual limpiado.', {
      undo: () => {
        finance().months[key] = removed;
        persist();
        loadMonth();
      },
    });
  };

  $('prev-month').onclick = () => shiftMonth(-1);
  $('next-month').onclick = () => shiftMonth(1);
  ['month-select-month', 'month-select-year'].forEach(id =>
    $(id).addEventListener('change', () => {
      inheritRecurring();
      loadMonth();
    })
  );
}

export function initFinance() {
  if (initialized) return;
  initialized = true;
  populateMonthPicker();
  setMonthKey(currentMonthKeyNow());
  $('transaction-date').value = today();
  bindEvents();
  loadMonth();
}

export function showFinance() {
  renderAll();
}

export function refreshFinanceCharts() {
  if (!initialized) return;
  renderCharts();
}

export function refreshFinanceAll() {
  if (!initialized) return;
  renderAll();
}

export function openTransactionForm(type) {
  if (!initialized) return;
  resetTransactionForm();
  $('transaction-type').value = type;
  $('transaction-type').dispatchEvent(new Event('change'));
  $('transaction-form').scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  setTimeout(() => $('transaction-amount').focus(), prefersReducedMotion() ? 0 : 300);
}

// ---- Shared transaction-record API (used by cards / subscriptions modules) ----

export function getAllTransactionsFlat() {
  const out = [];
  Object.values(finance().months).forEach(m => (m.transactions || []).forEach(t => out.push(t)));
  return out;
}

export function addTransactionRecord(tx) {
  ensureMonth(monthKey(tx.date)).transactions.push(tx);
  persist();
  return tx;
}

export function getCardConsumption(cardId) {
  let sum = 0;
  getAllTransactionsFlat().forEach(t => {
    if (t.type === 'expense' && t.cardId === cardId) sum += t.amount;
    if (t.type === 'card_payment' && t.cardId === cardId) sum -= t.amount;
  });
  return Math.max(0, sum);
}

export function recordCardPayment({ cardId, accountId, amount, date, description }) {
  const tx = {
    id: uid(),
    type: 'card_payment',
    date,
    description: description || `Pago ${cardName(cardId)}`,
    amount,
    category: '',
    account: accountId,
    toAccount: '',
    cardId,
    recurring: false,
    installmentGroupId: null,
    installmentIndex: null,
    installmentTotal: null,
    created: Date.now(),
  };
  return addTransactionRecord(tx);
}

export function getAccountsList() {
  return finance().accounts;
}

export function getCardsList() {
  return finance().creditCards;
}

export function getCardName(id) {
  return cardName(id);
}

export function getSelectedMonthKey() {
  return currentMonthKey();
}

export function getTransactionsForMonth(key) {
  return monthTransactions(key);
}

// ---- Cross-module read helpers (used by Home / Calendar / Search) ----

export function getFinanceSummary() {
  const key = currentMonthKeyNow();
  const f = finance();
  const m = f.months[key] || { baseIncome: 0, savingsGoal: 0, transactions: [] };
  let income = m.baseIncome || 0;
  let expenses = 0;
  m.transactions.forEach(t => {
    if (t.type === 'income') income += t.amount;
    if (t.type === 'expense') expenses += t.amount;
  });
  const totalBalance = f.accounts.reduce((s, a) => s + accountBalance(a.id), 0);
  const savingsRate = income ? Math.round(((income - expenses) / income) * 100) : 0;
  return { totalBalance, income, expenses, savingsRate, savingsGoal: m.savingsGoal || 0, balance: income - expenses };
}

export function getFinanceInsights() {
  const insights = [];
  const key = currentMonthKeyNow();
  const f = finance();
  const cur = totals(key);
  const prevKey = shiftMonthKey(key, -1);
  if (f.months[prevKey]) {
    const prev = totals(prevKey);
    if (prev.expenses > 0) {
      const diffPct = Math.round(((cur.expenses - prev.expenses) / prev.expenses) * 100);
      if (diffPct !== 0) {
        insights.push(`Gastaste ${Math.abs(diffPct)}% ${diffPct < 0 ? 'menos' : 'más'} que el mes pasado.`);
      }
    }
  }
  const cats = expenseByCategory(key);
  const topEntry = Object.entries(cats).sort((a, b) => b[1] - a[1])[0];
  if (topEntry && cur.expenses > 0) {
    const pct = Math.round((topEntry[1] / cur.expenses) * 100);
    insights.push(`${topEntry[0]} representa el ${pct}% de tus gastos de este mes.`);
  }
  const m = f.months[key];
  if (m?.savingsGoal) {
    const missing = m.savingsGoal - cur.balance;
    if (missing > 0) insights.push(`Te faltan ${money(missing)} para alcanzar tu objetivo de ahorro.`);
    else insights.push(`Ya alcanzaste tu objetivo de ahorro de este mes.`);
  }
  const cardDebt = f.creditCards.reduce((s, c) => s + getCardConsumption(c.id), 0);
  if (cardDebt > 0) insights.push(`Tenés ${money(cardDebt)} acumulados en tarjetas de crédito.`);
  const owedToMe = f.debts.filter(d => d.type === 'owed' && d.status !== 'paid').reduce((s, d) => s + d.remainingAmount, 0);
  if (owedToMe > 0) insights.push(`Te deben ${money(owedToMe)} en total.`);
  const iOwe = f.debts.filter(d => d.type === 'owe' && d.status !== 'paid').reduce((s, d) => s + d.remainingAmount, 0);
  if (iOwe > 0) insights.push(`Debés ${money(iOwe)} en total.`);
  return insights;
}

export function getAccountBalance(id) {
  return accountBalance(id);
}
