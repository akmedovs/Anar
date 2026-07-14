import { useEffect, useMemo, useState } from 'react';
import { reportsApi, washExpensesApi, washWaterApi } from '../../api/reports';
import { aylar, cariIl, formatDateAz, formatMoney, localDateKey } from '../../constants/reporting';
import { theme } from '../../constants/theme';
import { useIsMobile } from '../../hooks/useIsMobile';

function AdminPanel() {
  const isMobile = useIsMobile();
  const [settings, setSettings] = useState(loadSettings);
  const [draft, setDraft] = useState(() => ({ ...loadSettings() }));
  const [notice, setNotice] = useState('');
  const [year, setYear] = useState(cariIl);
  const [reports, setReports] = useState([]);
  const [waterData, setWaterData] = useState([]);
  const [expenseData, setExpenseData] = useState([]);
  const [editor, setEditor] = useState(null);
  const [editorDraft, setEditorDraft] = useState(null);
  const [editType, setEditType] = useState('report');
  const [editMonth, setEditMonth] = useState(aylar[new Date().getMonth()]);
  const [tenantForm, setTenantForm] = useState(() => ({
    ev: 'K-1',
    name: '',
    moveInDate: localDateKey(new Date()),
    note: '',
  }));
  const [tenantHistory, setTenantHistory] = useState(loadTenantHistory);

  useEffect(() => {
    Promise.all([reportsApi.list({ il: year }), washWaterApi.list({ il: year }), washExpensesApi.list({ il: year })])
      .then(([reportRows, waterRows, expenseRows]) => {
        setReports(reportRows);
        setWaterData(waterRows);
        setExpenseData(expenseRows);
      })
      .catch((error) => setNotice(error.message));
  }, [year]);

  const editItems = useMemo(() => {
    const monthIndex = editMonth === 'Bütün Aylar' ? -1 : aylar.indexOf(editMonth);

    if (editType === 'report') {
      return reports
        .filter((item) => String(item.ev || '').trim().toUpperCase() !== 'MOYKA')
        .filter((item) => monthIndex < 0 || aylar.indexOf(String(item.ay || '').trim()) === monthIndex);
    }

    if (editType === 'moyka') {
      return reports
        .filter((item) => String(item.ev || '').trim().toUpperCase() === 'MOYKA')
        .filter((item) => monthIndex < 0 || aylar.indexOf(String(item.ay || '').trim()) === monthIndex);
    }

    if (editType === 'water') {
      return waterData.filter((item) => monthIndex < 0 || aylar.indexOf(String(item.ay || '').trim()) === monthIndex);
    }

    return expenseData.filter((item) => {
      if (monthIndex < 0) return true;
      const date = new Date(item.expenseDate);
      return !Number.isNaN(date.getTime()) && date.getMonth() === monthIndex;
    });
  }, [editMonth, editType, expenseData, reports, waterData]);

  const handleSettingsChange = (e) => {
    const { name, value } = e.target;
    setDraft((prev) => ({ ...prev, [name]: value }));
  };

  const handleTenantChange = (e) => {
    const { name, value } = e.target;
    setTenantForm((prev) => ({ ...prev, [name]: value }));
  };

  const saveSettings = () => {
    const next = {
      isiqTarif: String(draft.isiqTarif || '0.15'),
      suQiymet: String(draft.suQiymet || '3'),
      standartKiraye: String(draft.standartKiraye || '300'),
      standartInternet: String(draft.standartInternet || '5'),
    };

    setSettings(next);
    localStorage.setItem('qlobal_ayarlar', JSON.stringify(next));
    setNotice('Qlobal tariflər saxlanıldı.');
    window.alert('Qlobal tariflər saxlanıldı.');
  };

  const inferSuNefer = (item) => {
    const stored = Number(item?.suNefer ?? item?.su_nefer);
    if (Number.isFinite(stored) && stored > 0) return stored;

    const suQiymet = Number(settings.suQiymet) || 3;
    const inferred = Number(item?.suCem ?? item?.su_cem) / suQiymet;
    return Number.isFinite(inferred) && inferred > 0 ? inferred : 0;
  };

  const saveTenant = () => {
    if (!String(tenantForm.ev).trim() || !String(tenantForm.moveInDate).trim()) {
      alert('Ev və giriş tarixi vacibdir.');
      return;
    }

    const entry = {
      id: crypto.randomUUID(),
      ev: String(tenantForm.ev).trim(),
      name: String(tenantForm.name).trim(),
      moveInDate: String(tenantForm.moveInDate).trim(),
      note: String(tenantForm.note).trim(),
      createdAt: new Date().toISOString(),
    };

    const next = [entry, ...tenantHistory];
    setTenantHistory(next);
    localStorage.setItem('kirayeci_girisleri', JSON.stringify(next));
    setNotice('Kirayəçi girişi saxlanıldı.');
    window.alert('Kirayəçi girişi saxlanıldı.');
    setTenantForm((prev) => ({
      ...prev,
      name: '',
      note: '',
    }));
  };

  const openEditor = (type, item) => {
    setEditor(type);

    if (type === 'report') {
      const inferredSuNefer = inferSuNefer(item);
      setEditorDraft({
        id: item.id,
        il: item.il,
        ay: item.ay,
        ev: item.ev,
        kiraye: item.kiraye,
        wifi: item.wifi,
        suNefer: String(inferredSuNefer || ''),
        originalSuNefer: String(inferredSuNefer || ''),
        kohneIsiq: item.kohneIsiq,
        yeniIsiq: item.yeniIsiq,
      });
      return;
    }

    if (type === 'water') {
      setEditorDraft({
        id: item.id,
        il: item.il,
        ay: item.ay,
        oldReading: item.oldReading,
        newReading: item.newReading,
        pricePerUnit: item.pricePerUnit ?? 1,
      });
      return;
    }

    setEditorDraft({
      id: item.id,
      expenseDate: item.expenseDate,
      title: item.title,
      amount: item.amount,
      note: item.note,
    });
  };

  const handleEditorChange = (e) => {
    const { name, value } = e.target;
    setEditorDraft((prev) => ({ ...prev, [name]: value }));
  };

  const saveEditor = async (e) => {
    e.preventDefault();

    try {
      if (editor === 'report') {
        const id = editorDraft.id;
        const il = Number(editorDraft.il) || cariIl;
        const ay = String(editorDraft.ay).trim();
        const ev = String(editorDraft.ev).trim();
        const kirayeNum = Number(editorDraft.kiraye) || 0;
        const kohneIsiqNum = Number(editorDraft.kohneIsiq) || 0;
        const yeniIsiqNum = Number(editorDraft.yeniIsiq) || 0;
        const currentReport = reports.find((row) => row.id === id);
        const fallbackSuNefer = inferSuNefer(currentReport) || editorDraft.originalSuNefer || 0;
        const suNeferValue =
          String(editorDraft.suNefer ?? '').trim() === ''
            ? fallbackSuNefer
            : editorDraft.suNefer;
        const suNeferNum = Number(suNeferValue) || 0;
        const wifiNum = Number(editorDraft.wifi) || 0;
        const suQiymet = Number(settings.suQiymet) || 0;
        const tarif = Number(settings.isiqTarif) || 0.15;
        const serfiyyat = yeniIsiqNum - kohneIsiqNum;
        const isiqPulu = Number((Math.max(0, serfiyyat) * tarif).toFixed(2));
        const suCem = Number((suNeferNum * suQiymet).toFixed(2));
        const total = Number((kirayeNum - isiqPulu - suCem - wifiNum).toFixed(2));

        const duplicate = reports.some((row) => row.id !== id && Number(row.il) === il && String(row.ay).trim() === ay && String(row.ev).trim() === ev);
        if (duplicate) {
          alert('Bu ev üçün bu ay artıq qeyd var.');
          return;
        }

        await reportsApi.update({
          id,
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
      }

      if (editor === 'water') {
        const id = editorDraft.id;
        const il = Number(editorDraft.il) || cariIl;
        const ay = String(editorDraft.ay).trim();
        const duplicate = waterData.some((row) => row.id !== id && Number(row.il) === il && String(row.ay).trim() === ay);
        if (duplicate) {
          alert('Bu ay üçün su göstəricisi artıq var.');
          return;
        }

        await washWaterApi.update({
          id,
          il,
          ay,
          oldReading: Number(editorDraft.oldReading) || 0,
          newReading: Number(editorDraft.newReading) || 0,
          pricePerUnit: Number(editorDraft.pricePerUnit) || 1,
        });
      }

      if (editor === 'expense') {
        if (!String(editorDraft.expenseDate).trim() || !String(editorDraft.title).trim() || !String(editorDraft.amount).trim()) {
          alert('Xərc üçün tarix, ad və məbləğ yazmalısan.');
          return;
        }

        await washExpensesApi.update(editorDraft);
      }

      const [reportRows, waterRows, expenseRows] = await Promise.all([reportsApi.list({ il: year }), washWaterApi.list({ il: year }), washExpensesApi.list({ il: year })]);
      setReports(reportRows);
      setWaterData(waterRows);
      setExpenseData(expenseRows);
      setEditor(null);
      setEditorDraft(null);
      setNotice('Dəyişikliyi saxladım.');
      window.alert('Dəyişikliyi saxladım.');
    } catch (error) {
      setNotice(`Dəyişikliyi saxlamaq olmadı: ${error.message}`);
    }
  };

  return (
    <div style={isMobile ? wrapMobile : wrap}>
      <header style={isMobile ? heroMobile : hero}>
        <div>
          <div style={eyebrow}>AdminPanel</div>
          <h1 style={isMobile ? titleMobile : title}>Qlobal Tarif Ayarları</h1>
          <p style={sub}>Bu dəyərlər Admin bölməsində ev girişinə tətbiq olunur.</p>
        </div>
        {notice && <div style={noticeBox}>{notice}</div>}
      </header>

      <section style={card}>
        <div style={isMobile ? gridMobile : grid}>
          <Field label="İşıq Tarifi (1 Kwt / ₼)">
            <input type="number" step="any" name="isiqTarif" value={draft.isiqTarif} onChange={handleSettingsChange} style={inputStyle} />
          </Field>
          <Field label="Su Qiyməti (Nəfər başı / ₼)">
            <input type="number" step="any" name="suQiymet" value={draft.suQiymet} onChange={handleSettingsChange} style={inputStyle} />
          </Field>
          <Field label="Standart Kirayə (₼)">
            <input type="number" step="any" name="standartKiraye" value={draft.standartKiraye} onChange={handleSettingsChange} style={inputStyle} />
          </Field>
          <Field label="Standart Wifi (₼)">
            <input type="number" step="any" name="standartInternet" value={draft.standartInternet} onChange={handleSettingsChange} style={inputStyle} />
          </Field>
        </div>

        <button type="button" onClick={saveSettings} style={button}>
          Yadda Saxla
        </button>
      </section>

      <section style={editSection}>
        <div style={isMobile ? sectionTopMobile : sectionTop}>
          <div>
            <div style={sectionEyebrow}>DÜZƏLİŞ</div>
            <h2 style={sectionTitle}>Qeydləri dəyiş</h2>
          </div>
        </div>

        {editor && editorDraft && (
          <form onSubmit={saveEditor} style={editForm}>
            <div style={editorHead}>
              <div style={sectionEyebrow}>SEÇİLMİŞ QEYD</div>
              <h3 style={sectionTitleSmall}>{editor === 'report' ? 'Kirayə' : editor === 'water' ? 'Su göstəricisi' : 'Xərc'}</h3>
            </div>

            {editor === 'report' && (
              <>
            <Row isMobile={isMobile}>
                  <Field label="İl">
                    <input type="number" name="il" value={editorDraft.il} onChange={handleEditorChange} style={inputStyle} />
                  </Field>
                  <Field label="Ay">
                    <select name="ay" value={editorDraft.ay} onChange={handleEditorChange} style={inputStyle}>
                      {aylar.map((ay) => (
                        <option key={ay} value={ay}>
                          {ay}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Ev">
                    <select name="ev" value={editorDraft.ev} onChange={handleEditorChange} style={inputStyle}>
                      {['K-1', 'K-2', 'K-3', 'K-4', 'K-5', 'K-PDVL', 'MOYKA'].map((ev) => (
                        <option key={ev} value={ev}>
                          {ev}
                        </option>
                      ))}
                    </select>
                  </Field>
                </Row>
            <Row isMobile={isMobile}>
                  <Field label="Kirayə (₼)">
                    <input type="number" step="any" name="kiraye" value={editorDraft.kiraye} onChange={handleEditorChange} style={inputStyle} />
                  </Field>
                  <Field label="Wifi (₼)">
                    <input type="number" step="any" name="wifi" value={editorDraft.wifi} onChange={handleEditorChange} style={inputStyle} />
                  </Field>
                  <Field label="Nəfər sayı">
                    <input type="number" step="any" name="suNefer" value={editorDraft.suNefer} onChange={handleEditorChange} style={inputStyle} />
                  </Field>
                </Row>
                <Row isMobile={isMobile}>
                  <Field label="Köhnə İşıq">
                    <input type="number" step="any" name="kohneIsiq" value={editorDraft.kohneIsiq} onChange={handleEditorChange} style={inputStyle} />
                  </Field>
                  <Field label="Yeni İşıq">
                    <input type="number" step="any" name="yeniIsiq" value={editorDraft.yeniIsiq} onChange={handleEditorChange} style={inputStyle} />
                  </Field>
                </Row>
              </>
            )}

            {editor === 'water' && (
              <Row isMobile={isMobile}>
                <Field label="İl">
                  <input type="number" name="il" value={editorDraft.il} onChange={handleEditorChange} style={inputStyle} />
                </Field>
                <Field label="Ay">
                  <select name="ay" value={editorDraft.ay} onChange={handleEditorChange} style={inputStyle}>
                    {aylar.map((ay) => (
                      <option key={ay} value={ay}>
                        {ay}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Köhnə Su">
                  <input type="number" step="any" name="oldReading" value={editorDraft.oldReading} onChange={handleEditorChange} style={inputStyle} />
                </Field>
                <Field label="Yeni Su">
                  <input type="number" step="any" name="newReading" value={editorDraft.newReading} onChange={handleEditorChange} style={inputStyle} />
                </Field>
                <Field label="Qiymət">
                  <input type="number" step="any" name="pricePerUnit" value={editorDraft.pricePerUnit} onChange={handleEditorChange} style={inputStyle} />
                </Field>
              </Row>
            )}

            {editor === 'expense' && (
              <Row isMobile={isMobile}>
                <Field label="Tarix">
                  <input type="date" name="expenseDate" value={editorDraft.expenseDate} onChange={handleEditorChange} style={inputStyle} />
                </Field>
                <Field label="Ad">
                  <input type="text" name="title" value={editorDraft.title} onChange={handleEditorChange} style={inputStyle} />
                </Field>
                <Field label="Məbləğ">
                  <input type="number" step="any" name="amount" value={editorDraft.amount} onChange={handleEditorChange} style={inputStyle} />
                </Field>
                <Field label="Qeyd">
                  <input type="text" name="note" value={editorDraft.note} onChange={handleEditorChange} style={inputStyle} />
                </Field>
              </Row>
            )}

            <button type="submit" style={button}>
              Dəyişikliyi Saxla
            </button>
          </form>
        )}

        <div style={isMobile ? filterBarMobile : filterBar}>
          <Field label="İl">
            <select value={year} onChange={(e) => setYear(Number(e.target.value) || cariIl)} style={inputStyle}>
              {yearOptions().map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Tip">
            <select value={editType} onChange={(e) => setEditType(e.target.value)} style={inputStyle}>
              <option value="report">Kirayə</option>
              <option value="moyka">Aftoyuma</option>
              <option value="water">Su</option>
              <option value="expense">Xərc</option>
            </select>
          </Field>
          <Field label="Ay">
            <select value={editMonth} onChange={(e) => setEditMonth(e.target.value)} style={inputStyle}>
              <option value="Bütün Aylar">Bütün Aylar</option>
              {aylar.map((ay) => (
                <option key={ay} value={ay}>
                  {ay}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <SimpleList
          isMobile={isMobile}
          title={`${editType === 'report' ? 'Kirayə' : editType === 'moyka' ? 'Aftoyuma' : editType === 'water' ? 'Su' : 'Xərc'} qeydləri`}
          items={editItems}
          emptyText="Qeyd yoxdur."
          renderItem={(item) => {
            if (editType === 'report') {
              return (
                <>
                  <div style={isMobile ? listTopMobile : listTop}>
                    <strong>{item.ev}</strong>
                    <span>{item.ay}</span>
                  </div>
                  <div style={listMeta}>
                    Kirayə: {formatMoney(item.kiraye)} · İşıq: {formatMoney(item.isiqPulu)} · Su: {formatMoney(item.suCem)} · Wifi: {formatMoney(item.wifi)}
                  </div>
                  <button type="button" onClick={() => openEditor('report', item)} style={smallButton}>
                    Düzəlt
                  </button>
                </>
              );
            }

            if (editType === 'moyka') {
              return (
                <>
                  <div style={isMobile ? listTopMobile : listTop}>
                    <strong>{item.ay}</strong>
                    <span>{item.il}</span>
                  </div>
                  <div style={listMeta}>
                    İşıq: {formatMoney(item.isiqPulu)} · Su: {formatMoney(item.suCem)} · Kwt: {Number(item.serfiyyat || 0).toFixed(2)}
                  </div>
                  <button type="button" onClick={() => openEditor('report', item)} style={smallButton}>
                    Düzəlt
                  </button>
                </>
              );
            }

            if (editType === 'water') {
              return (
                <>
                  <div style={isMobile ? listTopMobile : listTop}>
                    <strong>{item.ay}</strong>
                    <span>{item.il}</span>
                  </div>
                  <div style={listMeta}>
                    Köhnə: {item.oldReading} · Yeni: {item.newReading} · Cəmi: {formatMoney(item.total)}
                  </div>
                  <button type="button" onClick={() => openEditor('water', item)} style={smallButton}>
                    Düzəlt
                  </button>
                </>
              );
            }

            return (
              <>
                <div style={isMobile ? listTopMobile : listTop}>
                  <strong>{item.title}</strong>
                  <span>{formatDateAz(item.expenseDate)}</span>
                </div>
                <div style={listMeta}>
                  Məbləğ: {formatMoney(item.amount)} {item.note ? `· ${item.note}` : ''}
                </div>
                <button type="button" onClick={() => openEditor('expense', item)} style={smallButton}>
                  Düzəlt
                </button>
              </>
            );
          }}
        />
      </section>

      <section style={card}>
        <div style={isMobile ? sectionHeadSimpleMobile : sectionHeadSimple}>
          <div>
            <div style={sectionEyebrow}>KİRAYƏÇİ TARİXİ</div>
            <h2 style={sectionTitle}>Evə giriş qeydi</h2>
          </div>
          <div style={sectionHint}>Hər köçdə yeni tarix əlavə et</div>
        </div>

        <div style={isMobile ? tenantGridMobile : tenantGrid}>
          <Field label="Ev">
            <select name="ev" value={tenantForm.ev} onChange={handleTenantChange} style={inputStyle}>
              {['K-1', 'K-2', 'K-3', 'K-4', 'K-5', 'K-PDVL', 'MOYKA'].map((ev) => (
                <option key={ev} value={ev}>
                  {ev}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Kirayəçi Adı">
            <input type="text" name="name" value={tenantForm.name} onChange={handleTenantChange} style={inputStyle} placeholder="İstəyə görə" />
          </Field>
          <Field label="Giriş Tarixi">
            <input type="date" name="moveInDate" value={tenantForm.moveInDate} onChange={handleTenantChange} style={inputStyle} />
          </Field>
          <Field label="Qeyd">
            <input type="text" name="note" value={tenantForm.note} onChange={handleTenantChange} style={inputStyle} placeholder="Məsələn: yeni kirayəçi" />
          </Field>
        </div>

        <button type="button" onClick={saveTenant} style={button}>
          Tarixi Saxla
        </button>

        <div style={tenantHistoryWrap}>
          {tenantHistory.length ? (
            tenantHistory.map((item) => (
              <div key={item.id} style={isMobile ? tenantRowMobile : tenantRow}>
                <div>
                  <strong>{item.ev}</strong>
                  <div style={tenantMeta}>
                    {item.name || 'Ad yazılmayıb'} · {formatDateAz(item.moveInDate)}
                  </div>
                </div>
                <div style={isMobile ? tenantNoteMobile : tenantNote}>{item.note || 'Qeyd yoxdur'}</div>
              </div>
            ))
          ) : (
            <div style={emptyBox}>Hələ qeyd yoxdur.</div>
          )}
        </div>
      </section>
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
    return JSON.parse(localStorage.getItem('qlobal_ayarlar')) || {
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

function loadTenantHistory() {
  if (typeof window === 'undefined') return [];

  try {
    const saved = JSON.parse(localStorage.getItem('kirayeci_girisleri'));
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function yearOptions() {
  const current = new Date().getFullYear();
  return [current - 1, current, current + 1];
}

function Field({ label, children }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

function Row({ children, isMobile }) {
  return <div style={isMobile ? rowStyleMobile : rowStyle}>{children}</div>;
}

function SimpleList({ title, items, emptyText, renderItem }) {
  return (
    <section style={listCard}>
      <div style={listHead}>
        <h3 style={listTitle}>{title}</h3>
        <span style={listCount}>{items.length}</span>
      </div>

      {items.length ? (
        <div style={listItems}>
          {items.map((item) => (
            <div key={item.id} style={listItem}>
              {renderItem(item)}
            </div>
          ))}
        </div>
      ) : (
        <div style={emptyBox}>{emptyText}</div>
      )}
    </section>
  );
}

const wrap = { display: 'grid', gap: '18px', maxWidth: '1120px', margin: '15px auto', padding: '0 15px 24px', color: theme.colors.text };
const wrapMobile = { ...wrap, padding: '0 12px 20px' };
const hero = { display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'end', padding: '18px', borderRadius: theme.radius.lg, background: 'linear-gradient(135deg, #fefce8 0%, #ffffff 100%)', border: `1px solid ${theme.colors.border}` };
const heroMobile = { ...hero, padding: '14px', flexDirection: 'column', alignItems: 'stretch' };
const eyebrow = { fontSize: '11px', fontWeight: 900, color: theme.colors.primaryDark, letterSpacing: '0.08em', marginBottom: '4px' };
const title = { margin: 0, fontSize: '24px', color: theme.colors.text };
const titleMobile = { ...title, fontSize: '20px' };
const sub = { margin: '6px 0 0', color: theme.colors.muted, fontSize: '13px' };
const noticeBox = { padding: '10px 12px', borderRadius: '10px', background: '#ecfeff', border: '1px solid #a5f3fc', color: '#155e75', fontSize: '13px', maxWidth: '320px' };
const card = { background: theme.colors.surface, padding: '20px', borderRadius: '14px', boxShadow: theme.shadow, border: `1px solid ${theme.colors.border}` };
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginBottom: '14px' };
const gridMobile = { ...grid, gridTemplateColumns: '1fr' };
const labelStyle = { display: 'block', marginBottom: '5px', fontSize: '13px', fontWeight: '600', color: theme.colors.muted };
const inputStyle = { width: '100%', padding: '12px', borderRadius: '8px', border: `1px solid ${theme.colors.border}`, boxSizing: 'border-box', fontSize: '15px' };
const button = { padding: '15px', background: theme.colors.success, color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', fontSize: '15px' };
const rowStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' };
const rowStyleMobile = { ...rowStyle, gridTemplateColumns: '1fr' };
const sectionHeadSimple = { display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '14px' };
const sectionHeadSimpleMobile = { ...sectionHeadSimple, alignItems: 'stretch' };
const sectionHint = { fontSize: '13px', color: theme.colors.muted };
const tenantGrid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '12px' };
const tenantGridMobile = { ...tenantGrid, gridTemplateColumns: '1fr' };
const tenantHistoryWrap = { display: 'grid', gap: '10px', marginTop: '14px' };
const tenantRow = { display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start', padding: '12px', borderRadius: '12px', background: '#f9fafb', border: `1px solid ${theme.colors.border}` };
const tenantRowMobile = { ...tenantRow, flexDirection: 'column' };
const tenantMeta = { marginTop: '4px', fontSize: '12px', color: theme.colors.muted };
const tenantNote = { fontSize: '12px', color: theme.colors.text, maxWidth: '220px', textAlign: 'right' };
const tenantNoteMobile = { ...tenantNote, maxWidth: '100%', textAlign: 'left' };
const editSection = { marginTop: '18px', padding: '20px', borderRadius: '14px', background: theme.colors.surface, border: `1px solid ${theme.colors.border}`, boxShadow: theme.shadow };
const sectionTop = { display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '14px' };
const sectionTopMobile = { ...sectionTop, alignItems: 'stretch' };
const sectionEyebrow = { fontSize: '11px', fontWeight: 900, color: theme.colors.primaryDark, letterSpacing: '0.08em', marginBottom: '4px' };
const sectionTitle = { margin: 0, fontSize: '18px', color: theme.colors.text };
const sectionTitleSmall = { margin: 0, fontSize: '16px', color: theme.colors.text };
const editorHead = { display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-start' };
const editForm = { display: 'grid', gap: '14px', marginBottom: '18px', padding: '16px', borderRadius: '12px', background: '#f8fafc', border: `1px solid ${theme.colors.border}` };
const filterBar = { display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginBottom: '12px' };
const filterBarMobile = { ...filterBar, gridTemplateColumns: '1fr' };
const listCard = { padding: '14px', borderRadius: '12px', background: '#fff', border: `1px solid ${theme.colors.border}` };
const listHead = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginBottom: '10px' };
const listTitle = { margin: 0, fontSize: '15px', color: theme.colors.text };
const listCount = { minWidth: '26px', padding: '2px 8px', borderRadius: '999px', background: '#eef2ff', color: theme.colors.primaryDark, fontSize: '12px', fontWeight: '700', textAlign: 'center' };
const listItems = { display: 'grid', gap: '10px' };
const listItem = { padding: '10px', borderRadius: '10px', background: '#f9fafb', border: '1px solid #e5e7eb' };
const listTop = { display: 'flex', justifyContent: 'space-between', gap: '10px', fontSize: '14px', marginBottom: '4px' };
const listTopMobile = { ...listTop, flexDirection: 'column' };
const listMeta = { color: theme.colors.muted, fontSize: '12px', lineHeight: 1.4, marginBottom: '8px' };
const smallButton = { padding: '8px 10px', background: theme.colors.primary, color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', fontSize: '12px' };
const emptyBox = { padding: '18px', textAlign: 'center', color: theme.colors.muted, background: theme.colors.surfaceSoft, borderRadius: theme.radius.md };

export default AdminPanel;
