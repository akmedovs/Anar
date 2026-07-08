import { useCallback, useEffect, useMemo, useState } from 'react';
import { reportsApi } from '../../api/reports';
import { aylar, cariIl, formatMoney, netReportTotal } from '../../constants/reporting';
import { theme } from '../../constants/theme';

function AdminOnly() {
  const [dbData, setDbData] = useState([]);
  const [selectedReportKey, setSelectedReportKey] = useState('');
  const [formData, setFormData] = useState({
    il: cariIl,
    ay: aylar[new Date().getMonth()],
    ev: 'K-1',
    kiraye: '',
    kohneIsiq: '',
    yeniIsiq: '',
    suNefer: '',
    wifi: '',
  });

  const fetchReports = useCallback(async (il) => {
    const data = await reportsApi.list({ il });
    setDbData(data.filter((item) => item.ev !== 'MOYKA'));
  }, []);

  useEffect(() => {
    fetchReports(formData.il).catch((error) => console.error(error.message));
  }, [fetchReports, formData.il]);

  useEffect(() => {
    const current = findLatestReport(dbData, formData.il, formData.ay, formData.ev);
    const previous = findPreviousReport(dbData, formData.il, formData.ay, formData.ev);

    setFormData((prev) => ({
      ...prev,
      kohneIsiq: current ? String(current.kohneIsiq ?? '') : previous ? String(previous.yeniIsiq ?? '') : '',
      yeniIsiq: current ? String(current.yeniIsiq ?? '') : '',
      kiraye: current ? String(current.kiraye ?? '') : prev.kiraye,
      wifi: current ? String(current.wifi ?? '') : prev.wifi,
    }));
  }, [dbData, formData.il, formData.ay, formData.ev]);

  useEffect(() => {
    if (!selectedReportKey) return;
    const selected = dbData.find((item) => keyOf(item) === selectedReportKey);
    if (!selected) return;
    setFormData({
      il: Number(selected.il),
      ay: selected.ay,
      ev: selected.ev,
      kiraye: String(selected.kiraye ?? ''),
      kohneIsiq: String(selected.kohneIsiq ?? ''),
      yeniIsiq: String(selected.yeniIsiq ?? ''),
      suNefer: String(selected.suNefer ?? ''),
      wifi: String(selected.wifi ?? ''),
    });
  }, [selectedReportKey, dbData]);

  const currentReports = useMemo(() => dbData.slice().sort((a, b) => Number(b.il) - Number(a.il) || aylar.indexOf(a.ay) - aylar.indexOf(b.ay)), [dbData]);

  const handleChange = (e) => setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();

    const il = Number(formData.il) || cariIl;
    const kirayeNum = Number(formData.kiraye) || 0;
    const kohneIsiqNum = Number(formData.kohneIsiq) || 0;
    const yeniIsiqNum = Number(formData.yeniIsiq) || 0;
    const suNeferNum = Number(formData.suNefer) || 0;
    const wifiNum = Number(formData.wifi) || 0;
    const tarif = 0.15;
    const suQiymet = 3;
    const serfiyyat = Math.max(0, yeniIsiqNum - kohneIsiqNum);
    const isiqPulu = serfiyyat * tarif;
    const suCem = suNeferNum * suQiymet;
    const total = kirayeNum - isiqPulu - suCem - wifiNum;

    await reportsApi.create({
      il,
      ay: formData.ay,
      ev: formData.ev,
      kiraye: kirayeNum,
      kohneIsiq: kohneIsiqNum,
      yeniIsiq: yeniIsiqNum,
      serfiyyat,
      isiqPulu,
      suCem,
      wifi: wifiNum,
      total,
    });

    setSelectedReportKey('');
    await fetchReports(il);
  };

  return (
    <div style={wrap}>
      <h1 style={title}>Kirayə qeydləri</h1>
      <p style={sub}>Mövcud qeydi seç, məlumatları yeni qeyd kimi saxla</p>

      <section style={panel}>
        <h2 style={panelTitle}>Mövcud qeydlər</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
          {currentReports.slice(0, 12).map((item) => (
            <button key={keyOf(item)} type="button" onClick={() => setSelectedReportKey(keyOf(item))} style={pill(selectedReportKey === keyOf(item))}>
              {item.il} / {item.ay} / {item.ev}
            </button>
          ))}
        </div>

        <form onSubmit={save} style={{ display: 'grid', gap: '12px' }}>
          <Row>
            <Field label="İl"><input type="number" name="il" value={formData.il} onChange={handleChange} style={control} /></Field>
            <Field label="Ay"><select name="ay" value={formData.ay} onChange={handleChange} style={control}>{aylar.map((ay) => <option key={ay} value={ay}>{ay}</option>)}</select></Field>
            <Field label="Ev"><select name="ev" value={formData.ev} onChange={handleChange} style={control}>{['K-1', 'K-2', 'K-3', 'K-4', 'K-5', 'K-PDVL'].map((ev) => <option key={ev} value={ev}>{ev}</option>)}</select></Field>
          </Row>
          <Row>
            <Field label="Kiraye"><input type="number" name="kiraye" value={formData.kiraye} onChange={handleChange} style={control} /></Field>
            <Field label="Köhnə"><input type="number" name="kohneIsiq" value={formData.kohneIsiq} onChange={handleChange} style={control} /></Field>
            <Field label="Yeni"><input type="number" name="yeniIsiq" value={formData.yeniIsiq} onChange={handleChange} style={control} /></Field>
          </Row>
          <Row>
            <Field label="Su nəfər"><input type="number" name="suNefer" value={formData.suNefer} onChange={handleChange} style={control} /></Field>
            <Field label="Internet xərci"><input type="number" name="wifi" value={formData.wifi} onChange={handleChange} style={control} /></Field>
            <div />
          </Row>
          <button type="submit" style={button}>Yadda Saxla</button>
        </form>
      </section>

      <section style={{ ...panel, marginTop: '14px' }}>
        <h2 style={panelTitle}>Cədvəl</h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={table}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['İl', 'Ay', 'Ev', 'Kiraye', 'İşıq xərci', 'Su xərci', 'Internet xərci', 'Net'].map((x) => <th key={x} style={th}>{x}</th>)}
              </tr>
            </thead>
            <tbody>
              {currentReports.map((item) => (
                <tr key={keyOf(item)} style={{ background: '#fff' }}>
                  <td style={td}>{item.il}</td>
                  <td style={td}>{item.ay}</td>
                  <td style={td}>{item.ev}</td>
                  <td style={td}>{formatMoney(item.kiraye)}</td>
                  <td style={td}>{formatMoney(item.isiqPulu)}</td>
                  <td style={td}>{formatMoney(item.suCem)}</td>
                  <td style={td}>{formatMoney(item.wifi)}</td>
                  <td style={td}>{formatMoney(netReportTotal(item))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

const wrap = { padding: '16px', maxWidth: '1120px', margin: '0 auto', color: theme.colors.text };
const title = { margin: 0, fontSize: '22px', color: theme.colors.text };
const sub = { margin: '4px 0 12px', color: theme.colors.muted, fontSize: '13px' };
const panel = { background: theme.colors.surface, border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.md, padding: '14px' };
const panelTitle = { margin: '0 0 12px', fontSize: '15px', color: theme.colors.text };
const button = { padding: '14px', borderRadius: theme.radius.md, border: 'none', background: theme.colors.text, color: '#fff', fontWeight: 700, cursor: 'pointer' };
const table = { width: '100%', borderCollapse: 'collapse', fontSize: '12px' };
const th = { textAlign: 'left', padding: '10px 8px', borderBottom: `1px solid ${theme.colors.border}`, color: '#475569' };
const td = { padding: '10px 8px', borderBottom: '1px solid #eef2f7', color: theme.colors.text, whiteSpace: 'nowrap' };
const control = { width: '100%', padding: '10px', borderRadius: '7px', border: `1px solid ${theme.colors.border}`, background: '#fff', fontSize: '14px', boxSizing: 'border-box' };
const rowStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' };
const Row = ({ children }) => <div style={rowStyle}>{children}</div>;
const Field = ({ label, children }) => <div><label style={{ display: 'block', marginBottom: '5px', color: theme.colors.muted, fontSize: '12px', fontWeight: 700 }}>{label}</label>{children}</div>;
const keyOf = (item) => `${item.id}-${item.il}-${item.ay}-${item.ev}`;
const pill = (active) => ({ border: `1px solid ${theme.colors.border}`, background: active ? theme.colors.text : theme.colors.surface, color: active ? '#fff' : '#334155', borderRadius: theme.radius.pill, padding: '8px 12px', cursor: 'pointer', fontSize: '12px', fontWeight: 700 });

function findLatestReport(data, il, ay, ev) {
  return data
    .filter((item) =>
      Number(item.il) === Number(il) &&
      String(item.ev).trim() === String(ev).trim() &&
      String(item.ay).trim().toLowerCase() === String(ay).trim().toLowerCase())
    .sort((a, b) => Number(b.id) - Number(a.id))[0] || null;
}

function findPreviousReport(data, il, ay, ev) {
  const currentIndex = aylar.indexOf(ay);
  if (currentIndex === -1) return null;

  const previousAy = currentIndex === 0 ? aylar[11] : aylar[currentIndex - 1];
  const previousIl = currentIndex === 0 ? Number(il) - 1 : Number(il);
  return findLatestReport(data, previousIl, previousAy, ev);
}

export default AdminOnly;
