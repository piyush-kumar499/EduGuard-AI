'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const permissions = require('../lib/permissions');

function facultyScope() {
  return {
    role: 'FACULTY',
    userId: 'u1',
    assignments: [
      { id: 'ta1', subject_id: 's1', section_id: 'a', subject_name: 'Maths', section_name: 'A', branch: 'Science', semester: '1' }
    ],
    subjects: [{ id: 's1', name: 'Maths' }],
    sections: [{ id: 'a', name: 'A', branch: 'Science', semester: '1' }],
    subjectIds: new Set(['s1']),
    sectionIds: new Set(['a']),
    pairs: new Set(['s1:a'])
  };
}

function hodScope() {
  return {
    role: 'HOD',
    userId: 'h1',
    assignments: [],
    subjects: [{ id: 's1', name: 'Maths' }, { id: 's2', name: 'Physics' }],
    sections: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
    subjectIds: null,
    sectionIds: null,
    pairs: null
  };
}

test('scopeAllows requires the exact subject and section pair for faculty', () => {
  const scope = facultyScope();
  assert.equal(permissions.scopeAllows(scope, 's1', 'a'), true);
  assert.equal(permissions.scopeAllows(scope, 's1', 'b'), false);
  assert.equal(permissions.scopeAllows(scope, 's2', 'a'), false);
  assert.equal(permissions.scopeAllows(null, 's1', 'a'), false);
});

test('assertScope throws a 403 OUT_OF_SCOPE outside the teaching pair', () => {
  const scope = facultyScope();
  assert.equal(permissions.assertScope(scope, 's1', 'a'), true);
  assert.throws(() => permissions.assertScope(scope, 's1', 'b'), (error) => {
    assert.equal(error.status, 403);
    assert.equal(error.code, 'OUT_OF_SCOPE');
    return true;
  });
});

test('assertSubject and assertSection only allow assigned ids for faculty', () => {
  const scope = facultyScope();
  assert.equal(permissions.assertSubject(scope, 's1'), true);
  assert.equal(permissions.assertSection(scope, 'a'), true);
  assert.throws(() => permissions.assertSubject(scope, 's2'), /outside your teaching assignments/);
  assert.throws(() => permissions.assertSection(scope, 'b'), /outside your teaching assignments/);
});

test('an HOD can access every subject and section', () => {
  const scope = hodScope();
  assert.equal(permissions.scopeAllows(scope, 'anything', 'anything'), true);
  assert.equal(permissions.assertScope(scope, 's2', 'b'), true);
  assert.equal(permissions.assertSubject(scope, 's2'), true);
  assert.equal(permissions.assertSection(scope, 'b'), true);
});

test('scopeSectionFilter constrains faculty and leaves the HOD open', () => {
  const faculty = permissions.scopeSectionFilter(facultyScope());
  assert.equal(faculty.sql, 'st.section_id IN (?)');
  assert.deepEqual(faculty.args, ['a']);

  const hod = permissions.scopeSectionFilter(hodScope());
  assert.equal(hod.sql, '1 = 1');
  assert.deepEqual(hod.args, []);

  const empty = permissions.scopeSectionFilter({
    role: 'FACULTY', sectionIds: new Set(), subjectIds: new Set(), pairs: new Set()
  });
  assert.equal(empty.sql, '1 = 0');
});

test('scopeSubjectFilter constrains faculty subjects', () => {
  const faculty = permissions.scopeSubjectFilter(facultyScope());
  assert.equal(faculty.sql, 'a.subject_id IN (?)');
  assert.deepEqual(faculty.args, ['s1']);

  const hod = permissions.scopeSubjectFilter(hodScope());
  assert.equal(hod.sql, '1 = 1');

  const empty = permissions.scopeSubjectFilter({
    role: 'FACULTY', sectionIds: new Set(), subjectIds: new Set(), pairs: new Set()
  });
  assert.equal(empty.sql, '1 = 0');
});

test('scopePayload serialises a faculty scope without leaking internals', () => {
  const payload = permissions.scopePayload(facultyScope());
  assert.equal(payload.role, 'FACULTY');
  assert.deepEqual(payload.subjects, [{ id: 's1', name: 'Maths', code: '' }]);
  assert.deepEqual(payload.sections, [{ id: 'a', name: 'A', branch: 'Science', semester: '1' }]);
  assert.deepEqual(payload.assignments, [{
    id: 'ta1', termId: undefined, subjectId: 's1', subjectName: 'Maths',
    sectionId: 'a', sectionName: 'A', branch: 'Science', semester: '1'
  }]);
});

test('scopePayload reports department-wide access for an HOD', () => {
  const payload = permissions.scopePayload(hodScope());
  assert.equal(payload.role, 'HOD');
  assert.deepEqual(payload.assignments, []);
  assert.equal(payload.subjects.length, 2);
});
