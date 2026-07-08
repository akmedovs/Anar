import { useEffect, useMemo, useState } from 'react';
import { reportsApi, vehicleEventsApi, washExpensesApi, washWaterApi } from '../../api/reports';
import { aylar, cariIl, formatMoney, getYearOptions, netReportTotal, toAmount } from '../../constants/reporting';
import { theme } from '../../constants/theme';

function Home() {
  const [data, setData] = useState([]);
  const [secilenIl, setSecilenIl] = useState(cariIl);
  const [secilenAy, setSecilenAy] = useState('Bütün Aylar');
  const [secilenBaxis, setSecilenBaxis] = useState('all');
  const [error, setError] = useState('');
  const [vehicleEvents, setVehicleEvents] = useState([]);
  const [washExpenses, setWashExpenses] = useState([]);
  const [waterReadings, setWaterReadings] = useState([]);

  useEffect(() => {
    const fetchHomeData = async () => {
      try {
        setError('');
        setData(await reportsApi.list({ il: secilenIl }));
      } catch (err) {
        setError(err.message);
        setData([]);
        console.error('Backend-den melumat alinarken xeta:', err.message);
      }
    };

    fetchHomeData();
  }, [secilenIl]);

  useEffect(() => {
    const fetchWashData = async () => {
      try {
        const [events, expenses, readings] = await Promise.all([
          vehicleEventsApi.list(),
          washExpensesApi.list({ il: secilenIl }),
          washWaterApi.list({ il: secilenIl }),
        ]);
        setVehicleEvents(events);
        setWashExpenses(expenses);
        setWaterReadings(readings);
      } catch (err) {
        console.error('Aftoyuma dashboard məlumatları alınmadı:', err.message);
      }
    };

    fetchWashData();
  }, [secilenIl]);

  const filtered = useMemo(() => {
    return data.filter((item) => {
      const monthMatch = secilenAy === 'Bütün Aylar' || String(item.ay).trim() === secilenAy;
      const typeMatch =
        secilenBaxis === 'all' ||
        (secilenBaxis === 'rent' && !isWashReport(item)) ||
        (secilenBaxis === 'wash' && isWashReport(item));
      return monthMatch && typeMatch;
    });
  }, [data, secilenAy, secilenBaxis]);

  const rentData = useMemo(() => filtered.filter((item) => !isWashReport(item)), [filtered]);
  const washData = useMemo(() => filtered.filter(isWashReport), [filtered]);
  const totals = useMemo(() => summarize(filtered), [filtered]);
  const rentTotals = useMemo(() => summarize(rentData), [rentData]);
  const washTotals = useMemo(() => summarize(washData), [washData]);

  const monthlyTrend = useMemo(() => {
    const source = data.filter((item) => {
      if (secilenBaxis === 'rent') return !isWashReport(item);
      if (secilenBaxis === 'wash') return isWashReport(item);
      return true;
    });
    return aylar.map((ay) => {
      const rows = source.filter((item) => item.ay === ay);
      return {
        label: ay.slice(0, 3),
        value: rows.reduce((sum, item) => sum + netReportTotal(item), 0),
      };
    });
  }, [data, secilenBaxis]);

  const houseTotals = useMemo(() => buildHouseTotals(rentData), [rentData]);
  const composition = useMemo(() => {
    if (secilenBaxis === 'wash') {
      return [
        { label: 'Aftoyuma', value: washTotals.total, color: theme.colors.wash },
        { label: 'Isiq xerci', value: washTotals.isiq, color: theme.colors.amber },
      ];
    }

    return [
      { label: 'Kiraye geliri', value: totals.kiraye, color: theme.colors.primary },
      { label: 'Isiq xerci', value: totals.isiq, color: theme.colors.wash },
      { label: 'Su xerci', value: totals.su, color: theme.colors.info },
      { label: 'Internet xerci', value: totals.wifi, color: theme.colors.success },
    ];
  }, [secilenBaxis, totals, washTotals]);

  const bestMonth = monthlyTrend.reduce((best, item) => (item.value > best.value ? item : best), { label: '-', value: 0 });
  const averageMonth = monthlyTrend.length ? monthlyTrend.reduce((sum, item) => sum + item.value, 0) / monthlyTrend.length : 0;
  const washDashboard = useMemo(
    () => buildWashDashboard(vehicleEvents, washExpenses, waterReadings, secilenIl, secilenAy),
    [vehicleEvents, washExpenses, waterReadings, secilenIl, secilenAy],
  );

  return (
    <div style={wrap}>
      <header style={hero}>
        <div>
          <div style={eyebrow}>ANALITIKA</div>
          <h1 style={title}>Dashboard</h1>
          <p style={sub}>Kiraye neti, aftoyuma xərcləri, aylıq trendlər və obyekt performansı</p>
        </div>
        <div style={filters}>
          <Field label="Il">
            <input type="number" min="2020" max="2100" value={secilenIl} onChange={(e) => setSecilenIl(e.target.value)} list="dashboard-iller" style={controlStyle} />
            <datalist id="dashboard-iller">
              {getYearOptions(secilenIl).map((il) => <option key={il} value={il} />)}
            </datalist>
          </Field>
          <Field label="Ay">
            <select value={secilenAy} onChange={(e) => setSecilenAy(e.target.value)} style={controlStyle}>
              <option value="Bütün Aylar">Bütün Aylar</option>
              {aylar.map((ay) => <option key={ay} value={ay}>{ay}</option>)}
            </select>
          </Field>
          <Field label="Baxis">
            <select value={secilenBaxis} onChange={(e) => setSecilenBaxis(e.target.value)} style={controlStyle}>
              <option value="all">Hamisi</option>
              <option value="rent">Kirayeler</option>
              <option value="wash">Aftoyuma</option>
            </select>
          </Field>
        </div>
      </header>

      {error && <div style={alert}>Backend baglantisi aktiv deyil: {error}</div>}

      <section style={kpiGrid}>
        {secilenBaxis === 'wash' ? (
          <>
            <Kpi title="Bugunku masin" value={`${washDashboard.todayCount}`} note="giris qeydi" color={theme.colors.text} />
            <Kpi title={secilenAy === 'Bütün Aylar' ? 'Illik masin' : `${secilenAy} masin`} value={`${washDashboard.periodCount}`} note={`${secilenIl}`} color={theme.colors.primary} />
            <Kpi title="En cox masin" value={washDashboard.bestMonth.label} note={`${washDashboard.bestMonth.value} masin`} color={theme.colors.teal} />
            <Kpi title="Isiq xerci" value={formatMoney(washTotals.isiq)} note={`${washTotals.serfiyyat.toFixed(2)} Kwt`} color={theme.colors.amber} />
            <Kpi title="Xercler" value={formatMoney(washDashboard.expenseTotal)} note="secilen dovr" color={theme.colors.wash} />
          </>
        ) : (
          <>
            <Kpi title="Umumi net" value={formatMoney(totals.total)} note={`${filtered.length} qeyd`} color={theme.colors.text} />
            <Kpi title="Kiraye neti" value={formatMoney(rentTotals.total)} note={`${rentData.length} qeyd`} color={theme.colors.primary} />
            {secilenBaxis !== 'rent' && <Kpi title="Aftoyuma xərci" value={formatMoney(washTotals.isiq)} note={`${washData.length} qeyd`} color={theme.colors.wash} />}
            <Kpi title="Ayliq orta" value={formatMoney(averageMonth)} note={`En yaxsi: ${bestMonth.label}`} color={theme.colors.teal} />
          </>
        )}
      </section>

      {secilenBaxis === 'wash' ? (
        <WashDashboard data={washDashboard} secilenIl={secilenIl} washTotals={washTotals} />
      ) : (
        <>
          <section style={mainGrid}>
            <Panel title={`${secilenIl} ayliq trend`} wide>
              <ColumnChart data={monthlyTrend} />
            </Panel>

            <Panel title="Gelir payi">
              <Donut segments={buildRevenueSegments(secilenBaxis, rentTotals, washTotals)} total={totals.total} />
            </Panel>

            <Panel title="Gəlir və xərc tərkibi">
              <StackList data={composition} total={Math.max(totals.kiraye + totals.isiq + totals.su + totals.wifi, 1)} />
            </Panel>

          <Panel title="Evler uzre ranking">
            <Ranking data={houseTotals} />
          </Panel>
          </section>

          <section style={detailGrid}>
            <Panel title="Operativ xulase">
              <div style={metricRows}>
                <Metric label="Kiraye gəliri" value={formatMoney(totals.kiraye)} />
                <Metric label="Isiq xərci" value={formatMoney(totals.isiq)} />
                <Metric label="Su xərci" value={formatMoney(totals.su)} />
                <Metric label="Internet xərci" value={formatMoney(totals.wifi)} />
                <Metric label="Serfiyyat" value={`${totals.serfiyyat.toFixed(2)} Kwt`} />
              </div>
            </Panel>

            <Panel title="Son hesabatlar" wide>
              <DataTable rows={filtered.slice(0, 12)} view={secilenBaxis} />
            </Panel>
          </section>
        </>
      )}
    </div>
  );
}

function isWashReport(item) {
  return String(item.ev || '').trim().toUpperCase() === 'MOYKA';
}

function buildRevenueSegments(view, rentTotals, washTotals) {
  const rentExpenses = rentTotals.isiq + rentTotals.su + rentTotals.wifi;

  if (view === 'rent') {
    return [
      { label: 'Kiraye geliri', value: rentTotals.kiraye, color: theme.colors.primary },
      { label: 'Xercler', value: rentExpenses, color: theme.colors.wash },
    ];
  }

  if (view === 'wash') {
    return [{ label: 'Aftoyuma xerci', value: washTotals.isiq, color: theme.colors.wash }];
  }

  return [
    { label: 'Kiraye geliri', value: rentTotals.kiraye, color: theme.colors.primary },
    { label: 'Xercler', value: rentExpenses + washTotals.isiq, color: theme.colors.wash },
  ];
}

function buildWashDashboard(events, expenses, readings, il, ay) {
  const entryEvents = events.filter((item) => item.direction === 'entry');
  const todayKey = localDateKey(new Date());
  const yearEvents = entryEvents.filter((item) => new Date(item.createdAt).getFullYear() === Number(il));
  const periodEvents = yearEvents.filter((item) => ay === 'Bütün Aylar' || aylar[new Date(item.createdAt).getMonth()] === ay);
  const monthCounts = aylar.map((monthName, index) => ({
    label: monthName.slice(0, 3),
    value: yearEvents.filter((item) => new Date(item.createdAt).getMonth() === index).length,
  }));
  const bestMonth = monthCounts.reduce((best, item) => (item.value > best.value ? item : best), { label: '-', value: 0 });
  const periodExpenses = expenses.filter((item) => {
    const date = new Date(item.expenseDate);
    return date.getFullYear() === Number(il) && (ay === 'Bütün Aylar' || aylar[date.getMonth()] === ay);
  });
  const periodReadings = readings.filter((item) => Number(item.il) === Number(il) && (ay === 'Bütün Aylar' || item.ay === ay));

  return {
    todayCount: entryEvents.filter((item) => localDateKey(new Date(item.createdAt)) === todayKey).length,
    periodCount: periodEvents.length,
    bestMonth,
    monthCounts,
    expenseTotal: periodExpenses.reduce((sum, item) => sum + toAmount(item.amount), 0),
    waterTotal: periodReadings.reduce((sum, item) => sum + toAmount(item.total), 0),
    waterUsage: periodReadings.reduce((sum, item) => sum + toAmount(item.usageAmount), 0),
    expenses: periodExpenses.slice(0, 12),
    recentEvents: periodEvents.slice(0, 12),
    readings: periodReadings.slice(0, 12),
  };
}

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function summarize(items) {
  return items.reduce(
    (acc, item) => ({
      kiraye: acc.kiraye + toAmount(item.kiraye),
      isiq: acc.isiq + toAmount(item.isiqPulu),
      su: acc.su + toAmount(item.suCem),
      wifi: acc.wifi + toAmount(item.wifi),
      total: acc.total + netReportTotal(item),
      serfiyyat: acc.serfiyyat + toAmount(item.serfiyyat),
    }),
    { kiraye: 0, isiq: 0, su: 0, wifi: 0, total: 0, serfiyyat: 0 },
  );
}

function buildHouseTotals(items) {
  const grouped = items.reduce((acc, item) => {
    acc[item.ev] = (acc[item.ev] || 0) + netReportTotal(item);
    return acc;
  }, {});

  return Object.entries(grouped)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
}

function Kpi({ title, value, note, color }) {
  return (
    <div style={kpi}>
      <div style={{ ...kpiAccent, background: color }} />
      <div style={kpiLabel}>{title}</div>
      <div style={kpiValue}>{value}</div>
      <div style={kpiNote}>{note}</div>
    </div>
  );
}

function Panel({ title, children, wide = false }) {
  return (
    <section style={{ ...panel, gridColumn: wide ? 'span 2' : 'span 1' }}>
      <h2 style={panelTitle}>{title}</h2>
      {children}
    </section>
  );
}

function WashDashboard({ data, secilenIl, washTotals }) {
  return (
    <>
      <section style={mainGrid}>
        <Panel title={`${secilenIl} masin axini`} wide>
          <ColumnChart data={data.monthCounts} />
        </Panel>

        <Panel title="Aftoyuma xerc xulasesi">
          <div style={metricRows}>
            <Metric label="Xercler" value={formatMoney(data.expenseTotal)} />
            <Metric label="Isiq xerci" value={formatMoney(washTotals.isiq)} />
            <Metric label="Isiq serfiyyati" value={`${washTotals.serfiyyat.toFixed(2)} Kwt`} />
            <Metric label="Su pulu" value={formatMoney(data.waterTotal)} />
            <Metric label="Su serfiyyati" value={`${data.waterUsage.toFixed(2)} kub`} />
            <Metric label="En aktiv ay" value={`${data.bestMonth.label} / ${data.bestMonth.value} masin`} />
          </div>
        </Panel>
      </section>

      <section style={detailGrid}>
        <Panel title="Xercler" wide>
          <MiniTable
            rows={data.expenses}
            columns={[
              ['Tarix', (item) => formatDate(item.expenseDate)],
              ['Xerc', (item) => item.title],
              ['Mebleg', (item) => formatMoney(item.amount)],
              ['Qeyd', (item) => item.note || '-'],
            ]}
          />
        </Panel>

        <Panel title="Son masinlar">
          <MiniTable
            rows={data.recentEvents}
            columns={[
              ['Vaxt', (item) => formatDateTime(item.createdAt)],
              ['Nomre', (item) => item.plate],
              ['Menbe', (item) => item.source],
            ]}
          />
        </Panel>

        <Panel title="Su gostericileri">
          <MiniTable
            rows={data.readings}
            columns={[
              ['Ay', (item) => `${item.il} / ${item.ay}`],
              ['Kohne', (item) => item.oldReading.toFixed(2)],
              ['Yeni', (item) => item.newReading.toFixed(2)],
              ['Total', (item) => formatMoney(item.total)],
            ]}
          />
        </Panel>
      </section>
    </>
  );
}

function ColumnChart({ data }) {
  const max = Math.max(...data.map((item) => item.value), 1);

  return (
    <div style={chartWrap}>
      {data.map((item) => (
        <div key={item.label} style={chartItem}>
          <div style={barTrack}>
            <div
              title={`${item.label}: ${formatMoney(item.value)}`}
              style={{
                ...bar,
                height: `${Math.max(3, (item.value / max) * 100)}%`,
                background: item.value === max ? theme.colors.primary : '#8fb4ff',
              }}
            />
          </div>
          <span style={axisLabel}>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

function Donut({ segments, total }) {
  const safeTotal = Math.max(total, 1);
  const gradient = segments
    .reduce(
      (acc, segment) => {
        const start = acc.cursor;
        const end = start + (segment.value / safeTotal) * 100;
        return {
          cursor: end,
          parts: [...acc.parts, `${segment.color} ${start}% ${end}%`],
        };
      },
      { cursor: 0, parts: [] },
    )
    .parts.join(', ');

  return (
    <div style={donutWrap}>
      <div style={{ ...donut, background: `conic-gradient(${gradient || '#e2e8f0 0 100%'})` }}>
        <div style={donutHole}>
          <strong>{formatMoney(total)}</strong>
          <span>total</span>
        </div>
      </div>
      <div style={{ display: 'grid', gap: '9px' }}>
        {segments.map((item) => (
          <Legend key={item.label} color={item.color} label={item.label} value={formatMoney(item.value)} />
        ))}
      </div>
    </div>
  );
}

function StackList({ data, total }) {
  return (
    <div style={{ display: 'grid', gap: '12px' }}>
      {data.map((item) => (
        <div key={item.label}>
          <div style={stackHead}>
            <span>{item.label}</span>
            <strong>{formatMoney(item.value)}</strong>
          </div>
          <div style={stackTrack}>
            <div style={{ width: `${Math.min(100, (item.value / total) * 100)}%`, height: '100%', background: item.color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Ranking({ data }) {
  const max = Math.max(...data.map((item) => item.value), 1);

  if (!data.length) return <Empty />;

  return (
    <div style={{ display: 'grid', gap: '10px' }}>
      {data.map((item, index) => (
        <div key={item.label} style={rankRow}>
          <span style={rankIndex}>{index + 1}</span>
          <span style={rankName}>{item.label}</span>
          <div style={rankTrack}>
            <div style={{ width: `${(item.value / max) * 100}%`, height: '100%', background: theme.colors.success }} />
          </div>
          <strong style={rankValue}>{formatMoney(item.value)}</strong>
        </div>
      ))}
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div style={metric}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Legend({ color, label, value }) {
  return (
    <div style={legend}>
      <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: color }} />
      <span style={{ flex: 1 }}>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function MiniTable({ rows, columns }) {
  if (!rows.length) return <Empty />;

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={table}>
        <thead>
          <tr>
            {columns.map(([label]) => (
              <th key={label} style={th}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.id}-${index}`} style={{ background: index % 2 ? '#f8fafc' : '#fff' }}>
              {columns.map(([label, accessor]) => (
                <td key={label} style={td}>{accessor(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatDate(value) {
  return new Date(value).toLocaleDateString('az-AZ');
}

function formatDateTime(value) {
  return new Date(value).toLocaleString('az-AZ', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function DataTable({ rows, view }) {
  if (!rows.length) return <Empty />;

  const columns = view === 'wash'
    ? [
        ['Tarix', (row) => `${row.il} / ${row.ay}`],
        ['Obyekt', (row) => row.ev],
        ['Kohne', (row) => Number(row.kohneIsiq).toFixed(2)],
        ['Yeni', (row) => Number(row.yeniIsiq).toFixed(2)],
        ['Serfiyyat', (row) => `${Number(row.serfiyyat).toFixed(2)} Kwt`],
        ['Isiq xerci', (row) => formatMoney(row.isiqPulu)],
        ['Net', (row) => formatMoney(netReportTotal(row))],
      ]
    : [
        ['Tarix', (row) => `${row.il} / ${row.ay}`],
        ['Obyekt', (row) => row.ev],
        ['Kiraye', (row) => formatMoney(row.kiraye)],
        ['Isiq xərci', (row) => formatMoney(row.isiqPulu)],
        ['Su xərci', (row) => formatMoney(row.suCem)],
        ['Internet xərci', (row) => formatMoney(row.wifi)],
        ['Net', (row) => formatMoney(netReportTotal(row))],
      ];

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={table}>
        <thead>
          <tr>
            {columns.map(([label]) => (
              <th key={label} style={th}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.id}-${index}`} style={{ background: index % 2 ? '#f8fafc' : '#fff' }}>
              {columns.map(([label, accessor]) => (
                <td key={label} style={{ ...td, fontWeight: label === 'Total' ? 800 : 400 }}>
                  {accessor(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Empty() {
  return <div style={empty}>Melumat yoxdur.</div>;
}

function Field({ label, children }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

const wrap = { maxWidth: '1280px', margin: '0 auto', padding: '16px', color: theme.colors.text };
const hero = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'end',
  gap: '16px',
  flexWrap: 'wrap',
  padding: '18px',
  border: `1px solid ${theme.colors.border}`,
  background: '#ffffff',
  borderRadius: theme.radius.md,
  marginBottom: '14px',
};
const eyebrow = { fontSize: '11px', fontWeight: 800, color: theme.colors.primary, letterSpacing: 0 };
const title = { margin: '4px 0 0', fontSize: '26px', color: theme.colors.text };
const sub = { margin: '5px 0 0', color: theme.colors.muted, fontSize: '13px' };
const filters = { display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'end' };
const labelStyle = { display: 'block', color: theme.colors.muted, fontSize: '12px', fontWeight: 700, marginBottom: '5px' };
const controlStyle = { width: '138px', padding: '10px', borderRadius: '7px', border: `1px solid ${theme.colors.border}`, background: '#fff', fontSize: '14px', boxSizing: 'border-box' };
const alert = { padding: '12px', marginBottom: '14px', borderRadius: theme.radius.sm, background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a', fontSize: '13px' };
const kpiGrid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '12px', marginBottom: '12px' };
const kpi = { position: 'relative', overflow: 'hidden', background: '#fff', border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.md, padding: '14px' };
const kpiAccent = { position: 'absolute', top: 0, left: 0, width: '100%', height: '4px' };
const kpiLabel = { color: theme.colors.muted, fontSize: '12px', fontWeight: 700 };
const kpiValue = { color: theme.colors.text, fontSize: '23px', fontWeight: 900, marginTop: '8px' };
const kpiNote = { color: theme.colors.muted, fontSize: '12px', marginTop: '6px' };
const mainGrid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px', alignItems: 'stretch' };
const detailGrid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '12px', marginTop: '12px' };
const panel = { background: '#fff', border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.md, padding: '14px', minWidth: 0, boxShadow: '0 1px 0 rgba(15, 23, 42, 0.03)' };
const panelTitle = { margin: '0 0 12px', fontSize: '14px', color: theme.colors.text };
const chartWrap = { height: '250px', display: 'grid', gridTemplateColumns: 'repeat(12, minmax(22px, 1fr))', gap: '8px', alignItems: 'end', padding: '6px 0 0', borderBottom: '1px solid #e2e8f0' };
const chartItem = { minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '7px', height: '100%' };
const barTrack = { flex: 1, width: '100%', display: 'flex', alignItems: 'end', background: '#f1f5f9', borderRadius: '6px 6px 0 0', overflow: 'hidden' };
const bar = { width: '100%', minHeight: '3px', borderRadius: '6px 6px 0 0' };
const axisLabel = { fontSize: '11px', color: theme.colors.muted };
const donutWrap = { display: 'grid', gridTemplateColumns: '150px 1fr', gap: '14px', alignItems: 'center' };
const donut = { width: '150px', height: '150px', borderRadius: '50%', display: 'grid', placeItems: 'center' };
const donutHole = { width: '94px', height: '94px', borderRadius: '50%', background: '#fff', display: 'grid', placeItems: 'center', textAlign: 'center', fontSize: '12px', color: theme.colors.muted };
const legend = { display: 'flex', alignItems: 'center', gap: '8px', color: theme.colors.muted, fontSize: '12px' };
const stackHead = { display: 'flex', justifyContent: 'space-between', gap: '10px', marginBottom: '6px', fontSize: '12px', color: theme.colors.muted };
const stackTrack = { height: '10px', background: '#eef2f7', borderRadius: theme.radius.pill, overflow: 'hidden' };
const rankRow = { display: 'grid', gridTemplateColumns: '24px 64px 1fr 92px', alignItems: 'center', gap: '8px', fontSize: '12px' };
const rankIndex = { width: '22px', height: '22px', display: 'grid', placeItems: 'center', borderRadius: '50%', background: '#e8eefc', color: theme.colors.primary, fontWeight: 800 };
const rankName = { fontWeight: 800, color: theme.colors.text };
const rankTrack = { height: '9px', borderRadius: theme.radius.pill, overflow: 'hidden', background: '#eef2f7' };
const rankValue = { textAlign: 'right', color: theme.colors.text };
const metricRows = { display: 'grid', gap: '8px' };
const metric = { display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '10px', background: '#f8fafc', borderRadius: theme.radius.sm, fontSize: '13px' };
const table = { width: '100%', borderCollapse: 'collapse', fontSize: '12px' };
const th = { textAlign: 'left', padding: '10px 8px', borderBottom: `1px solid ${theme.colors.border}`, color: '#475569', background: '#f8fafc' };
const td = { padding: '10px 8px', borderBottom: '1px solid #eef2f7', color: theme.colors.text, whiteSpace: 'nowrap' };
const empty = { padding: '28px', textAlign: 'center', color: theme.colors.muted, background: '#f8fafc', borderRadius: theme.radius.sm };

export default Home;
