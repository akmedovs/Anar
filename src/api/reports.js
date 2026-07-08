async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.error || 'Server sorğusu uğursuz oldu.');
  }

  return data;
}

export const reportsApi = {
  list(filters = {}) {
    const params = new URLSearchParams();

    if (filters.il) params.set('il', filters.il);
    if (filters.ay && filters.ay !== 'Bütün Aylar') params.set('ay', filters.ay);

    const query = params.toString();
    return request(`/api/reports${query ? `?${query}` : ''}`);
  },
  upsert(report) {
    return request('/api/reports', {
      method: 'POST',
      body: JSON.stringify(report),
    });
  },
  remove({ il, ay, ev }) {
    const params = new URLSearchParams({ il, ay, ev });
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
