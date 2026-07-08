import { useEffect, useMemo, useState } from 'react';
import { reportsApi, vehicleEventsApi } from '../../api/reports';
import { aylar, cariIl, formatMoney, getYearOptions, toAmount } from '../../constants/reporting';
import { theme } from '../../constants/theme';

function Aftoyuma() {
  const [data, setData] = useState([]);
  const [secilenIl, setSecilenIl] = useState(cariIl);
  const [secilenAy, setSecilenAy] = useState('Bütün Aylar');
  const [vehicleEvents, setVehicleEvents] = useState([]);
  const [plateInput, setPlateInput] = useState('');
  const [direction, setDirection] = useState('entry');

  useEffect(() => {
    const fetchAftoyumaData = async () => {
      try {
        const reports = await reportsApi.list({ il: secilenIl });
        setData(reports.filter((item) => String(item.ev).trim() === 'MOYKA'));
      } catch (error) {
        console.error('Backend-dən məlumat alınarkən xəta:', error.message);
      }
    };

    fetchAftoyumaData();
  }, [secilenIl]);

  useEffect(() => {
    const loadEvents = async () => {
      try {
        const events = await vehicleEventsApi.list();
        setVehicleEvents(events);
      } catch (error) {
        console.error('Maşın qeydiyyatı alınarkən xəta:', error.message);
      }
    };

    loadEvents();
  }, []);

  const filteredData = useMemo(() => {
    if (secilenAy === 'Bütün Aylar') return data;
    return data.filter((item) => String(item.ay).trim() === secilenAy);
  }, [data, secilenAy]);

  const cemSerfiyyat = filteredData.reduce((sum, item) => sum + toAmount(item.serfiyyat), 0);
  const cemIsiqPulu = filteredData.reduce((sum, item) => sum + toAmount(item.isiqPulu), 0);
  const umumiCem = filteredData.reduce((sum, item) => sum + toAmount(item.total), 0);
  const todayKey = localDateKey(new Date());
  const dailyEvents = vehicleEvents.filter((item) => localDateKey(new Date(item.createdAt)) === todayKey);

  const handleSavePlate = async (e) => {
    e.preventDefault();
    const plate = plateInput.trim().toUpperCase();
    if (!plate) return;

    try {
      await vehicleEventsApi.create({ plate, direction, source: 'manual' });
      setPlateInput('');
      const events = await vehicleEventsApi.list();
      setVehicleEvents(events);
    } catch (error) {
      console.error('Nömrə qeyd edilərkən xəta:', error.message);
      alert('Nömrə yadda saxlanmadı.');
    }
  };

  return (
    <div style={{ padding: '15px', maxWidth: '760px', margin: '0 auto', color: theme.colors.text }}>
      <div style={{ backgroundColor: theme.colors.surface, padding: '15px', borderRadius: theme.radius.md, border: `1px solid ${theme.colors.border}`, marginBottom: '15px', display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'space-between', alignItems: 'end' }}>
        <div>
          <h2 style={{ margin: 0, color: theme.colors.text, fontSize: '18px', fontWeight: '700' }}>Aftoyuma</h2>
          <div style={{ marginTop: '4px', color: theme.colors.muted, fontSize: '12px' }}>Günlük maşın sayı, nömrə qeydiyyatı və işıq sərfiyyatı</div>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <div>
            <label style={labelStyle}>İl</label>
            <input type="number" min="2020" max="2100" value={secilenIl} onChange={(e) => setSecilenIl(e.target.value)} list="aftoyuma-iller" style={controlStyle} />
            <datalist id="aftoyuma-iller">
              {getYearOptions(secilenIl).map((il) => <option key={il} value={il} />)}
            </datalist>
          </div>
          <div>
            <label style={labelStyle}>Ay</label>
            <select value={secilenAy} onChange={(e) => setSecilenAy(e.target.value)} style={controlStyle}>
              <option value="Bütün Aylar">Bütün Aylar</option>
              {aylar.map((ay) => <option key={ay} value={ay}>{ay}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px', marginBottom: '15px' }}>
        <Summary title="Xalis sərfiyyat" value={`${cemSerfiyyat.toFixed(2)} Kwt`} color="#334155" />
        <Summary title="İşıq pulu" value={formatMoney(cemIsiqPulu)} color="#e84118" />
        <Summary title="Yekun total" value={formatMoney(umumiCem)} color="#20bf6b" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px', marginBottom: '15px' }}>
        <Summary title="Günlük maşın sayı" value={`${dailyEvents.length}`} color="#0f172a" />
        <Summary title="Son nömrə" value={dailyEvents[0]?.plate || '-'} color="#4b7bec" />
      </div>

      <div style={{ background: theme.colors.surface, padding: '15px', borderRadius: theme.radius.md, border: `1px solid ${theme.colors.border}`, marginBottom: '15px' }}>
        <h3 style={{ margin: '0 0 8px', color: theme.colors.text, fontSize: '16px' }}>Kamera və nömrə qutusu</h3>
        <div style={{ color: theme.colors.muted, fontSize: '12px', marginBottom: '12px' }}>
          Dahua IPC-HFW2441T-ZS kameradan gələn görüntü sonradan OCR üçün eyni qutuya yazılacaq. Hazırda manual nömrə əlavə olunur.
        </div>
        <form onSubmit={handleSavePlate} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '8px', alignItems: 'end' }}>
          <div>
            <label style={labelStyle}>Nömrə</label>
            <input value={plateInput} onChange={(e) => setPlateInput(e.target.value)} placeholder="10AA001" style={{ ...controlStyle, width: '100%' }} />
          </div>
          <div>
            <label style={labelStyle}>İstiqamət</label>
            <select value={direction} onChange={(e) => setDirection(e.target.value)} style={controlStyle}>
              <option value="entry">Giriş</option>
              <option value="exit">Çıxış</option>
            </select>
          </div>
          <button type="submit" style={{ ...controlStyle, background: theme.colors.text, color: '#fff', border: 'none', cursor: 'pointer', width: '100%' }}>Qeyd et</button>
        </form>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {filteredData.length === 0 ? (
          <div style={{ padding: '30px', textAlign: 'center', color: theme.colors.muted, background: theme.colors.surface, borderRadius: theme.radius.md, border: `1px solid ${theme.colors.border}` }}>
            Məlumat tapılmadı.
          </div>
        ) : (
          filteredData.map((item) => (
            <div key={`${item.il}-${item.ay}-${item.ev}`} style={{ background: theme.colors.surface, borderRadius: theme.radius.md, padding: '15px', border: `1px solid ${theme.colors.border}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px', marginBottom: '10px' }}>
                <span style={{ fontWeight: '700', color: theme.colors.text, fontSize: '15px' }}>{item.il} / {item.ay}</span>
                <span style={{ background: '#fef2f2', color: theme.colors.wash, padding: '4px 10px', borderRadius: theme.radius.pill, fontSize: '12px', fontWeight: '700' }}>{item.ev}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '13px', color: theme.colors.muted }}>
                <Metric label="Köhnə İşıq" value={item.kohneIsiq} />
                <Metric label="Yeni İşıq" value={item.yeniIsiq} />
                <Metric label="Xalis Sərfiyyat" value={`${item.serfiyyat} Kwt`} />
                <Metric label="İşıq Pulu" value={formatMoney(item.isiqPulu)} color="#e84118" />
              </div>
              <div style={{ marginTop: '12px', paddingTop: '8px', borderTop: '1px dashed #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Yekun ödəniş</span>
                <span style={{ fontSize: '16px', fontWeight: '700', color: theme.colors.wash }}>{formatMoney(item.total)}</span>
              </div>
            </div>
          ))
        )}
      </div>

      <div style={{ background: theme.colors.surface, padding: '15px', borderRadius: theme.radius.md, border: `1px solid ${theme.colors.border}`, marginTop: '15px' }}>
        <h3 style={{ margin: '0 0 10px', color: theme.colors.text, fontSize: '16px' }}>Bugünkü qeydlər</h3>
        {dailyEvents.length === 0 ? (
          <div style={{ padding: '18px', textAlign: 'center', color: theme.colors.muted, background: theme.colors.surfaceSoft, borderRadius: theme.radius.md }}>Hələ maşın qeydi yoxdur.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['Vaxt', 'Nömrə', 'İstiqamət', 'Mənbə'].map((x) => <th key={x} style={tableHead}>{x}</th>)}
                </tr>
              </thead>
              <tbody>
                {dailyEvents.map((item) => (
                  <tr key={item.id} style={{ background: '#fff' }}>
                    <td style={tableCell}>{new Date(item.createdAt).toLocaleTimeString('az-AZ', { hour: '2-digit', minute: '2-digit' })}</td>
                    <td style={tableCell}>{item.plate}</td>
                    <td style={tableCell}>{item.direction === 'entry' ? 'Giriş' : 'Çıxış'}</td>
                    <td style={tableCell}>{item.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function Summary({ title, value, color }) {
  return (
    <div style={{ background: theme.colors.surface, border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.md, padding: '12px' }}>
      <div style={{ color: theme.colors.muted, fontSize: '12px', fontWeight: 700 }}>{title}</div>
      <div style={{ color, fontSize: '20px', fontWeight: 800, marginTop: '6px' }}>{value}</div>
    </div>
  );
}

function Metric({ label, value, color = '#334155' }) {
  return (
    <div>
      {label}: <strong style={{ color }}>{value}</strong>
    </div>
  );
}

const labelStyle = {
  display: 'block',
  color: theme.colors.muted,
  fontSize: '12px',
  fontWeight: 700,
  marginBottom: '5px',
};

const controlStyle = {
  width: '130px',
  padding: '10px',
  borderRadius: '7px',
  border: `1px solid ${theme.colors.border}`,
  background: '#fff',
  fontSize: '14px',
  boxSizing: 'border-box',
};

const tableHead = {
  textAlign: 'left',
  padding: '10px 8px',
  borderBottom: `1px solid ${theme.colors.border}`,
  color: '#475569',
};

const tableCell = {
  padding: '10px 8px',
  borderBottom: '1px solid #eef2f7',
  color: '#0f172a',
  whiteSpace: 'nowrap',
};

export default Aftoyuma;
