import { getState } from './state.js';
import { initRouter, registerRoute, navigate } from './router.js';
import { initToast } from './components/toast.js';
import { initQuickAdd } from './components/quickadd.js';
import { initFinance, showFinance } from './modules/finance.js';
import { initCards, showCards } from './modules/cards.js';
import { initSubscriptions, showSubscriptions } from './modules/subscriptions.js';
import { initDebts, showDebts } from './modules/debts.js';
import { initReminders, showReminders } from './modules/reminders.js';
import { initCalendar, showCalendar } from './modules/calendar.js';
import { initHome, showHome } from './modules/home.js';
import { initSettings, showSettings, initTheme } from './modules/settings.js';
import { initImportExport } from './modules/importExport.js';
import { initNotifications } from './modules/notifications.js';
import { initSearch } from './modules/search.js';

function initNav() {
  document.querySelectorAll('[data-nav-link]').forEach(el => {
    el.addEventListener('click', () => navigate(el.dataset.navLink));
  });
}

function initMobileMenu() {
  const toggle = document.getElementById('mobile-menu-toggle');
  const sidebar = document.getElementById('sidebar');
  if (!toggle || !sidebar) return;
  toggle.addEventListener('click', () => {
    const open = sidebar.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(open));
  });
  document.querySelectorAll('[data-nav-link], #search-trigger').forEach(el =>
    el.addEventListener('click', () => {
      sidebar.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
    })
  );
}

const FINANCE_TAB_SHOW = {
  resumen: showFinance,
  tarjetas: showCards,
  suscripciones: showSubscriptions,
  deudas: showDebts,
};

function initFinanceTabs() {
  document.querySelectorAll('[data-finance-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.financeTab;
      document.querySelectorAll('[data-finance-tab]').forEach(b => b.classList.toggle('active', b === btn));
      document.querySelectorAll('[data-finance-subview]').forEach(el => el.classList.toggle('active', el.dataset.financeSubview === tab));
      FINANCE_TAB_SHOW[tab]?.();
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initToast();

  initHome();
  initFinance();
  initCards();
  initSubscriptions();
  initDebts();
  initReminders();
  initCalendar();
  initSettings();
  initQuickAdd();
  initImportExport();
  initSearch();
  initNotifications();

  initNav();
  initMobileMenu();
  initFinanceTabs();

  registerRoute('home', { onShow: showHome });
  registerRoute('finanzas', { onShow: showFinance });
  registerRoute('recordatorios', { onShow: showReminders });
  registerRoute('calendario', { onShow: showCalendar });
  registerRoute('configuracion', { onShow: showSettings });

  initRouter(getState().settings.defaultHome || 'home');
});
