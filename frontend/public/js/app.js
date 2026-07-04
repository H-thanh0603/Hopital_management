// Main SPA controller
const app = {
  currentView: 'dashboard',

  navItems: [
    { id: 'dashboard', label: 'Dashboard', icon: 'speedometer2' },
    { id: 'patients', label: 'Patients', icon: 'people' },
    { id: 'doctors', label: 'Doctors', icon: 'person-badge' },
    { id: 'departments', label: 'Departments', icon: 'diagram-3' },
    { id: 'appointments', label: 'Appointments', icon: 'calendar-check' },
    { id: 'records', label: 'Medical Records', icon: 'file-medical' },
    { id: 'invoices', label: 'Billing', icon: 'receipt' },
  ],

  init() {
    if (!api.isAuthenticated()) {
      auth.renderLogin();
    } else {
      this.render();
    }
  },

  render() {
    const user = api.user || {};
    document.getElementById('app').innerHTML = `
      <nav class="sidebar" id="sidebar">
        <div class="brand"><i class="bi bi-hospital"></i> Hospital MS</div>
        <ul class="nav flex-column mt-2">
          ${this.navItems.map(n => `
            <li class="nav-item">
              <a class="nav-link ${n.id === this.currentView ? 'active' : ''}" href="#" data-view="${n.id}">
                <i class="bi bi-${n.icon}"></i> ${n.label}
              </a>
            </li>`).join('')}
        </ul>
      </nav>
      <div class="main-content">
        <div class="topbar">
          <div class="d-flex align-items-center gap-2">
            <button class="btn btn-sm btn-light d-md-none" id="menuToggle"><i class="bi bi-list"></i></button>
            <h1 id="viewTitle">Dashboard</h1>
          </div>
          <div class="user-info">
            <span class="text-muted"><i class="bi bi-person-circle"></i> ${user.fullName || user.email || 'User'}</span>
            <span class="badge bg-secondary">${user.role || ''}</span>
            <button class="btn btn-sm btn-outline-danger" id="logoutBtn"><i class="bi bi-box-arrow-right"></i></button>
          </div>
        </div>
        <div id="viewContent"></div>
      </div>`;

    document.querySelectorAll('[data-view]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        this.currentView = el.dataset.view;
        this.render();
      });
    });
    document.getElementById('logoutBtn').addEventListener('click', () => auth.logout());
    const toggle = document.getElementById('menuToggle');
    if (toggle) toggle.addEventListener('click', () => document.getElementById('sidebar').classList.toggle('open'));

    this.loadView();
  },

  async loadView() {
    const content = document.getElementById('viewContent');
    const titleMap = { dashboard: 'Dashboard', patients: 'Patients', doctors: 'Doctors', departments: 'Departments', appointments: 'Appointments', records: 'Medical Records', invoices: 'Billing' };
    document.getElementById('viewTitle').textContent = titleMap[this.currentView];
    content.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div></div>';
    try {
      await this.views[this.currentView](content);
    } catch (err) {
      content.innerHTML = `<div class="alert alert-danger">Error: ${err.message}</div>`;
    }
  },

  badge(status) {
    return `<span class="badge badge-status-${status}">${status.replace('_', ' ')}</span>`;
  },

  views: {
    async dashboard(el) {
      const [stats, byStatus, byDept, revenue, recent] = await Promise.all([
        api.getStats(), api.getAppointmentsByStatus(), api.getAppointmentsByDepartment(),
        api.getRevenueByMonth(), api.getRecentAppointments(),
      ]);
      const s = stats.data;
      const cards = [
        { label: 'Patients', value: s.totalPatients, icon: 'people', color: '#0d6efd' },
        { label: 'Doctors', value: s.totalDoctors, icon: 'person-badge', color: '#198754' },
        { label: 'Appointments', value: s.totalAppointments, icon: 'calendar-check', color: '#6610f2' },
        { label: "Today's Appts", value: s.todayAppointments, icon: 'calendar-day', color: '#fd7e14' },
        { label: 'Pending Invoices', value: s.pendingInvoices, icon: 'receipt', color: '#dc3545' },
        { label: 'Revenue', value: '$' + (s.totalRevenue || 0).toLocaleString(), icon: 'cash-stack', color: '#20c997' },
      ];
      const maxRev = Math.max(1, ...revenue.data.map(r => r.revenue));
      el.innerHTML = `
        <div class="row g-3 mb-4">
          ${cards.map(c => `
            <div class="col-6 col-md-4 col-xl-2">
              <div class="card stat-card"><div class="card-body d-flex align-items-center gap-3">
                <div class="stat-icon" style="background:${c.color}"><i class="bi bi-${c.icon}"></i></div>
                <div><p class="stat-value">${c.value}</p><p class="stat-label">${c.label}</p></div>
              </div></div>
            </div>`).join('')}
        </div>
        <div class="row g-3">
          <div class="col-lg-8">
            <div class="chart-container">
              <h5>Revenue (last 6 months)</h5>
              <div class="bar-chart">
                ${revenue.data.length ? revenue.data.map(r => `
                  <div class="bar" style="height:${(r.revenue / maxRev) * 100}%">
                    <span class="bar-value">$${r.revenue}</span>
                    <span class="bar-label">${r.month}</span>
                  </div>`).join('') : '<p class="text-muted">No paid invoices yet</p>'}
              </div>
            </div>
          </div>
          <div class="col-lg-4">
            <div class="chart-container">
              <h5>Appointments by Status</h5>
              ${byStatus.data.map(r => `<div class="d-flex justify-content-between py-1"><span>${app.badge(r.status)}</span><strong>${r.count}</strong></div>`).join('') || '<p class="text-muted">No data</p>'}
            </div>
          </div>
        </div>
        <div class="chart-container mt-3">
          <h5>Recent Appointments</h5>
          <div class="table-responsive"><table class="table mb-0">
            <thead><tr><th>Patient</th><th>Doctor</th><th>Date</th><th>Time</th><th>Status</th></tr></thead>
            <tbody>${recent.data.map(r => `<tr><td>${r.patient_name}</td><td>${r.doctor_name}</td><td>${r.appointment_date}</td><td>${r.start_time}</td><td>${app.badge(r.status)}</td></tr>`).join('') || '<tr><td colspan="5" class="text-muted text-center">No appointments</td></tr>'}</tbody>
          </table></div>
        </div>`;
    },

    async patients(el) {
      const res = await api.getPatients();
      el.innerHTML = app.crudTable('patients', res.data, [
        { key: 'full_name', label: 'Name' }, { key: 'gender', label: 'Gender' },
        { key: 'phone', label: 'Phone' }, { key: 'blood_group', label: 'Blood' },
        { key: 'date_of_birth', label: 'DOB' },
      ]);
      app.bindCrud('patients', {
        fields: [
          { name: 'fullName', label: 'Full Name', required: true },
          { name: 'dateOfBirth', label: 'Date of Birth', type: 'date' },
          { name: 'gender', label: 'Gender', type: 'select', options: ['male', 'female', 'other'] },
          { name: 'phone', label: 'Phone' }, { name: 'email', label: 'Email', type: 'email' },
          { name: 'address', label: 'Address' }, { name: 'bloodGroup', label: 'Blood Group' },
        ],
        create: (d) => api.createPatient(d), update: (id, d) => api.updatePatient(id, d), remove: (id) => api.deletePatient(id),
        map: (r) => ({ fullName: r.full_name, dateOfBirth: r.date_of_birth, gender: r.gender, phone: r.phone, email: r.email, address: r.address, bloodGroup: r.blood_group }),
      });
    },

    async doctors(el) {
      const [res, deps] = await Promise.all([api.getDoctors(), api.getDepartments()]);
      el.innerHTML = app.crudTable('doctors', res.data, [
        { key: 'full_name', label: 'Name' }, { key: 'specialization', label: 'Specialization' },
        { key: 'department_name', label: 'Department' }, { key: 'phone', label: 'Phone' },
        { key: 'consultation_fee', label: 'Fee', fmt: (v) => '$' + v },
      ]);
      app.bindCrud('doctors', {
        fields: [
          { name: 'fullName', label: 'Full Name', required: true },
          { name: 'email', label: 'Email', type: 'email' }, { name: 'phone', label: 'Phone' },
          { name: 'departmentId', label: 'Department', type: 'select', options: deps.data.map(d => ({ value: d.id, text: d.name })) },
          { name: 'specialization', label: 'Specialization' }, { name: 'qualification', label: 'Qualification' },
          { name: 'consultationFee', label: 'Consultation Fee', type: 'number' },
        ],
        create: (d) => api.createDoctor(d), update: (id, d) => api.updateDoctor(id, d), remove: (id) => api.deleteDoctor(id),
        map: (r) => ({ fullName: r.full_name, email: r.email, phone: r.phone, departmentId: r.department_id, specialization: r.specialization, qualification: r.qualification, consultationFee: r.consultation_fee }),
      });
    },

    async departments(el) {
      const res = await api.getDepartments();
      el.innerHTML = app.crudTable('departments', res.data, [
        { key: 'name', label: 'Name' }, { key: 'description', label: 'Description' },
      ]);
      app.bindCrud('departments', {
        fields: [{ name: 'name', label: 'Name', required: true }, { name: 'description', label: 'Description', type: 'textarea' }],
        create: (d) => api.createDepartment(d), update: (id, d) => api.updateDepartment(id, d), remove: (id) => api.deleteDepartment(id),
        map: (r) => ({ name: r.name, description: r.description }),
      });
    },

    async appointments(el) {
      const [res, patients, doctors] = await Promise.all([api.getAppointments(), api.getPatients(), api.getDoctors()]);
      el.innerHTML = app.crudTable('appointments', res.data, [
        { key: 'patient_name', label: 'Patient' }, { key: 'doctor_name', label: 'Doctor' },
        { key: 'appointment_date', label: 'Date' }, { key: 'start_time', label: 'Time' },
        { key: 'status', label: 'Status', fmt: (v) => app.badge(v) },
      ]);
      app.bindCrud('appointments', {
        fields: [
          { name: 'patientId', label: 'Patient', type: 'select', required: true, options: patients.data.map(p => ({ value: p.id, text: p.full_name })) },
          { name: 'doctorId', label: 'Doctor', type: 'select', required: true, options: doctors.data.map(d => ({ value: d.id, text: d.full_name })) },
          { name: 'appointmentDate', label: 'Date', type: 'date', required: true },
          { name: 'startTime', label: 'Start Time', type: 'time', required: true },
          { name: 'endTime', label: 'End Time', type: 'time', required: true },
          { name: 'reason', label: 'Reason' },
          { name: 'status', label: 'Status', type: 'select', options: ['scheduled', 'completed', 'cancelled', 'no_show'] },
        ],
        create: (d) => api.createAppointment(d), update: (id, d) => api.updateAppointment(id, d), remove: (id) => api.deleteAppointment(id),
        map: (r) => ({ patientId: r.patient_id, doctorId: r.doctor_id, appointmentDate: r.appointment_date, startTime: r.start_time, endTime: r.end_time, reason: r.reason, status: r.status }),
      });
    },

    async records(el) {
      const [res, patients, doctors] = await Promise.all([api.getMedicalRecords(), api.getPatients(), api.getDoctors()]);
      el.innerHTML = app.crudTable('records', res.data, [
        { key: 'patient_name', label: 'Patient' }, { key: 'doctor_name', label: 'Doctor' },
        { key: 'diagnosis', label: 'Diagnosis' }, { key: 'created_at', label: 'Date', fmt: (v) => (v || '').slice(0, 10) },
      ], 'medical-records');
      app.bindCrud('records', {
        fields: [
          { name: 'patientId', label: 'Patient', type: 'select', required: true, options: patients.data.map(p => ({ value: p.id, text: p.full_name })) },
          { name: 'doctorId', label: 'Doctor', type: 'select', required: true, options: doctors.data.map(d => ({ value: d.id, text: d.full_name })) },
          { name: 'diagnosis', label: 'Diagnosis', type: 'textarea', required: true },
          { name: 'prescription', label: 'Prescription', type: 'textarea' },
          { name: 'notes', label: 'Notes', type: 'textarea' },
        ],
        create: (d) => api.createMedicalRecord(d), update: (id, d) => api.updateMedicalRecord(id, d), remove: (id) => api.deleteMedicalRecord(id),
        map: (r) => ({ patientId: r.patient_id, doctorId: r.doctor_id, diagnosis: r.diagnosis, prescription: r.prescription, notes: r.notes }),
      });
    },

    async invoices(el) {
      const res = await api.getInvoices();
      el.innerHTML = app.crudTable('invoices', res.data, [
        { key: 'invoice_number', label: 'Invoice #' }, { key: 'patient_name', label: 'Patient' },
        { key: 'total', label: 'Total', fmt: (v) => '$' + v }, { key: 'status', label: 'Status', fmt: (v) => app.badge(v) },
        { key: 'issue_date', label: 'Issued' },
      ], 'invoices', true);
    },
  },

  crudTable(view, rows, cols, apiPath, readOnly) {
    return `
      <div class="d-flex justify-content-end mb-3">
        ${readOnly ? '' : `<button class="btn btn-primary" id="addBtn"><i class="bi bi-plus-lg"></i> Add New</button>`}
      </div>
      <div class="table-container"><div class="table-responsive"><table class="table mb-0">
        <thead><tr>${cols.map(c => `<th>${c.label}</th>`).join('')}${readOnly ? '' : '<th class="text-end">Actions</th>'}</tr></thead>
        <tbody>
          ${rows.length ? rows.map(r => `<tr>
            ${cols.map(c => `<td>${c.fmt ? c.fmt(r[c.key]) : (r[c.key] ?? '-')}</td>`).join('')}
            ${readOnly ? '' : `<td class="text-end">
              <button class="btn btn-sm btn-outline-primary edit-btn" data-id="${r.id}"><i class="bi bi-pencil"></i></button>
              <button class="btn btn-sm btn-outline-danger del-btn" data-id="${r.id}"><i class="bi bi-trash"></i></button>
            </td>`}
          </tr>`).join('') : `<tr><td colspan="${cols.length + 1}" class="text-center text-muted py-4">No records found</td></tr>`}
        </tbody>
      </table></div></div>
      <div class="modal fade" id="crudModal" tabindex="-1"><div class="modal-dialog"><div class="modal-content">
        <div class="modal-header"><h5 class="modal-title" id="crudModalTitle">Add</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
        <div class="modal-body"><div id="crudFormError" class="alert alert-danger d-none"></div><form id="crudForm"></form></div>
        <div class="modal-footer"><button class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button><button class="btn btn-primary" id="crudSave">Save</button></div>
      </div></div></div>`;
  },

  bindCrud(view, cfg) {
    this._crudCfg = cfg;
    this._crudRows = {};
    const modalEl = document.getElementById('crudModal');
    const modal = app.makeModal(modalEl);
    const form = document.getElementById('crudForm');
    let editId = null;

    const renderForm = (data = {}) => {
      form.innerHTML = cfg.fields.map(f => {
        const val = data[f.name] ?? '';
        if (f.type === 'select') {
          const opts = f.options.map(o => {
            const value = typeof o === 'object' ? o.value : o;
            const text = typeof o === 'object' ? o.text : o;
            return `<option value="${value}" ${String(val) === String(value) ? 'selected' : ''}>${text}</option>`;
          }).join('');
          return `<div class="mb-3"><label class="form-label">${f.label}</label><select class="form-select" name="${f.name}" ${f.required ? 'required' : ''}><option value="">-- select --</option>${opts}</select></div>`;
        }
        if (f.type === 'textarea') {
          return `<div class="mb-3"><label class="form-label">${f.label}</label><textarea class="form-control" name="${f.name}" rows="2">${val}</textarea></div>`;
        }
        return `<div class="mb-3"><label class="form-label">${f.label}</label><input type="${f.type || 'text'}" class="form-control" name="${f.name}" value="${val}" ${f.required ? 'required' : ''} /></div>`;
      }).join('');
    };

    const addBtn = document.getElementById('addBtn');
    if (addBtn) addBtn.addEventListener('click', () => {
      editId = null;
      document.getElementById('crudModalTitle').textContent = 'Add New';
      renderForm();
      document.getElementById('crudFormError').classList.add('d-none');
      modal.show();
    });

    document.querySelectorAll('.edit-btn').forEach(btn => btn.addEventListener('click', async () => {
      editId = btn.dataset.id;
      const row = (await app.fetchRow(view, editId));
      document.getElementById('crudModalTitle').textContent = 'Edit';
      renderForm(cfg.map(row));
      document.getElementById('crudFormError').classList.add('d-none');
      modal.show();
    }));

    document.querySelectorAll('.del-btn').forEach(btn => btn.addEventListener('click', async () => {
      if (!confirm('Delete this record?')) return;
      try { await cfg.remove(btn.dataset.id); app.loadView(); }
      catch (err) { alert('Error: ' + err.message); }
    }));

    document.getElementById('crudSave').addEventListener('click', async () => {
      const data = {};
      cfg.fields.forEach(f => {
        const input = form.querySelector(`[name="${f.name}"]`);
        let v = input.value;
        if (v === '') { if (!f.required) return; }
        if (f.type === 'number') v = parseFloat(v);
        if ((f.name.endsWith('Id')) && v !== '') v = parseInt(v, 10);
        data[f.name] = v;
      });
      const errBox = document.getElementById('crudFormError');
      errBox.classList.add('d-none');
      try {
        if (editId) await cfg.update(editId, data); else await cfg.create(data);
        modal.hide();
        app.loadView();
      } catch (err) {
        errBox.textContent = err.message;
        errBox.classList.remove('d-none');
      }
    });
  },

  // Lightweight modal controller (no bootstrap JS dependency)
  makeModal(el) {
    const backdropClass = 'modal-open-backdrop';
    const show = () => {
      el.classList.add('show');
      el.style.display = 'block';
      document.body.classList.add(backdropClass);
    };
    const hide = () => {
      el.classList.remove('show');
      el.style.display = 'none';
      document.body.classList.remove(backdropClass);
    };
    el.querySelectorAll('[data-bs-dismiss="modal"]').forEach(b => b.addEventListener('click', hide));
    el.addEventListener('click', (e) => { if (e.target === el) hide(); });
    return { show, hide };
  },

  async fetchRow(view, id) {
    const map = {
      patients: () => api.getPatient(id), doctors: () => api.getDoctor(id),
      departments: () => api.getDepartment(id), appointments: () => api.getAppointment(id),
      records: () => api.getMedicalRecord(id),
    };
    const res = await map[view]();
    return res.data;
  },
};

document.addEventListener('DOMContentLoaded', () => app.init());
