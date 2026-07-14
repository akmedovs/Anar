import { useEffect, useMemo, useState } from 'react';
import { reportsApi, washExpensesApi, washWaterApi } from '../../api/reports';
import { aylar, cariAy, cariIl, localDateKey } from '../../constants/reporting';
import { theme } from '../../constants/theme';

const rentEvOptions = ['K-1', 'K-2', 'K-3', 'K-4', 'K-5', 'K-PDVL'];

function AdminBig() {
  const [mode, setMode] = useState('kiraye');
  const [settings, setSettings] = useState(loadSettings);
  const [draftSettings, setDraftSettings] = useState(() => ({ ...loadSettings() }));
  const [rentRecords, setRentRecords] = useState([]);
  const [moykaReports, setMoykaReports] = useState([]);
  const [waterRecords, setWaterRecords] = useState([]);
  const [expenseRecords, setExpenseRecords] = useState([]);
  const [notice, setNotice] = useState('');
  const [rentSelection, setRentSelection] = useState({ il: cariIl, ay: cariAy, ev: 'K-1' });
  const [rentForm, setRentForm] = useState({
    kiraye: loadSettings().standartKiraye,
    kohneIsiq: '',
    yeniIsiq: '',
    suNefer: '',
    internet: loadSettings().standartInternet,
  });
  const [moykaSelection, setMoykaSelection] = useState({ il: cariIl, ay: cariAy });
  const [moykaForm, setMoykaForm] = useState({
    kohneIsiq: '',
    yeniIsiq: '',
    oldReading: '',
    newReading: '',
    expenseDate: localDateKey(new Date()),
    title: '',
    amount: '',
    note: '',
  });

  useEffect(() => {
    reportsApi.list({ il: rentSelection.il }).then((rows) => setRentRecords(rows.filter((row) => row.ev !== 'MOYKA'))).catch((error) => console.error(error.message));
  }, [rentSelection.il]);

  useEffect(() => {
    Promise.all([
      reportsApi.list({ il: moykaSelection.il }),
      washWaterApi.list({ il: moykaSelection.il }),
      washExpensesApi.list({ il: moykaSelection.il }),
    ])
      .then(([reports, water, expenses]) => {
        setMoykaReports(reports.filter((row) => row.ev === 'MOYKA'));
        setWaterRecords(water);
        setExpenseRecords(expenses);
      })
      .catch((error) => console.error(error.message));
  }, [moykaSelection.il]);

  useEffect(() => {
    const current = findLatestReport(rentRecords, rentSelection.il, rentSelection.ay, rentSelection.ev);
    const previous = findPreviousReport(rentRecords, rentSelection.il, rentSelection.ay, rentSelection.ev);
    const isJanuary = aylar.indexOf(rentSelection.ay) === 0;

    setRentForm((prev) => ({
      ...prev,
      kiraye: current ? String(current.kiraye ?? '') : settings.standartKiraye,
      kohneIsiq: current
        ? String(current.kohneIsiq ?? '')
        : isJanuary
          ? ''
          : previous
            ? String(previous.yeniIsiq ?? '')
            : '',
      yeniIsiq: current ? String(current.yeniIsiq ?? '') : '',
      suNefer: current ? String(current.suNefer ?? '') : '',
      internet: current ? String(current.wifi ?? '') : settings.standartInternet,
    }));
  }, [rentRecords, rentSelection.ay, rentSelection.ev, rentSelection.il, settings.standartInternet, settings.standartKiraye]);

  useEffect(() => {
    const currentReport = findLatestReport(moykaReports, moykaSelection.il, moykaSelection.ay, 'MOYKA');
    const previousReport = findPreviousReport(moykaReports, moykaSelection.il, moykaSelection.ay, 'MOYKA');
    const currentWater = findLatestWaterReading(waterRecords, moykaSelection.il, moykaSelection.ay);
    const previousWater = findPreviousWaterReading(waterRecords, moykaSelection.il, moykaSelection.ay);
    const currentExpense = findLatestExpense(expenseRecords, moykaSelection.il, moykaSelection.ay);
    const isJanuary = aylar.indexOf(moykaSelection.ay) === 0;

    setMoykaForm((prev) => ({
      ...prev,
      kohneIsiq: currentReport
        ? String(currentReport.kohneIsiq ?? '')
        : isJanuary
          ? ''
          : previousReport
            ? String(previousReport.yeniIsiq ?? '')
            : '',
      yeniIsiq: currentReport ? String(currentReport.yeniIsiq ?? '') : '',
      oldReading: currentWater
        ? String(currentWater.oldReading ?? '')
        : isJanuary
          ? ''
          : previousWater
            ? String(previousWater.newReading ?? '')
            : '',
      newReading: currentWater ? String(currentWater.newReading ?? '') : '',
      expenseDate: currentExpense ? String(currentExpense.expenseDate).slice(0, 10) : localDateKey(new Date()),
      title: currentExpense ? String(currentExpense.title ?? '') : '',
      amount: currentExpense ? String(currentExpense.amount ?? '') : '',
      note: currentExpense ? String(currentExpense.note ?? '') : '',
    }));
  }, [expenseRecords, moykaReports, moykaSelection.ay, moykaSelection.il, waterRecords]);

  const handleRentSelection = (e) => {
    const { name, value } = e.target;
    setRentSelection((prev) => ({ ...prev, [name]: value }));
  };

  const handleRentForm = (e) => {
    const { name, value } = e.target;
    setRentForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleMoykaSelection = (e) => {
    const { name, value } = e.target;
    setMoykaSelection((prev) => ({ ...prev, [name]: value }));
  };

  const handleMoykaForm = (e) => {
    const { name, value } = e.target;
    setMoykaForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSettingsChange = (e) => {
    const { name, value } = e.target;
    setDraftSettings((prev) => ({ ...prev, [name]: value }));
  };

  const saveSettings = () => {
    setSettings({ ...draftSettings });
    localStorage.setItem('qlobal_ayarlar', JSON.stringify(draftSettings));
    setNotice('Qlobal tariflər yeniləndi.');
  };

  const saveRent = async (e) => {
    e.preventDefault();
    const il = Number(rentSelection.il) || cariIl;
    const ay = String(rentSelection.ay).trim();
    const ev = String(rentSelection.ev).trim();
    const tarif = Number(settings.isiqTarif) || 0.15;
    const kirayeNum = Number(rentForm.kiraye) || 0;
    const kohneIsiqNum = Number(rentForm.kohneIsiq) || 0;
    const yeniIsiqNum = Number(rentForm.yeniIsiq) || 0;
    const suNeferNum = Number(rentForm.suNefer) || 0;
    const internetNum = Number(rentForm.internet) || 0;
    const serfiyyat = yeniIsiqNum - kohneIsiqNum;
    const isiqPulu = Number((Math.max(0, serfiyyat) * tarif).toFixed(2));
    const suCem = Number((suNeferNum * (Number(settings.suQiymet) || 0)).toFixed(2));
    const total = Number((kirayeNum - isiqPulu - suCem - internetNum).toFixed(2));

    try {
      await reportsApi.create({
        il,
        ay,
        ev,
        kiraye: kirayeNum,
        kohneIsiq: kohneIsiqNum,
        yeniIsiq: yeniIsiqNum,
        serfiyyat,
        isiqPulu,
        suCem,
        wifi: internetNum,
        total,
      });

      setRentRecords(await reportsApi.list({ il }));
      setNotice('Kirayə qeydi saxlanıldı.');
    } catch (error) {
      setNotice(`Kirayə saxlanmadı: ${error.message}`);
    }
  };

  const saveMoyka = async (e) => {
    e.preventDefault();
    const il = Number(moykaSelection.il) || cariIl;
    const ay = String(moykaSelection.ay).trim();
    const tarif = Number(settings.isiqTarif) || 0.15;
    const oldIsiq = Number(moykaForm.kohneIsiq) || 0;
    const newIsiq = Number(moykaForm.yeniIsiq) || 0;
    const oldWater = Number(moykaForm.oldReading) || 0;
    const newWater = Number(moykaForm.newReading) || 0;
    const serfiyyat = newIsiq - oldIsiq;
    const isiqPulu = Number((Math.max(0, serfiyyat) * tarif).toFixed(2));

    try {
      await reportsApi.create({
        il,
        ay,
        ev: 'MOYKA',
        kiraye: 0,
        kohneIsiq: oldIsiq,
        yeniIsiq: newIsiq,
        serfiyyat,
        isiqPulu,
        suCem: 0,
        wifi: 0,
        total: Number((-isiqPulu).toFixed(2)),
      });

      await washWaterApi.create({ il, ay, oldReading: oldWater, newReading: newWater, pricePerUnit: 1 });
      await washExpensesApi.create(moykaForm);

      await Promise.all([
        reportsApi.list({ il }).then((rows) => setMoykaReports(rows.filter((row) => row.ev === 'MOYKA'))),
        washWaterApi.list({ il }).then(setWaterRecords),
        washExpensesApi.list({ il }).then(setExpenseRecords),
      ]);

      setNotice('Aftoyuma qeydləri saxlanıldı.');
    } catch (error) {
      setNotice(`Aftoyuma saxlanmadı: ${error.message}`);
    }
  };

  const isMoyka = mode === 'moyka';

  return (
    <div style={wrap}>
      <div style={hero}>
        <div>
          <div style={eyebrow}>Admin bölməsi</div>
          <h1 style={title}>Kirayə və Aftoyuma idarəetməsi</h1>
          <p style={sub}>Rejim seç, qeydi aç və eyni ekran üzərindən düzəlt. Hazırda aktiv rejim: <strong>{isMoyka ? 'Aftoyuma' : 'Kirayə'}</strong>.</p>
        </div>
        {notice && <div style={noticeBox}>{notice}</div>}
      </div>

      <div style={tabs}>
        <button type="button" onClick={() => setMode('kiraye')} style={tabButton(mode === 'kiraye')}>Kirayə</button>
        <button type="button" onClick={() => setMode('moyka')} style={tabButton(mode === 'moyka')}>Aftoyuma</button>
      </div>

      <div style={card}>
        <h3 style={sectionTitle}>Qlobal Tarif Ayarları</h3>
        <div style={{ display: 'grid', gap: '12px' }}>
          {[
            ['isiqTarif', 'İşıq Tarifi (1 Kwt / ₼)'],
            ['suQiymet', 'Su Qiyməti (Nəfər başı / ₼)'],
            ['standartKiraye', 'Standart Kirayə (₼)'],
            ['standartInternet', 'Standart Wifi (₼)'],
          ].map(([name, label]) => (
            <div key={name}>
              <label style={labelStyle}>{label}</label>
              <input type="number" step="any" name={name} value={draftSettings[name]} onChange={handleSettingsChange} style={inputStyle} />
            </div>
          ))}
          <button type="button" onClick={saveSettings} style={primaryButton}>Qiymətləri Yenilə və Tətbiq Et</button>
        </div>
      </div>

      {mode === 'kiraye' && (
        <div style={card}>
          <div style={{ borderLeft: `4px solid ${theme.colors.primary}`, paddingLeft: '10px', marginBottom: '18px' }}>
            <h2 style={{ margin: 0, color: theme.colors.text, fontSize: '18px', fontWeight: '700' }}>Kirayə giriş paneli</h2>
          </div>
          <form onSubmit={saveRent} style={{ display: 'grid', gap: '15px' }}>
            <Row>
              <Field label="İl">
                <input type="number" name="il" value={rentSelection.il} onChange={handleRentSelection} style={inputStyle} />
              </Field>
              <Field label="Hesabat Ayı">
                <select name="ay" value={rentSelection.ay} onChange={handleRentSelection} style={inputStyle}>
                  {aylar.map((ay) => <option key={ay} value={ay}>{ay}</option>)}
                </select>
              </Field>
              <Field label="Ev / Obyekt">
                <select name="ev" value={rentSelection.ev} onChange={handleRentSelection} style={inputStyle}>
                  {rentEvOptions.map((ev) => <option key={ev} value={ev}>{ev}</option>)}
                </select>
              </Field>
            </Row>
            <Row>
              <Field label="Kiraye">
                <input type="number" step="any" name="kiraye" value={rentForm.kiraye} onChange={handleRentForm} style={inputStyle} />
              </Field>
              <Field label="Wifi">
                <input type="number" step="any" name="internet" value={rentForm.internet} onChange={handleRentForm} style={inputStyle} />
              </Field>
            </Row>
            <div style={infoBox(false)}>
              <span style={infoTitle(false)}>İşıq sayğac göstəricisi</span>
              <Row>
                <Field label="Köhnə">
                  <input type="number" name="kohneIsiq" value={rentForm.kohneIsiq} onChange={handleRentForm} style={inputStyle} />
                </Field>
                <Field label="Yeni">
                  <input type="number" name="yeniIsiq" value={rentForm.yeniIsiq} onChange={handleRentForm} style={inputStyle} />
                </Field>
              </Row>
            </div>
            <div style={infoBox(false)}>
              <span style={infoTitle(false)}>Su hesabı</span>
              <Field label="Su nəfər sayı">
                <input type="number" name="suNefer" value={rentForm.suNefer} onChange={handleRentForm} style={inputStyle} />
              </Field>
            </div>
            <button type="submit" style={submitButton}>Hesablamanı Saxla</button>
          </form>
        </div>
      )}

      {mode === 'moyka' && (
        <div style={card}>
          <div style={{ borderLeft: `4px solid ${theme.colors.wash}`, paddingLeft: '10px', marginBottom: '18px' }}>
            <h2 style={{ margin: 0, color: theme.colors.text, fontSize: '18px', fontWeight: '700' }}>Aftoyuma giriş paneli</h2>
          </div>
          <form onSubmit={saveMoyka} style={{ display: 'grid', gap: '15px' }}>
            <Row>
              <Field label="İl">
                <input type="number" name="il" value={moykaSelection.il} onChange={handleMoykaSelection} style={inputStyle} />
              </Field>
              <Field label="Hesabat Ayı">
                <select name="ay" value={moykaSelection.ay} onChange={handleMoykaSelection} style={inputStyle}>
                  {aylar.map((ay) => <option key={ay} value={ay}>{ay}</option>)}
                </select>
              </Field>
            </Row>

            <div style={infoBox(true)}>
              <span style={infoTitle(true)}>Aftoyuma işıq sayğac göstəricisi</span>
              <Row>
                <Field label="Köhnə">
                  <input type="number" name="kohneIsiq" value={moykaForm.kohneIsiq} onChange={handleMoykaForm} style={inputStyle} />
                </Field>
                <Field label="Yeni">
                  <input type="number" name="yeniIsiq" value={moykaForm.yeniIsiq} onChange={handleMoykaForm} style={inputStyle} />
                </Field>
              </Row>
            </div>

            <div style={infoBox(true)}>
              <span style={infoTitle(true)}>Aftoyuma su sayğac göstəricisi</span>
              <Row>
                <Field label="Köhnə">
                  <input type="number" name="oldReading" value={moykaForm.oldReading} onChange={handleMoykaForm} style={inputStyle} />
                </Field>
                <Field label="Yeni">
                  <input type="number" name="newReading" value={moykaForm.newReading} onChange={handleMoykaForm} style={inputStyle} />
                </Field>
              </Row>
              <div style={hint}>Hesablanma: yeni - köhnə, 1 ton = 1 ₼</div>
            </div>

            <div style={infoBox(false)}>
              <span style={infoTitle(false)}>Aftoyuma xərci</span>
              <Row>
                <Field label="Tarix">
                  <input type="date" name="expenseDate" value={moykaForm.expenseDate} onChange={handleMoykaForm} style={inputStyle} />
                </Field>
                <Field label="Xərc adı">
                  <input type="text" name="title" value={moykaForm.title} onChange={handleMoykaForm} style={inputStyle} />
                </Field>
              </Row>
              <Row>
                <Field label="Məbləğ">
                  <input type="number" step="any" name="amount" value={moykaForm.amount} onChange={handleMoykaForm} style={inputStyle} />
                </Field>
                <Field label="Qeyd">
                  <input type="text" name="note" value={moykaForm.note} onChange={handleMoykaForm} style={inputStyle} />
                </Field>
              </Row>
            </div>

            <button type="submit" style={submitButtonMoyka}>Hamısını Saxla</button>
          </form>
        </div>
      )}
    </div>
  );
}

function loadSettings() {
  if (typeof window === 'undefined') {
    return {
      isiqTarif: '0.15',
      suQiymet: '3',
      standartKiraye: '300',
      standartInternet: '5',
    };
  }

  try {
    const saved = JSON.parse(localStorage.getItem('qlobal_ayarlar'));
    return saved || {
      isiqTarif: '0.15',
      suQiymet: '3',
      standartKiraye: '300',
      standartInternet: '5',
    };
  } catch {
    return {
      isiqTarif: '0.15',
      suQiymet: '3',
      standartKiraye: '300',
      standartInternet: '5',
    };
  }
}

function findLatestReport(data, il, ay, ev) {
  return (
    data
      .filter((item) => Number(item.il) === Number(il) && String(item.ev).trim() === String(ev).trim() && String(item.ay).trim().toLowerCase() === String(ay).trim().toLowerCase())
      .sort((a, b) => Number(b.id) - Number(a.id))[0] || null
  );
}

function findPreviousReport(data, il, ay, ev) {
  const currentIndex = aylar.indexOf(ay);
  if (currentIndex === -1) return null;
  const previousAy = currentIndex === 0 ? aylar[11] : aylar[currentIndex - 1];
  const previousIl = currentIndex === 0 ? Number(il) - 1 : Number(il);
  return findLatestReport(data, previousIl, previousAy, ev);
}

function findLatestWaterReading(data, il, ay) {
  return (
    data
      .filter((item) => Number(item.il) === Number(il) && String(item.ay).trim() === String(ay).trim())
      .sort((a, b) => Number(b.id) - Number(a.id))[0] || null
  );
}

function findPreviousWaterReading(data, il, ay) {
  const currentIndex = aylar.indexOf(ay);
  if (currentIndex === -1) return null;
  const previousAy = currentIndex === 0 ? aylar[11] : aylar[currentIndex - 1];
  const previousIl = currentIndex === 0 ? Number(il) - 1 : Number(il);
  return findLatestWaterReading(data, previousIl, previousAy);
}

function findLatestExpense(data, il, ay) {
  const monthIndex = aylar.indexOf(ay);
  const monthNumber = monthIndex + 1;
  return (
    data
      .filter((item) => {
        const itemYear = Number(String(item.expenseDate || '').slice(0, 4));
        const itemMonth = Number(String(item.expenseDate || '').slice(5, 7));
        return itemYear === Number(il) && itemMonth === monthNumber;
      })
      .sort((a, b) => String(b.expenseDate).localeCompare(String(a.expenseDate)) || Number(b.id) - Number(a.id))[0] || null
  );
}

function Row({ children }) {
  return <div style={rowStyle}>{children}</div>;
}

function Field({ label, children }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

const wrap = { display: 'grid', gap: '18px', maxWidth: '720px', margin: '15px auto', padding: '0 15px 24px', color: theme.colors.text };
const hero = { display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap', padding: '18px', borderRadius: '18px', background: `linear-gradient(135deg, ${theme.colors.surface} 0%, ${theme.colors.softPrimary} 100%)`, border: `1px solid ${theme.colors.border}`, boxShadow: theme.shadow };
const eyebrow = { fontSize: '12px', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: theme.colors.primaryDark };
const title = { margin: '4px 0 6px', fontSize: '24px', lineHeight: 1.15 };
const sub = { margin: 0, color: theme.colors.muted, fontSize: '13px', lineHeight: 1.55, maxWidth: '720px' };
const noticeBox = { border: `1px solid ${theme.colors.border}`, background: theme.colors.surface, color: theme.colors.text, borderRadius: theme.radius.md, padding: '12px 14px', fontSize: '13px', fontWeight: 700 };
const tabs = { display: 'flex', gap: '10px', flexWrap: 'wrap' };
const tabButton = (active) => ({ padding: '12px 16px', borderRadius: '999px', border: `1px solid ${active ? theme.colors.text : theme.colors.border}`, background: active ? theme.colors.text : theme.colors.surface, color: active ? '#fff' : theme.colors.text, fontWeight: 800, cursor: 'pointer' });
const card = { background: theme.colors.surface, padding: '20px', borderRadius: '14px', boxShadow: theme.shadow, border: `1px solid ${theme.colors.border}` };
const sectionTitle = { margin: '0 0 15px 0', color: theme.colors.text, fontSize: '16px', borderBottom: `2px solid ${theme.colors.primary}`, paddingBottom: '8px', fontWeight: '700' };
const labelStyle = { display: 'block', marginBottom: '5px', fontSize: '13px', fontWeight: '600', color: theme.colors.muted };
const inputStyle = { width: '100%', padding: '12px', borderRadius: '8px', border: `1px solid ${theme.colors.border}`, boxSizing: 'border-box', fontSize: '15px' };
const rowStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' };
const primaryButton = { width: '100%', padding: '14px', background: theme.colors.success, color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', marginTop: '5px', fontSize: '14px' };
const submitButton = { padding: '15px', background: theme.colors.primary, color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '15px', marginTop: '5px' };
const submitButtonMoyka = { padding: '15px', background: theme.colors.teal, color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '15px', marginTop: '5px' };
const infoBox = (isMoyka) => ({ padding: '12px', background: '#f5f7fb', borderRadius: '10px', border: isMoyka ? '1px dashed #10b981' : '1px dashed #4a6ee0' });
const infoTitle = (isMoyka) => ({ display: 'block', fontWeight: '700', color: isMoyka ? '#059669' : '#4a6ee0', marginBottom: '10px', fontSize: '12px' });
const hint = { marginTop: '8px', fontSize: '12px', color: theme.colors.muted };

export default AdminBig;
