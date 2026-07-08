import { useCallback, useEffect, useMemo, useState } from 'react';
import { vehicleEventsApi, washExpensesApi, washWaterApi } from '../../api/reports';
import { aylar, cariAy, cariIl, formatMoney, getYearOptions, toAmount } from '../../constants/reporting';
import { theme } from '../../constants/theme';

function Aftoyuma() {
  const [secilenIl, setSecilenIl] = useState(cariIl);
  const [secilenAy, setSecilenAy] = useState(cariAy);
  const [vehicleEvents, setVehicleEvents] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [waterReadings, setWaterReadings] = useState([]);
  const [plateInput, setPlateInput] = useState('');
  const [direction, setDirection] = useState('entry');
  const [expenseForm, setExpenseForm] = useState({
    expenseDate: localDateKey(new Date()),
    title: '',
    amount: '',
    note: '',
  });
  const [waterForm, setWaterForm] = useState({
    il: cariIl,
    ay: cariAy,
    oldReading: '',
    newReading: '',
    pricePerUnit: '1',
  });

  const loadAll = useCallback(async () => {
    const [events, expenseRows, waterRows] = await Promise.all([
      vehicleEventsApi.list(),
      washExpensesApi.list({ il: secilenIl }),
      washWaterApi.list({ il: secilenIl }),
    ]);

    setVehicleEvents(events);
    setExpenses(expenseRows);
    setWaterReadings(waterRows);
  }, [secilenIl]);

  useEffect(() => {
    loadAll().catch((error) => console.error('Aftoyuma məlumatları alınmadı:', error.message));
  }, [loadAll]);

  useEffect(() => {
    const previous = findPreviousReading(waterReadings, waterForm.il, waterForm.ay);
    setWaterForm((prev) => ({
      ...prev,
      oldReading: previous ? String(previous.newReading) : prev.oldReading,
    }));
  }, [waterReadings, waterForm.il, waterForm.ay]);

  const filteredEvents = useMemo(
    () => vehicleEvents.filter((item) => eventMatches(item, secilenIl, secilenAy) && item.direction === 'entry'),
    [vehicleEvents, secilenIl, secilenAy],
  );
  const todayEvents = useMemo(
    () => vehicleEvents.filter((item) => localDateKey(new Date(item.createdAt)) === localDateKey(new Date()) && item.direction === 'entry'),
    [vehicleEvents],
  );
  const filteredExpenses = useMemo(
    () => expenses.filter((item) => expenseMatches(item, secilenIl, secilenAy)),
    [expenses, secilenIl, secilenAy],
  );
  const filteredWater = useMemo(
    () => waterReadings.filter((item) => Number(item.il) === Number(secilenIl) && item.ay === secilenAy),
    [waterReadings, secilenIl, secilenAy],
  );

  const monthlyExpenseTotal = filteredExpenses.reduce((sum, item) => sum + toAmount(item.amount), 0);
  const monthlyWaterTotal = filteredWater.reduce((sum, item) => sum + toAmount(item.total), 0);
  const monthlyWaterUsage = filteredWater.reduce((sum, item) => sum + toAmount(item.usageAmount), 0);
  const lastPlate = todayEvents[0]?.plate || '-';

  const handleSavePlate = async (e) => {
    e.preventDefault();
    const plate = plateInput.trim().toUpperCase();
    if (!plate) return;

    try {
      await vehicleEventsApi.create({ plate, direction, source: 'manual' });
      setPlateInput('');
      await loadAll();
    } catch (error) {
      alert(`Nömrə yadda saxlanmadı: ${error.message}`);
    }
  };

  const handleSaveExpense = async (e) => {
    e.preventDefault();

    try {
      await washExpensesApi.create(expenseForm);
      setExpenseForm((prev) => ({ ...prev, title: '', amount: '', note: '' }));
      await loadAll();
    } catch (error) {
      alert(`Xərc yadda saxlanmadı: ${error.message}`);
    }
  };

  const handleSaveWater = async (e) => {
    e.preventDefault();

    try {
      await washWaterApi.create(waterForm);
      setWaterForm((prev) => ({ ...prev, newReading: '' }));
      await loadAll();
    } catch (error) {
      alert(`Su göstəricisi yadda saxlanmadı: ${error.message}`);
    }
  };

  return (
    <div style={wrap}>
      <header style={header}>
        <div>
          <h2 style={title}>Aftoyuma</h2>
          <div style={sub}>Maşın sayı, xərclər və su göstəricisi</div>
        </div>
        <div style={filterRow}>
          <Field label="İl">
            <input type="number" min="2020" max="2100" value={secilenIl} onChange={(e) => setSecilenIl(e.target.value)} list="aftoyuma-iller" style={controlStyle} />
            <datalist id="aftoyuma-iller">
              {getYearOptions(secilenIl).map((il) => <option key={il} value={il} />)}
            </datalist>
          </Field>
          <Field label="Ay">
            <select value={secilenAy} onChange={(e) => setSecilenAy(e.target.value)} style={controlStyle}>
              {aylar.map((ay) => <option key={ay} value={ay}>{ay}</option>)}
            </select>
          </Field>
        </div>
      </header>

      <section style={summaryGrid}>
        <Summary title="Bugünkü maşın" value={`${todayEvents.length}`} color={theme.colors.text} />
        <Summary title={`${secilenAy} maşın`} value={`${filteredEvents.length}`} color={theme.colors.primary} />
        <Summary title="Aylıq xərclər" value={formatMoney(monthlyExpenseTotal)} color={theme.colors.wash} />
        <Summary title="Su pulu" value={formatMoney(monthlyWaterTotal)} color={theme.colors.teal} />
      </section>

      <section style={grid}>
        <Panel title="Maşın qeydiyyatı">
          <form onSubmit={handleSavePlate} style={formGrid}>
            <Field label="Nömrə">
              <input value={plateInput} onChange={(e) => setPlateInput(e.target.value)} placeholder="10AA001" style={{ ...controlStyle, width: '100%' }} />
            </Field>
            <Field label="İstiqamət">
              <select value={direction} onChange={(e) => setDirection(e.target.value)} style={{ ...controlStyle, width: '100%' }}>
                <option value="entry">Giriş</option>
                <option value="exit">Çıxış</option>
              </select>
            </Field>
            <button type="submit" style={button}>Qeyd et</button>
          </form>
          <MetricRow label="Son nömrə" value={lastPlate} />
        </Panel>

        <Panel title="Xərc əlavə et">
          <form onSubmit={handleSaveExpense} style={formGrid}>
            <Field label="Tarix">
              <input type="date" value={expenseForm.expenseDate} onChange={(e) => setExpenseForm((prev) => ({ ...prev, expenseDate: e.target.value }))} style={{ ...controlStyle, width: '100%' }} />
            </Field>
            <Field label="Xərc adı">
              <input value={expenseForm.title} onChange={(e) => setExpenseForm((prev) => ({ ...prev, title: e.target.value }))} placeholder="Dərman, təkər qaraldan..." style={{ ...controlStyle, width: '100%' }} />
            </Field>
            <Field label="Məbləğ">
              <input type="number" step="any" value={expenseForm.amount} onChange={(e) => setExpenseForm((prev) => ({ ...prev, amount: e.target.value }))} style={{ ...controlStyle, width: '100%' }} />
            </Field>
            <Field label="Qeyd">
              <input value={expenseForm.note} onChange={(e) => setExpenseForm((prev) => ({ ...prev, note: e.target.value }))} style={{ ...controlStyle, width: '100%' }} />
            </Field>
            <button type="submit" style={button}>Xərci saxla</button>
          </form>
        </Panel>

        <Panel title="Su göstəricisi">
          <form onSubmit={handleSaveWater} style={formGrid}>
            <Field label="İl">
              <input type="number" value={waterForm.il} onChange={(e) => setWaterForm((prev) => ({ ...prev, il: e.target.value }))} style={{ ...controlStyle, width: '100%' }} />
            </Field>
            <Field label="Ay">
              <select value={waterForm.ay} onChange={(e) => setWaterForm((prev) => ({ ...prev, ay: e.target.value }))} style={{ ...controlStyle, width: '100%' }}>
                {aylar.map((ay) => <option key={ay} value={ay}>{ay}</option>)}
              </select>
            </Field>
            <Field label="Köhnə">
              <input type="number" step="any" value={waterForm.oldReading} onChange={(e) => setWaterForm((prev) => ({ ...prev, oldReading: e.target.value }))} style={{ ...controlStyle, width: '100%' }} />
            </Field>
            <Field label="Yeni">
              <input type="number" step="any" value={waterForm.newReading} onChange={(e) => setWaterForm((prev) => ({ ...prev, newReading: e.target.value }))} style={{ ...controlStyle, width: '100%' }} />
            </Field>
            <Field label="Qiymət">
              <input type="number" step="any" value={waterForm.pricePerUnit} onChange={(e) => setWaterForm((prev) => ({ ...prev, pricePerUnit: e.target.value }))} style={{ ...controlStyle, width: '100%' }} />
            </Field>
            <button type="submit" style={button}>Su göstəricisini saxla</button>
          </form>
          <MetricRow label="Aylıq sərfiyyat" value={`${monthlyWaterUsage.toFixed(2)} kub`} />
        </Panel>
      </section>

      <section style={grid}>
        <Panel title={`${secilenAy} xərcləri`}>
          <SimpleTable
            rows={filteredExpenses}
            empty="Bu ay xərc yoxdur."
            columns={[
              ['Tarix', (item) => formatDate(item.expenseDate)],
              ['Xərc', (item) => item.title],
              ['Məbləğ', (item) => formatMoney(item.amount)],
              ['Qeyd', (item) => item.note || '-'],
            ]}
          />
        </Panel>

        <Panel title={`${secilenAy} maşın qeydləri`}>
          <SimpleTable
            rows={filteredEvents.slice(0, 20)}
            empty="Bu ay maşın qeydi yoxdur."
            columns={[
              ['Vaxt', (item) => formatDateTime(item.createdAt)],
              ['Nömrə', (item) => item.plate],
              ['Mənbə', (item) => item.source],
            ]}
          />
        </Panel>

        <Panel title="Su tarixçəsi">
          <SimpleTable
            rows={filteredWater}
            empty="Bu ay su göstəricisi yoxdur."
            columns={[
              ['Ay', (item) => `${item.il} / ${item.ay}`],
              ['Köhnə', (item) => item.oldReading.toFixed(2)],
              ['Yeni', (item) => item.newReading.toFixed(2)],
              ['Sərfiyyat', (item) => item.usageAmount.toFixed(2)],
              ['Total', (item) => formatMoney(item.total)],
            ]}
          />
        </Panel>
      </section>
    </div>
  );
}

function eventMatches(item, il, ay) {
  const date = new Date(item.createdAt);
  return date.getFullYear() === Number(il) && aylar[date.getMonth()] === ay;
}

function expenseMatches(item, il, ay) {
  const date = new Date(item.expenseDate);
  return date.getFullYear() === Number(il) && aylar[date.getMonth()] === ay;
}

function findPreviousReading(readings, il, ay) {
  const currentIndex = aylar.indexOf(ay);
  if (currentIndex === -1) return null;

  const previousAy = currentIndex === 0 ? aylar[11] : aylar[currentIndex - 1];
  const previousIl = currentIndex === 0 ? Number(il) - 1 : Number(il);

  return readings
    .filter((item) => Number(item.il) === previousIl && item.ay === previousAy)
    .sort((a, b) => Number(b.id) - Number(a.id))[0] || null;
}

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDate(value) {
  return new Date(value).toLocaleDateString('az-AZ');
}

function formatDateTime(value) {
  return new Date(value).toLocaleString('az-AZ', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
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
      <h3 style={panelTitle}>{title}</h3>
      {children}
    </section>
  );
}

function Summary({ title, value, color }) {
  return (
    <div style={summary}>
      <div style={{ color: theme.colors.muted, fontSize: '12px', fontWeight: 700 }}>{title}</div>
      <div style={{ color, fontSize: '21px', fontWeight: 900, marginTop: '6px' }}>{value}</div>
    </div>
  );
}

function MetricRow({ label, value }) {
  return (
    <div style={metricRow}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SimpleTable({ rows, columns, empty }) {
  if (!rows.length) {
    return <div style={emptyStyle}>{empty}</div>;
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={table}>
        <thead>
          <tr>
            {columns.map(([label]) => <th key={label} style={tableHead}>{label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.id}-${index}`}>
              {columns.map(([label, accessor]) => <td key={label} style={tableCell}>{accessor(row)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const wrap = { padding: '15px', maxWidth: '1180px', margin: '0 auto', color: theme.colors.text };
const header = { background: theme.colors.surface, padding: '15px', borderRadius: theme.radius.md, border: `1px solid ${theme.colors.border}`, marginBottom: '15px', display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'space-between', alignItems: 'end' };
const title = { margin: 0, color: theme.colors.text, fontSize: '20px', fontWeight: 800 };
const sub = { marginTop: '4px', color: theme.colors.muted, fontSize: '12px' };
const filterRow = { display: 'flex', gap: '10px', flexWrap: 'wrap' };
const summaryGrid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px', marginBottom: '15px' };
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '12px', marginBottom: '15px' };
const panel = { background: theme.colors.surface, padding: '15px', borderRadius: theme.radius.md, border: `1px solid ${theme.colors.border}` };
const panelTitle = { margin: '0 0 12px', color: theme.colors.text, fontSize: '16px' };
const summary = { background: theme.colors.surface, border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.md, padding: '12px' };
const formGrid = { display: 'grid', gap: '10px' };
const metricRow = { display: 'flex', justifyContent: 'space-between', gap: '12px', marginTop: '12px', padding: '10px', borderRadius: theme.radius.sm, background: theme.colors.surfaceSoft, color: theme.colors.muted, fontSize: '13px' };
const labelStyle = { display: 'block', color: theme.colors.muted, fontSize: '12px', fontWeight: 700, marginBottom: '5px' };
const controlStyle = { width: '130px', padding: '10px', borderRadius: '7px', border: `1px solid ${theme.colors.border}`, background: '#fff', fontSize: '14px', boxSizing: 'border-box' };
const button = { padding: '11px', borderRadius: '7px', border: 'none', background: theme.colors.text, color: '#fff', cursor: 'pointer', fontWeight: 800 };
const emptyStyle = { padding: '22px', textAlign: 'center', color: theme.colors.muted, background: theme.colors.surfaceSoft, borderRadius: theme.radius.md };
const table = { width: '100%', borderCollapse: 'collapse', fontSize: '12px' };
const tableHead = { textAlign: 'left', padding: '10px 8px', borderBottom: `1px solid ${theme.colors.border}`, color: '#475569', background: '#f8fafc' };
const tableCell = { padding: '10px 8px', borderBottom: '1px solid #eef2f7', color: '#0f172a', whiteSpace: 'nowrap' };

export default Aftoyuma;
