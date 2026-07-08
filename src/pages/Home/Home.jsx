import { useEffect, useMemo, useState } from 'react';
import { reportsApi } from '../../api/reports';
import { aylar, cariIl, formatMoney, getYearOptions, toAmount } from '../../constants/reporting';
import { theme } from '../../constants/theme';

function Home() {
  const [data, setData] = useState([]);
  const [secilenIl, setSecilenIl] = useState(cariIl);
  const [secilenAy, setSecilenAy] = useState('Bütün Aylar');
  const [secilenBaxis, setSecilenBaxis] = useState('all');

  useEffect(() => {
    const fetchHomeData = async () => {
      try {
        const reports = await reportsApi.list({ il: secilenIl });
        setData(reports);
      } catch (error) {
        console.error('Backend-dən məlumat alınarkən xəta:', error.message);
      }
    };

    fetchHomeData();
  }, [secilenIl]);

  const { rentData, washData } = useMemo(() => {
    const byMonth = (item) => secilenAy === 'Bütün Aylar' || String(item.ay).trim() === secilenAy;
    const rent = data.filter((item) => item.ev !== 'MOYKA' && byMonth(item));
    const wash = data.filter((item) => item.ev === 'MOYKA' && byMonth(item));
    return { rentData: rent, washData: wash };
  }, [data, secilenAy]);

  const rentTotals = useMemo(() => summarize(rentData), [rentData]);
  const washTotals = useMemo(() => summarize(washData), [washData]);

  const rentMonthlyTotals = useMemo(
    () => buildMonthlyTotals(data.filter((item) => item.ev !== 'MOYKA'), aylar),
    [data],
  );
  const washMonthlyTotals = useMemo(
    () => buildMonthlyTotals(data.filter((item) => item.ev === 'MOYKA'), aylar),
    [data],
  );

  const rentHouseTotals = useMemo(
    () => buildHouseTotals(rentData),
    [rentData],
  );

  const summaryView = secilenBaxis === 'rent'
    ? renderRentSummary(rentTotals)
    : secilenBaxis === 'wash'
      ? renderWashSummary(washTotals)
      : (
        <>
          {renderRentSummary(rentTotals)}
          {renderWashSummary(washTotals)}
        </>
      );

  return (
    <div style={{ padding: '16px', maxWidth: '1120px', margin: '0 auto', color: theme.colors.text }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'end', justifyContent: 'space-between', marginBottom: '18px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '22px', color: theme.colors.text }}>Dashboard</h1>
          <p style={{ margin: '4px 0 0', color: theme.colors.muted, fontSize: '13px' }}>İl və ay üzrə kirayə, aftoyuma və ümumi gəlir xülasəsi</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'end', flexWrap: 'wrap' }}>
          <Field label="İl">
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
        </div>
      </div>

      <div style={{ display: 'inline-flex', gap: '8px', padding: '6px', background: '#e8eef7', borderRadius: theme.radius.pill, marginBottom: '16px' }}>
        <TabButton active={secilenBaxis === 'all'} onClick={() => setSecilenBaxis('all')}>Hamısı</TabButton>
        <TabButton active={secilenBaxis === 'rent'} onClick={() => setSecilenBaxis('rent')}>Kirayələr</TabButton>
        <TabButton active={secilenBaxis === 'wash'} onClick={() => setSecilenBaxis('wash')}>Aftoyuma</TabButton>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', marginBottom: '16px' }}>
        <Kpi title="Kirayə gəliri" value={formatMoney(rentTotals.total)} accent={theme.colors.primary} />
        <Kpi title="Aftoyuma gəliri" value={formatMoney(washTotals.total)} accent={theme.colors.wash} />
        <Kpi title="Kirayə qeydi" value={`${rentData.length}`} accent={theme.colors.success} />
        <Kpi title="Aftoyuma qeydi" value={`${washData.length}`} accent={theme.colors.teal} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
        {secilenBaxis !== 'wash' && (
          <Panel title={`${secilenIl} - Kirayələr`}>
            <BarChart data={rentMonthlyTotals} color="#4b7bec" suffix="₼" />
          </Panel>
        )}
        {secilenBaxis !== 'rent' && (
          <Panel title={`${secilenIl} - Aftoyuma`}>
            <BarChart data={washMonthlyTotals} color="#e84118" suffix="₼" />
          </Panel>
        )}
        {secilenBaxis !== 'wash' && (
          <Panel title="Kirayələr üzrə evlər">
            <BarChart data={rentHouseTotals} color="#20bf6b" suffix="₼" horizontal />
          </Panel>
        )}
        {secilenBaxis !== 'rent' && (
          <Panel title="Aftoyuma xülasəsi">
            <div style={{ display: 'grid', gap: '10px' }}>
              <MiniRow label="Xalis sərfiyyat" value={`${washTotals.serfiyyat.toFixed(2)} Kwt`} />
              <MiniRow label="İşıq pulu" value={formatMoney(washTotals.isiq)} />
              <MiniRow label="Yekun total" value={formatMoney(washTotals.total)} />
              <ReportList data={washData} />
            </div>
          </Panel>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '14px', marginTop: '14px' }}>
        {secilenBaxis !== 'wash' && (
          <Panel title="Kirayə gridi">
            <DataTable
              rows={rentData}
              columns={[
                ['İl / Ay', (item) => `${item.il} / ${item.ay}`],
                ['Ev', (item) => item.ev],
                ['Kirayə', (item) => formatMoney(item.kiraye)],
                ['İşıq', (item) => formatMoney(item.isiqPulu)],
                ['Su', (item) => formatMoney(item.suCem)],
                ['Internet', (item) => formatMoney(item.wifi)],
                ['Total', (item) => formatMoney(item.total)],
              ]}
            />
          </Panel>
        )}

        {secilenBaxis !== 'rent' && (
          <Panel title="Aftoyuma gridi">
            <DataTable
              rows={washData}
              columns={[
                ['İl / Ay', (item) => `${item.il} / ${item.ay}`],
                ['Ev', (item) => item.ev],
                ['Köhnə', (item) => item.kohneIsiq],
                ['Yeni', (item) => item.yeniIsiq],
                ['Sərfiyyat', (item) => `${Number(item.serfiyyat).toFixed(2)} Kwt`],
                ['İşıq Pulu', (item) => formatMoney(item.isiqPulu)],
                ['Total', (item) => formatMoney(item.total)],
              ]}
            />
          </Panel>
        )}
      </div>

      {summaryView}
    </div>
  );
}

function renderRentSummary(totals) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px', marginTop: '16px' }}>
      <Summary title="Kirayə cəmi" value={formatMoney(totals.kiraye)} color="#4b7bec" />
      <Summary title="İşıq" value={formatMoney(totals.isiq)} color="#eb3b5a" />
      <Summary title="Su" value={formatMoney(totals.su)} color="#2d98da" />
      <Summary title="Internet" value={formatMoney(totals.wifi)} color="#20bf6b" />
      <Summary title="Yekun total" value={formatMoney(totals.total)} color="#0f172a" />
    </div>
  );
}

function renderWashSummary(totals) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px', marginTop: '16px' }}>
      <Summary title="Xalis sərfiyyat" value={`${totals.serfiyyat.toFixed(2)} Kwt`} color="#334155" />
      <Summary title="İşıq pulu" value={formatMoney(totals.isiq)} color="#e84118" />
      <Summary title="Yekun total" value={formatMoney(totals.total)} color="#20bf6b" />
    </div>
  );
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

function buildMonthlyTotals(items, months) {
  return months.map((ay) => ({
    label: ay.slice(0, 3),
    value: items.filter((item) => item.ay === ay).reduce((sum, item) => sum + toAmount(item.total), 0),
  }));
}

function buildHouseTotals(items) {
  const grouped = items.reduce((acc, item) => {
    acc[item.ev] = (acc[item.ev] || 0) + toAmount(item.total);
    return acc;
  }, {});

  return Object.entries(grouped)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

function Kpi({ title, value, accent }) {
  return (
    <div style={{ background: theme.colors.surface, border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.md, padding: '12px', borderTop: `3px solid ${accent}` }}>
      <div style={{ color: theme.colors.muted, fontSize: '12px', fontWeight: 600 }}>{title}</div>
      <div style={{ color: theme.colors.text, fontSize: '19px', fontWeight: 800, marginTop: '6px' }}>{value}</div>
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <section style={{ background: theme.colors.surface, border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.md, padding: '14px', minWidth: 0, boxShadow: '0 1px 0 rgba(15, 23, 42, 0.02)' }}>
      <h2 style={{ margin: '0 0 12px', fontSize: '15px', color: theme.colors.text }}>{title}</h2>
      {children}
    </section>
  );
}

function BarChart({ data, color, suffix, horizontal = false }) {
  const max = Math.max(...data.map((item) => item.value), 1);
  const visible = data.length ? data : [{ label: 'Yoxdur', value: 0 }];

  if (horizontal) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {visible.map((item) => (
          <div key={item.label} style={{ display: 'grid', gridTemplateColumns: '64px 1fr 78px', gap: '8px', alignItems: 'center', fontSize: '12px' }}>
            <span style={{ fontWeight: 700 }}>{item.label}</span>
            <div style={{ height: '10px', background: '#eef2f7', borderRadius: '999px', overflow: 'hidden' }}>
              <div style={{ width: `${(item.value / max) * 100}%`, height: '100%', background: color }} />
            </div>
            <span style={{ textAlign: 'right', color: '#475569' }}>{item.value.toFixed(0)} {suffix}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ height: '220px', display: 'grid', gridTemplateColumns: `repeat(${visible.length}, minmax(22px, 1fr))`, gap: '8px', alignItems: 'end', borderBottom: '1px solid #e2e8f0', paddingTop: '6px' }}>
      {visible.map((item) => (
        <div key={item.label} style={{ minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
          <div title={`${item.value.toFixed(2)} ${suffix}`} style={{ width: '100%', height: `${Math.max(4, (item.value / max) * 180)}px`, background: color, borderRadius: '5px 5px 0 0' }} />
          <span style={{ fontSize: '11px', color: '#64748b' }}>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

function ReportList({ data }) {
  if (!data.length) {
    return <div style={{ padding: '24px', textAlign: 'center', color: theme.colors.muted, background: theme.colors.surfaceSoft, borderRadius: theme.radius.md }}>Məlumat yoxdur.</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '320px', overflow: 'auto' }}>
      {data.map((item) => (
        <div key={`${item.il}-${item.ay}-${item.ev}`} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', alignItems: 'center', padding: '10px', border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.md, background: theme.colors.surface }}>
          <div>
            <strong style={{ fontSize: '13px' }}>{item.ev}</strong>
            <div style={{ fontSize: '12px', color: theme.colors.muted }}>{item.il} / {item.ay}</div>
          </div>
          <strong style={{ color: theme.colors.success }}>{formatMoney(item.total)}</strong>
        </div>
      ))}
    </div>
  );
}

function DataTable({ rows, columns }) {
  if (!rows.length) {
    return <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', background: '#f8fafc', borderRadius: '8px' }}>Məlumat yoxdur.</div>;
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
        <thead>
          <tr style={{ background: '#f8fafc' }}>
            {columns.map(([label]) => (
              <th key={label} style={{ textAlign: 'left', padding: '10px 8px', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.il}-${row.ay}-${row.ev}-${index}`} style={{ background: index % 2 === 0 ? '#fff' : '#f8fafc' }}>
              {columns.map(([label, accessor]) => (
                <td key={label} style={{ padding: '10px 8px', borderBottom: '1px solid #eef2f7', color: '#0f172a', whiteSpace: 'nowrap' }}>
                  {typeof accessor === 'function' ? accessor(row) : row[accessor]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Summary({ title, value, color }) {
  return (
    <div style={{ background: theme.colors.surface, border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.md, padding: '12px' }}>
      <div style={{ color: theme.colors.muted, fontSize: '12px', fontWeight: 700 }}>{title}</div>
      <div style={{ color, fontSize: '20px', fontWeight: 800, marginTop: '6px' }}>{value}</div>
    </div>
  );
}

function MiniRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', fontSize: '13px' }}>
      <span style={{ color: theme.colors.muted }}>{label}</span>
      <strong style={{ color: theme.colors.text }}>{value}</strong>
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

function TabButton({ active, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: 'none',
        padding: '10px 14px',
        borderRadius: theme.radius.pill,
        background: active ? theme.colors.text : 'transparent',
        color: active ? '#fff' : '#334155',
        fontWeight: 700,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

const labelStyle = {
  display: 'block',
  color: theme.colors.muted,
  fontSize: '12px',
  fontWeight: 700,
  marginBottom: '5px',
};

const controlStyle = {
  width: '132px',
  padding: '10px',
  borderRadius: '7px',
  border: `1px solid ${theme.colors.border}`,
  background: '#fff',
  fontSize: '14px',
  boxSizing: 'border-box',
};

export default Home;
