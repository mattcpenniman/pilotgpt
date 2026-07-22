import { demoAirports } from './demoData';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

const airportCodes = (airport) => [airport.ident, airport.gps_code, airport.icao_code, airport.iata_code, airport.local_code].filter(Boolean);
const demoAirport = (code) => demoAirports.find((airport) => airportCodes(airport).some((candidate) => candidate.toUpperCase() === code.trim().toUpperCase()));
const searchDemoAirports = (query, limit) => {
  const normalized = query.trim().toLowerCase();
  return demoAirports.filter((airport) => [airport.name, airport.municipality, ...airportCodes(airport)].filter(Boolean).some((value) => value.toLowerCase().includes(normalized))).slice(0, limit);
};
const demoAirportDistance = (origin, destination) => {
  const from = demoAirport(origin);
  const to = demoAirport(destination);
  if (!from || !to || from.ident === to.ident) return null;
  const radians = (degrees) => degrees * Math.PI / 180;
  const latitudeDelta = radians(to.latitude_deg - from.latitude_deg);
  const longitudeDelta = radians(to.longitude_deg - from.longitude_deg);
  const a = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(radians(from.latitude_deg)) * Math.cos(radians(to.latitude_deg)) * Math.sin(longitudeDelta / 2) ** 2;
  return { origin:from, destination:to, distance_nm:Math.round(3440.065 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10 };
};

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
    const error = new Error(message);
    error.status = response.status;
    throw error;
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
  airports: (query, limit = 8) => request(`/airports?${new URLSearchParams({ query, limit })}`).catch((error) => error.status ? Promise.reject(error) : searchDemoAirports(query, limit)),
  airport: (code) => request(`/airports/${encodeURIComponent(code)}`).catch((error) => error.status ? Promise.reject(error) : demoAirport(code) || Promise.reject(error)),
  airportDistance: (origin, destination) => request(`/airports/distance?${new URLSearchParams({ origin, destination })}`).catch((error) => error.status ? Promise.reject(error) : demoAirportDistance(origin, destination) || Promise.reject(error)),
  create: (resource, payload) => request(`/${resource}`, { method: 'POST', body: JSON.stringify(payload) }),
  update: (resource, id, payload) => request(`/${resource}/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  remove: (resource, id) => request(`/${resource}/${id}`, { method: 'DELETE' }),
  approveTrip: (id, payload) => request(`/trips/${id}/approve`, { method: 'POST', body: JSON.stringify(payload) }),
  rejectTrip: (id, reason) => request(`/trips/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }),
  cancelTrip: (id) => request(`/trips/${id}/cancel`, { method: 'POST' }),
  flightStatus: (id, status) => request(`/flights/${id}/status`, { method: 'POST', body: JSON.stringify({ status, occurred_at: new Date().toISOString() }) }),
};
