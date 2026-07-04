// API helper module
const API_BASE = '/api';

const api = {
  token: localStorage.getItem('hms_token'),
  user: JSON.parse(localStorage.getItem('hms_user') || 'null'),

  async request(path, options = {}) {
    const url = `${API_BASE}${path}`;
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    const res = await fetch(url, { ...options, headers });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
    return data;
  },

  // Auth
  login: (email, password) => api.request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  register: (fullName, email, password, role) => api.request('/auth/register', { method: 'POST', body: JSON.stringify({ fullName, email, password, role }) }),
  me: () => api.request('/auth/me'),

  // Departments
  getDepartments: () => api.request('/departments'),
  getDepartment: (id) => api.request(`/departments/${id}`),
  createDepartment: (data) => api.request('/departments', { method: 'POST', body: JSON.stringify(data) }),
  updateDepartment: (id, data) => api.request(`/departments/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteDepartment: (id) => api.request(`/departments/${id}`, { method: 'DELETE' }),

  // Doctors
  getDoctors: (params = '') => api.request(`/doctors${params ? '?' + params : ''}`),
  getDoctor: (id) => api.request(`/doctors/${id}`),
  createDoctor: (data) => api.request('/doctors', { method: 'POST', body: JSON.stringify(data) }),
  updateDoctor: (id, data) => api.request(`/doctors/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteDoctor: (id) => api.request(`/doctors/${id}`, { method: 'DELETE' }),

  // Patients
  getPatients: (params = '') => api.request(`/patients${params ? '?' + params : ''}`),
  getPatient: (id) => api.request(`/patients/${id}`),
  createPatient: (data) => api.request('/patients', { method: 'POST', body: JSON.stringify(data) }),
  updatePatient: (id, data) => api.request(`/patients/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deletePatient: (id) => api.request(`/patients/${id}`, { method: 'DELETE' }),

  // Appointments
  getAppointments: (params = '') => api.request(`/appointments${params ? '?' + params : ''}`),
  getAppointment: (id) => api.request(`/appointments/${id}`),
  createAppointment: (data) => api.request('/appointments', { method: 'POST', body: JSON.stringify(data) }),
  updateAppointment: (id, data) => api.request(`/appointments/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  updateAppointmentStatus: (id, status) => api.request(`/appointments/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  deleteAppointment: (id) => api.request(`/appointments/${id}`, { method: 'DELETE' }),

  // Medical Records
  getMedicalRecords: (params = '') => api.request(`/medical-records${params ? '?' + params : ''}`),
  getMedicalRecord: (id) => api.request(`/medical-records/${id}`),
  createMedicalRecord: (data) => api.request('/medical-records', { method: 'POST', body: JSON.stringify(data) }),
  updateMedicalRecord: (id, data) => api.request(`/medical-records/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteMedicalRecord: (id) => api.request(`/medical-records/${id}`, { method: 'DELETE' }),

  // Invoices
  getInvoices: (params = '') => api.request(`/invoices${params ? '?' + params : ''}`),
  getInvoice: (id) => api.request(`/invoices/${id}`),
  createInvoice: (data) => api.request('/invoices', { method: 'POST', body: JSON.stringify(data) }),
  updateInvoice: (id, data) => api.request(`/invoices/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  updateInvoiceStatus: (id, status) => api.request(`/invoices/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  deleteInvoice: (id) => api.request(`/invoices/${id}`, { method: 'DELETE' }),

  // Dashboard
  getStats: () => api.request('/dashboard/stats'),
  getAppointmentsByStatus: () => api.request('/dashboard/appointments-by-status'),
  getAppointmentsByDepartment: () => api.request('/dashboard/appointments-by-department'),
  getRevenueByMonth: () => api.request('/dashboard/revenue-by-month'),
  getPatientsByGender: () => api.request('/dashboard/patients-by-gender'),
  getRecentAppointments: () => api.request('/dashboard/recent-appointments'),

  // Auth helpers
  setAuth(token, user) { this.token = token; this.user = user; localStorage.setItem('hms_token', token); localStorage.setItem('hms_user', JSON.stringify(user)); },
  clearAuth() { this.token = null; this.user = null; localStorage.removeItem('hms_token'); localStorage.removeItem('hms_user'); },
  isAuthenticated() { return !!this.token; },
};
