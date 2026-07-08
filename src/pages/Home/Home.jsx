import { useEffect, useMemo, useState } from 'react';
import { reportsApi } from '../../api/reports';
import { aylar, cariIl, formatMoney, getYearOptions, toAmount } from '../../constants/reporting';
import { theme } from '../../constants/theme';

function Home() {
  const [data, setData] = useState([]);
  const [secilenIl, setSecilenIl] = useState(cariIl);
  const [secilenAy, setSecilenAy] = useState('Bütün Aylar');
  const [secilenBaxis, setSecilenBaxis] = useState('all');
  const [error, setError] = useState('');

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
        value: rows.reduce((sum, item) => sum + toAmount(item.total), 0),
      };
    });
  }, [data, secilenBaxis]);

  const houseTotals = useMemo(() => buildHouseTotals(rentData), [rentData]);
  const composition = useMemo(() => {
    if (secilenBaxis === 'wash') {
      return [
        { label: 'Aftoyuma', value: washTotals.total, color: theme.colors.wash },
        { label: 'Isiq pulu', value: washTotals.isiq, color: theme.colors.amber },
      ];
    }

    return [
      { label: 'Kiraye', value: totals.kiraye, color: theme.colors.primary },
      { label: 'Isiq', value: totals.isiq, color: theme.colors.wash },
      { label: 'Su', value: totals.su, color: theme.colors.info },
      { label: 'Internet', value: totals.wifi, color: theme.colors.success },
    ];
  }, [secilenBaxis, totals, washTotals]);

  const bestMonth = monthlyTrend.reduce((best, item) => (item.value > best.value ? item : best), { label: '-', value: 0 });
  const averageMonth = monthlyTrend.length ? monthlyTrend.reduce((sum, item) => sum + item.value, 0) / monthlyTrend.length : 0;

  return (
    <div style={wrap}>
      <header style={hero}>
        <div>
          <div style={eyebrow}>ANALITIKA</div>
          <h1 style={title}>Dashboard</h1>
          <p style={sub}>Kiraye ve aftoyuma geliri, ayliq trendler ve obyekt performansi</p>
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
        <Kpi title="Umumi gelir" value={formatMoney(totals.total)} note={`${filtered.length} qeyd`} color={theme.colors.text} />
        {secilenBaxis !== 'wash' && <Kpi title="Kiraye geliri" value={formatMoney(rentTotals.total)} note={`${rentData.length} qeyd`} color={theme.colors.primary} />}
        {secilenBaxis !== 'rent' && <Kpi title="Aftoyuma geliri" value={formatMoney(washTotals.total)} note={`${washData.length} qeyd`} color={theme.colors.wash} />}
        <Kpi title="Ayliq orta" value={formatMoney(averageMonth)} note={`En yaxsi: ${bestMonth.label}`} color={theme.colors.teal} />
      </section>

      <section style={mainGrid}>
        <Panel title={`${secilenIl} ayliq trend`} wide>
          <ColumnChart data={monthlyTrend} />
        </Panel>

        <Panel title="Gelir payi">
          <Donut segments={buildRevenueSegments(secilenBaxis, rentTotals, washTotals)} total={totals.total} />
        </Panel>

        <Panel title="Xerc ve gelir terkibi">
          <StackList data={composition} total={Math.max(totals.kiraye + totals.isiq + totals.su + totals.wifi, 1)} />
        </Panel>

        {secilenBaxis !== 'wash' && (
          <Panel title="Evler uzre ranking">
            <Ranking data={houseTotals} />
          </Panel>
        )}
      </section>

      <section style={detailGrid}>
        <Panel title="Operativ xulase">
          <div style={metricRows}>
            {secilenBaxis !== 'wash' && <Metric label="Kiraye cem" value={formatMoney(totals.kiraye)} />}
            <Metric label="Isiq pulu" value={formatMoney(totals.isiq)} />
            {secilenBaxis !== 'wash' && <Metric label="Su" value={formatMoney(totals.su)} />}
            {secilenBaxis !== 'wash' && <Metric label="Internet" value={formatMoney(totals.wifi)} />}
            <Metric label="Serfiyyat" value={`${totals.serfiyyat.toFixed(2)} Kwt`} />
          </div>
        </Panel>

        <Panel title="Son hesabatlar" wide>
          <DataTable rows={filtered.slice(0, 12)} view={secilenBaxis} />
        </Panel>
      </section>
    </div>
  );
}

function isWashReport(item) {
  return String(item.ev || '').trim().toUpperCase() === 'MOYKA';
}

function buildRevenueSegments(view, rentTotals, washTotals) {
  if (view === 'rent') {
    return [{ label: 'Kiraye', value: rentTotals.total, color: theme.colors.primary }];
  }

  if (view === 'wash') {
    return [{ label: 'Aftoyuma', value: washTotals.total, color: theme.colors.wash }];
  }

  return [
    { label: 'Kiraye', value: rentTotals.total, color: theme.colors.primary },
    { label: 'Aftoyuma', value: washTotals.total, color: theme.colors.wash },
  ];
}

function summarize(items) {
  return items.reduce(
    (acc, item) => ({
      kiraye: acc.kiraye + toAmount(item.kiraye),
      isiq: acc.isiq + toAmount(item.isiqPulu),
      su: acc.su + toAmount(item.suCem),
      wifi: acc.wifi + toAmount(item.wifi),
      total: acc.total + toAmount(item.total),
      serfiyyat: acc.serfiyyat + toAmount(item.serfiyyat),
    }),
    { kiraye: 0, isiq: 0, su: 0, wifi: 0, total: 0, serfiyyat: 0 },
  );
}

function buildHouseTotals(items) {
  const grouped = items.reduce((acc, item) => {
    acc[item.ev] = (acc[item.ev] || 0) + toAmount(item.total);
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

function DataTable({ rows, view }) {
  if (!rows.length) return <Empty />;

  const columns = view === 'wash'
    ? [
        ['Tarix', (row) => `${row.il} / ${row.ay}`],
        ['Obyekt', (row) => row.ev],
        ['Kohne', (row) => Number(row.kohneIsiq).toFixed(2)],
        ['Yeni', (row) => Number(row.yeniIsiq).toFixed(2)],
        ['Serfiyyat', (row) => `${Number(row.serfiyyat).toFixed(2)} Kwt`],
        ['Isiq pulu', (row) => formatMoney(row.isiqPulu)],
        ['Total', (row) => formatMoney(row.total)],
      ]
    : [
        ['Tarix', (row) => `${row.il} / ${row.ay}`],
        ['Obyekt', (row) => row.ev],
        ['Kiraye', (row) => formatMoney(row.kiraye)],
        ['Isiq', (row) => formatMoney(row.isiqPulu)],
        ['Su', (row) => formatMoney(row.suCem)],
        ['Internet', (row) => formatMoney(row.wifi)],
        ['Total', (row) => formatMoney(row.total)],
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
