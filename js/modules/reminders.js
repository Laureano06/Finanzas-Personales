import { getState, persist } from '../state.js';
import { uid } from '../utils/id.js';
import { today, formatDateEs } from '../utils/dates.js';
import { showToast } from '../components/toast.js';
import { confirmAction } from '../components/confirm.js';
import { $, esc } from '../utils/dom.js';

const PRIORITY_LABEL = { low: 'Baja', medium: 'Media', high: 'Alta' };
let initialized = false;

function reminders() {
  return getState().reminders;
}
function categories() {
  return getState().reminderCategories;
}

function sortByDateTime(a, b) {
  return a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || '');
}

function populateCategorySelect() {
  $('reminder-category').innerHTML = categories()
    .map(c => `<option value="${esc(c)}">${esc(c)}</option>`)
    .join('');
}

function reminderCardHTML(r) {
  return `<article class="reminder-card priority-${r.priority} ${r.completed ? 'is-completed' : ''}" data-reminder-card="${r.id}">
    <label class="reminder-check"><input type="checkbox" data-toggle-reminder="${r.id}" ${r.completed ? 'checked' : ''} aria-label="Marcar ${esc(r.title)} como ${r.completed ? 'pendiente' : 'completado'}" /><span></span></label>
    <div class="reminder-main">
      <strong>${esc(r.title)}</strong>
      <div class="reminder-meta">
        <span>${formatDateEs(r.date)}${r.time ? ' · ' + r.time : ''}</span>
        <span class="chip chip-cat">${esc(r.category)}</span>
        <span class="chip chip-priority">${PRIORITY_LABEL[r.priority] || 'Media'}</span>
      </div>
      ${r.description ? `<p class="reminder-desc">${esc(r.description)}</p>` : ''}
    </div>
    <div class="reminder-actions">
      <button class="mini-btn" data-edit-reminder="${r.id}" aria-label="Editar ${esc(r.title)}">Editar</button>
      <button class="mini-btn" data-delete-reminder="${r.id}" aria-label="Eliminar ${esc(r.title)}">Eliminar</button>
    </div>
  </article>`;
}

function renderLists() {
  const all = reminders();
  const pending = all.filter(r => !r.completed).sort(sortByDateTime);
  const completed = all.filter(r => r.completed).sort((a, b) => sortByDateTime(b, a));

  const todayList = pending.filter(r => r.date === today());
  const upcomingList = pending.filter(r => r.date !== today());

  $('reminders-today-count').textContent = `${todayList.length} pendiente${todayList.length === 1 ? '' : 's'}`;
  $('reminders-today-list').innerHTML = todayList.length ? todayList.map(reminderCardHTML).join('') : '<p class="empty-copy">No hay recordatorios para hoy.</p>';
  $('reminders-upcoming-list').innerHTML = upcomingList.length ? upcomingList.map(reminderCardHTML).join('') : '<p class="empty-copy">No tenés próximos recordatorios.</p>';
  $('reminders-completed-list').innerHTML = completed.length ? completed.map(reminderCardHTML).join('') : '<p class="empty-copy">Todavía no completaste ningún recordatorio.</p>';
}

function resetForm() {
  $('reminder-form').reset();
  $('reminder-editing-id').value = '';
  $('reminder-date').value = today();
  populateCategorySelect();
  $('reminder-priority').value = 'medium';
}

export function openReminderDialog(reminder) {
  resetForm();
  if (reminder) {
    $('reminder-editing-id').value = reminder.id;
    $('reminder-title').value = reminder.title;
    $('reminder-description').value = reminder.description || '';
    $('reminder-date').value = reminder.date;
    $('reminder-time').value = reminder.time || '';
    $('reminder-priority').value = reminder.priority;
    $('reminder-category').value = reminder.category;
    $('reminder-dialog-title').textContent = 'Editar recordatorio';
  } else {
    $('reminder-dialog-title').textContent = 'Nuevo recordatorio';
  }
  $('reminder-dialog').showModal();
}

export function editReminderById(id) {
  const r = reminders().find(x => x.id === id);
  if (r) openReminderDialog(r);
}

function bindEvents() {
  $('reminder-new-btn').addEventListener('click', () => openReminderDialog());

  $('reminder-form').addEventListener('submit', e => {
    e.preventDefault();
    const title = $('reminder-title').value.trim();
    if (!title) return;
    const id = $('reminder-editing-id').value;
    const data = {
      id: id || uid(),
      title,
      description: $('reminder-description').value.trim(),
      date: $('reminder-date').value || today(),
      time: $('reminder-time').value || '',
      priority: $('reminder-priority').value,
      category: $('reminder-category').value,
      completed: false,
      createdAt: Date.now(),
    };
    const list = reminders();
    const idx = list.findIndex(r => r.id === id);
    if (idx >= 0) {
      data.completed = list[idx].completed;
      data.createdAt = list[idx].createdAt;
      list[idx] = data;
    } else {
      list.push(data);
    }
    persist();
    $('reminder-dialog').close();
    renderLists();
    showToast(idx >= 0 ? 'Recordatorio actualizado.' : 'Recordatorio creado.');
  });

  document.querySelectorAll('[data-reminder-list]').forEach(() => {});

  function handleListClick(e) {
    const editId = e.target.dataset.editReminder;
    const delId = e.target.dataset.deleteReminder;
    if (editId) return editReminderById(editId);
    if (delId) {
      const list = reminders();
      const idx = list.findIndex(r => r.id === delId);
      if (idx < 0) return;
      const [removed] = list.splice(idx, 1);
      persist();
      renderLists();
      showToast(`"${removed.title}" eliminado.`, {
        undo: () => {
          list.splice(idx, 0, removed);
          persist();
          renderLists();
        },
      });
    }
  }

  function handleListChange(e) {
    const id = e.target.dataset.toggleReminder;
    if (!id) return;
    const r = reminders().find(x => x.id === id);
    if (!r) return;
    r.completed = e.target.checked;
    persist();
    renderLists();
    showToast(r.completed ? `"${r.title}" completado.` : `"${r.title}" restaurado.`);
  }

  ['reminders-today-list', 'reminders-upcoming-list', 'reminders-completed-list'].forEach(id => {
    $(id).addEventListener('click', handleListClick);
    $(id).addEventListener('change', handleListChange);
  });

  $('reminders-clear-completed').addEventListener('click', async () => {
    const completed = reminders().filter(r => r.completed);
    if (!completed.length) return showToast('No hay recordatorios completados.');
    const ok = await confirmAction({
      title: 'Vaciar completados',
      message: `Se eliminarán ${completed.length} recordatorio${completed.length === 1 ? '' : 's'} completado${completed.length === 1 ? '' : 's'}.`,
      confirmText: 'Vaciar',
    });
    if (!ok) return;
    const state = getState();
    state.reminders = state.reminders.filter(r => !r.completed);
    persist();
    renderLists();
    showToast('Completados eliminados.');
  });
}

export function initReminders() {
  if (initialized) return;
  initialized = true;
  resetForm();
  bindEvents();
  renderLists();
}

export function showReminders() {
  populateCategorySelect();
  renderLists();
}

// ---- Cross-module read helpers ----

export function getReminderSummary() {
  const pending = reminders().filter(r => !r.completed);
  const todayPending = pending.filter(r => r.date === today());
  const next = [...pending].sort(sortByDateTime)[0] || null;
  return { pendingCount: pending.length, todayCount: todayPending.length, todayItems: todayPending.sort(sortByDateTime).slice(0, 5), next };
}

export function getRemindersForDate(dateStr) {
  return reminders().filter(r => r.date === dateStr);
}

export function getAllReminders() {
  return reminders();
}
