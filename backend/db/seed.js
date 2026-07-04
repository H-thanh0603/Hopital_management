const bcrypt = require('bcryptjs');
const db = require('./connection');
const initDb = require('./init');

function seed() {
  initDb();

  const departmentCount = db.prepare('SELECT COUNT(*) AS count FROM departments').get().count;
  if (departmentCount > 0) {
    console.log('Database already contains data. Skipping seed.');
    return;
  }

  const insertDepartment = db.prepare(
    'INSERT INTO departments (name, description) VALUES (?, ?)'
  );
  const departments = [
    ['General Medicine', 'Primary care and general health services'],
    ['Cardiology', 'Heart and cardiovascular system'],
    ['Pediatrics', 'Medical care for infants, children, and adolescents'],
    ['Orthopedics', 'Bones, joints, ligaments, and muscles'],
    ['Dermatology', 'Skin, hair, and nail conditions'],
  ];
  const departmentIds = {};
  for (const [name, description] of departments) {
    const info = insertDepartment.run(name, description);
    departmentIds[name] = info.lastInsertRowid;
  }

  const insertDoctor = db.prepare(`
    INSERT INTO doctors (full_name, email, phone, department_id, specialization, qualification, consultation_fee)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const doctors = [
    ['Dr. Sarah Johnson', 'sarah.johnson@hospital.com', '555-0101', departmentIds['General Medicine'], 'Family Medicine', 'MD', 50],
    ['Dr. Michael Chen', 'michael.chen@hospital.com', '555-0102', departmentIds['Cardiology'], 'Interventional Cardiology', 'MD, FACC', 120],
    ['Dr. Emily Davis', 'emily.davis@hospital.com', '555-0103', departmentIds['Pediatrics'], 'General Pediatrics', 'MD, FAAP', 70],
    ['Dr. James Wilson', 'james.wilson@hospital.com', '555-0104', departmentIds['Orthopedics'], 'Sports Medicine', 'MD, FAAOS', 100],
  ];
  const doctorIds = [];
  for (const doc of doctors) {
    const info = insertDoctor.run(...doc);
    doctorIds.push(info.lastInsertRowid);
  }

  const insertSchedule = db.prepare(`
    INSERT INTO doctor_schedules (doctor_id, day_of_week, start_time, end_time, slot_minutes)
    VALUES (?, ?, ?, ?, ?)
  `);
  for (const doctorId of doctorIds) {
    for (const day of [1, 2, 3, 4, 5]) {
      insertSchedule.run(doctorId, day, '09:00', '17:00', 30);
    }
  }

  const insertPatient = db.prepare(`
    INSERT INTO patients (full_name, date_of_birth, gender, phone, email, address, blood_group, emergency_contact_name, emergency_contact_phone, allergies)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const patients = [
    ['John Smith', '1985-04-12', 'male', '555-0201', 'john.smith@example.com', '123 Main St', 'O+', 'Jane Smith', '555-0202', 'Penicillin'],
    ['Maria Garcia', '1990-08-23', 'female', '555-0203', 'maria.garcia@example.com', '456 Oak Ave', 'A-', 'Carlos Garcia', '555-0204', 'None'],
    ['Robert Lee', '1978-01-30', 'male', '555-0205', 'robert.lee@example.com', '789 Pine Rd', 'B+', 'Susan Lee', '555-0206', 'None'],
  ];
  for (const p of patients) {
    insertPatient.run(...p);
  }

  const adminPasswordHash = bcrypt.hashSync('Admin@123', 10);
  const insertUser = db.prepare(`
    INSERT INTO users (full_name, email, password_hash, role, doctor_id)
    VALUES (?, ?, ?, ?, ?)
  `);
  insertUser.run('System Administrator', 'admin@hospital.com', adminPasswordHash, 'admin', null);

  const receptionistHash = bcrypt.hashSync('Reception@123', 10);
  insertUser.run('Front Desk', 'reception@hospital.com', receptionistHash, 'receptionist', null);

  console.log('Seed data inserted successfully.');
  console.log('Admin login -> email: admin@hospital.com, password: Admin@123');
  console.log('Receptionist login -> email: reception@hospital.com, password: Reception@123');
}

if (require.main === module) {
  seed();
}

module.exports = seed;
