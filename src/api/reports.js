async function request(path, options = {}) {
  let response;

  try {
    response = await fetch(path, {
      headers: {
        'Content-Type': 'application/json',
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
};
