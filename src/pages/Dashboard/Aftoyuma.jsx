import { useEffect, useMemo, useState } from 'react';
import { reportsApi, vehicleEventsApi, vehicleVisionApi, washWaterApi } from '../../api/reports';
import { aylar, cariIl, formatMoney, getYearOptions, toAmount } from '../../constants/reporting';
import { theme } from '../../constants/theme';
import { useIsMobile } from '../../hooks/useIsMobile';

function DashboardAftoyuma() {
  const isMobile = useIsMobile();
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonthName = aylar[now.getMonth()];
  const [selectedYear, setSelectedYear] = useState(cariIl);
  const [selectedMonth, setSelectedMonth] = useState(currentMonthName);
  const currentMonthLabel = `${selectedMonth} ${selectedYear}`;
  const [reports, setReports] = useState([]);
  const [waterReadings, setWaterReadings] = useState([]);
  const [captureImageDataUrl, setCaptureImageDataUrl] = useState('');
  const [recognitionMessage, setRecognitionMessage] = useState('');
  const [recognitionBusy, setRecognitionBusy] = useState(false);
  const [vehicleForm, setVehicleForm] = useState({
    plate: '',
    amount: '',
    note: '',
    il: currentYear,
    ay: currentMonthName,
    gun: String(now.getDate()).padStart(2, '0'),
  });

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        const [reportRows, waterRows] = await Promise.all([
          reportsApi.list({ il: currentYear }),
          washWaterApi.list({ il: currentYear }),
        ]);
        if (!alive) return;
        setReports(reportRows);
        setWaterReadings(waterRows);
      } catch (error) {
        if (!alive) return;
        console.error('Aftoyuma məlumatları alınmadı:', error.message);
      }
    };

    load();
    const timer = window.setInterval(load, 30000);

    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [currentYear]);
  const currentMonthElectricRows = useMemo(
    () =>
      reports.filter(
        (item) =>
          Number(item.il) === Number(selectedYear) &&
          String(item.ay || '').trim() === selectedMonth &&
          String(item.ev || '').trim().toUpperCase() === 'MOYKA',
      ),
    [reports, selectedMonth, selectedYear],
  );
  const currentMonthWaterRows = useMemo(
    () =>
      waterReadings.filter((item) => Number(item.il) === Number(selectedYear) && String(item.ay || '').trim() === selectedMonth),
    [selectedMonth, selectedYear, waterReadings],
  );
  const electricTotal = currentMonthElectricRows.reduce((sum, item) => sum + toAmount(item.isiqPulu), 0);
  const waterTotal = currentMonthWaterRows.reduce((sum, item) => sum + toAmount(item.total), 0);
  const communalTotal = electricTotal + waterTotal;

  const saveVehicle = async () => {
    if (!String(vehicleForm.plate).trim()) {
      alert('Maşın nömrəsi yazılmalıdır.');
      return;
    }

    try {
      await vehicleEventsApi.create({
        plate: vehicleForm.plate,
        direction: 'entry',
        source: 'manual',
        amount: Number(vehicleForm.amount) || 0,
        note: vehicleForm.note,
        createdAt: new Date(
          Number(vehicleForm.il) || currentYear,
          aylar.indexOf(vehicleForm.ay),
          Number(vehicleForm.gun) || now.getDate(),
          now.getHours(),
          now.getMinutes(),
          now.getSeconds(),
        ).toISOString(),
      });

      setVehicleForm({
        plate: '',
        amount: '',
        note: '',
        il: currentYear,
        ay: currentMonthName,
        gun: String(now.getDate()).padStart(2, '0'),
      });
    } catch (error) {
      alert(`Maşın qeydi saxlanmadı: ${error.message}`);
    }
  };

  const handleCaptureChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const dataUrl = await fileToDataUrl(file);
    setCaptureImageDataUrl(dataUrl);
    setRecognitionMessage('');
  };

  const recognizeCapture = async () => {
    if (!captureImageDataUrl) {
      alert('Əvvəl screenshot seçilməlidir.');
      return;
    }

    setRecognitionBusy(true);
    setRecognitionMessage('Şəkil oxunur...');

    try {
      const result = await vehicleVisionApi.recognize({
        imageDataUrl: captureImageDataUrl,
        direction: 'entry',
        source: 'camera',
        save: false,
      });

      const plate = String(result?.event?.plate || '').trim();
      const confidence = result?.vision?.confidence ?? result?.event?.confidence ?? null;

      if (plate) {
        setVehicleForm((prev) => ({ ...prev, plate }));
        setRecognitionMessage(`Oxundu: ${plate}${confidence !== null && confidence !== undefined ? ` · ${Number(confidence).toFixed(2)}` : ''}`);
      } else {
        setRecognitionMessage('Nömrə oxunmadı.');
      }
    } catch (error) {
      setRecognitionMessage(error.message || 'Şəkil oxunmadı.');
    } finally {
      setRecognitionBusy(false);
    }
  };

  return (
    <div style={isMobile ? wrapMobile : wrap}>
      <section style={communalHero}>
        <div style={{ minWidth: 0 }}>
          <div style={communalEyebrow}>AFTOYUMA</div>
          <h1 style={communalHeroTitle}>Aftoyuma Kamunallar ve Xercler</h1>
          <p style={communalHeroSub}>Default bütün aylar görünür. Detal yalnız ay seçəndə açılır.</p>
        </div>

        <div style={filtersLikeKiraye}>
          <Field label="İl">
            <select value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value) || currentYear)} style={controlSmall}>
              {getYearOptions(currentYear).map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Ay">
            <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} style={controlSmall}>
              {aylar.map((month) => (
                <option key={month} value={month}>
                  {month}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </section>

      <section style={communalSummaryCard}>
        <div style={sectionHead}>
          <div />
        </div>

        <div style={summaryTop}>
          <div>
            <div style={summaryLabel}>SEÇİLMİŞ AYIN CƏMİ</div>
            <div style={summaryTitle}>{currentMonthLabel}</div>
          </div>
          <div style={{ ...summaryValue, color: '#fff' }}>{formatMoney(communalTotal)}</div>
        </div>
        <div style={summaryGrid}>
          <div style={communalMetricCard}>
            <div style={communalSummaryLabel}>İşıq</div>
            <div style={communalSummaryValue}>{formatMoney(electricTotal)}</div>
          </div>
          <div style={communalMetricCard}>
            <div style={communalSummaryLabel}>Su</div>
            <div style={communalSummaryValue}>{formatMoney(waterTotal)}</div>
          </div>
        </div>
      </section>

      <section style={card}>
        <div style={sectionHead}>
          <div>
            <div style={sectionEyebrow}>MAŞINLAR</div>
            <h2 style={sectionTitle}>Nömrə, məbləğ, qeyd</h2>
          </div>

          <div style={vehicleHeaderRight}>
            <div style={vehicleDatePanel}>
              <Field label="İl">
                <select value={vehicleForm.il} onChange={(e) => setVehicleForm((prev) => ({ ...prev, il: Number(e.target.value) || currentYear }))} style={controlSmall}>
                  {getYearOptions(currentYear).map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Ay">
                <select value={vehicleForm.ay} onChange={(e) => setVehicleForm((prev) => ({ ...prev, ay: e.target.value }))} style={controlSmall}>
                  {aylar.map((month) => (
                    <option key={month} value={month}>
                      {month}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Gün">
                <select value={vehicleForm.gun} onChange={(e) => setVehicleForm((prev) => ({ ...prev, gun: e.target.value }))} style={controlSmall}>
                  {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
                    <option key={day} value={String(day).padStart(2, '0')}>
                      {day}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </div>
        </div>

        <div style={vehiclePanel}>
          <div style={cameraPanel}>
            <Field label="Kamera screenshot">
              <input type="file" accept="image/*" capture="environment" onChange={handleCaptureChange} style={controlStyle} />
            </Field>
            <button type="button" style={cameraButton} onClick={recognizeCapture} disabled={recognitionBusy}>
              {recognitionBusy ? 'Oxunur...' : 'YOLO + OCR ilə oxu'}
            </button>
            {recognitionMessage ? <div style={cameraNote}>{recognitionMessage}</div> : null}
          </div>

          <div style={vehicleFormWrap}>
            <Field label="Maşın nömrəsi">
              <input
                value={vehicleForm.plate}
                onChange={(e) => setVehicleForm((prev) => ({ ...prev, plate: e.target.value }))}
                placeholder="xx-xx-xxx"
                style={controlStyle}
              />
            </Field>
            <Field label="Məbləğ">
              <input
                type="number"
                step="any"
                value={vehicleForm.amount}
                onChange={(e) => setVehicleForm((prev) => ({ ...prev, amount: e.target.value }))}
                placeholder="₼"
                style={controlStyle}
              />
            </Field>
            <Field label="Qeyd">
              <input
                value={vehicleForm.note}
                onChange={(e) => setVehicleForm((prev) => ({ ...prev, note: e.target.value }))}
                placeholder="opsi"
                style={controlStyle}
              />
            </Field>
          </div>

          <button type="button" style={buttonStyle} onClick={saveVehicle}>
            Saxla
          </button>
        </div>

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

async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Screenshot oxuna bilmədi.'));
    reader.readAsDataURL(file);
  });
}

const wrap = { display: 'grid', gap: '18px', maxWidth: '1120px', margin: '15px auto', padding: '0 15px 24px', color: theme.colors.text };
const wrapMobile = { ...wrap, padding: '0 12px 20px' };
const communalHero = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '12px',
  flexWrap: 'wrap',
  alignItems: 'end',
  padding: '18px',
  borderRadius: theme.radius.lg,
  background: 'linear-gradient(135deg, #ecfdf5 0%, #ffffff 100%)',
  border: '1px solid #bbf7d0',
};
const communalHeroTitle = { margin: 0, fontSize: '26px', color: theme.colors.text };
const communalHeroSub = { margin: '5px 0 0', color: theme.colors.muted, fontSize: '13px' };
const communalEyebrow = { fontSize: '11px', fontWeight: 900, color: theme.colors.success, letterSpacing: '0.08em', marginBottom: '4px' };
const card = { padding: '16px', borderRadius: '14px', background: theme.colors.surface, border: `1px solid ${theme.colors.border}`, boxShadow: theme.shadow };
const sectionHead = { display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: '12px' };
const sectionEyebrow = { fontSize: '11px', fontWeight: 900, color: theme.colors.primaryDark, letterSpacing: '0.08em', marginBottom: '4px' };
const sectionTitle = { margin: 0, fontSize: '18px', color: theme.colors.text };
const summaryGrid = { display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginTop: '14px' };
const summaryLabel = { fontSize: '11px', fontWeight: 900, color: '#dcfce7', letterSpacing: '0.08em' };
const summaryTitle = { marginTop: '6px', fontSize: '18px', fontWeight: 800, color: '#fff' };
const summaryValue = { fontSize: '30px', fontWeight: 900, lineHeight: 1.05, color: theme.colors.text };
const summaryTop = { display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: '12px', flexWrap: 'wrap' };
const communalSummaryCard = {
  marginTop: '14px',
  borderRadius: theme.radius.lg,
  padding: '16px',
  background: 'linear-gradient(135deg, #166534, #22c55e)',
  color: '#fff',
  border: '1px solid #22c55e',
  boxShadow: theme.shadow,
};
const communalMetricCard = {
  padding: '12px',
  borderRadius: theme.radius.md,
  background: 'rgba(255,255,255,0.12)',
  border: '1px solid rgba(255,255,255,0.18)',
};
const communalSummaryLabel = { fontSize: '12px', fontWeight: 700, color: '#dcfce7' };
const communalSummaryValue = { marginTop: '6px', fontSize: '18px', fontWeight: 900, color: '#fff' };
const labelStyle = { display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: '700', color: theme.colors.muted };
const controlStyle = { width: '100%', padding: '10px 12px', borderRadius: '10px', border: `1px solid ${theme.colors.border}`, boxSizing: 'border-box', fontSize: '14px', background: '#fff' };
const controlSmall = { ...controlStyle, width: '150px', padding: '10px 12px', fontSize: '14px', borderRadius: '10px' };
const filtersLikeKiraye = {
  display: 'flex',
  gap: '10px',
  flexWrap: 'wrap',
  alignItems: 'end',
};
const vehicleHeaderRight = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'flex-end',
  marginLeft: 'auto',
};
const vehicleDatePanel = {
  display: 'flex',
  gap: '8px',
  flexWrap: 'wrap',
  alignItems: 'flex-start',
  width: 'fit-content',
  padding: '8px 10px',
  borderRadius: '12px',
  background: 'linear-gradient(180deg, #f8fafc 0%, #ffffff 100%)',
  border: `1px solid ${theme.colors.border}`,
  boxShadow: '0 6px 18px rgba(15, 23, 42, 0.04)',
};
const vehiclePanel = {
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  width: '100%',
  padding: '8px 10px',
  borderRadius: '12px',
  background: 'linear-gradient(180deg, #f8fafc 0%, #ffffff 100%)',
  border: `1px solid ${theme.colors.border}`,
  boxShadow: '0 6px 18px rgba(15, 23, 42, 0.04)',
};
const cameraPanel = {
  padding: '12px',
  borderRadius: '12px',
  border: `1px solid ${theme.colors.border}`,
  background: '#fff',
  display: 'grid',
  gap: '10px',
};
const cameraButton = {
  padding: '11px 14px',
  borderRadius: '10px',
  border: 'none',
  background: theme.colors.primary,
  color: '#fff',
  fontWeight: 800,
  cursor: 'pointer',
  width: 'fit-content',
};
const cameraNote = { fontSize: '12px', color: theme.colors.muted, fontWeight: 700 };
const vehicleFormWrap = { display: 'grid', gap: '8px', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' };
const buttonStyle = { padding: '12px 14px', borderRadius: '10px', border: 'none', background: theme.colors.primary, color: '#fff', fontWeight: 800, cursor: 'pointer', width: 'fit-content' };
export default DashboardAftoyuma;
