import { useEffect, useState } from 'react';
import { reportsApi, washExpensesApi, washWaterApi } from '../../api/reports';
import { aylar, cariAy, cariIl, localDateKey, toAmount } from '../../constants/reporting';
import { theme } from '../../constants/theme';
import { useIsMobile } from '../../hooks/useIsMobile';

const evOptions = ['K-1', 'K-2', 'K-3', 'K-4', 'K-5', 'K-PDVL', 'MOYKA'];

function Admin() {
  const isMobile = useIsMobile();
  const [dbData, setDbData] = useState([]);
  const [moykaReports, setMoykaReports] = useState([]);
  const [waterData, setWaterData] = useState([]);
  const [notice, setNotice] = useState('');
  const [settings] = useState(loadSettings);
  const initialSettings = settings;
  const [formData, setFormData] = useState({
    il: cariIl,
    ay: cariAy,
    ev: 'K-1',
    kiraye: initialSettings.standartKiraye,
    wifi: initialSettings.standartInternet,
    kohneIsiq: '',
    yeniIsiq: '',
    suNefer: '',
  });
  const [aftoyumaForm, setAftoyumaForm] = useState({
    oldIsiq: '',
    newIsiq: '',
    oldWater: '',
    newWater: '',
  });
  const [expenseForm, setExpenseForm] = useState({
    expenseDate: localDateKey(new Date()),
    title: '',
    amount: '',
    note: '',
  });

  useEffect(() => {
    Promise.all([reportsApi.list({ il: formData.il }), washWaterApi.list({ il: formData.il })])
      .then(([reports, water]) => {
        setDbData(reports.filter((item) => item.ev !== 'MOYKA'));
        setMoykaReports(reports.filter((item) => item.ev === 'MOYKA'));
        setWaterData(water);
      })
      .catch((error) => console.error(error.message));
  }, [formData.il]);

  const reportForSelection = findLatestReport(dbData, formData.il, formData.ay, formData.ev);

  useEffect(() => {
    const current = reportForSelection;
    const previous = findPreviousReport(dbData, formData.il, formData.ay, formData.ev);
    const isJanuary = aylar.indexOf(formData.ay) === 0;

    setFormData((prev) => ({
      ...prev,
      kiraye: current ? String(current.kiraye ?? '') : settings.standartKiraye,
      wifi: current ? String(current.wifi ?? '') : settings.standartInternet,
      kohneIsiq: current
        ? String(current.kohneIsiq ?? '')
        : isJanuary
          ? ''
          : previous
            ? String(previous.yeniIsiq ?? '')
            : '',
      yeniIsiq: current ? String(current.yeniIsiq ?? '') : '',
      suNefer: current ? String(current.suNefer ?? '') : prev.suNefer,
    }));
  }, [dbData, formData.ay, formData.ev, formData.il, reportForSelection, settings.standartInternet, settings.standartKiraye]);

  useEffect(() => {
    const currentReport = findLatestReport(moykaReports, formData.il, formData.ay, 'MOYKA');
    const previousReport = findPreviousReport(moykaReports, formData.il, formData.ay, 'MOYKA');
    const currentWater = findLatestWaterReading(waterData, formData.il, formData.ay);
    const previousWater = findPreviousWaterReading(waterData, formData.il, formData.ay);
    const isJanuary = aylar.indexOf(formData.ay) === 0;

    setAftoyumaForm((prev) => ({
      ...prev,
      oldIsiq: currentReport
        ? String(currentReport.kohneIsiq ?? '')
        : isJanuary
          ? ''
          : previousReport
            ? String(previousReport.yeniIsiq ?? '')
            : '',
      newIsiq: currentReport ? String(currentReport.yeniIsiq ?? '') : '',
      oldWater: currentWater
        ? String(currentWater.oldReading ?? '')
        : isJanuary
          ? ''
          : previousWater
            ? String(previousWater.newReading ?? '')
            : '',
      newWater: currentWater ? String(currentWater.newReading ?? '') : '',
    }));
  }, [formData.ay, formData.il, moykaReports, waterData]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleAftoyumaChange = (e) => {
    const { name, value } = e.target;
    setAftoyumaForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleExpenseChange = (e) => {
    const { name, value } = e.target;
    setExpenseForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const il = Number(formData.il) || cariIl;
    const ay = String(formData.ay).trim();
    const ev = String(formData.ev).trim();
    const kirayeNum = Number(formData.kiraye) || 0;
    const kohneIsiqNum = Number(formData.kohneIsiq) || 0;
    const yeniIsiqNum = Number(formData.yeniIsiq) || 0;
    const suNeferNum = Number(formData.suNefer) || 0;
    const wifiNum = Number(formData.wifi) || 0;
    const suQiymet = Number(settings.suQiymet) || 0;
    const tarif = Number(settings.isiqTarif) || 0.15;
    const serfiyyat = yeniIsiqNum - kohneIsiqNum;
    const isiqPulu = Number((Math.max(0, serfiyyat) * tarif).toFixed(2));
    const suCem = Number((suNeferNum * suQiymet).toFixed(2));
    const total = Number((kirayeNum - isiqPulu - suCem - wifiNum).toFixed(2));

    if (
      !ay ||
      !ev ||
      !String(formData.kiraye).trim() ||
      !String(formData.wifi).trim() ||
      !String(formData.suNefer).trim() ||
      !String(formData.kohneIsiq).trim() ||
      !String(formData.yeniIsiq).trim()
    ) {
      alert('Boş xana qalmasın.');
      return;
    }

    if (reportForSelection) {
      setNotice('Bu ev üçün bu ay artıq qeyd var. Yeni qeyd əlavə edilə bilməz.');
      alert('Bu ev üçün bu ay artıq qeyd var.');
      return;
    }

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
        suNefer: suNeferNum,
        suCem,
        wifi: wifiNum,
        total,
      });

      const [reports, water, expenses] = await Promise.all([reportsApi.list({ il }), washWaterApi.list({ il }), washExpensesApi.list({ il })]);
      setDbData(reports.filter((item) => item.ev !== 'MOYKA'));
      setMoykaReports(reports.filter((item) => item.ev === 'MOYKA'));
      setWaterData(water);
      setExpenseData(expenses);
      setNotice('Saxlanıldı tamam');
      window.alert('Saxlanıldı tamam');
    } catch (error) {
      setNotice(`Saxlanmadı: ${error.message}`);
    }
  };

  const handleAftoyumaSubmit = async (e) => {
    e.preventDefault();

    const il = Number(formData.il) || cariIl;
    const ay = String(formData.ay).trim();
    const currentReport = findLatestReport(moykaReports, il, ay, 'MOYKA');

    if (currentReport) {
      setNotice('Aftoyuma üçün bu ay artıq qeyd var. Yeni qeyd əlavə edilə bilməz.');
      return;
    }

    const tarif = Number(settings.isiqTarif) || 0.15;
    const oldIsiq = Number(aftoyumaForm.oldIsiq) || 0;
    const newIsiq = Number(aftoyumaForm.newIsiq) || 0;
    const oldWater = Number(aftoyumaForm.oldWater) || 0;
    const newWater = Number(aftoyumaForm.newWater) || 0;
    const houseKwtTotal = monthlyHouseKwt(dbData, il, ay);
    const serfiyyat = Math.max(0, (newIsiq - oldIsiq) - houseKwtTotal);
    const isiqPulu = Number((serfiyyat * tarif).toFixed(2));
    const waterUsage = Math.max(0, newWater - oldWater);

    if (!ay || !il || !String(aftoyumaForm.oldIsiq).trim() || !String(aftoyumaForm.newIsiq).trim() || !String(aftoyumaForm.oldWater).trim() || !String(aftoyumaForm.newWater).trim()) {
      alert('Aftoyuma üçün boş xana qalmasın.');
      return;
    }

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
        suNefer: 0,
        suCem: waterUsage,
        wifi: 0,
        total: Number((-isiqPulu).toFixed(2)),
      });

      await washWaterApi.create({
        il,
        ay,
        oldReading: oldWater,
        newReading: newWater,
        pricePerUnit: 1,
      });

      const [reports, water, expenses] = await Promise.all([reportsApi.list({ il }), washWaterApi.list({ il }), washExpensesApi.list({ il })]);
      setDbData(reports.filter((item) => item.ev !== 'MOYKA'));
      setMoykaReports(reports.filter((item) => item.ev === 'MOYKA'));
      setWaterData(water);
      setExpenseData(expenses);
      setExpenseForm({
        expenseDate: localDateKey(new Date()),
        title: '',
        amount: '',
        note: '',
      });
      setNotice('Aftoyuma saxlanıldı tamam');
      window.alert('Aftoyuma saxlanıldı tamam');
    } catch (error) {
      setNotice(`Aftoyuma saxlanmadı: ${error.message}`);
    }
  };

  const handleExpenseSubmit = async (e) => {
    e.preventDefault();

    if (!String(expenseForm.expenseDate).trim() || !String(expenseForm.title).trim() || !String(expenseForm.amount).trim()) {
      alert('Xərc üçün tarix, ad və məbləğ yazmalısan.');
      return;
    }

    try {
      await washExpensesApi.create(expenseForm);
      setExpenseForm({
        expenseDate: localDateKey(new Date()),
        title: '',
        amount: '',
        note: '',
      });
      setNotice('Xərc saxlanıldı');
      window.alert('Xərc saxlanıldı');
    } catch (error) {
      setNotice(`Xərc saxlanmadı: ${error.message}`);
    }
  };

  // Su məbləği nəfər sayına görə hesablanır.
  const calculatedWaterTotal = Number(formData.suNefer || 0) * (Number(settings.suQiymet) || 0);
  const aftoyumaCurrentReport = findLatestReport(moykaReports, formData.il, formData.ay, 'MOYKA');
  const aftoyumaLocked = Boolean(aftoyumaCurrentReport);
  const aftoyumaHouseKwt = monthlyHouseKwt(dbData, Number(formData.il) || cariIl, String(formData.ay).trim());
  const aftoyumaMainKwt = Math.max(0, Number(aftoyumaForm.newIsiq || 0) - Number(aftoyumaForm.oldIsiq || 0));
  const aftoyumaRemainingKwt = Math.max(0, aftoyumaMainKwt - aftoyumaHouseKwt);
  const aftoyumaWaterUsage = Math.max(0, Number(aftoyumaForm.newWater || 0) - Number(aftoyumaForm.oldWater || 0));
  const isMoyka = formData.ev === 'MOYKA';

  return (
    <div style={isMobile ? wrapMobile : wrap}>
      <header style={isMobile ? heroMobile : hero}>
        <div>
          <div style={eyebrow}>Admin</div>
          <h1 style={isMobile ? titleMobile : title}>{isMoyka ? 'Aftoyuma Girişi' : 'Ev Məlumat Girişi'}</h1>
          <p style={sub}>
            {isMoyka
              ? 'Aftoyuma üçün yalnız bu panel açılır.'
              : 'Su məbləği nəfər sayına görə hesablanır. Qlobal tariflər yalnız AdminPanel-dədir.'}
          </p>
        </div>
        <div style={isMobile ? headerActionsMobile : headerActions}>
          {isMoyka && (
            <button type="button" onClick={() => setFormData((prev) => ({ ...prev, ev: 'K-1' }))} style={ghostButton}>
              Geri
            </button>
          )}
          {!isMoyka && reportForSelection && <div style={lockedBox}>Bu ev üçün bu ay artıq qeyd var. Dəyişiklik edilmir.</div>}
          {isMoyka && aftoyumaLocked && <div style={lockedBox}>Bu ay üçün aftoyuma artıq qeyd var.</div>}
          {notice && <div style={noticeBox}>{notice}</div>}
        </div>
      </header>

      {!isMoyka ? (
        <section style={card}>
          <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '14px' }}>
            <Row isMobile={isMobile}>
              <Field label="İl">
                <input type="number" name="il" value={formData.il} onChange={handleChange} style={inputStyle} />
              </Field>
              <Field label="Ay">
                <select name="ay" value={formData.ay} onChange={handleChange} style={inputStyle}>
                  {aylar.map((ay) => (
                    <option key={ay} value={ay}>
                      {ay}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Ev">
                <select name="ev" value={formData.ev} onChange={handleChange} style={inputStyle}>
                  {evOptions.map((ev) => (
                    <option key={ev} value={ev}>
                      {ev}
                    </option>
                  ))}
                </select>
              </Field>
            </Row>

            <Row isMobile={isMobile}>
              <Field label="Kirayə (₼)">
                <input type="number" step="any" name="kiraye" value={formData.kiraye} onChange={handleChange} readOnly={!!reportForSelection} style={reportForSelection ? readOnlyInputStyle : inputStyle} />
              </Field>
              <Field label="Wifi (₼)">
                <input type="number" step="any" name="wifi" value={formData.wifi} onChange={handleChange} readOnly={!!reportForSelection} style={reportForSelection ? readOnlyInputStyle : inputStyle} />
              </Field>
            </Row>

            <div style={infoBox}>
              <span style={infoTitle}>Su hesabatı</span>
              <Row isMobile={isMobile}>
                <Field label="Su adam sayı">
                  <input type="number" step="any" name="suNefer" value={formData.suNefer} onChange={handleChange} placeholder="0" readOnly={!!reportForSelection} style={reportForSelection ? readOnlyInputStyle : inputStyle} />
                </Field>
              </Row>
            </div>

            <div style={infoBox}>
              <span style={infoTitle}>İşıq sayğacı</span>
              <Row isMobile={isMobile}>
                <Field label="Köhnə">
                  <input type="number" step="any" name="kohneIsiq" value={formData.kohneIsiq} onChange={handleChange} readOnly={!!reportForSelection} style={reportForSelection ? readOnlyInputStyle : inputStyle} />
                </Field>
                <Field label="Yeni">
                  <input type="number" step="any" name="yeniIsiq" value={formData.yeniIsiq} onChange={handleChange} readOnly={!!reportForSelection} style={reportForSelection ? readOnlyInputStyle : inputStyle} />
                </Field>
              </Row>
            </div>

            <div style={hintBox}>
              <div>Su: 1 nəfər = {settings.suQiymet} m</div>
              <div>İşıq: 1 Kwt = {settings.isiqTarif} ₼</div>
            </div>

            <button type="submit" style={button}>
              {reportForSelection ? 'Mövcuddur' : 'Saxla'}
            </button>
          </form>
        </section>
      ) : (
        <section style={card}>
          <div style={{ borderLeft: `4px solid ${theme.colors.teal}`, paddingLeft: '10px', marginBottom: '18px' }}>
            <h2 style={{ margin: 0, color: theme.colors.text, fontSize: '18px', fontWeight: '700' }}>Aftoyuma giriş paneli</h2>
            <p style={{ margin: '4px 0 0', color: theme.colors.muted, fontSize: '13px' }}>
              Elektrik: bütün evlərin kWt cəmi çıxılır, qalan hissə aftoyumaya yazılır. Su: 1 ton = 1 ₼.
            </p>
          </div>

          <form onSubmit={handleAftoyumaSubmit} style={{ display: 'grid', gap: '14px' }}>
            <Row isMobile={isMobile}>
              <Field label="İl">
                <input type="number" name="il" value={formData.il} onChange={handleChange} style={inputStyle} />
              </Field>
              <Field label="Ay">
                <select name="ay" value={formData.ay} onChange={handleChange} style={inputStyle}>
                  {aylar.map((ay) => (
                    <option key={ay} value={ay}>
                      {ay}
                    </option>
                  ))}
                </select>
              </Field>
            </Row>

            <Row isMobile={isMobile}>
              <Field label="Köhnə İşıq">
                <input type="number" step="any" name="oldIsiq" value={aftoyumaForm.oldIsiq} onChange={handleAftoyumaChange} readOnly={aftoyumaLocked} style={aftoyumaLocked ? readOnlyInputStyle : inputStyle} />
              </Field>
              <Field label="Yeni İşıq">
                <input type="number" step="any" name="newIsiq" value={aftoyumaForm.newIsiq} onChange={handleAftoyumaChange} readOnly={aftoyumaLocked} style={aftoyumaLocked ? readOnlyInputStyle : inputStyle} />
              </Field>
            </Row>

            <Row isMobile={isMobile}>
              <Field label="Köhnə Su">
                <input type="number" step="any" name="oldWater" value={aftoyumaForm.oldWater} onChange={handleAftoyumaChange} readOnly={aftoyumaLocked} style={aftoyumaLocked ? readOnlyInputStyle : inputStyle} />
              </Field>
              <Field label="Yeni Su">
                <input type="number" step="any" name="newWater" value={aftoyumaForm.newWater} onChange={handleAftoyumaChange} readOnly={aftoyumaLocked} style={aftoyumaLocked ? readOnlyInputStyle : inputStyle} />
              </Field>
            </Row>

            <div style={hintBox}>
              <div>İşıq qiyməti: 1 Kwt = {settings.isiqTarif} ₼</div>
              <div>Su qiyməti: 1 ton = 1 ₼</div>
            </div>

            <button type="submit" style={button}>
              {aftoyumaLocked ? 'Mövcuddur' : 'Aftoyumanı Saxla'}
            </button>
          </form>

          <form onSubmit={handleExpenseSubmit} style={{ ...infoBox, marginTop: '14px' }}>
            <span style={infoTitle}>Xərc Girişi</span>
            <Row isMobile={isMobile}>
              <Field label="Tarix (gün/ay/il)">
                <input type="date" name="expenseDate" value={expenseForm.expenseDate} onChange={handleExpenseChange} style={inputStyle} />
              </Field>
              <Field label="Xərc Adı">
                <input type="text" name="title" value={expenseForm.title} onChange={handleExpenseChange} style={inputStyle} />
              </Field>
            </Row>
            <Row isMobile={isMobile}>
              <Field label="Məbləğ">
                <input type="number" step="any" name="amount" value={expenseForm.amount} onChange={handleExpenseChange} style={inputStyle} />
              </Field>
              <Field label="Qeyd">
                <input type="text" name="note" value={expenseForm.note} onChange={handleExpenseChange} style={inputStyle} />
              </Field>
            </Row>
            <button type="submit" style={{ ...button, marginTop: '10px' }}>
              Xərci Saxla
            </button>
          </form>
        </section>
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
      .filter(
        (item) =>
          Number(item.il) === Number(il) &&
          String(item.ev).trim() === String(ev).trim() &&
          String(item.ay).trim().toLowerCase() === String(ay).trim().toLowerCase(),
      )
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

function monthlyHouseKwt(data, il, ay) {
  return data
    .filter((item) => Number(item.il) === Number(il) && String(item.ay).trim() === String(ay).trim() && String(item.ev).trim() !== 'MOYKA')
    .reduce((sum, item) => sum + toAmount(item.serfiyyat), 0);
}

function Row({ children, isMobile }) {
  return <div style={isMobile ? rowStyleMobile : rowStyle}>{children}</div>;
}

function Field({ label, children }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

const wrap = { display: 'grid', gap: '18px', maxWidth: '820px', margin: '15px auto', padding: '0 15px 24px', color: theme.colors.text };
const wrapMobile = { ...wrap, padding: '0 12px 20px' };
const hero = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '12px',
  flexWrap: 'wrap',
  alignItems: 'end',
  padding: '18px',
  borderRadius: theme.radius.lg,
  background: 'linear-gradient(135deg, #eff6ff 0%, #ffffff 100%)',
  border: `1px solid ${theme.colors.border}`,
};
const heroMobile = { ...hero, padding: '14px', flexDirection: 'column', alignItems: 'stretch' };
const eyebrow = { fontSize: '11px', fontWeight: 900, color: theme.colors.primaryDark, letterSpacing: '0.08em', marginBottom: '4px' };
const title = { margin: 0, fontSize: '24px', color: theme.colors.text };
const titleMobile = { ...title, fontSize: '20px' };
const sub = { margin: '6px 0 0', color: theme.colors.muted, fontSize: '13px' };
const noticeBox = { padding: '10px 12px', borderRadius: '10px', background: '#ecfeff', border: '1px solid #a5f3fc', color: '#155e75', fontSize: '13px', maxWidth: '320px' };
const lockedBox = { padding: '10px 12px', borderRadius: '10px', background: '#fef3c7', border: '1px solid #fcd34d', color: '#92400e', fontSize: '13px', maxWidth: '320px' };
const headerActions = { display: 'flex', gap: '10px', alignItems: 'flex-start', flexWrap: 'wrap', justifyContent: 'flex-end' };
const headerActionsMobile = { ...headerActions, alignItems: 'stretch', justifyContent: 'stretch' };
const card = { background: theme.colors.surface, padding: '20px', borderRadius: '14px', boxShadow: theme.shadow, border: `1px solid ${theme.colors.border}` };
const labelStyle = { display: 'block', marginBottom: '5px', fontSize: '13px', fontWeight: '600', color: theme.colors.muted };
const inputStyle = { width: '100%', padding: '12px', borderRadius: '8px', border: `1px solid ${theme.colors.border}`, boxSizing: 'border-box', fontSize: '15px' };
const readOnlyInputStyle = { ...inputStyle, background: theme.colors.surfaceSoft, color: theme.colors.muted, cursor: 'not-allowed' };
const rowStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' };
const rowStyleMobile = { ...rowStyle, gridTemplateColumns: '1fr' };
const button = { padding: '15px', background: theme.colors.primary, color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', fontSize: '15px' };
const ghostButton = { padding: '10px 14px', background: '#fff', color: theme.colors.primaryDark, border: `1px solid ${theme.colors.border}`, borderRadius: '10px', cursor: 'pointer', fontWeight: '700', fontSize: '13px' };
const infoBox = { padding: '12px', background: '#f5f7fb', borderRadius: '10px', border: '1px dashed #4a6ee0' };
const infoTitle = { display: 'block', fontWeight: '700', color: '#4a6ee0', marginBottom: '10px', fontSize: '12px' };
const hintBox = { padding: '10px 12px', borderRadius: '10px', background: '#f8fafc', border: `1px solid ${theme.colors.border}`, color: theme.colors.muted, fontSize: '13px' };
export default Admin;
