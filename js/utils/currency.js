const fmt = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });

export const money = v => fmt.format(Number(v) || 0);
export const moneyText = n => (Number(n) ? '$' + Number(n).toLocaleString('es-AR') : '');
export const parseNum = v => Number(String(v ?? '').replace(/\D/g, '')) || 0;

export function formatCurrencyInput(el) {
  const v = parseNum(el.value);
  el.value = v ? moneyText(v) : '';
}
