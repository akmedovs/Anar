async function request(path, options = {}) {
  let response;
  const token = typeof window !== 'undefined' ? localStorage.getItem('akmedovs-token') : '';

  try {
    response = await fetch(path, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
      ...options,
    });
  } catch {
    throw new Error('Backend baglantisi yoxdur. API server ve PostgreSQL islediyine emin olun.');
  }

  const raw = await response.text().catch(() => '');
  const data = raw ? parseJson(raw) : null;

  if (!response.ok) {
    throw new Error(data?.error || raw || `Server sorgusu ugursuz oldu. HTTP ${response.status}`);
  }

  return data;
}

export const authApi = {
  login(credentials) {
    return request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
  },
  me() {
    return request('/api/auth/me');
  },
  requestPasswordReset(payload) {
    return request('/api/auth/request-password-reset', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  resetPassword(payload) {
    return request('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  listUsers() {
    return request('/api/auth/users');
  },
  createUser(payload) {
    return request('/api/auth/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  updateUser(id, payload) {
    return request(`/api/auth/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },
  resetUserPassword(id, payload) {
    return request(`/api/auth/users/${id}/password`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};

export const settingsApi = {
  getMailSettings() {
    return request('/api/settings/mail');
  },
  updateMailSettings(payload) {
    return request('/api/settings/mail', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },
};

function parseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export const reportsApi = {
  list(filters = {}) {
    const params = new URLSearchParams();

    if (filters.il) params.set('il', filters.il);
    if (filters.ay && filters.ay !== 'Bütün Aylar') params.set('ay', filters.ay);

    const query = params.toString();
    return request(`/api/reports${query ? `?${query}` : ''}`);
  },
  create(report) {
    return request('/api/reports', {
      method: 'POST',
      body: JSON.stringify(report),
    });
  },
  update({ id, ...report }) {
    const params = new URLSearchParams({ id });
    return request(`/api/reports?${params.toString()}`, {
      method: 'PUT',
      body: JSON.stringify(report),
    });
  },
  remove({ id, il, ay, ev }) {
    const params = id ? new URLSearchParams({ id }) : new URLSearchParams({ il, ay, ev });
    return request(`/api/reports?${params.toString()}`, {
      method: 'DELETE',
    });
  },
};

export const vehicleEventsApi = {
  list() {
    return request('/api/vehicle-events');
  },
  create(event) {
    return request('/api/vehicle-events', {
      method: 'POST',
      body: JSON.stringify(event),
    });
  },
  update({ id, ...event }) {
    const params = new URLSearchParams({ id });
    return request(`/api/vehicle-events?${params.toString()}`, {
      method: 'PUT',
      body: JSON.stringify(event),
    });
  },
  remove({ id }) {
    const params = new URLSearchParams({ id });
    return request(`/api/vehicle-events?${params.toString()}`, {
      method: 'DELETE',
    });
  },
};

export const vehicleVisionApi = {
  recognize(payload) {
    return request('/api/vehicle-events/recognize', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};

export const recognitionJobsApi = {
  get(jobId) {
    return request(`/api/recognition-jobs/${jobId}`);
  },
  confirm(jobId, payload) {
    return request(`/api/recognition-jobs/${jobId}/confirm`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};

export const washExpensesApi = {
  list(filters = {}) {
    const params = new URLSearchParams();

    if (filters.il) params.set('il', filters.il);
    if (filters.ay && filters.ay !== 'Bütün Aylar') params.set('ay', filters.ay);

    const query = params.toString();
    return request(`/api/wash-expenses${query ? `?${query}` : ''}`);
  },
  create(expense) {
    return request('/api/wash-expenses', {
      method: 'POST',
      body: JSON.stringify(expense),
    });
  },
  update({ id, ...expense }) {
    const params = new URLSearchParams({ id });
    return request(`/api/wash-expenses?${params.toString()}`, {
      method: 'PUT',
      body: JSON.stringify(expense),
    });
  },
  remove({ id }) {
    const params = new URLSearchParams({ id });
    return request(`/api/wash-expenses?${params.toString()}`, {
      method: 'DELETE',
    });
  },
};

export const washWaterApi = {
  list(filters = {}) {
    const params = new URLSearchParams();

    if (filters.il) params.set('il', filters.il);
    if (filters.ay && filters.ay !== 'Bütün Aylar') params.set('ay', filters.ay);

    const query = params.toString();
    return request(`/api/wash-water-readings${query ? `?${query}` : ''}`);
  },
  create(reading) {
    return request('/api/wash-water-readings', {
      method: 'POST',
      body: JSON.stringify(reading),
    });
  },
  update({ id, ...reading }) {
    const params = new URLSearchParams({ id });
    return request(`/api/wash-water-readings?${params.toString()}`, {
      method: 'PUT',
      body: JSON.stringify(reading),
    });
  },
  remove({ id, il, ay }) {
    const params = id ? new URLSearchParams({ id }) : new URLSearchParams({ il, ay });
    return request(`/api/wash-water-readings?${params.toString()}`, {
      method: 'DELETE',
    });
  },
};
