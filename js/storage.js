const STORAGE_KEY = 'personalAppV6';
const LEGACY_KEY = 'finanzasV5';
const LEGACY_THEME_KEY = 'finanzasV5-theme';
const LEGACY_BACKUP_KEY = 'finanzasV5_backup_pre_v6';
const NOTIFIED_LOG_KEY = 'personalAppV6_notified';

const DEFAULT_CATEGORIES = ['Alquiler', 'Comida', 'Servicios', 'Entretenimiento', 'Transporte', 'Salud', 'Educación', 'Compras', 'Otros'];
const DEFAULT_REMINDER_CATEGORIES = ['Personal', 'Trabajo', 'Estudio', 'Finanzas', 'Deporte', 'Otro'];

function defaultFinance() {
  return {
    accounts: [
      { id: 'cash', name: 'Efectivo', opening: 0 },
      { id: 'bank', name: 'Banco', opening: 0 },
      { id: 'mp', name: 'Mercado Pago', opening: 0 },
    ],
    months: {},
    budgets: Object.fromEntries(DEFAULT_CATEGORIES.map(c => [c, 0])),
    creditCards: [],
    subscriptions: [],
    debts: [],
  };
}

function defaultState() {
  return {
    version: 6,
    settings: {
      currency: 'ARS',
      locale: 'es-AR',
      theme: null,
      notifications: false,
      defaultHome: 'home',
    },
    finance: defaultFinance(),
    reminders: [],
    reminderCategories: [...DEFAULT_REMINDER_CATEGORIES],
  };
}

function isValidFinance(f) {
  return !!f && typeof f === 'object' && Array.isArray(f.accounts) && typeof f.months === 'object' && f.months !== null;
}

function migrateFromV5() {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const legacy = JSON.parse(raw);
    if (!isValidFinance(legacy)) return null;

    if (!localStorage.getItem(LEGACY_BACKUP_KEY)) {
      localStorage.setItem(LEGACY_BACKUP_KEY, raw);
    }

    const state = defaultState();
    state.finance = {
      accounts: legacy.accounts?.length ? legacy.accounts : defaultFinance().accounts,
      months: legacy.months || {},
      budgets: legacy.budgets && Object.keys(legacy.budgets).length ? legacy.budgets : defaultFinance().budgets,
    };
    const theme = localStorage.getItem(LEGACY_THEME_KEY);
    if (theme === 'light' || theme === 'dark') state.settings.theme = theme;
    return state;
  } catch {
    return null;
  }
}

function mergeWithDefaults(parsed) {
  const base = defaultState();
  return {
    ...base,
    ...parsed,
    settings: { ...base.settings, ...(parsed.settings || {}) },
    finance: {
      ...base.finance,
      ...(parsed.finance || {}),
      accounts: parsed.finance?.accounts?.length ? parsed.finance.accounts : base.finance.accounts,
      months: parsed.finance?.months || {},
      budgets: parsed.finance?.budgets && Object.keys(parsed.finance.budgets).length ? parsed.finance.budgets : base.finance.budgets,
      creditCards: Array.isArray(parsed.finance?.creditCards) ? parsed.finance.creditCards : [],
      subscriptions: Array.isArray(parsed.finance?.subscriptions) ? parsed.finance.subscriptions : [],
      debts: Array.isArray(parsed.finance?.debts) ? parsed.finance.debts : [],
    },
    reminders: Array.isArray(parsed.reminders) ? parsed.reminders : [],
    reminderCategories: parsed.reminderCategories?.length ? parsed.reminderCategories : [...DEFAULT_REMINDER_CATEGORIES],
  };
}

export const StorageService = {
  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        return mergeWithDefaults(JSON.parse(raw));
      }
      const migrated = migrateFromV5();
      if (migrated) {
        this.save(migrated);
        return migrated;
      }
      const fresh = defaultState();
      this.save(fresh);
      return fresh;
    } catch {
      return defaultState();
    }
  },

  save(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  },

  exportBackupJSON(state) {
    return JSON.stringify(state, null, 2);
  },

  parseBackup(text) {
    const data = JSON.parse(text);
    if (!isValidFinance(data.finance)) throw new Error('Formato de backup inválido.');
    return mergeWithDefaults(data);
  },

  getNotifiedLog() {
    try {
      return JSON.parse(localStorage.getItem(NOTIFIED_LOG_KEY) || '[]');
    } catch {
      return [];
    }
  },

  saveNotifiedLog(keys) {
    // Keep the log from growing forever across months of daily use.
    localStorage.setItem(NOTIFIED_LOG_KEY, JSON.stringify(keys.slice(-500)));
  },

  clearNotifiedLog() {
    localStorage.removeItem(NOTIFIED_LOG_KEY);
  },

  resetAll() {
    localStorage.removeItem(STORAGE_KEY);
    this.clearNotifiedLog();
  },
};

export { defaultState, DEFAULT_CATEGORIES, DEFAULT_REMINDER_CATEGORIES };
