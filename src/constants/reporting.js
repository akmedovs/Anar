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

export function formatDateAz(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || '');
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
}

export function netReportTotal(item) {
  return toAmount(item.kiraye) - toAmount(item.isiqPulu) - toAmount(item.suCem) - toAmount(item.wifi);
}

export function getYearOptions(activeYear = cariIl) {
  const start = Math.min(cariIl - 2, Number(activeYear) || cariIl);
  const end = Math.max(cariIl + 3, Number(activeYear) || cariIl);

  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

export function monthIndex(month) {
  return aylar.indexOf(String(month || '').trim());
}

export function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function summarizeVehicleSessions(events, il, ay = 'Bütün Aylar') {
  const sorted = [...events].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const openEntries = new Map();
  const sessions = [];
  const entryEvents = sorted.filter((item) => item.direction === 'entry');
  const year = Number(il) || cariIl;
  const selectedMonthIndex = ay === 'Bütün Aylar' ? -1 : monthIndex(ay);

  for (const event of sorted) {
    const plate = String(event.plate || '').trim().toUpperCase();
    if (!plate) continue;

    if (event.direction === 'entry') {
      openEntries.set(plate, event);
      continue;
    }

    const start = openEntries.get(plate);
    if (!start) continue;

    const durationMinutes = Math.max(0, (new Date(event.createdAt) - new Date(start.createdAt)) / 60000);
    sessions.push({
      plate,
      startAt: start.createdAt,
      endAt: event.createdAt,
      durationMinutes,
    });
    openEntries.delete(plate);
  }

  const filteredEntries = entryEvents.filter((item) => new Date(item.createdAt).getFullYear() === year);
  const periodEntries = filteredEntries.filter((item) => {
    if (selectedMonthIndex === -1) return true;
    return new Date(item.createdAt).getMonth() === selectedMonthIndex;
  });
  const periodSessions = sessions.filter((item) => {
    const start = new Date(item.startAt);
    if (start.getFullYear() !== year) return false;
    if (selectedMonthIndex !== -1 && start.getMonth() !== selectedMonthIndex) return false;
    return true;
  });
  const todayKey = localDateKey(new Date());
  const todayEntries = entryEvents.filter((item) => localDateKey(new Date(item.createdAt)) === todayKey);
  const monthCounts = aylar.map((monthName, index) => ({
    label: monthName.slice(0, 3),
    value: filteredEntries.filter((item) => new Date(item.createdAt).getMonth() === index).length,
  }));

  return {
    year,
    selectedMonthIndex,
    todayEntries,
    filteredEntries,
    periodEntries,
    sessions: periodSessions,
    over30Count: periodSessions.filter((item) => item.durationMinutes > 30).length,
    under30Count: periodSessions.filter((item) => item.durationMinutes <= 30).length,
    monthCounts,
  };
}
