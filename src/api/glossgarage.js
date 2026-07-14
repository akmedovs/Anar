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
    throw new Error('Server baglantisi yoxdur.');
  }

  const raw = await response.text().catch(() => '');
  const data = raw ? parseJson(raw) : null;

  if (!response.ok) {
    throw new Error(data?.error || raw || `Sorğu uğursuz oldu. HTTP ${response.status}`);
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

export const glossServicesApi = {
  list() {
    return request('/api/gloss/services');
  },
  create(payload) {
    return request('/api/gloss/services', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  update({ id, ...payload }) {
    return request(`/api/gloss/services?id=${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },
  remove(id) {
    return request(`/api/gloss/services?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },
};

export const glossJobsApi = {
  list() {
    return request('/api/gloss/jobs');
  },
  create(payload) {
    return request('/api/gloss/jobs', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  update({ id, ...payload }) {
    return request(`/api/gloss/jobs?id=${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },
  remove(id) {
    return request(`/api/gloss/jobs?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },
};
