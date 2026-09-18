import { navigate } from '../router.js';
import { openTransactionForm } from '../modules/finance.js';
import { openReminderDialog } from '../modules/reminders.js';
import { $ } from '../utils/dom.js';

function closeMenu() {
  $('quickadd-menu').classList.add('hide');
  $('quickadd-fab').setAttribute('aria-expanded', 'false');
}

function toggleMenu() {
  const willOpen = $('quickadd-menu').classList.contains('hide');
  $('quickadd-menu').classList.toggle('hide', !willOpen);
  $('quickadd-fab').setAttribute('aria-expanded', String(willOpen));
}

export function initQuickAdd() {
  $('quickadd-fab').addEventListener('click', toggleMenu);

  $('quickadd-menu').addEventListener('click', e => {
    const action = e.target.closest('[data-quickadd]')?.dataset.quickadd;
    if (!action) return;
    closeMenu();
    if (action === 'reminder') {
      navigate('recordatorios');
      openReminderDialog();
      return;
    }
    navigate('finanzas');
    setTimeout(() => openTransactionForm(action), 0);
  });

  document.addEventListener('click', e => {
    if (!$('quickadd-menu').contains(e.target) && e.target !== $('quickadd-fab')) closeMenu();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeMenu();
  });
}
