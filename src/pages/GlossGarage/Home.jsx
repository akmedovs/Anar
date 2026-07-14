import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiArrowRight, FiCamera, FiCheckCircle, FiClock, FiImage, FiLayers, FiShield } from 'react-icons/fi';
import { glossJobsApi, glossServicesApi } from '../../api/glossgarage';
import { formatDateAz, formatMoney } from '../../constants/reporting';
import { theme } from '../../constants/theme';
import { useIsMobile } from '../../hooks/useIsMobile';

function GlossGarageHome() {
  const isMobile = useIsMobile();
  const [services, setServices] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const [serviceRows, jobRows] = await Promise.all([glossServicesApi.list(), glossJobsApi.list()]);
        if (!alive) return;
        setServices(serviceRows);
        setJobs(jobRows);
      } catch (err) {
        if (!alive) return;
        setError(err.message || 'Məlumat alınmadı');
      } finally {
        if (alive) setLoading(false);
      }
    };

    load();
    const timer = window.setInterval(load, 30000);

    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  const activeServices = useMemo(() => services.filter((service) => service.active), [services]);
  const recentJobs = useMemo(() => jobs.slice(0, 8), [jobs]);
  const sedanPrice = activeServices.reduce((sum, item) => sum + Number(item.sedanPrice || 0), 0);
  const suvPrice = activeServices.reduce((sum, item) => sum + Number(item.suvPrice || 0), 0);
  const imageCount = jobs.reduce((sum, item) => sum + (item.images?.length || 0), 0);

  return (
    <div style={isMobile ? pageMobile : page}>
      <section style={isMobile ? heroMobile : hero}>
        <div style={heroGlow} />
        <div style={{ position: 'relative', zIndex: 1, display: 'grid', gap: 20 }}>
          <div style={eyebrow}>GLOSS GARAGE</div>
          <h1 style={isMobile ? titleMobile : title}>Maşın yuma, nano, polirovka və ximcistka üçün premium vebsayt</h1>
          <p style={sub}>
            Qiymətləri ayrıca idarə et, sedan və cip üçün fərqli tarif saxla, görülən hər işi şəkillərlə jurnala yaz.
          </p>

          <div style={ctaRow}>
            <Link to="/admin" style={primaryButton}>
              Admin panel
              <FiArrowRight />
            </Link>
            <a href="#prices" style={secondaryButton}>
              Qiymətlərə bax
            </a>
          </div>

          <div style={isMobile ? metricRowMobile : metricRow}>
            <Metric label="Aktiv xidmətlər" value={String(activeServices.length)} icon={<FiLayers />} />
            <Metric label="Son işlər" value={String(jobs.length)} icon={<FiClock />} />
            <Metric label="Şəkil arxivi" value={String(imageCount)} icon={<FiImage />} />
          </div>
        </div>

        <div style={heroPanel}>
          <div style={heroPanelHeader}>
            <span style={heroPill}><FiShield /> Etibarlı qeyd</span>
            <span style={heroPillMuted}><FiCamera /> Şəkilli detal</span>
          </div>
          <div style={heroCard}>
            <div style={heroCardLabel}>Sedan paket cəmi</div>
            <div style={heroCardValue}>{formatMoney(sedanPrice)}</div>
            <div style={heroCardNote}>Aktiv xidmətlərin sedan cəmi</div>
          </div>
          <div style={heroCard}>
            <div style={heroCardLabel}>Cip paket cəmi</div>
            <div style={heroCardValue}>{formatMoney(suvPrice)}</div>
            <div style={heroCardNote}>Aktiv xidmətlərin SUV cəmi</div>
          </div>
        </div>
      </section>

      {loading && <div style={notice}>Məlumatlar yüklənir...</div>}
      {error && <div style={errorBox}>{error}</div>}

      <section id="prices" style={section}>
        <SectionHead
          eyebrow="Qiymətlər"
          title="Sedan və cip qiymətləri"
          sub="Qiymətləri admin paneldən dəyişirsən, sayt avtomatik yenilənir."
        />

        <div style={priceGrid}>
          {activeServices.map((service) => (
            <article key={service.id} style={priceCard}>
              <div style={priceTop}>
                <div>
                  <div style={priceCategory}>{service.category}</div>
                  <h3 style={priceTitle}>{service.title}</h3>
                </div>
                <span style={serviceStatus}>Aktiv</span>
              </div>
              <div style={priceRow}>
                <span>Sedan</span>
                <strong>{formatMoney(service.sedanPrice)}</strong>
              </div>
              <div style={priceRow}>
                <span>Cip</span>
                <strong>{formatMoney(service.suvPrice)}</strong>
              </div>
              {service.notes ? <p style={priceNote}>{service.notes}</p> : null}
            </article>
          ))}
        </div>
      </section>

      <section id="works" style={section}>
        <SectionHead
          eyebrow="İşlər"
          title="Görülən işlər şəkillə göstərilir"
          sub="Hər işdə hansı xidmətlərin edildiyi, nə qədər olduğu və şəkillər detallı görünür."
        />

        {recentJobs.length ? (
          <div style={jobGrid}>
            {recentJobs.map((job) => (
              <article key={job.id} style={jobCard}>
                <div style={jobHead}>
                  <div>
                    <div style={jobPlate}>{job.plate}</div>
                    <div style={jobMeta}>
                      {job.customerName || 'Müştəri qeyd edilməyib'} · {job.vehicleType === 'suv' ? 'Cip' : 'Sedan'}
                    </div>
                  </div>
                  <div style={jobTotal}>{formatMoney(job.total)}</div>
                </div>

                <div style={jobDate}>{formatDateAz(job.serviceDate)}</div>

                <div style={itemList}>
                  {job.items.map((item, index) => (
                    <div key={`${job.id}-${index}`} style={itemRow}>
                      <div>
                        <strong>{item.serviceTitle}</strong>
                        <div style={itemSub}>
                          {item.quantity} ədəd · {item.category || 'Xidmət'}
                        </div>
                      </div>
                      <div style={itemPrice}>{formatMoney(item.lineTotal)}</div>
                    </div>
                  ))}
                </div>

                {job.note ? <div style={jobNote}>{job.note}</div> : null}

                {job.images?.length ? (
                  <div style={imageGrid}>
                    {job.images.slice(0, 4).map((image, index) => (
                      <figure key={`${job.id}-image-${index}`} style={imageFigure}>
                        <img src={image.url} alt={`${job.plate} ${index + 1}`} style={imageStyle} />
                        {image.caption ? <figcaption style={imageCaption}>{image.caption}</figcaption> : null}
                      </figure>
                    ))}
                  </div>
                ) : (
                  <div style={noImage}>Şəkil əlavə olunmayıb.</div>
                )}
              </article>
            ))}
          </div>
        ) : (
          <div style={emptyBox}>
            <FiCheckCircle size={18} />
            Hələ iş qeydi yoxdur. Admin paneldən ilk işi əlavə et.
          </div>
        )}
      </section>
    </div>
  );
}

function SectionHead({ eyebrow, title, sub }) {
  return (
    <div style={{ display: 'grid', gap: 8, marginBottom: 18 }}>
      <div style={sectionEyebrow}>{eyebrow}</div>
      <h2 style={sectionTitle}>{title}</h2>
      <p style={sectionSub}>{sub}</p>
    </div>
  );
}

function Metric({ label, value, icon }) {
  return (
    <div style={metricCard}>
      <div style={metricIcon}>{icon}</div>
      <div>
        <div style={metricLabel}>{label}</div>
        <div style={metricValue}>{value}</div>
      </div>
    </div>
  );
}

const page = {
  maxWidth: '1280px',
  margin: '0 auto',
  padding: '28px 22px 56px',
};

const pageMobile = {
  ...page,
  padding: '16px 14px 40px',
};

const hero = {
  position: 'relative',
  overflow: 'hidden',
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1.2fr) minmax(320px, 0.8fr)',
  gap: 18,
  padding: '28px',
  borderRadius: theme.radius.lg,
  border: `1px solid ${theme.colors.border}`,
  background: 'linear-gradient(135deg, rgba(6, 11, 22, 0.94), rgba(15, 23, 42, 0.82))',
  boxShadow: theme.shadow,
  marginBottom: 26,
};

const heroMobile = {
  ...hero,
  gridTemplateColumns: '1fr',
  padding: '20px',
};

const heroGlow = {
  position: 'absolute',
  inset: '-20% auto auto -10%',
  width: 320,
  height: 320,
  borderRadius: '50%',
  background: 'radial-gradient(circle, rgba(20, 184, 166, 0.32), transparent 65%)',
  filter: 'blur(10px)',
};

const eyebrow = {
  letterSpacing: '0.24em',
  textTransform: 'uppercase',
  fontSize: 11,
  fontWeight: 800,
  color: theme.colors.amber,
};

const title = {
  margin: 0,
  fontSize: 'clamp(34px, 4vw, 62px)',
  lineHeight: 1.02,
  letterSpacing: '-0.04em',
  maxWidth: 'none',
};

const titleMobile = {
  ...title,
  maxWidth: 'none',
  fontSize: 'clamp(30px, 8vw, 44px)',
};

const sub = {
  margin: 0,
  maxWidth: 760,
  color: theme.colors.muted,
  fontSize: 16,
  lineHeight: 1.7,
};

const ctaRow = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 12,
};

const primaryButton = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 10,
  padding: '13px 18px',
  borderRadius: theme.radius.pill,
  background: `linear-gradient(135deg, ${theme.colors.primary}, ${theme.colors.primaryDark})`,
  color: '#fff',
  fontWeight: 800,
  textDecoration: 'none',
  boxShadow: '0 18px 36px rgba(20, 184, 166, 0.24)',
};

const secondaryButton = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 10,
  padding: '13px 18px',
  borderRadius: theme.radius.pill,
  color: theme.colors.text,
  textDecoration: 'none',
  border: `1px solid ${theme.colors.border}`,
  background: 'rgba(255,255,255,0.04)',
};

const metricRow = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: 12,
};

const metricRowMobile = {
  ...metricRow,
  gridTemplateColumns: '1fr',
};

const metricCard = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '14px 16px',
  borderRadius: theme.radius.md,
  background: 'rgba(255,255,255,0.05)',
  border: `1px solid ${theme.colors.border}`,
};

const metricIcon = {
  width: 42,
  height: 42,
  borderRadius: '14px',
  display: 'grid',
  placeItems: 'center',
  background: 'rgba(20, 184, 166, 0.15)',
  color: theme.colors.primary,
};

const metricLabel = {
  fontSize: 12,
  color: theme.colors.muted,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
};

const metricValue = {
  fontSize: 20,
  fontWeight: 800,
};

const heroPanel = {
  display: 'grid',
  gap: 12,
  alignContent: 'start',
};

const heroPanelHeader = {
  display: 'flex',
  gap: 10,
  flexWrap: 'wrap',
};

const heroPill = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 12px',
  borderRadius: theme.radius.pill,
  background: 'rgba(20, 184, 166, 0.15)',
  color: '#d6fffb',
  fontSize: 13,
  fontWeight: 700,
};

const heroPillMuted = {
  ...heroPill,
  background: 'rgba(245, 158, 11, 0.16)',
  color: '#fff3cd',
};

const heroCard = {
  padding: 18,
  borderRadius: theme.radius.lg,
  background: 'rgba(255,255,255,0.05)',
  border: `1px solid ${theme.colors.border}`,
};

const heroCardLabel = {
  fontSize: 12,
  color: theme.colors.muted,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
};

const heroCardValue = {
  marginTop: 8,
  fontSize: 34,
  fontWeight: 900,
};

const heroCardNote = {
  marginTop: 6,
  color: theme.colors.muted,
};

const section = {
  marginTop: 34,
};

const sectionEyebrow = {
  fontSize: 11,
  letterSpacing: '0.22em',
  textTransform: 'uppercase',
  fontWeight: 800,
  color: theme.colors.amber,
};

const sectionTitle = {
  margin: 0,
  fontSize: 'clamp(24px, 3vw, 34px)',
  lineHeight: 1.08,
};

const sectionSub = {
  margin: 0,
  color: theme.colors.muted,
  maxWidth: 760,
  lineHeight: 1.7,
};

const priceGrid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: 14,
};

const priceCard = {
  padding: 18,
  borderRadius: theme.radius.lg,
  background: theme.colors.surface,
  border: `1px solid ${theme.colors.border}`,
  boxShadow: theme.shadow,
};

const priceTop = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'start',
  gap: 12,
};

const priceCategory = {
  fontSize: 12,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: theme.colors.primary,
  fontWeight: 800,
};

const priceTitle = {
  margin: '6px 0 0',
  fontSize: 22,
};

const serviceStatus = {
  padding: '7px 10px',
  borderRadius: theme.radius.pill,
  background: 'rgba(34, 197, 94, 0.14)',
  color: '#bbf7d0',
  fontSize: 12,
  fontWeight: 700,
};

const priceRow = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '12px 0',
  borderBottom: `1px solid ${theme.colors.border}`,
  color: theme.colors.text,
};

const priceNote = {
  margin: '12px 0 0',
  color: theme.colors.muted,
  lineHeight: 1.6,
};

const jobGrid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))',
  gap: 16,
};

const jobCard = {
  padding: 18,
  borderRadius: theme.radius.lg,
  border: `1px solid ${theme.colors.border}`,
  background: 'rgba(255,255,255,0.05)',
  backdropFilter: 'blur(10px)',
};

const jobHead = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  alignItems: 'start',
};

const jobPlate = {
  fontSize: 22,
  fontWeight: 900,
  letterSpacing: '0.08em',
};

const jobMeta = {
  color: theme.colors.muted,
  marginTop: 4,
};

const jobTotal = {
  padding: '8px 12px',
  borderRadius: theme.radius.pill,
  background: 'rgba(245, 158, 11, 0.14)',
  color: '#fde68a',
  fontWeight: 800,
  whiteSpace: 'nowrap',
};

const jobDate = {
  marginTop: 8,
  color: theme.colors.muted,
  fontSize: 14,
};

const itemList = {
  display: 'grid',
  gap: 10,
  marginTop: 16,
};

const itemRow = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  padding: 12,
  borderRadius: theme.radius.md,
  background: 'rgba(255,255,255,0.04)',
  border: `1px solid ${theme.colors.border}`,
};

const itemSub = {
  marginTop: 4,
  color: theme.colors.muted,
  fontSize: 13,
};

const itemPrice = {
  fontWeight: 800,
  whiteSpace: 'nowrap',
};

const jobNote = {
  marginTop: 14,
  padding: 12,
  borderLeft: `3px solid ${theme.colors.primary}`,
  background: 'rgba(20, 184, 166, 0.08)',
  color: '#d9ffff',
  borderRadius: '0 12px 12px 0',
  lineHeight: 1.6,
};

const imageGrid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
  gap: 10,
  marginTop: 14,
};

const imageFigure = {
  margin: 0,
  overflow: 'hidden',
  borderRadius: theme.radius.md,
  background: '#020617',
  border: `1px solid ${theme.colors.border}`,
};

const imageStyle = {
  display: 'block',
  width: '100%',
  height: 120,
  objectFit: 'cover',
};

const imageCaption = {
  padding: '8px 10px',
  color: theme.colors.muted,
  fontSize: 12,
};

const noImage = {
  marginTop: 14,
  padding: 12,
  borderRadius: theme.radius.md,
  background: 'rgba(255,255,255,0.03)',
  color: theme.colors.muted,
  textAlign: 'center',
};

const notice = {
  padding: 14,
  borderRadius: theme.radius.md,
  background: 'rgba(59, 130, 246, 0.12)',
  border: '1px solid rgba(96, 165, 250, 0.22)',
  marginBottom: 16,
};

const errorBox = {
  ...notice,
  background: 'rgba(239, 68, 68, 0.12)',
  border: '1px solid rgba(248, 113, 113, 0.25)',
};

const emptyBox = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 10,
  padding: 16,
  borderRadius: theme.radius.md,
  background: 'rgba(255,255,255,0.05)',
  border: `1px solid ${theme.colors.border}`,
};

export default GlossGarageHome;
