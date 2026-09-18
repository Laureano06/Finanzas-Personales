import { money } from '../utils/currency.js';
import { today } from '../utils/dates.js';
import { showToast } from '../components/toast.js';
import { getAllTransactionsFlat, addTransactionRecord, getAccountsList, getCardsList, getSelectedMonthKey, getTransactionsForMonth, refreshFinanceAll } from './finance.js';
import { getState } from '../state.js';
import { uid } from '../utils/id.js';
import { $, esc } from '../utils/dom.js';

const TYPE_LABEL = { expense: 'Gasto', income: 'Ingreso', transfer: 'Transferencia', card_payment: 'Pago de tarjeta' };
const TYPE_FROM_LABEL = { gasto: 'expense', expense: 'expense', ingreso: 'income', income: 'income', transferencia: 'transfer', transfer: 'transfer' };

let initialized = false;
let previewRows = [];

// ---- Export ----

function csvField(v) {
  const s = String(v ?? '');
  return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function buildCSV(transactions) {
  const accounts = getAccountsList();
  const cards = getCardsList();
  const header = ['Fecha', 'Tipo', 'Descripción', 'Categoría', 'Cuenta', 'Tarjeta', 'Monto', 'Recurrente', 'Mes', 'Año'];
  const rows = transactions.map(t => {
    const accName = t.account ? accounts.find(a => a.id === t.account)?.name || '' : '';
    const cardNameStr = t.cardId ? cards.find(c => c.id === t.cardId)?.name || '' : '';
    const [y, m] = t.date.split('-');
    return [t.date, TYPE_LABEL[t.type] || t.type, t.description, t.category || '', accName, cardNameStr, t.amount, t.recurring ? 'Sí' : 'No', m, y];
  });
  return [header, ...rows].map(r => r.map(csvField).join(',')).join('\n');
}

function downloadCSV(content, filename) {
  const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportCurrentMonth() {
  const key = getSelectedMonthKey();
  const rows = [...getTransactionsForMonth(key)].sort((a, b) => a.date.localeCompare(b.date));
  if (!rows.length) return showToast('No hay movimientos en el mes seleccionado.');
  downloadCSV(buildCSV(rows), `movimientos-${key}.csv`);
  showToast('CSV exportado.');
}

function exportAll() {
  const rows = [...getAllTransactionsFlat()].sort((a, b) => a.date.localeCompare(b.date));
  if (!rows.length) return showToast('Todavía no hay movimientos para exportar.');
  downloadCSV(buildCSV(rows), `movimientos-todos-${today()}.csv`);
  showToast('CSV exportado.');
}

// ---- Import ----

function parseCSVText(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',' || c === ';') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c === '\r') {
      // ignore
    } else field += c;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter(r => r.some(cell => cell.trim() !== ''));
}

function normalizeHeader(h) {
  return h
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

const HEADER_ALIASES = {
  date: ['fecha', 'date'],
  description: ['descripcion', 'description', 'detalle', 'concepto'],
  amount: ['monto', 'amount', 'importe', 'valor'],
  category: ['categoria', 'category'],
  type: ['tipo', 'type'],
};

function detectColumns(headerRow) {
  const normalized = headerRow.map(normalizeHeader);
  const map = {};
  Object.entries(HEADER_ALIASES).forEach(([key, aliases]) => {
    const idx = normalized.findIndex(h => aliases.includes(h));
    if (idx >= 0) map[key] = idx;
  });
  return map;
}

function parseAmount(raw) {
  let s = String(raw ?? '').trim();
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith('-')) {
    negative = true;
    s = s.slice(1);
  }
  s = s.replace(/[^\d.,]/g, '');
  if (s.includes(',') && s.includes('.')) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  }
  const num = Math.round(parseFloat(s) || 0);
  return negative ? -num : num;
}

function parseDate(raw) {
  const s = String(raw ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // es-AR dates are day-first (DD/MM/YYYY), matching the app's own date formatting elsewhere.
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return today();
}

function findExistingCategory(name) {
  const budgets = Object.keys(getState().finance.budgets);
  const match = budgets.find(b => b.toLowerCase() === String(name ?? '').trim().toLowerCase());
  return match || budgets[0] || 'Otros';
}

function isDuplicate(date, description, amount) {
  return getAllTransactionsFlat().some(t => t.date === date && t.amount === amount && t.description.trim().toLowerCase() === description.trim().toLowerCase());
}

function buildPreviewRows(rows, columns) {
  return rows.slice(1).map(cells => {
    const rawDate = columns.date != null ? cells[columns.date] : '';
    const description = (columns.description != null ? cells[columns.description] : '').trim() || 'Movimiento importado';
    const amountRaw = columns.amount != null ? cells[columns.amount] : '0';
    const signedAmount = parseAmount(amountRaw);
    const amount = Math.abs(signedAmount);
    const date = parseDate(rawDate);
    // No explicit type column: fall back to the sign convention most bank/CSV exports use
    // (negative = money out, positive = money in) rather than guessing from the description.
    let type = signedAmount < 0 ? 'expense' : 'income';
    if (columns.type != null) {
      const t = TYPE_FROM_LABEL[normalizeHeader(cells[columns.type] || '')];
      if (t) type = t;
    }
    const category = columns.category != null ? findExistingCategory(cells[columns.category]) : findExistingCategory('');
    return {
      id: uid(),
      date,
      description,
      amount: amount || 0,
      type,
      category,
      duplicate: isDuplicate(date, description, amount || 0),
    };
  });
}

function renderPreview() {
  const budgets = Object.keys(getState().finance.budgets);
  $('import-summary').textContent = `${previewRows.length} fila${previewRows.length === 1 ? '' : 's'} detectada${previewRows.length === 1 ? '' : 's'}${
    previewRows.some(r => r.duplicate) ? ' · algunas parecen duplicadas y vienen desmarcadas' : ''
  }`;
  $('import-table-body').innerHTML = previewRows
    .map(
      (r, i) => `<tr class="${r.duplicate ? 'is-duplicate' : ''}">
        <td><input type="checkbox" data-import-include="${i}" ${r.duplicate ? '' : 'checked'} aria-label="Incluir fila ${i + 1}" /></td>
        <td>${r.date.split('-').reverse().join('/')}</td>
        <td>${esc(r.description)}${r.duplicate ? ' <span class="chip">Posible duplicado</span>' : ''}</td>
        <td>${money(r.amount)}</td>
        <td><select data-import-category="${i}">${budgets.map(b => `<option ${b === r.category ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select></td>
      </tr>`
    )
    .join('');
}

function openPreview(rows, columns) {
  if (columns.date == null || columns.description == null || columns.amount == null) {
    showToast('No se pudo detectar el formato del archivo (fecha, descripción o monto).');
    return;
  }
  previewRows = buildPreviewRows(rows, columns);
  if (!previewRows.length) {
    showToast('No se encontraron filas para importar.');
    return;
  }
  const accounts = getAccountsList();
  $('import-account').innerHTML = accounts.map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join('');
  renderPreview();
  $('import-dialog').showModal();
}

function bindEvents() {
  $('export-current-month').addEventListener('click', exportCurrentMonth);
  $('export-all').addEventListener('click', exportAll);

  $('import-csv-btn').addEventListener('click', () => $('import-csv-input').click());
  $('import-csv-input').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const rows = parseCSVText(String(reader.result));
        if (!rows.length) return showToast('El archivo está vacío.');
        const columns = detectColumns(rows[0]);
        openPreview(rows, columns);
      } catch {
        showToast('No se pudo leer el archivo CSV.');
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  });

  $('import-table-body').addEventListener('change', e => {
    const catIdx = e.target.dataset.importCategory;
    if (catIdx != null && e.target.tagName === 'SELECT') previewRows[catIdx].category = e.target.value;
    const incIdx = e.target.dataset.importInclude;
    if (incIdx != null) previewRows[incIdx].included = e.target.checked;
  });

  $('import-confirm').addEventListener('click', () => {
    const accountId = $('import-account').value;
    if (!accountId) return showToast('Creá una cuenta primero.');
    const checkboxes = [...$('import-table-body').querySelectorAll('[data-import-include]')];
    let count = 0;
    checkboxes.forEach(cb => {
      if (!cb.checked) return;
      const row = previewRows[cb.dataset.importInclude];
      addTransactionRecord({
        id: uid(),
        type: row.type,
        date: row.date,
        description: row.description,
        amount: row.amount,
        category: row.category,
        account: accountId,
        toAccount: '',
        cardId: '',
        recurring: false,
        installmentGroupId: null,
        installmentIndex: null,
        installmentTotal: null,
        created: Date.now(),
      });
      count++;
    });
    $('import-dialog').close();
    refreshFinanceAll();
    showToast(count ? `${count} movimiento${count === 1 ? '' : 's'} importado${count === 1 ? '' : 's'}.` : 'No se importó ninguna fila.');
  });
}

export function initImportExport() {
  if (initialized) return;
  initialized = true;
  bindEvents();
}
