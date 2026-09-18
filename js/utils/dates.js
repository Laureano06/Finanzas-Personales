export const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
export const MONTH_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
export const WEEKDAY_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export const today = () => new Date().toISOString().slice(0, 10);
export const monthKey = d => d.slice(0, 7);

export function currentMonthKeyNow() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function shiftMonthKey(key, delta) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function daysInMonth(year, month1to12) {
  return new Date(year, month1to12, 0).getDate();
}

export function addMonthsToDate(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const target = new Date(y, m - 1 + n, 1);
  const clampedDay = Math.min(d, daysInMonth(target.getFullYear(), target.getMonth() + 1));
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
}

export function addYearsToDate(dateStr, n) {
  return addMonthsToDate(dateStr, n * 12);
}

export function formatDateEs(dateStr) {
  return dateStr.split('-').reverse().join('/');
}

export function isToday(dateStr) {
  return dateStr === today();
}

export function isPast(dateStr) {
  return dateStr < today();
}
