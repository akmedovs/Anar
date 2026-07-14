import { useEffect, useMemo, useState } from 'react';
import { reportsApi } from '../../api/reports';
import { aylar, cariAy, cariIl, formatMoney, getYearOptions, toAmount } from '../../constants/reporting';
import { theme } from '../../constants/theme';
import { useIsMobile } from '../../hooks/useIsMobile';

function Kiraye() {
  const isMobile = useIsMobile();
  const [rows, setRows] = useState([]);
  const [secilenIl, setSecilenIl] = useState(cariIl);
  const [secilenAy, setSecilenAy] = useState(cariAy);
  const [secilenEv, setSecilenEv] = useState('Bütün Evler');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const data = await reportsApi.list({ il: secilenIl });

        if (!alive) return;

        setRows(data.filter((item) => String(item.ev || '').trim().toUpperCase() !== 'MOYKA'));
      } catch (err) {
        if (!alive) return;
        setError(err.message || 'Məlumat alınmadı');
        setRows([]);
      } finally {
        if (alive) setLoading(false);
      }
    };

    load();

    return () => {
      alive = false;
    };
  }, [secilenIl]);

  const yearRows = useMemo(
    () => (secilenAy === 'Bütün Aylar' ? rows : rows.filter((item) => String(item.ay || '').trim() === secilenAy)),
    [rows, secilenAy],
  );
  const houseOptions = useMemo(
    () => ['Bütün Evler', ...new Set(buildHouseRows(yearRows).map((item) => item.ev))],
    [yearRows],
  );
  const visibleRows = useMemo(
    () => yearRows.filter((item) => secilenEv === 'Bütün Evler' || String(item.ev || '').trim() === secilenEv),
    [yearRows, secilenEv],
  );
  const houseRows = useMemo(() => buildHouseRows(visibleRows), [visibleRows]);
  const totals = useMemo(() => calcTotals(houseRows), [houseRows]);

  useEffect(() => {
    if (!houseOptions.includes(secilenEv)) {
      setSecilenEv('Bütün Evler');
    }
  }, [houseOptions, secilenEv]);

  return (
    <div style={isMobile ? wrapMobile : wrap}>
      <header style={isMobile ? heroMobile : hero}>
        <div style={{ minWidth: 0 }}>
          <div style={eyebrow}>KİRAYƏLƏR</div>
          <h1 style={isMobile ? titleMobile : title}>Evlərin Hesabat Cədvəli</h1>
          <p style={sub}>Default cari ay və bütün evlər görünür. Detal ay seçiminə görə dəyişir.</p>
        </div>

        <div style={isMobile ? filtersMobile : filters}>
          <Field label="İl">
            <select value={secilenIl} onChange={(e) => setSecilenIl(e.target.value)} style={isMobile ? controlMobile : control}>
              {getYearOptions(secilenIl).map((il) => (
                <option key={il} value={il}>
                  {il}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Ay">
            <select value={secilenAy} onChange={(e) => setSecilenAy(e.target.value)} style={isMobile ? controlMobile : control}>
              {aylar.map((ay) => (
                <option key={ay} value={ay}>
                  {ay}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Ev">
            <select value={secilenEv} onChange={(e) => setSecilenEv(e.target.value)} style={isMobile ? controlMobile : control}>
              {houseOptions.map((ev) => (
                <option key={ev} value={ev}>
                  {ev}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </header>

      {loading && <div style={notice}>Məlumatlar yüklənir...</div>}
      {error && <div style={errorBox}>{error}</div>}

      <section style={summaryCard}>
        <div style={isMobile ? summaryTopMobile : summaryTop}>
          <div>
            <div style={summaryLabel}>SEÇİLMİŞ AYIN CƏMİ</div>
            <div style={isMobile ? summaryTitleMobile : summaryTitle}>
              {secilenIl} / {secilenAy} / {secilenEv}
            </div>
          </div>
          <div style={isMobile ? summaryValueMobile : summaryValue}>{formatMoney(totals.total)}</div>
        </div>

        <div style={isMobile ? summaryGridMobile : summaryGrid}>
          <SummaryItem label="Kiraye" value={formatMoney(totals.kiraye)} />
          <SummaryItem label="İşıq" value={`${formatMoney(totals.isiq)} · ${totals.isiqKwt.toFixed(2)} Kwt`} />
          <SummaryItem label="Su" value={formatMoney(totals.su)} />
          <SummaryItem label="İnternet" value={formatMoney(totals.internet)} />
        </div>
      </section>

      {secilenAy !== 'Bütün Aylar' && (
        <section style={panel}>
          <div style={isMobile ? panelHeadMobile : panelHead}>
            <div>
              <div style={sectionEyebrow}>{secilenAy}</div>
              <h2 style={sectionTitle}>Evlər üzrə detal</h2>
            </div>
            <div style={panelNote}>{houseRows.length ? `${houseRows.length} ev` : 'Qeyd yoxdur'}</div>
          </div>

          {houseRows.length ? (
            <div style={isMobile ? houseListMobile : houseList}>
              {houseRows.map((house) => (
                <HouseCard key={house.ev} house={house} isMobile={isMobile} />
              ))}
            </div>
          ) : (
            <div style={empty}>Bu ay üçün kiraye qeydi yoxdur.</div>
          )}
        </section>
      )}
    </div>
  );
}

function buildHouseRows(rows) {
  const map = new Map();

  for (const row of rows) {
    const ev = String(row.ev || '').trim();
    if (!ev) continue;

    const current = map.get(ev) ?? {
      ev,
      kiraye: 0,
      isiq: 0,
      isiqKwt: 0,
      kohneIsiq: null,
      yeniIsiq: null,
      su: 0,
      internet: 0,
      total: 0,
      records: 0,
    };

    current.kiraye += toAmount(row.kiraye);
    current.isiq += toAmount(row.isiqPulu ?? row.isiq_pulu);
    current.isiqKwt += toAmount(row.serfiyyat);
    current.kohneIsiq = row.kohneIsiq ?? row.kohne_isiq ?? current.kohneIsiq;
    current.yeniIsiq = row.yeniIsiq ?? row.yeni_isiq ?? current.yeniIsiq;
    current.su += toAmount(row.suCem ?? row.su_cem);
    current.internet += toAmount(row.wifi);
    current.total = current.kiraye + current.isiq + current.su + current.internet;
    current.records += 1;

    map.set(ev, current);
  }

  return Array.from(map.values()).sort((a, b) => a.ev.localeCompare(b.ev));
}

function calcTotals(rows) {
  return rows.reduce(
    (acc, item) => ({
      kiraye: acc.kiraye + item.kiraye,
      isiq: acc.isiq + item.isiq,
      isiqKwt: acc.isiqKwt + item.isiqKwt,
      su: acc.su + item.su,
      internet: acc.internet + item.internet,
      total: acc.total + item.total,
    }),
    { kiraye: 0, isiq: 0, isiqKwt: 0, su: 0, internet: 0, total: 0 },
  );
}

function HouseCard({ house, isMobile }) {
  const copyText = async () => {
    const text = buildHouseCopyText(house);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const temp = document.createElement('textarea');
      temp.value = text;
      temp.setAttribute('readonly', '');
      temp.style.position = 'fixed';
      temp.style.opacity = '0';
      document.body.appendChild(temp);
      temp.select();
      document.execCommand('copy');
      document.body.removeChild(temp);
    }
  };

  return (
    <article style={houseCard}>
      <div style={isMobile ? houseTopMobile : houseTop}>
        <div>
          <div style={houseTitle}>{house.ev}</div>
          <div style={houseMeta}>{house.records} qeyd</div>
        </div>
        <div style={houseTopActions}>
          <button type="button" onClick={copyText} style={copyButton}>
            Kopyala
          </button>
          <strong style={isMobile ? houseTotalMobile : houseTotal}>{formatMoney(house.total)}</strong>
        </div>
      </div>

      <div style={detailList}>
        <StickerLine label="Kirayə" icon="🏠" value={formatMoney(house.kiraye)} />
        <StickerLine label="Wifi" icon="🌐" value={formatMoney(house.internet)} />
        <StickerLine label="Köhnə İşıq" icon="📉" value={formatMeter(house.kohneIsiq)} />
        <StickerLine label="Yeni İşıq" icon="📈" value={formatMeter(house.yeniIsiq)} />
        <StickerLine label="İşıq Pulu" icon="⚡" value={`${formatMoney(house.isiq)} · ${Number(house.isiqKwt || 0).toFixed(2)} Kwt`} />
        <StickerLine label="Su Cəm" icon="💧" value={formatMoney(house.su)} />
        <StickerLine label="Ev Cəmi" icon="💰" value={formatMoney(house.total)} strong />
      </div>
    </article>
  );
}

function StickerLine({ label, value, icon, strong }) {
  return (
    <div style={strong ? detailStickerStrong : detailSticker}>
      <span style={strong ? detailStickerTextStrong : detailStickerText}>
        <span style={detailStickerIcon}>{icon}</span>
        {label}: {value}
      </span>
    </div>
  );
}

function buildHouseCopyText(house) {
  return [
    `${house.ev}`,
    `🏠 Kirayə: ${formatMoney(house.kiraye)}`,
    `🌐 Wifi: ${formatMoney(house.internet)}`,
    `📉 Köhnə İşıq: ${formatMeter(house.kohneIsiq)}`,
    `📈 Yeni İşıq: ${formatMeter(house.yeniIsiq)}`,
    `⚡ İşıq Pulu: ${formatMoney(house.isiq)}`,
    `💧 Su Cəm: ${formatMoney(house.su)}`,
    `💰 Ev Cəmi: ${formatMoney(house.total)}`,
  ].join('\n');
}

function SummaryItem({ label, value }) {
  return (
    <div style={summaryItem}>
      <div style={summaryItemLabel}>{label}</div>
      <div style={summaryItemValue}>{value}</div>
    </div>
  );
}

function formatMeter(value) {
  if (value === null || value === undefined || value === '') return '-';
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(0) : String(value);
}

function Field({ label, children }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

const wrap = { padding: '16px', maxWidth: '1120px', margin: '0 auto', color: theme.colors.text };
const wrapMobile = { padding: '12px', maxWidth: '1120px', margin: '0 auto', color: theme.colors.text };
const hero = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '12px',
  flexWrap: 'wrap',
  alignItems: 'end',
  padding: '18px',
  borderRadius: theme.radius.lg,
  background: 'linear-gradient(135deg, #ecfdf5 0%, #ffffff 100%)',
  border: '1px solid #bbf7d0',
  marginBottom: '14px',
};
const heroMobile = { ...hero, padding: '14px', flexDirection: 'column', alignItems: 'stretch' };
const eyebrow = { fontSize: '11px', fontWeight: 900, color: theme.colors.success, letterSpacing: '0.08em', marginBottom: '4px' };
const title = { margin: 0, fontSize: '26px', color: theme.colors.text };
const titleMobile = { ...title, fontSize: '20px' };
const sub = { margin: '5px 0 0', color: theme.colors.muted, fontSize: '13px' };
const filters = { display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'end' };
const filtersMobile = { display: 'grid', gap: '10px', alignItems: 'stretch', width: '100%' };
const labelStyle = { display: 'block', color: theme.colors.muted, fontSize: '12px', fontWeight: 700, marginBottom: '5px' };
const control = {
  width: '150px',
  padding: '10px 12px',
  borderRadius: '10px',
  border: `1px solid ${theme.colors.border}`,
  background: '#fff',
  fontSize: '14px',
  boxSizing: 'border-box',
};
const controlMobile = { ...control, width: '100%' };
const notice = { padding: '12px 14px', marginBottom: '14px', borderRadius: theme.radius.md, background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a', fontSize: '13px' };
const errorBox = { padding: '12px 14px', marginBottom: '14px', borderRadius: theme.radius.md, background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', fontSize: '13px' };
const summaryCard = { marginBottom: '14px', borderRadius: theme.radius.lg, padding: '16px', background: 'linear-gradient(135deg, #166534, #22c55e)', color: '#fff', boxShadow: theme.shadow };
const summaryTop = { display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: '12px', flexWrap: 'wrap' };
const summaryTopMobile = { ...summaryTop, alignItems: 'stretch' };
const summaryLabel = { fontSize: '11px', fontWeight: 900, letterSpacing: '0.08em', opacity: 0.9 };
const summaryTitle = { marginTop: '6px', fontSize: '18px', fontWeight: 800 };
const summaryTitleMobile = { ...summaryTitle, fontSize: '16px' };
const summaryValue = { fontSize: '30px', fontWeight: 900, lineHeight: 1.05, whiteSpace: 'nowrap' };
const summaryValueMobile = { ...summaryValue, fontSize: '24px', whiteSpace: 'normal' };
const summaryGrid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', marginTop: '14px' };
const summaryGridMobile = { ...summaryGrid, gridTemplateColumns: '1fr' };
const summaryItem = { padding: '12px', borderRadius: theme.radius.md, background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.18)' };
const summaryItemLabel = { fontSize: '12px', fontWeight: 700, opacity: 0.9 };
const summaryItemValue = { marginTop: '6px', fontSize: '18px', fontWeight: 900 };
const panel = { background: theme.colors.surface, border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.lg, padding: '16px', marginBottom: '14px' };
const panelHead = { display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'end', marginBottom: '12px' };
const panelHeadMobile = { ...panelHead, alignItems: 'stretch' };
const sectionEyebrow = { fontSize: '11px', fontWeight: 900, color: theme.colors.primaryDark, letterSpacing: '0.08em', marginBottom: '4px' };
const sectionTitle = { margin: 0, fontSize: '18px', color: theme.colors.text };
const panelNote = { fontSize: '12px', color: theme.colors.muted, fontWeight: 700 };
const houseList = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '10px' };
const houseListMobile = { ...houseList, gridTemplateColumns: '1fr' };
const houseCard = {
  padding: '14px',
  borderRadius: theme.radius.md,
  background: theme.colors.surfaceSoft,
  border: `1px solid ${theme.colors.border}`,
  display: 'grid',
  gap: '10px',
};
const houseTop = { display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'start' };
const houseTopMobile = { ...houseTop, flexDirection: 'column', alignItems: 'stretch' };
const houseTitle = { fontSize: '16px', fontWeight: 900, color: theme.colors.text };
const houseMeta = { marginTop: '4px', fontSize: '12px', color: theme.colors.muted };
const houseTopActions = { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', justifyContent: 'flex-end' };
const houseTotal = { fontSize: '18px', fontWeight: 900, color: theme.colors.success, whiteSpace: 'nowrap' };
const houseTotalMobile = { ...houseTotal, whiteSpace: 'normal' };
const detailList = { display: 'grid', gap: '8px', paddingTop: '2px' };
const detailSticker = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-start',
  padding: '10px 12px',
  borderRadius: '12px',
  background: '#fff',
  border: `1px solid ${theme.colors.border}`,
  overflow: 'hidden',
};
const detailStickerStrong = {
  ...detailSticker,
  background: 'linear-gradient(135deg, #ecfdf5 0%, #ffffff 100%)',
  border: '1px solid #bbf7d0',
};
const detailStickerText = { display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: theme.colors.text, fontWeight: 800, lineHeight: 1.4, whiteSpace: 'nowrap', minWidth: 0 };
const detailStickerTextStrong = { ...detailStickerText, color: theme.colors.primaryDark, fontSize: '14px' };
const detailStickerIcon = { fontSize: '13px', lineHeight: 1, flex: '0 0 auto' };
const copyButton = {
  padding: '8px 10px',
  borderRadius: '10px',
  border: `1px solid ${theme.colors.border}`,
  background: '#fff',
  color: theme.colors.text,
  fontSize: '12px',
  fontWeight: 800,
  cursor: 'pointer',
};
const empty = { padding: '18px', textAlign: 'center', color: theme.colors.muted, background: theme.colors.surfaceSoft, borderRadius: theme.radius.md };

export default Kiraye;
