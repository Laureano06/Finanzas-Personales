import { getState, replaceState } from '../state.js';
import { StorageService, defaultState } from '../storage.js';
import { today } from '../utils/dates.js';
import { showToast } from '../components/toast.js';
import { confirmAction } from '../components/confirm.js';
import { refreshFinanceCharts } from './finance.js';
import { $ } from '../utils/dom.js';

let initialized = false;

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const btn = $('theme-toggle');
  if (btn) {
    btn.textContent = theme === 'light' ? 'Claro' : 'Oscuro';
    btn.setAttribute('aria-label', theme === 'light' ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro');
  }
  const select = $('settings-theme');
  if (select) select.value = theme;
}

export function initTheme() {
  const state = getState();
  const theme = state.settings.theme || (window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  applyTheme(theme);
}

function setTheme(theme) {
  getState().settings.theme = theme;
  StorageService.save(getState());
  applyTheme(theme);
  refreshFinanceCharts();
}

function bindEvents() {
  $('theme-toggle').addEventListener('click', () => {
    setTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
  });
  $('settings-theme').addEventListener('change', () => setTheme($('settings-theme').value));

  $('settings-notifications').addEventListener('change', () => {
    const state = getState();
    if ($('settings-notifications').checked && 'Notification' in window) {
      Notification.requestPermission().then(perm => {
        state.settings.notifications = perm === 'granted';
        $('settings-notifications').checked = state.settings.notifications;
        StorageService.save(state);
        showToast(state.settings.notifications ? 'Notificaciones activadas.' : 'Permiso de notificaciones denegado.');
      });
    } else {
      state.settings.notifications = false;
      StorageService.save(state);
    }
  });

  $('settings-export-backup').addEventListener('click', () => {
    const state = getState();
    const blob = new Blob([StorageService.exportBackupJSON(state)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `panel-personal-backup-${today()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Backup descargado.');
  });

  $('settings-import-input').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = StorageService.parseBackup(reader.result);
        const ok = await confirmAction({
          title: 'Importar backup',
          message: 'Esto reemplaza todos tus datos actuales por los del archivo. Se recomienda exportar un backup antes de continuar.',
          confirmText: 'Reemplazar datos',
        });
        if (!ok) return;
        replaceState(parsed);
        location.reload();
      } catch {
        showToast('El archivo no tiene un formato válido.');
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  });
  $('settings-import-btn').addEventListener('click', () => $('settings-import-input').click());

  $('settings-reset-app').addEventListener('click', async () => {
    const ok = await confirmAction({
      title: 'Reiniciar aplicación',
      message: 'Se borrarán todos tus datos (finanzas, cuentas, recordatorios). Esta acción no se puede deshacer.',
      confirmText: 'Borrar todo',
    });
    if (!ok) return;
    StorageService.resetAll();
    replaceState(defaultState());
    location.reload();
  });
}

export function initSettings() {
  if (initialized) return;
  initialized = true;
  bindEvents();
}

export function showSettings() {
  const state = getState();
  $('settings-theme').value = document.documentElement.dataset.theme || 'dark';
  $('settings-notifications').checked = !!state.settings.notifications;
}
