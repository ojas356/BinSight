import axios from 'axios';

const API_BASE = 'http://127.0.0.1:5000/api';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
});

// ============ Reports ============
export const getReports = (params = {}) => api.get('/reports', { params });
export const getReport = (id) => api.get(`/reports/${id}`);
export const createReport = (formData) =>
  api.post('/reports', formData, {
    headers: formData instanceof FormData ? { 'Content-Type': 'multipart/form-data' } : {},
  });

// ============ Trucks ============
export const getTrucks = () => api.get('/trucks');
export const updateTruckLocation = (id, data) => api.post(`/trucks/${id}/location`, data);

// ============ Fixed Routes ============
export const getFixedRoutes = () => api.get('/fixed-routes');

// ============ Hotspots ============
export const getHotspots = () => api.get('/hotspots');
export const analyzeHotspots = () => api.post('/hotspots/analyze');

// ============ Gap Routes ============
export const getRoutes = () => api.get('/routes');
export const generateRoute = () => api.post('/routes/generate');
export const startCollection = (id) => api.post(`/routes/${id}/start`);
export const collectStop = (routeId, stopOrder) =>
  api.post(`/routes/${routeId}/collect-stop`, { stop_order: stopOrder });

// ============ Stats ============
export const getStats = () => api.get('/stats');

// ============ Sim Clock ============
export const getClock = () => api.get('/sim/clock');
export const setClock = (data) => api.post('/sim/clock', data);
export const simTick = () => api.post('/sim/tick');

// ============ Seed ============
export const resetSeed = () => api.post('/seed/reset');

// ============ Health ============
export const healthCheck = () => api.get('/health');

export default api;
