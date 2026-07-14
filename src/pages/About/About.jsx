import { useEffect, useMemo, useState } from 'react';
import { reportsApi, washExpensesApi, washWaterApi } from '../../api/reports';
import { aylar, cariIl, formatMoney, getYearOptions, toAmount } from '../../constants/reporting';
import { theme } from '../../constants/theme';

function About() {
  const [secilenIl, setSecilenIl] = useState(cariIl);
  const [secilenAy, setSecilenAy] = useState('Bütün Aylar');
  const [expenses, setExpenses] = useState([]);
  const [waterReadings, setWaterReadings] = useState([]);
  const [electricReports, setElectricReports] = useState([]);

  useEffect(() => {
    const load = async () => {
      const [expenseRows, waterRows, reports] = await Promise.all([
        washExpensesApi.list({ il: secilenIl }),
        washWaterApi.list({ il: secilenIl }),
        reportsApi.list({ il: secilenIl }),
      ]);

      setExpenses(expenseRows);
      setWaterReadings(waterRows);
      setElectricReports(reports.filter((item) => String(item.ev || '').trim().toUpperCase() === 'MOYKA'));
    };

    load().catch((error) => console.error('Aftoyuma məlumatları alınmadı:', error.message));
  }, [secilenIl]);

  const filteredExpenses = useMemo(
    () => expenses.filter((item) => matchesExpensePeriod(item, secilenIl, secilenAy)),
    [expenses, secilenIl, secilenAy],
  );
  const filteredElectric = useMemo(
    () => electricReports.filter((item) => matchesReportPeriod(item.il, item.ay, secilenIl, secilenAy)),
    [electricReports, secilenIl, secilenAy],
  );
  const filteredWater = useMemo(
    () => waterReadings.filter((item) => matchesReportPeriod(item.il, item.ay, secilenIl, secilenAy)),
    [waterReadings, secilenIl, secilenAy],
  );

  return (
    <div style={wrap}>
      <header style={header}>
        <div style={{ flex: 1 }}>
          <div style={eyebrow}>MENYU / AFTOYUMA</div>
          <h1 style={title}>Aftoyuma</h1>
        </div>

        <div style={filters}>
          <Field label="İl">
            <input
              type="number"
              min="2020"
              max="2100"
              value={secilenIl}
              onChange={(e) => setSecilenIl(e.target.value)}
              list="aftoyuma-years"
              style={control}
            />
            <datalist id="aftoyuma-years">
              {getYearOptions(secilenIl).map((il) => (
                <option key={il} value={il} />
              ))}
            </datalist>
          </Field>
          <Field label="Ay">
            <select value={secilenAy} onChange={(e) => setSecilenAy(e.target.value)} style={control}>
              <option value="Bütün Aylar">Bütün Aylar</option>
              {aylar.map((ay) => (
                <option key={ay} value={ay}>
                  {ay}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </header>

      <section style={grid}>
        <Panel title="Xərclər">
          <MiniTable
            rows={filteredExpenses}
            empty="Məlumat yoxdur."
            columns={[
              ['Tarix', (item) => formatDate(item.expenseDate)],
              ['Xərc adı', (item) => item.title],
              ['Məbləğ', (item) => formatMoney(item.amount)],
            ]}
          />
        </Panel>

        <Panel title="İşıq">
          <MiniTable
            rows={filteredElectric}
            empty="Məlumat yoxdur."
            columns={[
              ['Ay', (item) => `${item.il} / ${item.ay}`],
              ['Məbləğ', (item) => formatMoney(item.isiqPulu)],
              ['Kwt', (item) => `${Number(item.serfiyyat).toFixed(2)}`],
            ]}
          />
        </Panel>

        <Panel title="Su">
          <MiniTable
            rows={filteredWater}
            empty="Məlumat yoxdur."
            columns={[
              ['Ay', (item) => `${item.il} / ${item.ay}`],
              ['Məbləğ', (item) => formatMoney(item.total)],
              ['Ton', (item) => `${Number(item.usageAmount).toFixed(2)}`],
            ]}
          />
        </Panel>
      </section>
    </div>
  );
}

function matchesExpensePeriod(item, il, ay) {
  const date = new Date(item.expenseDate);
  return date.getFullYear() === Number(il) && (ay === 'Bütün Aylar' || aylar[date.getMonth()] === ay);
}

function matchesReportPeriod(il, ay, secilenIl, secilenAy) {
  return Number(il) === Number(secilenIl) && (secilenAy === 'Bütün Aylar' || String(ay).trim() === secilenAy);
}

function formatDate(value) {
  return new Date(value).toLocaleDateString('az-AZ');
}

function Field({ label, children }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <section style={panel}>
      <h2 style={panelTitle}>{title}</h2>
      {children}
    </section>
  );
}

function MiniTable({ rows, columns, empty }) {
  if (!rows.length) {
    return <div style={emptyStyle}>{empty}</div>;
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={table}>
        <thead>
          <tr>
            {columns.map(([label]) => (
              <th key={label} style={tableHead}>
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.id}-${index}`} style={{ background: index % 2 ? '#f8fafc' : '#fff' }}>
              {columns.map(([label, accessor]) => (
                <td key={label} style={tableCell}>
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

const wrap = { padding: '15px', maxWidth: '1180px', margin: '0 auto', color: theme.colors.text };
const header = {
  background: theme.colors.surface,
  padding: '15px',
  borderRadius: theme.radius.md,
  border: `1px solid ${theme.colors.border}`,
  marginBottom: '15px',
  display: 'flex',
  flexWrap: 'wrap',
  gap: '12px',
  justifyContent: 'space-between',
  alignItems: 'end',
};
const eyebrow = { fontSize: '11px', fontWeight: 900, color: theme.colors.primaryDark, marginBottom: '4px' };
const title = { margin: 0, color: theme.colors.text, fontSize: '20px', fontWeight: 800 };
const filters = { display: 'flex', gap: '10px', flexWrap: 'wrap' };
const labelStyle = { display: 'block', color: theme.colors.muted, fontSize: '12px', fontWeight: 700, marginBottom: '5px' };
const control = { width: '138px', padding: '10px', borderRadius: '7px', border: `1px solid ${theme.colors.border}`, background: '#fff', fontSize: '14px', boxSizing: 'border-box' };
const grid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: '12px',
};
const panel = { background: theme.colors.surface, padding: '15px', borderRadius: theme.radius.md, border: `1px solid ${theme.colors.border}`, minWidth: 0 };
const panelTitle = { margin: '0 0 12px', color: theme.colors.text, fontSize: '16px' };
const emptyStyle = { padding: '20px', textAlign: 'center', color: theme.colors.muted, background: theme.colors.surfaceSoft, borderRadius: theme.radius.md };
const table = { width: '100%', borderCollapse: 'collapse', fontSize: '12px' };
const tableHead = { textAlign: 'left', padding: '10px 8px', borderBottom: `1px solid ${theme.colors.border}`, color: '#475569', whiteSpace: 'nowrap' };
const tableCell = { padding: '10px 8px', borderBottom: '1px solid #eef2f7', color: theme.colors.text, whiteSpace: 'nowrap' };

export default About;
