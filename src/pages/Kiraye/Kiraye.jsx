import { useEffect, useMemo, useState } from 'react';
import { reportsApi } from '../../api/reports';
import { aylar, cariIl, formatMoney, getYearOptions, netReportTotal, toAmount } from '../../constants/reporting';
import { theme } from '../../constants/theme';

function Kiraye() {
  const [data, setData] = useState([]);
  const [secilenIl, setSecilenIl] = useState(cariIl);
  const [secilenAy, setSecilenAy] = useState('Bütün Aylar');

  useEffect(() => {
    const load = async () => {
      try {
        const reports = await reportsApi.list({ il: secilenIl });
        setData(reports.filter((item) => item.ev !== 'MOYKA'));
      } catch (error) {
        console.error(error.message);
      }
    };

    load();
  }, [secilenIl]);

  const filtered = useMemo(() => {
    if (secilenAy === 'Bütün Aylar') return data;
    return data.filter((item) => String(item.ay).trim() === secilenAy);
  }, [data, secilenAy]);

  const totals = filtered.reduce(
    (acc, item) => ({
      kiraye: acc.kiraye + toAmount(item.kiraye),
      isiq: acc.isiq + toAmount(item.isiqPulu),
      su: acc.su + toAmount(item.suCem),
      wifi: acc.wifi + toAmount(item.wifi),
      total: acc.total + netReportTotal(item),
    }),
    { kiraye: 0, isiq: 0, su: 0, wifi: 0, total: 0 },
  );

  return (
    <div style={wrap}>
      <header style={head}>
        <div>
          <h1 style={title}>Kirayə</h1>
          <p style={sub}>Aylıq kirayə qeydləri və cədvəl görünüşü</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <Field label="İl">
            <input type="number" min="2020" max="2100" value={secilenIl} onChange={(e) => setSecilenIl(e.target.value)} list="kiraye-years" style={control} />
            <datalist id="kiraye-years">
              {getYearOptions(secilenIl).map((il) => <option key={il} value={il} />)}
            </datalist>
          </Field>
          <Field label="Ay">
            <select value={secilenAy} onChange={(e) => setSecilenAy(e.target.value)} style={control}>
              <option value="Bütün Aylar">Bütün Aylar</option>
              {aylar.map((ay) => <option key={ay} value={ay}>{ay}</option>)}
            </select>
          </Field>
        </div>
      </header>

      <div style={kpiRow}>
        <Kpi label="Kiraye gəliri" value={formatMoney(totals.kiraye)} />
        <Kpi label="İşıq xərci" value={formatMoney(totals.isiq)} />
        <Kpi label="Su xərci" value={formatMoney(totals.su)} />
        <Kpi label="Internet xərci" value={formatMoney(totals.wifi)} />
        <Kpi label="Net" value={formatMoney(totals.total)} />
      </div>

      <section style={panel}>
        <h2 style={panelTitle}>Kirayə grid</h2>
        <GridTable
          rows={filtered}
          columns={[
            ['İl / Ay', (item) => `${item.il} / ${item.ay}`],
            ['Ev', (item) => item.ev],
            ['Kiraye', (item) => formatMoney(item.kiraye)],
            ['İşıq xərci', (item) => formatMoney(item.isiqPulu)],
            ['Su xərci', (item) => formatMoney(item.suCem)],
            ['Internet xərci', (item) => formatMoney(item.wifi)],
            ['Net', (item) => formatMoney(netReportTotal(item))],
          ]}
        />
      </section>
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

function Kpi({ label, value }) {
  return (
    <div style={kpi}>
      <div style={{ color: theme.colors.muted, fontSize: '12px', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: '18px', fontWeight: 800, marginTop: '6px', color: theme.colors.text }}>{value}</div>
    </div>
  );
}

function GridTable({ rows, columns }) {
  if (!rows.length) return <div style={empty}>Məlumat yoxdur.</div>;

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={table}>
        <thead>
          <tr style={{ background: '#f8fafc' }}>
            {columns.map(([label]) => (
              <th key={label} style={th}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.il}-${row.ay}-${row.ev}-${index}`} style={{ background: index % 2 ? '#f8fafc' : '#fff' }}>
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

const wrap = {
  padding: '16px',
  maxWidth: '1120px',
  margin: '0 auto',
  color: theme.colors.text,
};
const head = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'end',
  gap: '12px',
  flexWrap: 'wrap',
  marginBottom: '16px',
};
const title = { margin: 0, fontSize: '22px', color: theme.colors.text };
const sub = { margin: '4px 0 0', color: theme.colors.muted, fontSize: '13px' };
const labelStyle = { display: 'block', color: theme.colors.muted, fontSize: '12px', fontWeight: 700, marginBottom: '5px' };
const control = { width: '132px', padding: '10px', borderRadius: '7px', border: `1px solid ${theme.colors.border}`, background: '#fff', fontSize: '14px', boxSizing: 'border-box' };
const kpiRow = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', marginBottom: '16px' };
const kpi = { background: theme.colors.surface, border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.md, padding: '12px' };
const panel = { background: theme.colors.surface, border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.md, padding: '14px' };
const panelTitle = { margin: '0 0 12px', fontSize: '15px', color: theme.colors.text };
const empty = { padding: '24px', textAlign: 'center', color: theme.colors.muted, background: theme.colors.surfaceSoft, borderRadius: theme.radius.md };
const table = { width: '100%', borderCollapse: 'collapse', fontSize: '12px' };
const th = { textAlign: 'left', padding: '10px 8px', borderBottom: `1px solid ${theme.colors.border}`, color: '#475569' };
const td = { padding: '10px 8px', borderBottom: '1px solid #eef2f7', color: theme.colors.text, whiteSpace: 'nowrap' };

export default Kiraye;
