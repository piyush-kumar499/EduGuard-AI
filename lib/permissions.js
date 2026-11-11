'use strict';

const { all, get } = require('./db');
const { forbidden, badRequest } = require('./validate');

/** The single active, non-archived term. */
async function activeTerm() {
  const term = await get('SELECT * FROM terms WHERE active = 1 AND archived = 0 ORDER BY starts_on DESC LIMIT 1');
  if (!term) {
    throw badRequest('No active term is configured. Ask the HOD to create and activate a term.', 'NO_ACTIVE_TERM');
  }
  return term;
}

async function termById(termId) {
  return get('SELECT * FROM terms WHERE id = ?', [termId]);
}

async function termWritable(termId) {
  const term = await termById(termId);
  if (!term) throw badRequest('That term no longer exists.', 'TERM_MISSING');
  if (Number(term.archived) === 1) {
    throw badRequest('This term is archived and read-only.', 'TERM_ARCHIVED');
  }
  return term;
}

async function facultyAssignments(userId, termId) {
  return all(
    `SELECT ta.id, ta.term_id, ta.subject_id, ta.section_id,
            s.name AS subject_name, s.code AS subject_code,
            sec.name AS section_name, sec.branch, sec.semester
       FROM teaching_assignments ta
       JOIN subjects s ON s.id = ta.subject_id
       JOIN sections sec ON sec.id = ta.section_id
      WHERE ta.user_id = ? AND ta.term_id = ?
      ORDER BY s.name, sec.name`,
    [userId, termId]
  );
}

/**
 * The server-side authority for visibility. Every data handler receives this
 * object and must pass ids through assertScope before reading or writing.
 */
async function buildScope(user, term = null) {
  const active = term || await activeTerm();
  if (user.role === 'HOD') {
    const [subjects, sections] = await Promise.all([
      all('SELECT * FROM subjects WHERE active = 1 ORDER BY name'),
      all('SELECT * FROM sections WHERE active = 1 ORDER BY branch, semester, name')
    ]);
    return {
      role: 'HOD',
      userId: user.id,
      term: active,
      assignments: [],
      subjects,
      sections,
      subjectIds: null,
      sectionIds: null,
      pairs: null
    };
  }

  const assignments = await facultyAssignments(user.id, active.id);
  const subjectMap = new Map();
  const sectionMap = new Map();
  for (const row of assignments) {
    if (!subjectMap.has(row.subject_id)) {
      subjectMap.set(row.subject_id, { id: row.subject_id, name: row.subject_name, code: row.subject_code });
    }
    if (!sectionMap.has(row.section_id)) {
      sectionMap.set(row.section_id, {
        id: row.section_id, name: row.section_name, branch: row.branch, semester: row.semester
      });
    }
  }
  return {
    role: 'FACULTY',
    userId: user.id,
    term: active,
    assignments,
    subjects: [...subjectMap.values()].sort((a, b) => a.name.localeCompare(b.name)),
    sections: [...sectionMap.values()].sort((a, b) => a.name.localeCompare(b.name)),
    subjectIds: new Set(subjectMap.keys()),
    sectionIds: new Set(sectionMap.keys()),
    pairs: new Set(assignments.map((row) => `${row.subject_id}:${row.section_id}`))
  };
}

function scopeAllows(scope, subjectId, sectionId) {
  if (!scope) return false;
  if (scope.role === 'HOD') return true;
  return scope.pairs.has(`${subjectId}:${sectionId}`);
}

function assertScope(scope, subjectId, sectionId) {
  if (!scopeAllows(scope, subjectId, sectionId)) {
    throw forbidden('That subject and section are outside your teaching assignments.', 'OUT_OF_SCOPE');
  }
  return true;
}

function assertSubject(scope, subjectId) {
  if (scope.role === 'HOD') return true;
  if (!scope.subjectIds.has(subjectId)) {
    throw forbidden('That subject is outside your teaching assignments.', 'OUT_OF_SCOPE');
  }
  return true;
}

function assertSection(scope, sectionId) {
  if (scope.role === 'HOD') return true;
  if (!scope.sectionIds.has(sectionId)) {
    throw forbidden('That section is outside your teaching assignments.', 'OUT_OF_SCOPE');
  }
  return true;
}

/** Faculty only see students in a section they teach; HOD sees everyone. */
function scopeSectionFilter(scope) {
  if (scope.role === 'HOD') return { sql: '1 = 1', args: [] };
  const ids = [...scope.sectionIds];
  if (!ids.length) return { sql: '1 = 0', args: [] };
  return { sql: `st.section_id IN (${ids.map(() => '?').join(',')})`, args: ids };
}

function scopeSubjectFilter(scope) {
  if (scope.role === 'HOD') return { sql: '1 = 1', args: [] };
  const ids = [...scope.subjectIds];
  if (!ids.length) return { sql: '1 = 0', args: [] };
  return { sql: `a.subject_id IN (${ids.map(() => '?').join(',')})`, args: ids };
}

/** Shape returned to the browser with /auth/me and used to build pickers. */
function scopePayload(scope) {
  return {
    role: scope.role,
    assignments: scope.assignments.map((row) => ({
      id: row.id,
      termId: row.term_id,
      subjectId: row.subject_id,
      subjectName: row.subject_name,
      sectionId: row.section_id,
      sectionName: row.section_name,
      branch: row.branch,
      semester: row.semester
    })),
    subjects: scope.subjects.map((subject) => ({ id: subject.id, name: subject.name, code: subject.code || '' })),
    sections: scope.sections.map((section) => ({
      id: section.id, name: section.name, branch: section.branch, semester: section.semester
    }))
  };
}

async function allSections() {
  return all('SELECT * FROM sections WHERE active = 1 ORDER BY branch, semester, name');
}

async function allSubjects() {
  return all('SELECT * FROM subjects WHERE active = 1 ORDER BY name');
}

async function allActiveAssignments(termId) {
  return all(
    `SELECT ta.*, u.name AS user_name, u.role AS user_role, s.name AS subject_name, sec.name AS section_name
       FROM teaching_assignments ta
       JOIN users u ON u.id = ta.user_id
       JOIN subjects s ON s.id = ta.subject_id
       JOIN sections sec ON sec.id = ta.section_id
      WHERE ta.term_id = ?
      ORDER BY s.name, sec.name`,
    [termId]
  );
}

module.exports = {
  activeTerm, termById, termWritable, facultyAssignments, buildScope,
  scopeAllows, assertScope, assertSubject, assertSection,
  scopeSectionFilter, scopeSubjectFilter, scopePayload,
  allSections, allSubjects, allActiveAssignments
};
