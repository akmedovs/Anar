import { useEffect, useState } from 'react';
import { reportsApi } from '../../api/reports';
import { aylar, cariAy, cariIl, getYearOptions } from '../../constants/reporting';
import { theme } from '../../constants/theme';

function Admin() {
  const [dbData, setDbData] = useState([]);
  const [savedSummary, setSavedSummary] = useState('');
  const [ayarlar, setAyarlar] = useState(() => {
    const savedSettings = JSON.parse(localStorage.getItem('qlobal_ayarlar'));
    return savedSettings || {
      isiqTarif: '0.15',
      suQiymet: '3',
      standartKiraye: '300',
      standartInternet: '5',
    };
  });
  const [tempAyarlar, setTempAyarlar] = useState({ ...ayarlar });
  const [formData, setFormData] = useState({
    il: cariIl,
    ay: cariAy,
    ev: 'K-1',
    kiraye: ayarlar.standartKiraye,
    kohneIsiq: '',
    yeniIsiq: '',
    suNefer: '',
    internet: ayarlar.standartInternet,
  });

  useEffect(() => {
    reportsApi.list({ il: formData.il }).then(setDbData).catch((error) => console.error(error.message));
  }, [formData.il]);

  useEffect(() => {
    const secilenAyIndex = aylar.indexOf(formData.ay);
    if (secilenAyIndex === -1) return;

    const currentReport = findLatestReport(dbData, formData.il, formData.ay, formData.ev);
    const previousReport = findPreviousReport(dbData, formData.il, formData.ay, formData.ev);

    setFormData((prev) => ({
      ...prev,
      kohneIsiq: currentReport ? String(currentReport.kohneIsiq ?? '') : previousReport ? String(previousReport.yeniIsiq ?? '') : '',
      yeniIsiq: currentReport ? String(currentReport.yeniIsiq ?? '') : '',
      ...(formData.ev !== 'MOYKA'
        ? {
            kiraye: currentReport ? String(currentReport.kiraye ?? '') : ayarlar.standartKiraye,
            internet: currentReport ? String(currentReport.wifi ?? '') : ayarlar.standartInternet,
            suNefer: currentReport ? String((Number(currentReport.suCem) || 0) / (Number(ayarlar.suQiymet) || 1)) : prev.suNefer,
          }
        : { kiraye: '0', internet: '0', suNefer: '0' }),
    }));
  }, [formData.ev, formData.ay, formData.il, ayarlar, dbData]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleTempAyarlarChange = (e) => {
    const { name, value } = e.target;
    setTempAyarlar((prev) => ({ ...prev, [name]: value }));
  };

  const handleSaveAyarlar = () => {
    setAyarlar({ ...tempAyarlar });
    localStorage.setItem('qlobal_ayarlar', JSON.stringify(tempAyarlar));
    alert('Qlobal tariflər yeniləndi və tətbiq olundu.');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const currentYear = Number(formData.il) || cariIl;
    const currentMonth = String(formData.ay).trim();
    const currentEv = String(formData.ev).trim();
    const tarif = Number(ayarlar.isiqTarif) || 0.15;

    const kirayeNum = Number(formData.kiraye) || 0;
    const kohneIsiqNum = Number(formData.kohneIsiq) || 0;
    const yeniIsiqNum = Number(formData.yeniIsiq) || 0;
    const suNeferNum = Number(formData.suNefer) || 0;
    const suQiymetNum = Number(ayarlar.suQiymet) || 0;
    const internetNum = Number(formData.internet) || 0;

    const serfiyyat = Math.max(0, yeniIsiqNum - kohneIsiqNum);
    const isiqPulu = serfiyyat * tarif;
    const suCem = suNeferNum * suQiymetNum;
    const total = kirayeNum - isiqPulu - suCem - internetNum;

    const finalData =
      formData.ev === 'MOYKA'
        ? {
            il: currentYear,
            ay: currentMonth,
            ev: 'MOYKA',
            kiraye: 0,
            kohneIsiq: kohneIsiqNum,
            yeniIsiq: yeniIsiqNum,
            serfiyyat: Math.max(0, serfiyyat),
            isiqPulu: Number((Math.max(0, serfiyyat) * tarif).toFixed(2)),
            suCem: 0,
            wifi: 0,
            total: Number((0 - Math.max(0, serfiyyat) * tarif).toFixed(2)),
          }
        : {
            il: currentYear,
            ay: currentMonth,
            ev: currentEv,
            kiraye: kirayeNum,
            kohneIsiq: kohneIsiqNum,
            yeniIsiq: yeniIsiqNum,
            serfiyyat,
            isiqPulu: Number(isiqPulu.toFixed(2)),
            suCem: Number(suCem.toFixed(2)),
            wifi: internetNum,
            total: Number(total.toFixed(2)),
          };

    try {
      await reportsApi.create(finalData);
      const summaryText = buildSummaryText(finalData, ayarlar);
      setSavedSummary(summaryText);
      try {
        await navigator.clipboard.writeText(summaryText);
      } catch {
        // ignore clipboard permission issues
      }
      await reportsApi.list({ il: currentYear }).then(setDbData);
      alert('Hesablandı və köçürmək üçün mətn hazırlandı.');
    } catch (error) {
      alert(`Xəta baş verdi: ${error.message}`);
    }
  };

  const isMoyka = formData.ev === 'MOYKA';

  return (
    <div style={wrap}>
      <div style={card}>
        <h3 style={sectionTitle}>Qlobal tarif ayarları</h3>
        <div style={{ display: 'grid', gap: '12px' }}>
          {[
            ['isiqTarif', 'İşıq xərci tarifi (1 Kwt / ₼)'],
            ['suQiymet', 'Su xərci (Nəfər başı / ₼)'],
            ['standartKiraye', 'Standart Kirayə (₼)'],
            ['standartInternet', 'Standart Internet (₼)'],
          ].map(([name, label]) => (
            <div key={name}>
              <label style={labelStyle}>{label}</label>
              <input type="number" step="any" name={name} value={tempAyarlar[name]} onChange={handleTempAyarlarChange} style={inputStyle} />
            </div>
          ))}
          <button type="button" onClick={handleSaveAyarlar} style={primaryButton}>Qiymətləri yenilə və tətbiq et</button>
        </div>
      </div>

      <div style={card}>
        <div style={{ borderLeft: `4px solid ${isMoyka ? theme.colors.wash : theme.colors.primary}`, paddingLeft: '10px', marginBottom: '18px' }}>
          <h2 style={{ margin: 0, color: theme.colors.text, fontSize: '18px', fontWeight: '700' }}>
            {isMoyka ? 'Aftoyuma giriş paneli' : 'Kirayə giriş paneli'}
          </h2>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '15px' }}>
          <Row>
            <Field label="İl">
              <input type="number" name="il" min="2020" max="2100" value={formData.il} onChange={handleInputChange} list="il-secimleri" style={inputStyle} />
              <datalist id="il-secimleri">{getYearOptions(formData.il).map((il) => <option key={il} value={il} />)}</datalist>
            </Field>
            <Field label="Hesabat ayı">
              <select name="ay" value={formData.ay} onChange={handleInputChange} style={inputStyle}>{aylar.map((ay) => <option key={ay} value={ay}>{ay}</option>)}</select>
            </Field>
          </Row>

          <Field label="Ev / obyekt">
            <select name="ev" value={formData.ev} onChange={handleInputChange} style={inputStyle}>
              {['K-1', 'K-2', 'K-3', 'K-4', 'K-5', 'K-PDVL', 'MOYKA'].map((ev) => <option key={ev} value={ev}>{ev}</option>)}
            </select>
          </Field>

          {!isMoyka && (
            <Row>
              <Field label="Kirayə Haqqı (₼)"><input type="number" step="any" name="kiraye" value={formData.kiraye} onChange={handleInputChange} style={inputStyle} /></Field>
              <Field label="Internet xərci (₼)"><input type="number" step="any" name="internet" value={formData.internet} onChange={handleInputChange} style={inputStyle} /></Field>
            </Row>
          )}

          <div style={infoBox(isMoyka)}>
            <span style={infoTitle(isMoyka)}>{isMoyka ? 'Aftoyuma sayğac göstəricisi' : 'İşıq sayğacı göstəricisi'}</span>
            <Row>
              <Field label="Köhnə"><input type="number" name="kohneIsiq" value={formData.kohneIsiq} onChange={handleInputChange} required style={inputStyle} /></Field>
              <Field label="Yeni"><input type="number" name="yeniIsiq" value={formData.yeniIsiq} onChange={handleInputChange} required style={inputStyle} /></Field>
            </Row>
          </div>

          {!isMoyka && (
            <div style={infoBox(false)}>
              <span style={infoTitle(false)}>Su hesabı</span>
              <Field label="Su nəfər sayı"><input type="number" name="suNefer" value={formData.suNefer} onChange={handleInputChange} style={inputStyle} /></Field>
            </div>
          )}

          <button type="submit" style={submitButton}>
            {isMoyka ? 'Aftoyumanı avtomatik hesabla' : 'Hesablamanı saxla'}
          </button>
        </form>
      </div>

      {savedSummary && (
        <div style={card}>
          <h3 style={sectionTitle}>Kopyalama üçün hazır mətn</h3>
          <textarea readOnly value={savedSummary} rows={9} style={textareaStyle} />
        </div>
      )}
    </div>
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

function buildSummaryText(data, ayarlar) {
  return [
    `Il: ${data.il}`,
    `Ay: ${data.ay}`,
    `Ev: ${data.ev}`,
    `Kiraye: ${Number(data.kiraye || 0).toFixed(2)} ₼`,
    `Kohne isiq: ${Number(data.kohneIsiq || 0).toFixed(2)}`,
    `Yeni isiq: ${Number(data.yeniIsiq || 0).toFixed(2)}`,
    `Isiq xerci: ${Number(data.isiqPulu || 0).toFixed(2)} ₼`,
    `Su xerci: ${Number(data.suCem || 0).toFixed(2)} ₼`,
    `Internet xerci: ${Number(data.wifi || 0).toFixed(2)} ₼`,
    `Net: ${Number(data.total || 0).toFixed(2)} ₼`,
    `Tarifler: isiq=${ayarlar.isiqTarif} / su=${ayarlar.suQiymet} / kiraye=${ayarlar.standartKiraye} / internet=${ayarlar.standartInternet}`,
  ].join('\n');
}

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

const wrap = { display: 'grid', gap: '20px', maxWidth: '560px', margin: '15px auto', padding: '0 15px', color: theme.colors.text };
const card = { background: theme.colors.surface, padding: '20px', borderRadius: '14px', boxShadow: theme.shadow, border: `1px solid ${theme.colors.border}` };
const sectionTitle = { margin: '0 0 15px 0', color: theme.colors.text, fontSize: '16px', borderBottom: `2px solid ${theme.colors.primary}`, paddingBottom: '8px', fontWeight: '700' };
const labelStyle = { display: 'block', marginBottom: '5px', fontSize: '13px', fontWeight: '600', color: theme.colors.muted };
const inputStyle = { width: '100%', padding: '12px', borderRadius: '8px', border: `1px solid ${theme.colors.border}`, boxSizing: 'border-box', fontSize: '15px' };
const rowStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' };
const primaryButton = { width: '100%', padding: '14px', background: theme.colors.success, color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', marginTop: '5px', fontSize: '14px' };
const submitButton = { padding: '15px', background: theme.colors.primary, color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '15px', marginTop: '5px' };
const textareaStyle = { width: '100%', resize: 'vertical', borderRadius: '8px', border: `1px solid ${theme.colors.border}`, padding: '10px', boxSizing: 'border-box', fontSize: '13px', lineHeight: 1.5 };

function infoBox(isMoyka) {
  return { padding: '12px', background: '#f5f7fb', borderRadius: '10px', border: isMoyka ? '1px dashed #e84118' : '1px dashed #4a6ee0' };
}

function infoTitle(isMoyka) {
  return { display: 'block', fontWeight: '700', color: isMoyka ? '#e84118' : '#4a6ee0', marginBottom: '10px', fontSize: '12px' };
}

export default Admin;
