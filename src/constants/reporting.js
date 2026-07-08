export const aylar = [
  'Yanvar',
  'Fevral',
  'Mart',
  'Aprel',
  'May',
  'İyun',
  'İyul',
  'Avqust',
  'Sentyabr',
  'Oktyabr',
  'Noyabr',
  'Dekabr',
];

export const cariIl = new Date().getFullYear();
export const cariAy = aylar[new Date().getMonth()];

export function toAmount(value) {
  return Number(value) || 0;
}

export function formatMoney(value) {
  return `${toAmount(value).toFixed(2)} ₼`;
}

export function getYearOptions(activeYear = cariIl) {
  const start = Math.min(cariIl - 2, Number(activeYear) || cariIl);
  const end = Math.max(cariIl + 3, Number(activeYear) || cariIl);

  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}
