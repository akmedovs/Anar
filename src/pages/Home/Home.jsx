import { useEffect, useMemo, useState } from 'react';
import { FiDroplet, FiTable, FiDollarSign, FiActivity } from 'react-icons/fi';
import { reportsApi, vehicleEventsApi, washExpensesApi } from '../../api/reports';
import { aylar, cariIl, formatMoney, getYearOptions, localDateKey, netReportTotal, toAmount } from '../../constants/reporting';
import { theme } from '../../constants/theme';
import { useIsMobile } from '../../hooks/useIsMobile';

function Home() {
  const isMobile = useIsMobile();
  const [year, setYear] = useState(cariIl);
  const [month, setMonth] = useState('Bütün Aylar');
  const [showAftoyumaReport, setShowAftoyumaReport] = useState(false);
  const [showKirayeReport, setShowKirayeReport] = useState(false);
  const [showExpenseDetails, setShowExpenseDetails] = useState(false);
  const [reports, setReports] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [vehicleEvents, setVehicleEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const [rentRows, expenseRows, vehicleRows] = await Promise.all([
          reportsApi.list({ il: year }),
          washExpensesApi.list({ il: year }),
          vehicleEventsApi.list(),
        ]);

        if (!alive) return;

        setReports(rentRows);
        setExpenses(expenseRows);
        setVehicleEvents(vehicleRows);
      } catch (err) {
        if (!alive) return;
        setError(err.message || 'Məlumat alınmadı');
      } finally {
        if (alive) setLoading(false);
      }
    };

    load();
    const timer = window.setInterval(load, 30000);

    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [year]);

  const rentRows = useMemo(
    () => reports.filter((item) => String(item.ev || '').trim().toUpperCase() !== 'MOYKA'),
    [reports],
  );
  const selectedMonthRentRows = useMemo(() => rentRows.filter((item) => monthMatches(item.il, item.ay, year, month)), [rentRows, year, month]);
  const selectedMonthExpenseRows = useMemo(() => expenses.filter((item) => monthMatchesDate(item.expenseDate, year, month)), [expenses, year, month]);
  const groupedExpenseRows = useMemo(() => groupExpensesByDate(selectedMonthExpenseRows), [selectedMonthExpenseRows]);
  const selectedMonthVehicleRows = useMemo(
    () =>
      vehicleEvents
        .filter((item) => monthMatchesDate(item.createdAt, year, month))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    [month, vehicleEvents, year],
  );
  const todayKey = localDateKey(new Date());
  const todayVehicleRows = useMemo(
    () =>
      vehicleEvents
        .filter((item) => localDateKey(new Date(item.createdAt)) === todayKey)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    [todayKey, vehicleEvents],
  );
  const todayVehicleTimeline = useMemo(() => buildDailyVehicleTimeline(todayVehicleRows), [todayVehicleRows]);
  const todayVehicleSessions = useMemo(() => buildDailyVehicleSessions(todayVehicleRows), [todayVehicleRows]);

  const rentTotals = calcRentTotals(selectedMonthRentRows);
  const selectedMonthExpenseTotal = selectedMonthExpenseRows.reduce((sum, item) => sum + toAmount(item.amount), 0);
  const selectedMonthVehicleAmount = selectedMonthVehicleRows.reduce((sum, item) => sum + toAmount(item.amount), 0);
  const aftoyumaProfit = selectedMonthVehicleAmount - selectedMonthExpenseTotal;
  const todayVehicleCount = todayVehicleRows.filter((item) => item.direction === 'entry').length || todayVehicleRows.length;
  const todayUnder30 = todayVehicleSessions.filter((item) => item.durationMinutes <= 30).length;
  const todayOver30 = todayVehicleSessions.filter((item) => item.durationMinutes > 30).length;

  const yearlyRentBars = useMemo(() => buildMonthlyRentBars(reports, year), [reports, year]);
  const yearlyVehicleBars = useMemo(() => buildMonthlyVehicleBars(vehicleEvents, year), [vehicleEvents, year]);
  const topHouses = useMemo(() => buildHouseRows(selectedMonthRentRows).slice(0, 6), [selectedMonthRentRows]);

  return (
    <div style={isMobile ? wrapMobile : wrap}>
      <header style={isMobile ? heroMobile : hero}>
        <div style={{ minWidth: 0 }}>
          <div style={eyebrow}>DASHBOARD</div>
          <h1 style={isMobile ? titleMobile : title}>Report Panel</h1>
          <p style={sub}>Kirayə və Aftoyuma üçün ayrı bölmələr. Qrafiklər və günlük xülasə bir yerdə.</p>
        </div>

      </header>

      {loading && <div style={notice}>Məlumatlar yüklənir...</div>}
      {error && <div style={errorBox}>{error}</div>}

      <section style={navGrid}>
        <ToggleCard
          icon={<FiTable size={22} />}
          title="Kirayələr"
          desc="Aylıq cəm, evlər üzrə detal və ümumi analiz."
          active={showKirayeReport}
          onClick={() => {
            setShowKirayeReport((prev) => !prev);
            setShowAftoyumaReport(false);
          }}
        />
        <ToggleCard
          icon={<FiDroplet size={22} />}
          title="Aftoyuma"
          desc="Maşınlar, xərclər, su və işıq hesablamaları."
          active={showAftoyumaReport}
          onClick={() => {
            setShowAftoyumaReport((prev) => !prev);
            setShowKirayeReport(false);
          }}
        />
      </section>

      {showAftoyumaReport && (
        <>
          <section style={panel}>
            <SectionHead title="Günlük Baxış" note={`${year} / bugünkü maşınlar`} icon={<FiActivity />} />

            <div style={summaryGrid}>
              <Kpi label="Maşın sayı" value={String(todayVehicleCount)} tone="primary" />
              <Kpi label="30 dəq. az" value={String(todayUnder30)} tone="teal" />
              <Kpi label="30 dəq. çox" value={String(todayOver30)} tone="amber" />
            </div>

            <div style={tableWrap}>
              {todayVehicleTimeline.length ? (
                <div style={todayTable}>
                  <div style={todayHead}>
                    <span>Nömrə</span>
                    <span>Giriş / Çıxış</span>
                    <span>Müddət</span>
                  </div>
                  {todayVehicleTimeline.map((item) => (
                    <div key={`${item.plate}-${item.startAt || item.endAt || item.id}`} style={todayRow}>
                      <strong>{item.plate}</strong>
                      <span>
                        Giriş: {formatTime(item.startAt || item.createdAt)}
                        <br />
                        Çıxış: {item.endAt ? formatTime(item.endAt) : 'Gözləyir'}
                      </span>
                      <span>{item.durationMinutes != null ? `${Math.round(item.durationMinutes)} dəq.` : '-'}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={emptyBox}>Bugün maşın qeydi yoxdur.</div>
              )}
            </div>
          </section>

          <section style={panel}>
            <div style={monthlyHead}>
              <SectionHead title="Aylıq Baxış" note={`${year} / ${month}`} icon={<FiActivity />} />
              <div style={isMobile ? filterStackMobile : filterStack}>
                <Field label="İl">
                  <select value={year} onChange={(e) => setYear(Number(e.target.value) || cariIl)} style={isMobile ? controlMobile : control}>
                    {getYearOptions(year).map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Ay">
                  <select value={month} onChange={(e) => setMonth(e.target.value)} style={isMobile ? controlMobile : control}>
                    <option value="Bütün Aylar">Bütün Aylar</option>
                    {aylar.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>

            <div style={summaryGrid}>
              <Kpi
                label="Xərclər"
                value={formatMoney(selectedMonthExpenseTotal)}
                tone="amber"
                active={showExpenseDetails}
                onClick={() => setShowExpenseDetails((prev) => !prev)}
              />
              <Kpi label="Alver" value={formatMoney(selectedMonthVehicleAmount)} tone="primary" />
              <Kpi label="Qazanc" value={formatMoney(aftoyumaProfit)} tone="dark" />
              <Kpi label="Maşın sayı" value={String(selectedMonthVehicleRows.length)} tone="teal" />
            </div>

            {showExpenseDetails && (
              <section style={expenseSection}>
                {selectedMonthExpenseRows.length ? (
                  <div style={expenseList}>
                    {groupedExpenseRows.map((group) => (
                      <div key={group.key} style={expenseGroup}>
                        <div style={expenseGroupHeader}>
                          <strong style={expenseGroupTitle}>{group.label}</strong>
                          <span style={expenseGroupCount}>{group.items.length} xərc</span>
                        </div>

                        <div style={expenseCards}>
                          {group.items.map((item) => (
                            <div key={item.id} style={expenseCardRow}>
                              <div style={expenseCardTop}>
                                <div style={expenseName}>{item.title}</div>
                                <div style={expenseAmount}>{formatMoney(item.amount)}</div>
                              </div>
                              <div style={expenseCardBottom}>
                                <span style={expenseDate}>{formatExpenseDate(item.expenseDate || item.createdAt)}</span>
                                {item.note ? <span style={expenseNote}>{item.note}</span> : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={emptyExpense}>Bu filtrlərə uyğun xərc tapılmadı.</div>
                )}
              </section>
            )}

            <div>
              <BarChart bars={yearlyVehicleBars} label="maşın" title="İllik maşın statistikası" isMobile={isMobile} />
            </div>
          </section>
        </>
      )}

      {showKirayeReport && (
        <section style={panel}>
          <SectionHead title="Kirayə Report" note={`${year} / ${month}`} icon={<FiDollarSign />} />

          <div style={summaryGrid}>
            <Kpi label="Kirayə cəmi" value={formatMoney(rentTotals.kiraye)} tone="amber" />
            <Kpi label="İşıq" value={`${formatMoney(rentTotals.isiq)} · ${rentTotals.isiqKwt.toFixed(2)} Kwt`} tone="primary" />
            <Kpi label="Su" value={formatMoney(rentTotals.su)} tone="teal" />
            <Kpi label="İnternet" value={formatMoney(rentTotals.internet)} tone="dark" />
          </div>

          <div style={isMobile ? chartGridMobile : chartGrid}>
            <BarChart bars={yearlyRentBars} label="₼" title="İllik kirayə trendi" isMobile={isMobile} />
            <div style={miniPanel}>
              <div style={miniHead}>Seçilmiş ayın evləri</div>
              {topHouses.length ? (
                <div style={houseList}>
                  {topHouses.map((house) => (
                    <HouseRow key={house.ev} house={house} />
                  ))}
                </div>
              ) : (
                <div style={emptyBox}>Bu dövr üçün kirayə qeydi yoxdur.</div>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function ToggleCard({ icon, title, desc, active, onClick }) {
  return (
    <button type="button" onClick={onClick} style={{ ...navCard, cursor: 'pointer', textAlign: 'left' }}>
      <div style={{ ...navIcon, background: active ? theme.colors.softPrimary : theme.colors.surfaceSoft }}>{icon}</div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={navTitle}>{title}</div>
        <div style={navDesc}>{desc}</div>
      </div>
      <span style={cardBadge(active)}>{active ? 'Açıq' : 'Bağlı'}</span>
    </button>
  );
}

function SectionHead({ title, note, icon, action }) {
  return (
    <div style={sectionHead}>
      <div>
        <div style={sectionEyebrow}>
          {icon}
          <span>{title}</span>
        </div>
        <h2 style={sectionTitle}>{note}</h2>
      </div>
      {action}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

function Kpi({ label, value, tone = 'primary', active = false, onClick }) {
  const tones = {
    amber: { bg: '#fffbeb', border: '#fde68a', color: theme.colors.amber },
    primary: { bg: '#eff6ff', border: '#bfdbfe', color: theme.colors.primaryDark },
    teal: { bg: '#f0fdfa', border: '#99f6e4', color: theme.colors.teal },
    dark: { bg: '#0f172a', border: '#0f172a', color: '#fff' },
  };

  const current = tones[tone] || tones.primary;

  const cardStyle = {
    ...kpiCard,
    background: current.bg,
    borderColor: active ? current.color : current.border,
    cursor: onClick ? 'pointer' : 'default',
    boxShadow: active ? `0 0 0 2px ${current.color}22` : undefined,
  };

  const content = (
    <>
      <div style={{ ...kpiLabel, color: current.color }}>{label}</div>
      <div style={{ ...kpiValue, color: current.color }}>{value}</div>
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} style={cardStyle}>
        {content}
      </button>
    );
  }

  return <div style={cardStyle}>{content}</div>;
}

function BarChart({ bars, label, title, isMobile }) {
  const maxValue = Math.max(1, ...bars.map((bar) => bar.value));

  return (
    <div style={miniPanel}>
      <div style={miniHead}>{title}</div>
      <div style={barScroll}>
        <div style={isMobile ? barGridMobile : barGrid}>
          {bars.map((bar) => {
            const height = Math.max(6, (bar.value / maxValue) * 100);
            return (
              <div key={bar.label} style={barItem}>
                <div style={barValue}>{bar.value}</div>
                <div style={barTrack}>
                  <div style={{ ...barFill, height: `${height}%` }} />
                </div>
                <div style={barLabel}>{bar.label}</div>
              </div>
            );
          })}
        </div>
      </div>
      <div style={chartHint}>{label}</div>
    </div>
  );
}

function HouseRow({ house }) {
  return (
    <div style={houseRow}>
      <div>
        <strong>{house.ev}</strong>
        <div style={houseMeta}>{house.records} qeyd</div>
      </div>
      <strong style={houseTotal}>{formatMoney(house.total)}</strong>
    </div>
  );
}

function monthMatches(il, ay, selectedYear, selectedMonth) {
  return Number(il) === Number(selectedYear) && (selectedMonth === 'Bütün Aylar' || String(ay).trim() === selectedMonth);
}

function monthMatchesDate(value, selectedYear, selectedMonth) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date.getFullYear() === Number(selectedYear) && (selectedMonth === 'Bütün Aylar' || aylar[date.getMonth()] === selectedMonth);
}

function groupExpensesByDate(rows) {
  const groups = new Map();

  for (const item of rows) {
    const date = new Date(item.expenseDate || item.createdAt);
    if (Number.isNaN(date.getTime())) continue;

    const year = date.getFullYear();
    const monthIndex = date.getMonth();
    const day = String(date.getDate()).padStart(2, '0');
    const key = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${day}`;
    const label = `${aylar[monthIndex]}, ${day}`;

    if (!groups.has(key)) {
      groups.set(key, { key, label, items: [] });
    }

    groups.get(key).items.push(item);
  }

  return [...groups.values()].sort((a, b) => b.key.localeCompare(a.key));
}

function formatExpenseDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || '');
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
}

function buildHouseRows(rows) {
  const map = new Map();

  for (const row of rows) {
    const ev = String(row.ev || '').trim();
    if (!ev) continue;

    const current = map.get(ev) || {
      ev,
      kiraye: 0,
      isiq: 0,
      isiqKwt: 0,
      su: 0,
      internet: 0,
      total: 0,
      records: 0,
    };

    current.kiraye += toAmount(row.kiraye);
    current.isiq += toAmount(row.isiqPulu);
    current.isiqKwt += toAmount(row.serfiyyat);
    current.su += toAmount(row.suCem);
    current.internet += toAmount(row.wifi);
    current.total = current.kiraye + current.isiq + current.su + current.internet;
    current.records += 1;

    map.set(ev, current);
  }

  return Array.from(map.values()).sort((a, b) => a.ev.localeCompare(b.ev));
}

function buildMonthlyRentBars(rows, selectedYear) {
  return aylar.map((month, index) => {
    const total = rows
      .filter((row) => Number(row.il) === Number(selectedYear) && aylar[index] === String(row.ay).trim() && String(row.ev || '').trim().toUpperCase() !== 'MOYKA')
      .reduce((sum, row) => sum + netReportTotal(row), 0);

    return { label: month.slice(0, 3), value: Number(total.toFixed(0)) };
  });
}

function buildMonthlyVehicleBars(rows, selectedYear) {
  return aylar.map((month, index) => ({
    label: month.slice(0, 3),
    value: rows.filter((row) => new Date(row.createdAt).getFullYear() === Number(selectedYear) && new Date(row.createdAt).getMonth() === index).length,
  }));
}

function buildDailyVehicleSessions(rows) {
  const sorted = [...rows].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const openEntries = new Map();
  const sessions = [];

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

  return sessions;
}

function buildDailyVehicleTimeline(rows) {
  const sorted = [...rows].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const openEntries = new Map();
  const timeline = [];

  for (const event of sorted) {
    const plate = String(event.plate || '').trim().toUpperCase();
    if (!plate) continue;

    if (event.direction === 'entry') {
      openEntries.set(plate, event);
      continue;
    }

    const start = openEntries.get(plate);
    if (!start) {
      timeline.push({
        plate,
        startAt: null,
        endAt: event.createdAt,
        durationMinutes: null,
      });
      continue;
    }

    const durationMinutes = Math.max(0, (new Date(event.createdAt) - new Date(start.createdAt)) / 60000);
    timeline.push({
      plate,
      startAt: start.createdAt,
      endAt: event.createdAt,
      durationMinutes,
    });
    openEntries.delete(plate);
  }

  for (const [plate, start] of openEntries) {
    timeline.push({
      plate,
      startAt: start.createdAt,
      endAt: null,
      durationMinutes: null,
    });
  }

  return timeline.sort((a, b) => new Date((b.endAt || b.startAt)) - new Date((a.endAt || a.startAt)));
}

function calcRentTotals(rows) {
  return rows.reduce(
    (acc, item) => ({
      kiraye: acc.kiraye + toAmount(item.kiraye),
      isiq: acc.isiq + toAmount(item.isiqPulu),
      isiqKwt: acc.isiqKwt + toAmount(item.serfiyyat),
      su: acc.su + toAmount(item.suCem),
      internet: acc.internet + toAmount(item.wifi),
    }),
    { kiraye: 0, isiq: 0, isiqKwt: 0, su: 0, internet: 0 },
  );
}

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('az-AZ', { hour: '2-digit', minute: '2-digit' });
}

const wrap = { maxWidth: '1180px', margin: '0 auto', padding: '16px', color: theme.colors.text, display: 'grid', gap: '16px' };
const wrapMobile = { ...wrap, padding: '12px' };
const hero = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'end',
  gap: '12px',
  flexWrap: 'wrap',
  padding: '20px',
  borderRadius: '24px',
  background:
    'linear-gradient(135deg, rgba(255,253,249,0.98) 0%, rgba(248,243,234,0.98) 100%)',
  border: `1px solid ${theme.colors.border}`,
  boxShadow: '0 20px 55px rgba(15, 23, 42, 0.08)',
};
const heroMobile = { ...hero, padding: '14px', alignItems: 'stretch', flexDirection: 'column' };
const eyebrow = { fontSize: '11px', fontWeight: 900, color: theme.colors.amber, letterSpacing: '0.14em', marginBottom: '8px' };
const title = { margin: 0, fontSize: '30px', color: theme.colors.text, letterSpacing: '-0.03em' };
const titleMobile = { ...title, fontSize: '22px' };
const sub = { margin: '8px 0 0', color: theme.colors.muted, fontSize: '13px', lineHeight: 1.6, maxWidth: '72ch' };
const filterStack = { display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'end' };
const filterStackMobile = { display: 'grid', gap: '10px', width: '100%' };
const labelStyle = { display: 'block', marginBottom: '5px', fontSize: '12px', fontWeight: 700, color: theme.colors.muted };
const control = {
  width: '150px',
  padding: '10px 12px',
  borderRadius: '12px',
  border: `1px solid ${theme.colors.border}`,
  background: 'linear-gradient(180deg, #ffffff 0%, #faf7f2 100%)',
  fontSize: '14px',
  boxSizing: 'border-box',
  color: theme.colors.text,
  boxShadow: '0 10px 24px rgba(15, 23, 42, 0.04)',
};
const controlMobile = { ...control, width: '100%' };
const navGrid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' };
const navCard = {
  display: 'flex',
  alignItems: 'center',
  gap: '14px',
  padding: '16px',
  borderRadius: '18px',
  background: 'linear-gradient(180deg, #fffdf9 0%, #fbf7f1 100%)',
  border: `1px solid ${theme.colors.border}`,
  textDecoration: 'none',
  color: theme.colors.text,
  boxShadow: '0 16px 38px rgba(15, 23, 42, 0.06)',
};
const navIcon = {
  width: '46px',
  height: '46px',
  borderRadius: '14px',
  display: 'grid',
  placeItems: 'center',
  background: 'linear-gradient(180deg, rgba(15,118,110,0.12), rgba(15,118,110,0.06))',
  color: theme.colors.primaryDark,
  flex: '0 0 auto',
};
const navTitle = { fontSize: '16px', fontWeight: 900, marginBottom: '4px' };
const navDesc = { fontSize: '13px', color: theme.colors.muted, lineHeight: 1.4 };
const panel = {
  padding: '16px',
  borderRadius: '22px',
  background: 'linear-gradient(180deg, rgba(255,253,249,0.98), rgba(251,247,240,0.98))',
  border: `1px solid ${theme.colors.border}`,
  boxShadow: '0 18px 44px rgba(15, 23, 42, 0.06)',
  display: 'grid',
  gap: '14px',
};
const sectionHead = { display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' };
const monthlyHead = { display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' };
const sectionEyebrow = { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', fontWeight: 900, color: theme.colors.amber, letterSpacing: '0.14em', marginBottom: '4px' };
const sectionTitle = { margin: 0, fontSize: '18px', color: theme.colors.text };
const summaryGrid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px' };
const kpiCard = {
  padding: '12px',
  borderRadius: '16px',
  border: `1px solid ${theme.colors.border}`,
  boxShadow: '0 12px 28px rgba(15, 23, 42, 0.04)',
};
const kpiLabel = { fontSize: '11px', fontWeight: 800, letterSpacing: '0.02em' };
const kpiValue = { fontSize: '17px', fontWeight: 900, marginTop: '5px', lineHeight: 1.25 };
const chartGrid = { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: '12px', alignItems: 'start' };
const chartGridMobile = { ...chartGrid, gridTemplateColumns: '1fr' };
const miniPanel = {
  padding: '14px',
  borderRadius: '16px',
  background: 'linear-gradient(180deg, rgba(255,255,255,0.92), rgba(250,246,239,0.92))',
  border: `1px solid ${theme.colors.border}`,
  display: 'grid',
  gap: '10px',
};
const miniHead = { fontSize: '14px', fontWeight: 900, color: theme.colors.text };
const houseList = { display: 'grid', gap: '8px' };
const houseRow = { display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid rgba(229, 218, 204, 0.7)` };
const houseMeta = { fontSize: '12px', color: theme.colors.muted, marginTop: '4px' };
const houseTotal = { fontSize: '14px', color: theme.colors.success };
const tableWrap = { marginTop: '12px' };
const todayTable = { display: 'grid', gap: '8px' };
const todayHead = { display: 'grid', gridTemplateColumns: '1fr 0.8fr 0.8fr', gap: '8px', padding: '10px 12px', borderRadius: '12px', background: 'rgba(15,118,110,0.06)', color: theme.colors.muted, fontSize: '12px', fontWeight: 800 };
const todayRow = { display: 'grid', gridTemplateColumns: '1fr 0.8fr 0.8fr', gap: '8px', padding: '10px 12px', borderRadius: '12px', background: '#fffefc', border: `1px solid ${theme.colors.border}`, alignItems: 'center', fontSize: '13px', boxShadow: '0 10px 22px rgba(15, 23, 42, 0.03)' };
const barScroll = { overflowX: 'auto' };
const barGrid = { display: 'grid', gridTemplateColumns: 'repeat(12, minmax(48px, 1fr))', gap: '8px', alignItems: 'end', minWidth: '620px' };
const barGridMobile = { ...barGrid, minWidth: '760px' };
const barItem = { display: 'grid', gap: '6px', justifyItems: 'center' };
const barTrack = { width: '100%', height: '150px', borderRadius: '12px', background: 'linear-gradient(180deg, rgba(255,255,255,0.88) 0%, rgba(241,233,221,0.9) 100%)', border: `1px solid ${theme.colors.border}`, display: 'flex', alignItems: 'flex-end', padding: '8px' };
const barFill = { width: '100%', borderRadius: '8px', background: 'linear-gradient(180deg, #0f766e 0%, #b45309 100%)', minHeight: '6px' };
const barValue = { fontSize: '11px', fontWeight: 900, color: theme.colors.primaryDark };
const barLabel = { fontSize: '11px', color: theme.colors.muted, fontWeight: 700 };
const chartHint = { textAlign: 'right', fontSize: '12px', color: theme.colors.muted };
const notice = { padding: '12px 14px', borderRadius: theme.radius.md, background: 'rgba(15,118,110,0.08)', border: '1px solid rgba(15,118,110,0.16)', color: theme.colors.primaryDark, fontSize: '13px' };
const errorBox = { padding: '12px 14px', borderRadius: theme.radius.md, background: 'rgba(194,65,12,0.08)', border: '1px solid rgba(194,65,12,0.16)', color: '#9a3412', fontSize: '13px' };
const emptyBox = { padding: '18px', textAlign: 'center', color: theme.colors.muted, background: theme.colors.surfaceSoft, borderRadius: theme.radius.md, border: `1px dashed ${theme.colors.border}` };
const expenseSection = { display: 'grid', gap: '12px', paddingTop: '2px' };
const expenseList = { display: 'grid', gap: '12px' };
const expenseGroup = {
  padding: '12px',
  borderRadius: '16px',
  border: `1px solid ${theme.colors.border}`,
  background: '#fffefc',
  boxShadow: '0 10px 22px rgba(15, 23, 42, 0.03)',
};
const expenseGroupHeader = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' };
const expenseGroupTitle = { color: theme.colors.text, fontSize: '15px' };
const expenseGroupCount = { fontSize: '12px', color: theme.colors.muted, fontWeight: 700 };
const expenseCards = { display: 'grid', gap: '10px' };
const expenseCardRow = {
  padding: '12px',
  borderRadius: '14px',
  background: 'linear-gradient(180deg, #ffffff 0%, #faf7f2 100%)',
  border: `1px solid ${theme.colors.border}`,
};
const expenseCardTop = { display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'start', flexWrap: 'wrap' };
const expenseCardBottom = { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' };
const expenseName = { fontSize: '14px', fontWeight: 800, color: theme.colors.text };
const expenseAmount = { fontSize: '15px', fontWeight: 900, color: theme.colors.primaryDark };
const expenseDate = { fontSize: '12px', color: theme.colors.muted, fontWeight: 700 };
const expenseNote = { fontSize: '12px', color: theme.colors.text, background: 'rgba(255,255,255,0.85)', padding: '4px 8px', borderRadius: '999px', border: `1px solid ${theme.colors.border}` };
const emptyExpense = { padding: '18px', borderRadius: theme.radius.md, border: `1px dashed ${theme.colors.border}`, color: theme.colors.muted, background: theme.colors.surfaceSoft };
const cardBadge = (active) => ({
  padding: '6px 10px',
  borderRadius: theme.radius.pill,
  fontSize: '11px',
  fontWeight: 800,
  color: active ? theme.colors.primaryDark : theme.colors.muted,
  background: active ? 'rgba(15,118,110,0.08)' : theme.colors.surfaceSoft,
  border: `1px solid ${active ? 'rgba(15,118,110,0.14)' : theme.colors.border}`,
  whiteSpace: 'nowrap',
});

export default Home;
