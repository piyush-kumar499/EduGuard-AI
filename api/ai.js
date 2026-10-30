/**
 * Vercel serverless endpoint for the dashboard's AI support plan and weekly
 * summary. The browser never sees the API key: only this function reads it.
 *
 * Default provider: Anthropic Messages API
 * Optional provider: Groq (OpenAI-compatible) when AI_PROVIDER=groq.
 * Optional provider: xAI / Grok (OpenAI-compatible) when AI_PROVIDER=grok or
 * the model name starts with "grok".
 */

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const XAI_URL = 'https://api.x.ai/v1/chat/completions';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
// Groq retired llama-3.3-70b-versatile and llama-3.1-8b-instant on 16 Aug 2026.
const DEFAULT_GROQ_MODEL = 'openai/gpt-oss-120b';
const GROQ_MODEL_REPLACEMENTS = {
  'llama-3.3-70b-versatile': 'openai/gpt-oss-120b',
  'llama-3.1-8b-instant': 'openai/gpt-oss-20b'
};

const SYSTEM_PROMPT = [
  'You are a careful school support assistant helping a teacher plan next steps.',
  'Use soft, respectful wording such as "needs support" rather than labels.',
  'Never diagnose, never mention a student name, and never invent facts.',
  'Keep advice practical, short, and possible within a normal school week.',
  'Return strict JSON only. Do not wrap it in markdown fences or add commentary.'
].join(' ');

function number(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : (fallback || 0);
}

function cleanText(value, maxLength) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, maxLength || 200);
}

function sanitiseStudent(raw) {
  const data = raw && typeof raw === 'object' ? raw : {};
  const reasons = Array.isArray(data.reasons) ? data.reasons.slice(0, 5).map(function (item) {
    return {
      reason: cleanText(item && item.reason, 120),
      impact: number(item && item.impact, 0)
    };
  }).filter(function (item) { return item.reason; }) : [];

  return {
    roll: cleanText(data.roll, 20),
    section: cleanText(data.section, 6),
    attendance: number(data.attendance),
    attendanceTrend: number(data.attendanceTrend),
    assignments: number(data.assignments),
    avgMarks: number(data.avgMarks),
    t1: number(data.t1),
    t2: number(data.t2),
    t3: number(data.t3),
    testSlope: number(data.testSlope),
    latestTest: number(data.latestTest),
    score: number(data.score),
    riskLevel: ['high', 'medium', 'low'].indexOf(data.riskLevel) !== -1 ? data.riskLevel : 'medium',
    forecast: number(data.forecast),
    urgentPending: number(data.urgentPending),
    reasons: reasons
  };
}

function sanitiseWeekly(raw) {
  const data = raw && typeof raw === 'object' ? raw : {};
  const reasons = Array.isArray(data.topReasons) ? data.topReasons.slice(0, 6).map(function (item) {
    return {
      reason: cleanText(item && item.reason, 80),
      count: number(item && item.count, 0)
    };
  }).filter(function (item) { return item.reason; }) : [];

  return {
    scope: cleanText(data.scope, 40) || 'all sections',
    total: number(data.total),
    high: number(data.high),
    medium: number(data.medium),
    low: number(data.low),
    improved: number(data.improved),
    topReasons: reasons
  };
}

function buildPrompt(body) {
  if (body.type === 'student') {
    const student = sanitiseStudent(body.student);
    return [
      'Create a support plan for one student using only the anonymous data below.',
      'Data: ' + JSON.stringify(student),
      '',
      'Return strict JSON with exactly this shape:',
      '{"summary":"2-3 sentences for the teacher",' +
        '"plan":[{"step":"short action title","detail":"1-2 practical sentences","priority":"Urgent|Soon|Monitor"}],' +
        '"parentMessage":{"en":"warm parent message in English","hi":"same message in natural Hindi (Devanagari)"}}',
      '',
      'Rules:',
      '- Use 3 to 4 plan steps, ordered by priority.',
      '- The summary should explain the main pattern without blaming the student.',
      '- The parent message should be warm, factual, 3-5 sentences, and include one strength and one next step.',
      '- Do not include a name, diagnosis, or certainty about the future.',
      '- The forecast is only a prompt for support, not a prediction of failure.'
    ].join('\n');
  }

  const summary = sanitiseWeekly(body.class);
  return [
    'Create a class-level weekly summary using only anonymous counts and reasons.',
    'Data: ' + JSON.stringify(summary),
    '',
    'Return strict JSON with exactly this shape:',
    '{"summary":"2-3 sentences for the teacher","actions":["action 1","action 2","action 3","action 4","action 5"]}',
    '',
    'Rules:',
    '- Exactly 5 short action lines.',
    '- Keep each action practical for the coming week.',
    '- Use soft wording and never mention a student name.',
    '- No diagnosis and no certainty about outcomes.'
  ].join('\n');
}

function extractJson(text) {
  const source = String(text == null ? '' : text).trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    return JSON.parse(source);
  } catch (error) {
    const start = source.indexOf('{');
    const end = source.lastIndexOf('}');
    if (start === -1 || end <= start) throw new Error('AI response was not JSON');
    return JSON.parse(source.slice(start, end + 1));
  }
}

function validateResult(type, result) {
  if (!result || typeof result !== 'object') throw new Error('AI response was empty');

  if (type === 'student') {
    if (typeof result.summary !== 'string' || !result.summary.trim()) throw new Error('AI summary missing');
    if (!Array.isArray(result.plan) || !result.plan.length) throw new Error('AI plan missing');
    if (!result.parentMessage) throw new Error('AI parent message missing');
    result.plan = result.plan.slice(0, 4);
    return result;
  }

  return normaliseWeekly(result);
}

/**
 * Weekly answers come back in slightly different shapes depending on the
 * model (strings, objects, "steps" instead of "actions"). Normalise all of
 * them to { summary, actions: [string] } so the dashboard always has text.
 */
function normaliseWeekly(result) {
  const summary = cleanText(result.summary || result.overview || result.headline, 600) ||
    'Suggested actions for the coming week, based on the class-level counts.';

  let list = result.actions || result.steps || result.plan ||
    result.suggestions || result.recommendations || result.items;
  if (typeof list === 'string') list = [list];
  if (!Array.isArray(list)) list = [];

  const actions = list.map(function (item) {
    if (typeof item === 'string') return cleanText(item, 220);
    if (item && typeof item === 'object') {
      return cleanText(item.action || item.step || item.title || item.text || item.detail || item.description, 220);
    }
    return '';
  }).filter(Boolean).slice(0, 5);

  if (!actions.length) throw new Error('AI actions missing');
  return { summary: summary, actions: actions };
}

async function callAnthropic(key, model, prompt) {
  const controller = new AbortController();
  const timer = setTimeout(function () { controller.abort(); }, 7500);
  try {
    const response = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: model,
        max_tokens: 1200,
        temperature: 0.3,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }]
      }),
      signal: controller.signal
    });

    const data = await response.json().catch(function () { return null; });
    if (!response.ok) {
      const message = data && data.error && data.error.message ? data.error.message : 'Anthropic request failed';
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }
    const blocks = data && Array.isArray(data.content) ? data.content : [];
    const text = blocks.filter(function (block) { return block.type === 'text'; }).map(function (block) { return block.text; }).join('\n');
    if (!text.trim()) throw new Error('Anthropic returned no text');
    return text;
  } finally {
    clearTimeout(timer);
  }
}

async function callXai(key, model, prompt) {
  const controller = new AbortController();
  const timer = setTimeout(function () { controller.abort(); }, 7500);
  try {
    const response = await fetch(XAI_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer ' + key
      },
      body: JSON.stringify({
        model: model,
        temperature: 0.3,
        max_tokens: 1200,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt }
        ]
      }),
      signal: controller.signal
    });

    const data = await response.json().catch(function () { return null; });
    if (!response.ok) {
      const message = data && data.error && data.error.message ? data.error.message : 'Grok request failed';
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }
    const text = data && data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content
      : '';
    if (!text || !String(text).trim()) throw new Error('Grok returned no text');
    return String(text);
  } finally {
    clearTimeout(timer);
  }
}

function isMissingModel(error) {
  if (!error) return false;
  if (error.status === 404) return true;
  const message = String(error.message || '');
  return /model/i.test(message) &&
    /(does not exist|not exist|not found|decommission|deprecat|no access|do not have access)/i.test(message);
}

async function callGroq(key, model, prompt) {
  const controller = new AbortController();
  const timer = setTimeout(function () { controller.abort(); }, 7500);

  const send = function (modelName, full) {
    const payload = {
      model: modelName,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt }
      ]
    };
    if (full) {
      payload.temperature = 0.3;
      payload.response_format = { type: 'json_object' };
    }
    // gpt-oss models expect max_completion_tokens; older models use max_tokens.
    if (/gpt-oss/i.test(modelName)) payload.max_completion_tokens = 1500;
    else payload.max_tokens = 1200;

    return fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer ' + key
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    }).then(function (response) {
      return response.json().catch(function () { return null; }).then(function (data) {
        if (!response.ok) {
          const message = data && data.error && data.error.message ? data.error.message : 'Groq request failed (' + response.status + ')';
          const error = new Error(message);
          error.status = response.status;
          throw error;
        }
        const text = data && data.choices && data.choices[0] && data.choices[0].message
          ? data.choices[0].message.content
          : '';
        if (!text || !String(text).trim()) throw new Error('Groq returned no text');
        return String(text);
      });
    });
  };

  const run = async function (modelName) {
    try {
      return await send(modelName, true);
    } catch (error) {
      // Some models reject JSON mode or temperature with a 400. Retry once
      // with only the required fields.
      if (error.status === 400 && !isMissingModel(error)) {
        return await send(modelName, false);
      }
      throw error;
    }
  };

  try {
    try {
      return await run(model);
    } catch (error) {
      if (!isMissingModel(error)) throw error;
      const replacement = GROQ_MODEL_REPLACEMENTS[model] || DEFAULT_GROQ_MODEL;
      if (replacement === model) throw error;
      console.warn('[api/ai] Groq model "' + model + '" is unavailable; retrying with "' + replacement + '".');
      return await run(replacement);
    }
  } finally {
    clearTimeout(timer);
  }
}

module.exports = async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');

  if (request.method === 'OPTIONS') {
    response.status(204).end();
    return;
  }
  if (request.method !== 'POST') {
    response.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  const provider = String(process.env.AI_PROVIDER || '').toLowerCase();
  const key = process.env.AI_API_KEY || process.env.GROQ_API_KEY || process.env.XAI_API_KEY;
  const model = process.env.AI_MODEL ||
    (provider === 'groq' ? DEFAULT_GROQ_MODEL : 'claude-sonnet-5-5');
  if (!key) {
    response.status(503).json({ ok: false, error: 'AI_API_KEY is not configured' });
    return;
  }

  let body = request.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (error) { body = null; }
  }
  if (!body || (body.type !== 'student' && body.type !== 'weekly')) {
    response.status(400).json({ ok: false, error: 'Expected type "student" or "weekly"' });
    return;
  }

  const isGroq = provider === 'groq';
  const isGrok = provider === 'grok' || provider === 'xai' || /^grok/i.test(model);

  const runProvider = function (promptText) {
    if (isGroq) return callGroq(key, model, promptText);
    if (isGrok) return callXai(key, model, promptText);
    return callAnthropic(key, model, promptText);
  };

  try {
    const prompt = buildPrompt(body);
    let text;
    try {
      text = await runProvider(prompt);
    } catch (error) {
      const status = error && error.status;
      const retriable = status === 429 || (status >= 500 && status <= 599);
      if (!retriable || (error && error.name === 'AbortError')) throw error;
      // Free tiers often rate-limit for a second or two. One quick retry
      // usually succeeds and still fits inside the 8s dashboard timeout.
      await new Promise(function (resolve) { setTimeout(resolve, 700); });
      text = await runProvider(prompt);
    }
    const parsed = extractJson(text);
    const shaped = Array.isArray(parsed) && body.type === 'weekly' ? { actions: parsed } : parsed;
    const result = validateResult(body.type, shaped);
    response.status(200).json({ ok: true, result: result });
  } catch (error) {
    const reason = error && error.message ? error.message : 'Unknown error';
    console.error('[api/ai] ' + (body && body.type) + ' request failed:', reason);
    response.status(502).json({
      ok: false,
      error: 'The AI service could not complete that request. The dashboard will show its offline template.',
      detail: cleanText(reason, 180)
    });
  }
};
