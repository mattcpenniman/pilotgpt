const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

export async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      message = typeof body.detail === 'string'
        ? body.detail
        : body.detail?.map?.((item) => item.msg).join(', ') || message;
    } catch { /* use status message */ }
    throw new Error(message);
  }
  return response.status === 204 ? null : response.json();
}

export const api = {
  dashboard: () => request('/dashboard'),
  pilots: () => request('/pilots'),
  aircraft: () => request('/aircraft'),
  trips: () => request('/trips'),
  flights: () => request('/flights'),
  fuelLogs: () => request('/fuel-logs'),
  create: (resource, payload) => request(`/${resource}`, { method: 'POST', body: JSON.stringify(payload) }),
  update: (resource, id, payload) => request(`/${resource}/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  remove: (resource, id) => request(`/${resource}/${id}`, { method: 'DELETE' }),
  approveTrip: (id, payload) => request(`/trips/${id}/approve`, { method: 'POST', body: JSON.stringify(payload) }),
  rejectTrip: (id, reason) => request(`/trips/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }),
  cancelTrip: (id) => request(`/trips/${id}/cancel`, { method: 'POST' }),
  flightStatus: (id, status) => request(`/flights/${id}/status`, { method: 'POST', body: JSON.stringify({ status, occurred_at: new Date().toISOString() }) }),
};
