import { useEffect, useMemo, useState } from 'react';
import { FiPlus, FiSave, FiTrash2, FiRefreshCw } from 'react-icons/fi';
import { glossJobsApi, glossServicesApi } from '../../api/glossgarage';
import { formatDateAz, formatMoney, localDateKey } from '../../constants/reporting';
import { theme } from '../../constants/theme';
import { useIsMobile } from '../../hooks/useIsMobile';

function GlossGarageAdmin() {
  const isMobile = useIsMobile();
  const today = new Date();
  const [services, setServices] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [message, setMessage] = useState('');
  const [serviceDraft, setServiceDraft] = useState({
    title: '',
    category: 'Xidmət',
    sedanPrice: '',
    suvPrice: '',
    notes: '',
    sortOrder: '0',
  });
  const [jobDraft, setJobDraft] = useState({
    customerName: '',
    plate: '',
    vehicleType: 'sedan',
    serviceDate: localDateKey(today),
    note: '',
  });
  const [selectedItems, setSelectedItems] = useState([]);
  const [images, setImages] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const [serviceRows, jobRows] = await Promise.all([glossServicesApi.list(), glossJobsApi.list()]);
      setServices(serviceRows);
      setJobs(jobRows);
      setMessage('');
    } catch (error) {
      setMessage(error.message);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const activeServices = useMemo(() => services.filter((service) => service.active), [services]);

  const toggleService = (service) => {
    setSelectedItems((prev) => {
      const exists = prev.some((item) => item.serviceSlug === service.slug);
      if (exists) {
        return prev.filter((item) => item.serviceSlug !== service.slug);
      }

      return [
        ...prev,
        {
          serviceId: service.id,
          serviceSlug: service.slug,
          serviceTitle: service.title,
          category: service.category,
          sedanPrice: service.sedanPrice,
          suvPrice: service.suvPrice,
          quantity: 1,
          note: '',
        },
      ];
    });
  };

  const updateItem = (slug, key, value) => {
    setSelectedItems((prev) => prev.map((item) => (item.serviceSlug === slug ? { ...item, [key]: value } : item)));
  };

  const updateServiceField = (id, key, value) => {
    setServices((prev) => prev.map((service) => (service.id === id ? { ...service, [key]: value } : service)));
  };

  const removeItem = (slug) => {
    setSelectedItems((prev) => prev.filter((item) => item.serviceSlug !== slug));
  };

  const handleServiceDraftChange = (e) => {
    const { name, value } = e.target;
    setServiceDraft((prev) => ({ ...prev, [name]: value }));
  };

  const handleJobDraftChange = (e) => {
    const { name, value } = e.target;
    setJobDraft((prev) => ({ ...prev, [name]: value }));
  };

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const dataUrls = await Promise.all(files.map(fileToDataUrl));
    setImages((prev) => [...prev, ...dataUrls.map((dataUrl) => ({ dataUrl }))]);
    e.target.value = '';
  };

  const saveService = async (e) => {
    e.preventDefault();
    if (!String(serviceDraft.title).trim()) {
      alert('Xidmət adı yazılmalıdır.');
      return;
    }

    setBusy(true);
    try {
      await glossServicesApi.create({
        title: serviceDraft.title,
        category: serviceDraft.category,
        sedanPrice: Number(serviceDraft.sedanPrice) || 0,
        suvPrice: Number(serviceDraft.suvPrice) || 0,
        notes: serviceDraft.notes,
        sortOrder: Number(serviceDraft.sortOrder) || 0,
      });
      setServiceDraft({
        title: '',
        category: 'Xidmət',
        sedanPrice: '',
        suvPrice: '',
        notes: '',
        sortOrder: '0',
      });
      await load();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  const saveServiceRow = async (service) => {
    setBusy(true);
    try {
      await glossServicesApi.update(service);
      await load();
      setMessage('Qiymət saxlanıldı.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  const saveJob = async (e) => {
    e.preventDefault();

    if (!String(jobDraft.plate).trim() || selectedItems.length === 0) {
      alert('Nömrə və ən az bir xidmət seçilməlidir.');
      return;
    }

    setBusy(true);
    try {
      await glossJobsApi.create({
        customerName: jobDraft.customerName,
        plate: jobDraft.plate,
        vehicleType: jobDraft.vehicleType,
        serviceDate: jobDraft.serviceDate,
        note: jobDraft.note,
        items: selectedItems,
        images,
      });

      setJobDraft({
        customerName: '',
        plate: '',
        vehicleType: 'sedan',
        serviceDate: localDateKey(new Date()),
        note: '',
      });
      setSelectedItems([]);
      setImages([]);
      await load();
      setMessage('İş saxlanıldı.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  const deleteService = async (id) => {
    if (!confirm('Bu xidməti silmək istəyirsən?')) return;
    setBusy(true);
    try {
      await glossServicesApi.remove(id);
      await load();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  const deleteJob = async (id) => {
    if (!confirm('Bu işi silmək istəyirsən?')) return;
    setBusy(true);
    try {
      await glossJobsApi.remove(id);
      await load();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  const totalPreview = selectedItems.reduce((sum, item) => {
    const unit = jobDraft.vehicleType === 'suv' ? Number(item.suvPrice || 0) : Number(item.sedanPrice || 0);
    return sum + unit * Number(item.quantity || 1);
  }, 0);

  return (
    <div style={isMobile ? wrapMobile : wrap}>
      <section style={isMobile ? heroMobile : hero}>
        <div>
          <div style={eyebrow}>GLOSS GARAGE ADMIN</div>
          <h1 style={title}>Qiymətləri, xidmətləri və iş qeydlərini buradan idarə et</h1>
          <p style={sub}>Sedan və cip qiymətlərini dəyiş, yeni xidmət əlavə et, hər işi şəkillərlə saxla.</p>
        </div>
        <button type="button" onClick={load} style={reloadButton}>
          <FiRefreshCw /> Yenilə
        </button>
      </section>

      {message ? <div style={messageBox}>{message}</div> : null}

      <section style={isMobile ? gridMobile : grid}>
        <article style={panel}>
          <SectionHead title="Xidmət əlavə et" sub="Nano yuma, polirovka, ximcistka və başqa xidmətləri buradan yaz." />
          <form onSubmit={saveService} style={{ display: 'grid', gap: 12 }}>
            <Field label="Xidmət adı">
              <input name="title" value={serviceDraft.title} onChange={handleServiceDraftChange} style={input} placeholder="Nano yuma" />
            </Field>
            <div style={twoCol}>
              <Field label="Kateqoriya">
                <input name="category" value={serviceDraft.category} onChange={handleServiceDraftChange} style={input} placeholder="Xarici" />
              </Field>
              <Field label="Sıra">
                <input name="sortOrder" type="number" value={serviceDraft.sortOrder} onChange={handleServiceDraftChange} style={input} />
              </Field>
            </div>
            <div style={twoCol}>
              <Field label="Sedan qiyməti">
                <input name="sedanPrice" type="number" step="0.01" value={serviceDraft.sedanPrice} onChange={handleServiceDraftChange} style={input} />
              </Field>
              <Field label="Cip qiyməti">
                <input name="suvPrice" type="number" step="0.01" value={serviceDraft.suvPrice} onChange={handleServiceDraftChange} style={input} />
              </Field>
            </div>
            <Field label="Qeyd">
              <textarea name="notes" value={serviceDraft.notes} onChange={handleServiceDraftChange} style={{ ...input, minHeight: 88 }} />
            </Field>
            <button type="submit" disabled={busy} style={actionButton}>
              <FiPlus /> Əlavə et
            </button>
          </form>

          <div style={{ marginTop: 18, display: 'grid', gap: 10 }}>
            {services.map((service) => (
              <div key={service.id} style={serviceRow}>
                <div style={serviceRowFields}>
                  <input value={service.title} onChange={(e) => updateServiceField(service.id, 'title', e.target.value)} style={input} />
                  <input value={service.category} onChange={(e) => updateServiceField(service.id, 'category', e.target.value)} style={input} />
                  <input value={service.sedanPrice} onChange={(e) => updateServiceField(service.id, 'sedanPrice', e.target.value)} style={input} />
                  <input value={service.suvPrice} onChange={(e) => updateServiceField(service.id, 'suvPrice', e.target.value)} style={input} />
                  <textarea value={service.notes || ''} onChange={(e) => updateServiceField(service.id, 'notes', e.target.value)} style={{ ...input, minHeight: 72 }} />
                </div>
                <div style={serviceMetaColumn}>
                  <div style={servicePriceWrap}>
                    <span>{formatMoney(service.sedanPrice)} / sedan</span>
                    <span>{formatMoney(service.suvPrice)} / cip</span>
                  </div>
                  <button type="button" onClick={() => saveServiceRow(service)} style={actionButton}>
                    <FiSave /> Saxla
                  </button>
                  <button type="button" onClick={() => deleteService(service.id)} style={iconButton}>
                    <FiTrash2 />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article style={panel}>
          <SectionHead title="Yeni iş yaz" sub="Müştəri, maşın, xidmətlər və şəkillər." />
          <form onSubmit={saveJob} style={{ display: 'grid', gap: 12 }}>
            <div style={twoCol}>
              <Field label="Müştəri">
                <input name="customerName" value={jobDraft.customerName} onChange={handleJobDraftChange} style={input} placeholder="Ad və soyad" />
              </Field>
              <Field label="Nömrə">
                <input name="plate" value={jobDraft.plate} onChange={handleJobDraftChange} style={input} placeholder="90-AA-111" />
              </Field>
            </div>
            <div style={twoCol}>
              <Field label="Maşın tipi">
                <select name="vehicleType" value={jobDraft.vehicleType} onChange={handleJobDraftChange} style={input}>
                  <option value="sedan">Sedan</option>
                  <option value="suv">Cip</option>
                </select>
              </Field>
              <Field label="Tarix">
                <input name="serviceDate" type="date" value={jobDraft.serviceDate} onChange={handleJobDraftChange} style={input} />
              </Field>
            </div>
            <Field label="Qeyd">
              <textarea name="note" value={jobDraft.note} onChange={handleJobDraftChange} style={{ ...input, minHeight: 88 }} />
            </Field>

            <div>
              <div style={label}>Xidmətlər</div>
              <div style={servicePickGrid}>
                {activeServices.map((service) => {
                  const selected = selectedItems.some((item) => item.serviceSlug === service.slug);
                  return (
                    <button
                      key={service.id}
                      type="button"
                      onClick={() => toggleService(service)}
                      style={selected ? selectedServiceCard : serviceCard}
                    >
                      <strong>{service.title}</strong>
                      <span>{formatMoney(jobDraft.vehicleType === 'suv' ? service.suvPrice : service.sedanPrice)}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {selectedItems.length ? (
              <div style={selectedList}>
                {selectedItems.map((item) => (
                  <div key={item.serviceSlug} style={selectedRow}>
                    <div style={{ minWidth: 0 }}>
                      <strong>{item.serviceTitle}</strong>
                      <div style={muted}>{item.category}</div>
                    </div>
                    <div style={selectedControls}>
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => updateItem(item.serviceSlug, 'quantity', Number(e.target.value) || 1)}
                        style={smallInput}
                      />
                      <input
                        type="text"
                        value={item.note}
                        onChange={(e) => updateItem(item.serviceSlug, 'note', e.target.value)}
                        placeholder="Qeyd"
                        style={smallInput}
                      />
                      <button type="button" onClick={() => removeItem(item.serviceSlug)} style={iconButton}>
                        <FiTrash2 />
                      </button>
                    </div>
                  </div>
                ))}
                <div style={totalBox}>Cəmi: {formatMoney(totalPreview)}</div>
              </div>
            ) : null}

            <Field label="Şəkillər">
              <input type="file" multiple accept="image/*" onChange={handleFiles} style={input} />
            </Field>

            {images.length ? (
              <div style={imageGrid}>
                {images.map((image, index) => (
                  <div key={`${index}-${image.dataUrl.slice(0, 16)}`} style={previewCard}>
                    <img src={image.dataUrl} alt={`preview-${index}`} style={previewImage} />
                    <button type="button" onClick={() => setImages((prev) => prev.filter((_, i) => i !== index))} style={removePreviewButton}>
                      Sil
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            <button type="submit" disabled={busy} style={actionButton}>
              <FiSave /> İşi saxla
            </button>
          </form>
        </article>
      </section>

      <section style={{ marginTop: 24 }}>
        <SectionHead title="Son işlər" sub="Buradan rekord və şəkilləri bir yerdə görürsən." />
        <div style={jobList}>
          {jobs.map((job) => (
            <article key={job.id} style={jobItem}>
              <div style={jobTop}>
                <div>
                  <div style={jobPlate}>{job.plate}</div>
                  <div style={muted}>
                    {job.customerName || 'Müştəri yoxdur'} · {formatDateAz(job.serviceDate)}
                  </div>
                </div>
                <div style={jobTotal}>{formatMoney(job.total)}</div>
              </div>

              <div style={jobItemList}>
                {job.items.map((item, index) => (
                  <div key={`${job.id}-${index}`} style={jobLine}>
                    <div>
                      <strong>{item.serviceTitle}</strong>
                      <div style={muted}>
                        {item.quantity} ədəd · {item.category || 'Xidmət'}
                      </div>
                    </div>
                    <div>{formatMoney(item.lineTotal)}</div>
                  </div>
                ))}
              </div>

              {job.images?.length ? (
                <div style={jobPreviewGrid}>
                  {job.images.map((image, index) => (
                    <img key={`${job.id}-img-${index}`} src={image.url} alt={image.caption || job.plate} style={jobPreviewImage} />
                  ))}
                </div>
              ) : (
                <div style={emptyNote}>Şəkil yoxdur.</div>
              )}

              {job.note ? <div style={jobNote}>{job.note}</div> : null}
              <button type="button" onClick={() => deleteJob(job.id)} style={dangerButton}>
                <FiTrash2 /> Sil
              </button>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function SectionHead({ title, sub }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <h2 style={{ margin: 0, fontSize: 24 }}>{title}</h2>
      <p style={{ margin: '6px 0 0', color: theme.colors.muted, lineHeight: 1.6 }}>{sub}</p>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'grid', gap: 8 }}>
      <span style={labelStyle}>{label}</span>
      {children}
    </label>
  );
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Şəkil oxunmadı.'));
    reader.readAsDataURL(file);
  });
}

const wrap = {
  maxWidth: 1280,
  margin: '0 auto',
  padding: '28px 22px 56px',
};

const wrapMobile = {
  ...wrap,
  padding: '16px 14px 40px',
};

const hero = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 18,
  alignItems: 'end',
  marginBottom: 24,
  padding: 24,
  borderRadius: theme.radius.lg,
  border: `1px solid ${theme.colors.border}`,
  background: 'linear-gradient(135deg, rgba(6,11,22,0.96), rgba(15,23,42,0.82))',
};

const heroMobile = {
  ...hero,
  flexDirection: 'column',
  alignItems: 'start',
};

const eyebrow = {
  fontSize: 11,
  letterSpacing: '0.24em',
  textTransform: 'uppercase',
  color: theme.colors.amber,
  fontWeight: 800,
};

const title = {
  margin: '8px 0 0',
  fontSize: 'clamp(28px, 4vw, 46px)',
  lineHeight: 1.05,
};

const sub = {
  margin: '10px 0 0',
  color: theme.colors.muted,
  maxWidth: 760,
  lineHeight: 1.7,
};

const reloadButton = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 10,
  border: `1px solid ${theme.colors.border}`,
  background: 'rgba(255,255,255,0.04)',
  color: theme.colors.text,
  padding: '12px 16px',
  borderRadius: theme.radius.pill,
};

const messageBox = {
  padding: 14,
  borderRadius: theme.radius.md,
  background: 'rgba(20, 184, 166, 0.12)',
  border: '1px solid rgba(20, 184, 166, 0.22)',
  marginBottom: 16,
};

const grid = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 16,
};

const gridMobile = {
  ...grid,
  gridTemplateColumns: '1fr',
};

const panel = {
  padding: 18,
  borderRadius: theme.radius.lg,
  background: theme.colors.surface,
  border: `1px solid ${theme.colors.border}`,
  boxShadow: theme.shadow,
};

const twoCol = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 12,
};

const labelStyle = {
  fontSize: 12,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: theme.colors.muted,
  fontWeight: 700,
};

const input = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: theme.radius.md,
  border: `1px solid ${theme.colors.border}`,
  background: 'rgba(255,255,255,0.04)',
  color: theme.colors.text,
  outline: 'none',
};

const actionButton = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
  padding: '12px 16px',
  borderRadius: theme.radius.pill,
  border: 'none',
  background: `linear-gradient(135deg, ${theme.colors.primary}, ${theme.colors.primaryDark})`,
  color: '#fff',
  fontWeight: 800,
};

const serviceRow = {
  display: 'grid',
  gridTemplateColumns: '1fr auto',
  gap: 12,
  alignItems: 'center',
  padding: 12,
  borderRadius: theme.radius.md,
  background: 'rgba(255,255,255,0.04)',
  border: `1px solid ${theme.colors.border}`,
};

const serviceRowFields = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
  gap: 10,
};

const serviceMetaColumn = {
  display: 'grid',
  gap: 10,
  justifyItems: 'end',
};

const muted = {
  color: theme.colors.muted,
  fontSize: 13,
};

const servicePriceWrap = {
  display: 'grid',
  gap: 4,
  textAlign: 'right',
  color: theme.colors.text,
  fontSize: 13,
};

const iconButton = {
  width: 38,
  height: 38,
  borderRadius: '50%',
  border: `1px solid ${theme.colors.border}`,
  background: 'rgba(255,255,255,0.03)',
  color: theme.colors.text,
  display: 'grid',
  placeItems: 'center',
};

const label = {
  fontSize: 12,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: theme.colors.muted,
  fontWeight: 700,
};

const servicePickGrid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: 10,
};

const serviceCard = {
  padding: 12,
  borderRadius: theme.radius.md,
  border: `1px solid ${theme.colors.border}`,
  background: 'rgba(255,255,255,0.04)',
  color: theme.colors.text,
  display: 'grid',
  gap: 8,
  textAlign: 'left',
};

const selectedServiceCard = {
  ...serviceCard,
  background: 'rgba(20, 184, 166, 0.12)',
  border: '1px solid rgba(20, 184, 166, 0.24)',
};

const selectedList = {
  display: 'grid',
  gap: 10,
};

const selectedRow = {
  display: 'grid',
  gridTemplateColumns: '1fr auto',
  gap: 12,
  padding: 12,
  borderRadius: theme.radius.md,
  background: 'rgba(255,255,255,0.04)',
  border: `1px solid ${theme.colors.border}`,
};

const selectedControls = {
  display: 'flex',
  gap: 8,
  alignItems: 'center',
  flexWrap: 'wrap',
};

const smallInput = {
  width: 120,
  padding: '10px 12px',
  borderRadius: theme.radius.md,
  border: `1px solid ${theme.colors.border}`,
  background: 'rgba(255,255,255,0.04)',
  color: theme.colors.text,
};

const totalBox = {
  padding: 12,
  borderRadius: theme.radius.md,
  background: 'rgba(245, 158, 11, 0.12)',
  border: '1px solid rgba(245, 158, 11, 0.22)',
  fontWeight: 800,
};

const imageGrid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
  gap: 10,
};

const previewCard = {
  position: 'relative',
  borderRadius: theme.radius.md,
  overflow: 'hidden',
  border: `1px solid ${theme.colors.border}`,
};

const previewImage = {
  width: '100%',
  height: 120,
  objectFit: 'cover',
  display: 'block',
};

const removePreviewButton = {
  position: 'absolute',
  top: 8,
  right: 8,
  border: 'none',
  borderRadius: theme.radius.pill,
  padding: '6px 10px',
  background: 'rgba(15,23,42,0.82)',
  color: '#fff',
};

const jobList = {
  display: 'grid',
  gap: 14,
};

const jobItem = {
  padding: 18,
  borderRadius: theme.radius.lg,
  background: theme.colors.surface,
  border: `1px solid ${theme.colors.border}`,
  boxShadow: theme.shadow,
};

const jobTop = {
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

const jobTotal = {
  padding: '8px 12px',
  borderRadius: theme.radius.pill,
  background: 'rgba(245, 158, 11, 0.14)',
  color: '#fde68a',
  fontWeight: 800,
};

const jobItemList = {
  display: 'grid',
  gap: 8,
  marginTop: 14,
};

const jobLine = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  padding: 12,
  borderRadius: theme.radius.md,
  background: 'rgba(255,255,255,0.04)',
  border: `1px solid ${theme.colors.border}`,
};

const jobPreviewGrid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
  gap: 10,
  marginTop: 14,
};

const jobPreviewImage = {
  width: '100%',
  height: 140,
  objectFit: 'cover',
  borderRadius: theme.radius.md,
  border: `1px solid ${theme.colors.border}`,
};

const emptyNote = {
  marginTop: 14,
  color: theme.colors.muted,
};

const jobNote = {
  marginTop: 14,
  padding: 12,
  borderRadius: theme.radius.md,
  background: 'rgba(20, 184, 166, 0.08)',
  border: '1px solid rgba(20, 184, 166, 0.14)',
  lineHeight: 1.6,
};

const dangerButton = {
  marginTop: 14,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 14px',
  borderRadius: theme.radius.pill,
  border: '1px solid rgba(248, 113, 113, 0.24)',
  background: 'rgba(248, 113, 113, 0.12)',
  color: '#fecaca',
  fontWeight: 700,
};

export default GlossGarageAdmin;
