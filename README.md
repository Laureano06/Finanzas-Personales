# Finanzas Personales

A personal finance and reminders app built with **plain JavaScript**: no framework, no build step.

**Live demo:** https://finanzas-personales-xi-ashy.vercel.app

## Features

- Income, expenses and transfers across multiple accounts (cash, bank, Mercado Pago)
- Monthly budgets by category
- Credit cards, subscriptions and debts tracking
- Reminders, calendar and due-date notifications
- CSV import and export
- Global search, quick-add and light/dark theme
- All data stays in the browser (localStorage), with versioned migrations from older formats

## How it's built

The app is a single page split into ES modules, with a small architecture written from scratch:

```
js/
  router.js      view router: shows/hides [data-view] sections, lazy init per view
  state.js       central store with subscribe/persist (observer pattern)
  storage.js     localStorage persistence + migration from previous schema versions
  modules/       one module per feature (finance, cards, debts, reminders, calendar...)
  components/    reusable UI pieces (toast, confirm dialog, quick-add)
  utils/         dates, currency formatting, DOM helpers, id generation
```

## Run locally

No install needed. Serve the folder with any static server:

```bash
npx serve .
```

## Tech

JavaScript (ES modules) · HTML · CSS · localStorage · Notifications API
