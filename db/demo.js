'use strict';

/**
 * Demo data generator. Every generated row uses a deterministic `demo-` id so
 * `npm run seed -- --reset-demo` can remove only demo content. Real rows the
 * HOD creates afterwards are never touched.
 */

const crypto = require('crypto');
const { get, batch, transaction, nowIso } = require('../lib/db');
const { hashPassword } = require('../lib/auth');
const { writeAudit } = require('../lib/audit');

const NAMES = [
  'Aarav Sharma', 'Diya Patel', 'Vivaan Reddy', 'Ananya Nair', 'Aditya Menon',
  'Ishita Banerjee', 'Kabir Singh', 'Meera Iyer', 'Rohan Das', 'Sneha Kulkarni',
  'Arjun Verma', 'Priya Raman', 'Dev Malhotra', 'Kavya Pillai', 'Siddharth Bose',
  'Nisha Gupta', 'Aryan Joshi', 'Tanvi Desai', 'Rahul Yadav', 'Pooja Mishra',
  'Karan Mehta', 'Riya Chatterjee', 'Manav Kapoor', 'Shreya Ghosh', 'Nikhil Rao',
  'Aisha Khan', 'Yash Thakur', 'Neha Agarwal', 'Sameer Shaikh', 'Anjali Tiwari',
  'Vikram Chawla', 'Aditi Saxena', 'Harsh Vardhan', 'Sanya Bhatt', 'Omkar Patil',
  'Fatima Sheikh', 'Pranav Shetty', 'Ritu Jain', 'Abhishek Pandey', 'Lavanya Krishnan',
  'Sahil Arora', 'Nandini Roy', 'Tejas Kamble', 'Ayesha Ansari', 'Dhruv Sinha',
  'Simran Kaur', 'Aravind Swamy', 'Trisha Mukherjee', 'Kunal Barve', 'Zoya Mirza',
  'Varun Hegde', 'Prisha Bansal', 'Akash Dubey', 'Divya Chandran', 'Rehan Qureshi',
  'Mitali Sahu', 'Gaurav Rane', 'Anvi Srivastava', 'Jatin Solanki', 'Naina Bhosale'
];

const SUBJECTS = [
  { slug: 'maths', name: 'Maths', code: 'MTH' },
  { slug: 'physics', name: 'Physics', code: 'PHY' },
  { slug: 'chemistry', name: 'Chemistry', code: 'CHE' },
  { slug: 'english', name: 'English', code: 'ENG' },
  { slug: 'computer-science', name: 'Computer Science', code: 'CSC' }
];

const FACULTY = [
  { slug: 'maths', name: 'Dr. Ananya Rao', subject: 'maths' },
  { slug: 'physics', name: 'Prof. Vikram Sethi', subject: 'physics' },
  { slug: 'chemistry', name: 'Dr. Leena Mathew', subject: 'chemistry' },
  { slug: 'english', name: 'Prof. Farah Qureshi', subject: 'english' },
  { slug: 'computer-science', name: 'Dr. Rohit Menon', subject: 'computer-science' }
];

const TYPES = [
  { id: 'demo-type-class-test', name: 'Class Test', coursework: 0 },
  { id: 'demo-type-assignment', name: 'Assignment', coursework: 1 },
  { id: 'demo-type-quiz', name: 'Quiz', coursework: 0 },
  { id: 'demo-type-practical', name: 'Practical', coursework: 1 }
];

const TERM_START = '2026-07-01';
const TERM_END = '2026-12-20';

function random(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) | 0;
    let result = Math.imul(value ^ (value >>> 15), 1 | value);
    result = (result + Math.imul(result ^ (result >>> 7), 61 | result)) ^ result;
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function average(values) {
  return values.length ? values.reduce((total, value) => total + Number(value), 0) / values.length : 0;
}

function buildWeeks(rand, base, trend) {
  const patterns = {
    falling: [14, 8, 3, -4],
    improving: [-6, -3, -1, 3],
    volatile: [rand() * 12 - 6, rand() * 12 - 6, rand() * 10 - 5, rand() * 8 - 4],
    steady: [4, 2, 1, 0]
  };
  return patterns[trend].map((offset) => Math.round(clamp(base + offset + rand() * 4 - 2, 30, 100)));
}

function buildMarks(rand, base, trend) {
  const drift = trend === 'falling' ? { T1: 8, T2: 3, T3: 0 }
    : trend === 'improving' ? { T1: -8, T2: -3, T3: 0 }
      : { T1: 0, T2: 0, T3: 0 };
  const offsets = SUBJECTS.map(() => rand() * 10 - 5);
  return Object.fromEntries(['T1', 'T2', 'T3'].map((test) => [test, Object.fromEntries(
    SUBJECTS.map((subject, index) => [subject.name, Math.round(clamp(base + offsets[index] + drift[test] + rand() * 4 - 2, 5, 100))])
  )]));
}

/** Ports the original demo distribution: 12 high, 15 medium, 33 low. */
function createDemoStudents() {
  const rand = random(20261030);
  const bands = [...Array(12).fill('high'), ...Array(15).fill('medium'), ...Array(33).fill('low')];
  for (let index = bands.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rand() * (index + 1));
    [bands[index], bands[swap]] = [bands[swap], bands[index]];
  }
  return NAMES.map((name, index) => {
    const band = bands[index];
    const ranges = {
      high: { attendance: [50, 73], assignments: [38, 63], marks: [32, 50] },
      medium: { attendance: [70, 88], assignments: [60, 82], marks: [45, 65] },
      low: { attendance: [86, 99], assignments: [82, 99], marks: [66, 91] }
    }[band];
    const trendRoll = rand();
    const trend = band === 'high' ? (trendRoll < 0.45 ? 'falling' : trendRoll < 0.68 ? 'volatile' : 'steady')
      : band === 'medium' ? (trendRoll < 0.35 ? 'falling' : trendRoll < 0.58 ? 'improving' : 'steady')
        : (trendRoll < 0.18 ? 'improving' : 'steady');
    const weeks = buildWeeks(rand, ranges.attendance[0] + rand() * (ranges.attendance[1] - ranges.attendance[0]), trend);
    const marks = buildMarks(rand, ranges.marks[0] + rand() * (ranges.marks[1] - ranges.marks[0]), trend);
    return {
      index,
      id: `demo-student-${String(index + 1).padStart(3, '0')}`,
      name,
      roll: `S-${String(index + 1).padStart(2, '0')}`,
      section: ['A', 'B', 'C'][Math.floor(index / 20)],
      attendance: { overall: Math.round(average(weeks)), weeks },
      assignments: Math.round(ranges.assignments[0] + rand() * (ranges.assignments[1] - ranges.assignments[0])),
      marks,
      trend,
      band,
      rand
    };
  });
}

function tempPassword() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const pick = (set) => set[crypto.randomInt(0, set.length)];
  const chars = [pick(letters), pick(digits)];
  while (chars.length < 14) chars.push(pick(letters + digits));
  for (let index = chars.length - 1; index > 0; index -= 1) {
    const swap = crypto.randomInt(0, index + 1);
    [chars[index], chars[swap]] = [chars[swap], chars[index]];
  }
  return chars.join('');
}

function assessmentPlan() {
  return [
    { type: 'demo-type-class-test', slug: 'ct1', title: 'Class Test 1', max: 100, held: '2026-07-24', test: 'T1' },
    { type: 'demo-type-assignment', slug: 'as1', title: 'Assignment 1', max: 20, held: '2026-07-31', coursework: 0, work: 0 },
    { type: 'demo-type-quiz', slug: 'qz1', title: 'Quiz 1', max: 10, held: '2026-08-01', work: 1 },
    { type: 'demo-type-practical', slug: 'pr1', title: 'Practical 1', max: 25, held: '2026-08-07', coursework: 0, work: 2 },
    { type: 'demo-type-assignment', slug: 'as2', title: 'Assignment 2', max: 20, held: '2026-08-14', coursework: 1, work: 3 },
    { type: 'demo-type-practical', slug: 'pr2', title: 'Practical 2', max: 25, held: '2026-08-21', coursework: 1, work: 4 },
    { type: 'demo-type-class-test', slug: 'ct2', title: 'Class Test 2', max: 100, held: '2026-08-28', test: 'T2' },
    { type: 'demo-type-quiz', slug: 'qz2', title: 'Quiz 2', max: 10, held: '2026-09-01', work: 5 },
    { type: 'demo-type-assignment', slug: 'as3', title: 'Assignment 3', max: 20, held: '2026-09-04', coursework: 2, work: 6 },
    { type: 'demo-type-practical', slug: 'pr3', title: 'Practical 3', max: 25, held: '2026-09-11', coursework: 2, work: 7 },
    { type: 'demo-type-assignment', slug: 'as4', title: 'Assignment 4', max: 20, held: '2026-09-18', coursework: 3, work: 8 },
    { type: 'demo-type-class-test', slug: 'ct3', title: 'Class Test 3', max: 100, held: '2026-09-25', test: 'T3' },
    { type: 'demo-type-quiz', slug: 'qz3', title: 'Quiz 3', max: 10, held: '2026-09-29', work: 9 },
    { type: 'demo-type-practical', slug: 'pr4', title: 'Practical 4', max: 25, held: '2026-10-02', coursework: 3, work: 10 }
  ];
}

const SESSION_DATES = [
  '2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31',
  '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28'
];

function statement(sql, args) { return { sql, args }; }

async function demoExists() {
  const row = await get("SELECT id FROM sections WHERE id = 'demo-section-a'");
  return Boolean(row);
}

async function deleteDemoData() {
  const statements = [
    statement("DELETE FROM marks WHERE assessment_id LIKE 'demo-%'"),
    statement("DELETE FROM attendance_records WHERE session_id LIKE 'demo-%'"),
    statement("DELETE FROM attendance_sessions WHERE id LIKE 'demo-%'"),
    statement("DELETE FROM action_items WHERE student_id LIKE 'demo-%'"),
    statement("DELETE FROM mentor_assignments WHERE student_id LIKE 'demo-%' OR mentor_id LIKE 'demo-%'"),
    statement("DELETE FROM assessments WHERE id LIKE 'demo-%'"),
    statement("DELETE FROM teaching_assignments WHERE term_id LIKE 'demo-%' OR user_id LIKE 'demo-%'"),
    statement("DELETE FROM subject_schemes WHERE subject_id LIKE 'demo-%' OR type_id LIKE 'demo-%'"),
    statement("DELETE FROM assessment_types WHERE id LIKE 'demo-%'"),
    statement("DELETE FROM students WHERE id LIKE 'demo-%' OR is_demo = 1"),
    statement("DELETE FROM sections WHERE id LIKE 'demo-%'"),
    statement("DELETE FROM subjects WHERE id LIKE 'demo-%'"),
    statement("DELETE FROM sessions WHERE user_id LIKE 'demo-%'"),
    statement("DELETE FROM users WHERE id LIKE 'demo-%'"),
    statement("DELETE FROM terms WHERE id LIKE 'demo-%'")
  ];
  for (let index = 0; index < statements.length; index += 20) {
    await batch(statements.slice(index, index + 20));
  }
  return { deleted: true };
}

async function ensureHod(log = () => {}) {
  const email = String(process.env.HOD_EMAIL || '').trim().toLowerCase();
  const name = String(process.env.HOD_NAME || '').trim() || 'Head of Department';
  const password = String(process.env.HOD_PASSWORD || '');
  if (!email || !password) {
    throw new Error('HOD_EMAIL and HOD_PASSWORD must be set in .env.local before seeding.');
  }
  const existing = await get('SELECT id FROM users WHERE email = ? COLLATE NOCASE', [email]);
  if (existing) return { id: existing.id, created: false };
  const id = crypto.randomUUID();
  await require('../lib/db').run(
    `INSERT INTO users (id, name, email, password_hash, role, active, must_change_password, created_at)
     VALUES (?, ?, ?, ?, 'HOD', 1, 0, ?)`,
    [id, name, email, await hashPassword(password), nowIso()]
  );
  await writeAudit({
    userId: null, action: 'seed.hod', entity: 'user', entityId: id,
    after: { email, name, role: 'HOD' }, reason: 'Initial HOD created by the seed script.'
  });
  log(`Created the first HOD: ${email}`);
  return { id, created: true };
}

async function ensureTerm() {
  const existing = await get('SELECT * FROM terms WHERE active = 1 AND archived = 0 ORDER BY starts_on DESC LIMIT 1');
  if (existing) return { ...existing, created: false };
  const id = 'demo-term-2026';
  await require('../lib/db').run(
    'INSERT INTO terms (id, name, starts_on, ends_on, active, archived) VALUES (?, ?, ?, ?, 1, 0)',
    [id, '2026–27 · Odd semester', TERM_START, TERM_END]
  );
  return { id, name: '2026–27 · Odd semester', starts_on: TERM_START, ends_on: TERM_END, active: 1, archived: 0, created: true };
}

function buildDemoStatements(termId) {
  const statements = [];
  const at = '2026-06-15T09:00:00.000Z';
  const demoStudents = createDemoStudents();
  const sectionMap = new Map();

  const sections = ['A', 'B', 'C'];
  sections.forEach((name) => {
    const id = `demo-section-${name.toLowerCase()}`;
    sectionMap.set(name, id);
    statements.push(statement(
      'INSERT INTO sections (id, branch, semester, name, active) VALUES (?, ?, ?, ?, 1)',
      [id, 'Demo', '1', name]
    ));
  });
  for (const subject of SUBJECTS) {
    statements.push(statement(
      'INSERT INTO subjects (id, code, name, active) VALUES (?, ?, ?, 1)',
      [`demo-subject-${subject.slug}`, subject.code, subject.name]
    ));
  }
  for (const type of TYPES) {
    statements.push(statement(
      'INSERT INTO assessment_types (id, name, is_coursework, active) VALUES (?, ?, ?, 1)',
      [type.id, type.name, type.coursework]
    ));
  }
  for (const subject of SUBJECTS) {
    statements.push(statement(
      'INSERT INTO subject_schemes (id, subject_id, type_id, weight, rule, rule_n) VALUES (?, ?, ?, ?, ?, ?)',
      [`demo-scheme-${subject.slug}-ct`, `demo-subject-${subject.slug}`, 'demo-type-class-test', 50, 'best_n', 2]
    ));
    statements.push(statement(
      'INSERT INTO subject_schemes (id, subject_id, type_id, weight, rule, rule_n) VALUES (?, ?, ?, ?, ?, ?)',
      [`demo-scheme-${subject.slug}-as`, `demo-subject-${subject.slug}`, 'demo-type-assignment', 20, 'average', null]
    ));
    statements.push(statement(
      'INSERT INTO subject_schemes (id, subject_id, type_id, weight, rule, rule_n) VALUES (?, ?, ?, ?, ?, ?)',
      [`demo-scheme-${subject.slug}-qz`, `demo-subject-${subject.slug}`, 'demo-type-quiz', 15, 'best_n', 2]
    ));
    statements.push(statement(
      'INSERT INTO subject_schemes (id, subject_id, type_id, weight, rule, rule_n) VALUES (?, ?, ?, ?, ?, ?)',
      [`demo-scheme-${subject.slug}-pr`, `demo-subject-${subject.slug}`, 'demo-type-practical', 15, 'average', null]
    ));
  }

  // Demo faculty: one per subject, teaching every demo section.
  const credentials = [];
  for (const person of FACULTY) {
    const id = `demo-faculty-${person.slug}`;
    const password = tempPassword();
    credentials.push({ name: person.name, email: `demo.${person.slug}@eduguard.local`, password });
    statements.push(statement(
      `INSERT INTO users (id, name, email, password_hash, role, active, must_change_password, created_at)
       VALUES (?, ?, ?, ?, 'FACULTY', 1, 1, ?)`,
      [id, person.name, `demo.${person.slug}@eduguard.local`, null, at]
    ));
    // The password hash needs async work; filled in by the caller below.
  }

  // Students
  for (const student of demoStudents) {
    const sectionId = sectionMap.get(student.section);
    statements.push(statement(
      `INSERT INTO students (id, roll, name, section_id, active, is_demo, created_at)
       VALUES (?, ?, ?, ?, 1, 1, ?)`,
      [student.id, student.roll, student.name, sectionId, at]
    ));
  }

  // Teaching assignments
  for (const subject of SUBJECTS) {
    for (const section of sections) {
      statements.push(statement(
        'INSERT INTO teaching_assignments (id, term_id, user_id, subject_id, section_id) VALUES (?, ?, ?, ?, ?)',
        [`demo-ta-${subject.slug}-${section.toLowerCase()}`, termId, `demo-faculty-${subject.slug}`,
          `demo-subject-${subject.slug}`, sectionMap.get(section)]
      ));
    }
  }

  const plan = assessmentPlan();
  const facultyFor = new Map(SUBJECTS.map((subject) => [subject.slug, `demo-faculty-${subject.slug}`]));
  const bySection = new Map();
  for (const student of demoStudents) {
    if (!bySection.has(student.section)) bySection.set(student.section, []);
    bySection.get(student.section).push(student);
  }

  for (const subject of SUBJECTS) {
    for (const section of sections) {
      const students = bySection.get(section) || [];
      for (const item of plan) {
        const assessmentId = `demo-a-${subject.slug}-${section.toLowerCase()}-${item.slug}`;
        statements.push(statement(
          `INSERT INTO assessments (id, term_id, subject_id, section_id, type_id, title, max_marks, held_on, locked, deleted, created_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`,
          [assessmentId, termId, `demo-subject-${subject.slug}`, sectionMap.get(section),
            item.type, `${item.title}`, item.max, item.held, facultyFor.get(subject.slug), `${item.held}T10:00:00.000Z`]
        ));
        const updatedBy = facultyFor.get(subject.slug);
        for (const student of students) {
          let percent;
          if (item.test) percent = student.marks[item.test][subject.name];
          else percent = clamp(student.marks.T3[subject.name] + (student.rand() * 14 - 7) + (item.work || 0) * 0.4, 5, 100);
          let status = 'present';
          if (item.coursework !== undefined) {
            const presentChance = student.assignments / 100;
            if (student.rand() > presentChance) status = 'absent';
          }
          const score = status === 'present' ? round((percent / 100) * item.max) : null;
          statements.push(statement(
            `INSERT INTO marks (assessment_id, student_id, score, status, updated_by, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [assessmentId, student.id, score, status, updatedBy, `${item.held}T15:00:00.000Z`]
          ));
        }

        if (item.slug === 'ct1') {
          // Create attendance sessions once per subject/section on the first
          // assessment loop iteration.
          for (let week = 0; week < SESSION_DATES.length; week += 1) {
            const sessionId = `demo-s-${subject.slug}-${section.toLowerCase()}-${week + 1}`;
            const date = SESSION_DATES[week];
            statements.push(statement(
              'INSERT INTO attendance_sessions (id, term_id, subject_id, section_id, held_on, created_by) VALUES (?, ?, ?, ?, ?, ?)',
              [sessionId, termId, `demo-subject-${subject.slug}`, sectionMap.get(section), date, facultyFor.get(subject.slug)]
            ));
            for (const student of students) {
              const slope = (student.attendance.weeks[3] - student.attendance.weeks[0]) / 4;
              const chance = clamp(student.attendance.overall + (week - 3.5) * slope, 20, 100) / 100;
              const present = student.rand() < chance ? 1 : 0;
              statements.push(statement(
                'INSERT INTO attendance_records (session_id, student_id, present) VALUES (?, ?, ?)',
                [sessionId, student.id, present]
              ));
            }
          }
        }
      }
    }
  }
  return { statements, credentials, students: demoStudents.length };
}

async function insertStatements(statements, chunkSize = 120) {
  for (let index = 0; index < statements.length; index += chunkSize) {
    await batch(statements.slice(index, index + chunkSize));
  }
}

async function seedDemoData(log = () => {}) {
  const term = await ensureTerm();
  const built = buildDemoStatements(term.id);
  // Password hashes are async, so patch the user rows before inserting.
  for (const credential of built.credentials) {
    const row = built.statements.find((statement) => statement.sql.includes('INSERT INTO users') && statement.args[2] === credential.email);
    if (row) row.args[3] = await hashPassword(credential.password);
  }
  await insertStatements(built.statements);
  return { term, students: built.students, credentials: built.credentials };
}

async function runSeed({ resetDemo = false, log = console.log } = {}) {
  const { migrate } = require('./migrate');
  await migrate();
  log('Schema ready.');
  const hod = await ensureHod(log);
  if (resetDemo) {
    await deleteDemoData();
    log('Previous demo data removed.');
  }
  if (!(await demoExists())) {
    const result = await seedDemoData(log);
    log(`Demo term: ${result.term.name}`);
    log(`Demo data inserted: ${result.students} students across 3 sections, 5 subjects and 5 faculty.`);
    log('');
    log('Demo faculty credentials (shown once — change them after signing in):');
    for (const credential of result.credentials) {
      log(`  ${credential.email}  /  ${credential.password}`);
    }
    log('');
    log('Warning: these are demo accounts. Reset or deactivate them in /faculty before real use.');
  } else {
    log('Demo data already present (use --reset-demo to regenerate it).');
  }
  log('');
  log(`HOD account: ${process.env.HOD_EMAIL || '(missing HOD_EMAIL)'}${hod.created ? ' (created)' : ' (already existed)'}`);
  log('Seed complete.');
  return { ok: true };
}

module.exports = { runSeed, seedDemoData, deleteDemoData, demoExists, createDemoStudents };
