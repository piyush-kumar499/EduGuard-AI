'use strict';

/**
 * EduGuard v2 schema. Every statement is idempotent so `npm run migrate` can
 * be run repeatedly against a live database.
 */
const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('HOD','FACULTY')),
    active INTEGER NOT NULL DEFAULT 1,
    must_change_password INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    last_login_at TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    ip TEXT,
    user_agent TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS login_attempts (
    key TEXT NOT NULL,
    at TEXT NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS rate_limits (
    key TEXT NOT NULL,
    at TEXT NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS terms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    starts_on TEXT,
    ends_on TEXT,
    active INTEGER NOT NULL DEFAULT 0,
    archived INTEGER NOT NULL DEFAULT 0
  )`,

  `CREATE TABLE IF NOT EXISTS sections (
    id TEXT PRIMARY KEY,
    branch TEXT NOT NULL,
    semester TEXT NOT NULL,
    name TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    UNIQUE(branch, semester, name)
  )`,

  `CREATE TABLE IF NOT EXISTS subjects (
    id TEXT PRIMARY KEY,
    code TEXT,
    name TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    UNIQUE(name)
  )`,

  `CREATE TABLE IF NOT EXISTS teaching_assignments (
    id TEXT PRIMARY KEY,
    term_id TEXT NOT NULL REFERENCES terms(id),
    user_id TEXT NOT NULL REFERENCES users(id),
    subject_id TEXT NOT NULL REFERENCES subjects(id),
    section_id TEXT NOT NULL REFERENCES sections(id),
    UNIQUE(term_id, subject_id, section_id)
  )`,

  `CREATE TABLE IF NOT EXISTS students (
    id TEXT PRIMARY KEY,
    roll TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    section_id TEXT NOT NULL REFERENCES sections(id),
    active INTEGER NOT NULL DEFAULT 1,
    is_demo INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS assessment_types (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    is_coursework INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1
  )`,

  `CREATE TABLE IF NOT EXISTS subject_schemes (
    id TEXT PRIMARY KEY,
    subject_id TEXT NOT NULL REFERENCES subjects(id),
    type_id TEXT NOT NULL REFERENCES assessment_types(id),
    weight REAL NOT NULL CHECK (weight >= 0 AND weight <= 100),
    rule TEXT NOT NULL DEFAULT 'average' CHECK (rule IN ('average','best_n','sum')),
    rule_n INTEGER,
    UNIQUE(subject_id, type_id)
  )`,

  `CREATE TABLE IF NOT EXISTS assessments (
    id TEXT PRIMARY KEY,
    term_id TEXT NOT NULL REFERENCES terms(id),
    subject_id TEXT NOT NULL REFERENCES subjects(id),
    section_id TEXT NOT NULL REFERENCES sections(id),
    type_id TEXT NOT NULL REFERENCES assessment_types(id),
    title TEXT NOT NULL,
    max_marks REAL NOT NULL CHECK (max_marks > 0),
    held_on TEXT,
    locked INTEGER NOT NULL DEFAULT 0,
    deleted INTEGER NOT NULL DEFAULT 0,
    created_by TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS marks (
    assessment_id TEXT NOT NULL REFERENCES assessments(id),
    student_id TEXT NOT NULL REFERENCES students(id),
    score REAL,
    status TEXT NOT NULL DEFAULT 'present' CHECK (status IN ('present','absent','exempt')),
    updated_by TEXT NOT NULL REFERENCES users(id),
    updated_at TEXT NOT NULL,
    PRIMARY KEY (assessment_id, student_id)
  )`,

  `CREATE TABLE IF NOT EXISTS attendance_sessions (
    id TEXT PRIMARY KEY,
    term_id TEXT NOT NULL REFERENCES terms(id),
    subject_id TEXT NOT NULL REFERENCES subjects(id),
    section_id TEXT NOT NULL REFERENCES sections(id),
    held_on TEXT NOT NULL,
    created_by TEXT NOT NULL REFERENCES users(id),
    UNIQUE(subject_id, section_id, held_on)
  )`,

  `CREATE TABLE IF NOT EXISTS attendance_records (
    session_id TEXT NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
    student_id TEXT NOT NULL REFERENCES students(id),
    present INTEGER NOT NULL,
    PRIMARY KEY (session_id, student_id)
  )`,

  `CREATE TABLE IF NOT EXISTS action_items (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES students(id),
    subject_id TEXT,
    action_key TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 0,
    note TEXT,
    user_id TEXT NOT NULL REFERENCES users(id),
    updated_at TEXT NOT NULL,
    UNIQUE(student_id, subject_id, action_key, user_id)
  )`,

  `CREATE TABLE IF NOT EXISTS mentor_assignments (
    student_id TEXT NOT NULL,
    mentor_id TEXT NOT NULL,
    subject_id TEXT,
    assigned_by TEXT NOT NULL,
    PRIMARY KEY (student_id, mentor_id, subject_id)
  )`,

  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY,
    at TEXT NOT NULL,
    user_id TEXT,
    action TEXT NOT NULL,
    entity TEXT NOT NULL,
    entity_id TEXT,
    before_json TEXT,
    after_json TEXT,
    reason TEXT,
    ip TEXT
  )`,

  // --- Indexes on foreign keys and hot filters -----------------------------
  `CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)`,
  `CREATE INDEX IF NOT EXISTS idx_login_attempts_key_at ON login_attempts(key, at)`,
  `CREATE INDEX IF NOT EXISTS idx_rate_limits_key_at ON rate_limits(key, at)`,
  `CREATE INDEX IF NOT EXISTS idx_terms_active ON terms(active, archived)`,
  `CREATE INDEX IF NOT EXISTS idx_sections_active ON sections(active)`,
  `CREATE INDEX IF NOT EXISTS idx_teaching_term ON teaching_assignments(term_id)`,
  `CREATE INDEX IF NOT EXISTS idx_teaching_user ON teaching_assignments(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_teaching_subject ON teaching_assignments(subject_id)`,
  `CREATE INDEX IF NOT EXISTS idx_teaching_section ON teaching_assignments(section_id)`,
  `CREATE INDEX IF NOT EXISTS idx_teaching_pair ON teaching_assignments(term_id, subject_id, section_id)`,
  `CREATE INDEX IF NOT EXISTS idx_students_section ON students(section_id)`,
  `CREATE INDEX IF NOT EXISTS idx_students_active ON students(active, is_demo)`,
  `CREATE INDEX IF NOT EXISTS idx_schemes_subject ON subject_schemes(subject_id)`,
  `CREATE INDEX IF NOT EXISTS idx_schemes_type ON subject_schemes(type_id)`,
  `CREATE INDEX IF NOT EXISTS idx_assessments_term ON assessments(term_id)`,
  `CREATE INDEX IF NOT EXISTS idx_assessments_subject ON assessments(subject_id)`,
  `CREATE INDEX IF NOT EXISTS idx_assessments_section ON assessments(section_id)`,
  `CREATE INDEX IF NOT EXISTS idx_assessments_type ON assessments(type_id)`,
  `CREATE INDEX IF NOT EXISTS idx_assessments_created_by ON assessments(created_by)`,
  `CREATE INDEX IF NOT EXISTS idx_assessments_pair ON assessments(subject_id, section_id, deleted)`,
  `CREATE INDEX IF NOT EXISTS idx_marks_student ON marks(student_id)`,
  `CREATE INDEX IF NOT EXISTS idx_marks_assessment ON marks(assessment_id)`,
  `CREATE INDEX IF NOT EXISTS idx_marks_updated_by ON marks(updated_by)`,
  `CREATE INDEX IF NOT EXISTS idx_attendance_term ON attendance_sessions(term_id)`,
  `CREATE INDEX IF NOT EXISTS idx_attendance_subject ON attendance_sessions(subject_id)`,
  `CREATE INDEX IF NOT EXISTS idx_attendance_section ON attendance_sessions(section_id)`,
  `CREATE INDEX IF NOT EXISTS idx_attendance_pair_date ON attendance_sessions(subject_id, section_id, held_on)`,
  `CREATE INDEX IF NOT EXISTS idx_attendance_records_student ON attendance_records(student_id)`,
  `CREATE INDEX IF NOT EXISTS idx_actions_student ON action_items(student_id)`,
  `CREATE INDEX IF NOT EXISTS idx_actions_user ON action_items(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_mentor_student ON mentor_assignments(student_id)`,
  `CREATE INDEX IF NOT EXISTS idx_mentor_mentor ON mentor_assignments(mentor_id)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log(at)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity, entity_id)`
];

const DEFAULT_SETTINGS = {
  score_weights: { attendance: 35, coursework: 25, marks: 40 },
  thresholds: {
    onTrack: 70,
    watch: 50,
    attendanceWatch: 85,
    attendanceConcern: 75,
    courseworkWatch: 80,
    courseworkConcern: 65,
    marksWatch: 65,
    marksConcern: 50,
    attendanceDrop: 10
  },
  absent_counts_as_zero: true,
  min_assessments_for_trend: 3
};

module.exports = { STATEMENTS, DEFAULT_SETTINGS };
