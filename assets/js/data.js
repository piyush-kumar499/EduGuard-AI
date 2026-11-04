export const CONFIG = {
  className: 'Class 10',
  subjects: ['Maths', 'Physics', 'Chemistry', 'English', 'Computer Science'],
  tests: ['T1', 'T2', 'T3'],
  testWeights: { T1: 0.2, T2: 0.3, T3: 0.5 },
  scoreWeights: { attendance: 0.35, assignments: 0.25, marks: 0.4 },
  thresholds: {
    onTrack: 70,
    watch: 50,
    attendanceWatch: 85,
    attendanceConcern: 75,
    assignmentWatch: 80,
    assignmentConcern: 65,
    marksWatch: 65,
    marksConcern: 50,
    attendanceDrop: 10
  }
};

export const LEVELS = {
  high: { label: 'Needs support', short: 'High', tone: 'red' },
  medium: { label: 'Watch closely', short: 'Medium', tone: 'amber' },
  low: { label: 'On track', short: 'Low', tone: 'green' }
};

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

function random(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) | 0;
    let result = Math.imul(value ^ (value >>> 15), 1 | value);
    result = (result + Math.imul(result ^ (result >>> 7), 61 | result)) ^ result;
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, number(value)));
}

export function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(number(value) * factor) / factor;
}

export function average(values) {
  return values.length ? values.reduce((total, value) => total + number(value), 0) / values.length : 0;
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
  const drift = trend === 'falling' ? { T1: 8, T2: 3, T3: 0 } :
    trend === 'improving' ? { T1: -8, T2: -3, T3: 0 } :
      { T1: 0, T2: 0, T3: 0 };
  const offsets = CONFIG.subjects.map(() => rand() * 10 - 5);
  return Object.fromEntries(CONFIG.tests.map((test) => [test, Object.fromEntries(
    CONFIG.subjects.map((subject, index) => [subject, Math.round(clamp(base + offsets[index] + drift[test] + rand() * 4 - 2, 5, 100))])
  )]));
}

export function createDemoStudents() {
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
    const trend = band === 'high' ? (trendRoll < 0.45 ? 'falling' : trendRoll < 0.68 ? 'volatile' : 'steady') :
      band === 'medium' ? (trendRoll < 0.35 ? 'falling' : trendRoll < 0.58 ? 'improving' : 'steady') :
        (trendRoll < 0.18 ? 'improving' : 'steady');
    const weeks = buildWeeks(rand, ranges.attendance[0] + rand() * (ranges.attendance[1] - ranges.attendance[0]), trend);
    const marks = buildMarks(rand, ranges.marks[0] + rand() * (ranges.marks[1] - ranges.marks[0]), trend);
    return {
      id: `demo-${String(index + 1).padStart(2, '0')}`,
      name,
      roll: `S-${String(index + 1).padStart(2, '0')}`,
      section: ['A', 'B', 'C'][Math.floor(index / 20)],
      attendance: { overall: Math.round(average(weeks)), weeks },
      assignments: Math.round(ranges.assignments[0] + rand() * (ranges.assignments[1] - ranges.assignments[0])),
      marks
    };
  });
}

function parseRows(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const source = String(text || '').replace(/^\uFEFF/, '');
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[index + 1] === '\n') index += 1;
      row.push(field); field = '';
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
    } else field += char;
  }
  if (quoted) throw new Error('A quotation mark is not closed.');
  row.push(field);
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}

const aliases = {
  name: ['name', 'student', 'studentname', 'fullname'],
  roll: ['roll', 'rollno', 'rollnumber', 'id', 'studentid'],
  section: ['section', 'class', 'sec'],
  attendance: ['attendance', 'attendancepct', 'attendancepercent'],
  assignments: ['assignments', 'assignment', 'assignmentcompletion'],
  marks: ['marks', 'averagemarks', 'avgmarks', 'score', 'percentage']
};

function headerKey(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

export function parseStudentCSV(text) {
  const rows = parseRows(text);
  if (rows.length < 2) throw new Error('Add a header row and at least one student.');
  const headers = Object.fromEntries(rows[0].map((value, index) => [headerKey(value), index]));
  const find = (names) => names.map(headerKey).map((name) => headers[name]).find((index) => index !== undefined) ?? -1;
  const columns = Object.fromEntries(Object.entries(aliases).map(([key, names]) => [key, find(names)]));
  const missing = ['name', 'roll', 'section', 'attendance', 'assignments'].filter((key) => columns[key] < 0);
  if (missing.length) throw new Error(`Missing required columns: ${missing.join(', ')}.`);

  const subjectColumns = Object.fromEntries(CONFIG.subjects.map((subject) => [subject, find([subject, subject.replace(/\s/g, ''), subject.replace('Computer Science', 'computer_science')])]));
  const testColumns = Object.fromEntries(CONFIG.tests.map((test) => [test, find([test, `test${test.slice(1)}`, `marks${test.slice(1)}`])]));
  const students = [];
  const errors = [];

  const readNumber = (row, index, label, line) => {
    const raw = String(index >= 0 ? row[index] || '' : '').trim().replace('%', '');
    const value = Number(raw);
    if (!raw || !Number.isFinite(value) || value < 0 || value > 100) {
      errors.push(`Row ${line}: ${label} must be a number from 0 to 100.`);
      return null;
    }
    return round(value);
  };

  rows.slice(1).forEach((row, rowIndex) => {
    const line = rowIndex + 2;
    const name = String(row[columns.name] || '').trim();
    const roll = String(row[columns.roll] || '').trim();
    const section = String(row[columns.section] || '').trim().replace(/^(section|class)\s+/i, '').toUpperCase();
    const attendance = readNumber(row, columns.attendance, 'attendance', line);
    const assignments = readNumber(row, columns.assignments, 'assignments', line);
    if (!name || !roll || !section || attendance === null || assignments === null) {
      if (!name) errors.push(`Row ${line}: name is empty.`);
      if (!roll) errors.push(`Row ${line}: roll number is empty.`);
      if (!section) errors.push(`Row ${line}: section is empty.`);
      return;
    }
    const optionalNumber = (index, label) => index < 0 ? null : readNumber(row, index, label, line);
    const subjectValues = Object.fromEntries(CONFIG.subjects.map((subject) => [subject, optionalNumber(subjectColumns[subject], subject)]).filter(([, value]) => value !== null));
    const testValues = Object.fromEntries(CONFIG.tests.map((test) => [test, optionalNumber(testColumns[test], test)]).filter(([, value]) => value !== null));
    const singleMarks = optionalNumber(columns.marks, 'marks');
    const hasMarks = singleMarks !== null || Object.values(subjectValues).length > 0 || Object.values(testValues).length > 0;
    const fallback = singleMarks ?? (Object.values(subjectValues).length ? average(Object.values(subjectValues)) : testValues.T3 ?? average(Object.values(testValues)));
    if (!hasMarks) { errors.push(`Row ${line}: add a marks column or subject/test marks.`); return; }
    const weeks = [1, 2, 3, 4].map((week) => find([`attendance_w${week}`, `attendanceweek${week}`, `week${week}`]));
    const weekly = weeks.every((index) => index >= 0) ? weeks.map((index) => readNumber(row, index, 'weekly attendance', line)) : [attendance + 3, attendance + 2, attendance + 1, attendance].map((value) => clamp(value));
    const marks = Object.fromEntries(CONFIG.tests.map((test) => {
      const shift = testValues[test] === undefined || testValues.T3 === undefined ? 0 : testValues[test] - testValues.T3;
      return [test, Object.fromEntries(CONFIG.subjects.map((subject) => [subject, clamp((subjectValues[subject] ?? fallback) + shift)]))];
    }));
    students.push({ id: `upload-${String(rowIndex + 1).padStart(3, '0')}`, name: name.slice(0, 80), roll: roll.slice(0, 30), section: section.slice(0, 10), attendance: { overall: attendance, weeks: weekly }, assignments, marks });
  });
  if (errors.length) throw new Error(errors.slice(0, 8).join(' '));
  if (!students.length) throw new Error('No valid student rows were found.');
  return students;
}

export const SAMPLE_CSV = [
  'name,roll,section,attendance,assignments,t1,t2,t3,maths,physics,chemistry,english,computer_science',
  'Meera Iyer,S-01,A,96,93,76,82,88,84,80,86,90,92',
  'Rohan Das,S-02,A,61,52,54,47,41,42,36,44,52,48',
  'Aisha Khan,S-03,A,88,74,68,72,77,70,66,74,82,80'
].join('\n');
