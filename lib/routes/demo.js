'use strict';

const { runSeed, deleteDemoData, demoExists } = require('../../db/demo');
const { all } = require('../db');

async function resetDemo(ctx) {
  const result = await runSeed({ resetDemo: true, log: () => {} });
  return {
    reset: true,
    students: result.students,
    term: result.term ? { id: result.term.id, name: result.term.name } : null,
    note: 'Demo data was regenerated. New demo faculty passwords were printed only in the seed console; reset individual passwords in /faculty if needed.'
  };
}

async function removeDemo(ctx) {
  const counts = await all(
    `SELECT
      (SELECT COUNT(*) FROM students WHERE is_demo = 1) AS students,
      (SELECT COUNT(*) FROM assessments WHERE id LIKE 'demo-%') AS assessments`
  );
  await deleteDemoData();
  return {
    deleted: true,
    removed: {
      students: Number(counts[0]?.students || 0),
      assessments: Number(counts[0]?.assessments || 0)
    }
  };
}

module.exports = [
  { method: 'POST', path: 'demo/reset', handler: resetDemo, hod: true },
  { method: 'DELETE', path: 'demo', handler: removeDemo, hod: true }
];
