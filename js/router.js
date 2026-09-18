const routes = new Map();
let current = null;

const TITLES = {
  home: 'Inicio',
  finanzas: 'Finanzas',
  recordatorios: 'Recordatorios',
  calendario: 'Calendario',
  configuracion: 'Configuración',
};

export function registerRoute(name, { onEnter, onShow } = {}) {
  routes.set(name, { onEnter, onShow, entered: false });
}

export function navigate(name) {
  if (!routes.has(name)) name = 'home';

  document.querySelectorAll('[data-view]').forEach(el => {
    el.classList.toggle('active', el.dataset.view === name);
  });
  document.querySelectorAll('[data-nav-link]').forEach(el => {
    el.classList.toggle('active', el.dataset.navLink === name);
  });

  const route = routes.get(name);
  if (route) {
    if (!route.entered && route.onEnter) {
      route.onEnter();
      route.entered = true;
    }
    if (route.onShow) route.onShow();
  }

  current = name;
  if (location.hash !== `#/${name}`) location.hash = `#/${name}`;
  document.title = `${TITLES[name] || ''} · Panel personal`.trim();

  const main = document.getElementById('app-main');
  if (main) main.scrollTop = 0;
}

export function initRouter(defaultRoute = 'home') {
  window.addEventListener('hashchange', () => {
    const name = location.hash.replace('#/', '') || defaultRoute;
    navigate(name);
  });
  const initial = location.hash.replace('#/', '') || defaultRoute;
  navigate(initial);
}

export function getCurrentRoute() {
  return current;
}
