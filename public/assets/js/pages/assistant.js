/* EduGuard Assistant: scoped chat, voice mode, weekly actions and student support plans. */
(function () {
  'use strict';

  var EG = window.EG;
  var ui = EG.ui;
  var el = ui.el;
  var pages = EG.pages;
  var icon = ui.icon;

  var STORAGE_KEY = 'eg-assistant-thread';
  var SPEAK_KEY = 'eg-assistant-speak';

  var state = {
    session: null,
    thread: [],
    sending: false,
    listening: false,
    recognition: null,
    autoSpeak: true,
    speakNext: false,
    students: [],
    weekly: null,
    plan: null,
    scroll: null,
    composer: null,
    orb: null,
    voiceStatus: null,
    weeklyHost: null,
    planHost: null,
    planButton: null,
    weeklyButton: null,
    sectionSelect: null,
    studentSelect: null
  };

  function greeting() {
    var name = String((state.session && state.session.user && state.session.user.name) || '').split(' ')[0].replace(/\.$/, '') || 'there';
    return {
      role: 'assistant',
      content: 'Hello ' + name + '. I can help you think through attendance, coursework, assessments and next steps for a class. I only see your assigned students, and I never need a student name. What would you like to work on?'
    };
  }

  function loadThread() {
    try {
      var raw = sessionStorage.getItem(STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed) && parsed.length) return parsed.filter(function (item) {
        return item && (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string';
      }).slice(-30);
    } catch (error) { /* ignore corrupt storage */ }
    return [greeting()];
  }

  function saveThread() {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state.thread.slice(-30)));
    } catch (error) { /* storage may be unavailable */ }
  }

  function messageNode(message) {
    var isUser = message.role === 'user';
    var bubble = el('div', { class: 'chat-bubble', text: message.content });
    var meta = null;
    if (message.offline) {
      meta = el('span', { class: 'pill pill--nodata mt-2', text: 'Offline template' });
    } else if (!isUser) {
      meta = el('button', {
        class: 'btn btn--sm btn--ghost mt-2', type: 'button',
        onClick: function () { speak(message.content); }
      }, el('span', { html: icon('volume', 13) }), 'Read aloud');
    }
    return el('div', { class: 'chat-msg' + (isUser ? ' chat-msg--user' : '') },
      el('div', { class: 'chat-msg__avatar', text: isUser ? ui.initials(state.session.user.name) : 'EG' }),
      el('div', null, bubble, meta)
    );
  }

  function renderThread() {
    if (!state.scroll) return;
    state.scroll.textContent = '';
    state.thread.forEach(function (message) {
      state.scroll.appendChild(messageNode(message));
    });
    if (state.sending) {
      state.scroll.appendChild(el('div', { class: 'chat-msg', id: 'chat-typing' },
        el('div', { class: 'chat-msg__avatar', text: 'EG' }),
        el('div', { class: 'chat-bubble' }, el('span', { class: 'chat-typing' }, el('i'), el('i'), el('i')))
      ));
    }
    scrollBottom();
  }

  function scrollBottom() {
    if (!state.scroll) return;
    state.scroll.scrollTop = state.scroll.scrollHeight;
  }

  function push(message) {
    state.thread.push(message);
    saveThread();
    renderThread();
  }

  function offlineReply(text) {
    var lower = String(text || '').toLowerCase();
    if (lower.indexOf('attendance') !== -1) {
      return 'Start with a short, private conversation about what is making attendance difficult. Agree on one realistic step for the coming week, note it down, and check back after the next class. If attendance has dropped suddenly, ask whether something changed at home or on the journey to school.';
    }
    if (lower.indexOf('mark') !== -1 || lower.indexOf('assessment') !== -1 || lower.indexOf('test') !== -1) {
      return 'Pick the single topic behind the lowest recent assessment and reteach it in a five-minute warm-up. Then use three quick questions to check understanding before moving on. Keep the feedback specific: name what the student did well and one next step.';
    }
    if (lower.indexOf('homework') !== -1 || lower.indexOf('coursework') !== -1 || lower.indexOf('assignment') !== -1) {
      return 'Choose the two most useful missing tasks rather than the whole list. Set a short, visible deadline for each, break the first one into a first step, and check it at the end of the week. A small completed plan is better than a large unfinished one.';
    }
    if (lower.indexOf('parent') !== -1 || lower.indexOf('home') !== -1 || lower.indexOf('family') !== -1) {
      return 'Open with one genuine strength, then describe the pattern without labels. Share one clear next step and ask the family what they have noticed. Keep the message short and invite a reply rather than asking for a meeting straight away.';
    }
    if (lower.indexOf('class') !== -1 || lower.indexOf('section') !== -1) {
      return 'Look at the class pattern before the individual one: which assessment type is lowest, and which section has the widest gap? A ten-minute whole-class reteach often helps more than several separate conversations. Then follow up with the students whose trend is still falling.';
    }
    return 'I can help with attendance, coursework, assessment trends, family conversations and weekly planning. Tell me the year group or subject you are thinking about, and describe what you have noticed so far. Please leave out student names.';
  }

  function send(text, fromVoice) {
    var value = String(text || '').trim();
    if (!value || state.sending) return;
    if (state.composer) state.composer.value = '';
    state.speakNext = Boolean(fromVoice) || state.autoSpeak;
    push({ role: 'user', content: value });
    state.sending = true;
    renderThread();
    var history = state.thread.slice(-12).map(function (item) {
      return { role: item.role, content: item.content };
    });
    EG.api.post('/api/ai', { type: 'voice', messages: history }).then(function (result) {
      var reply = result && result.result && result.result.reply;
      if (!reply) throw new Error('The assistant returned an empty reply.');
      return { reply: reply, offline: false };
    }).catch(function (error) {
      if (error && error.status === 401) return null;
      if (error && error.status === 429) {
        ui.toast('You have reached the AI request limit for this minute. The offline template is being used.', 'info');
      } else if (error && error.status === 503) {
        ui.toast('The AI service is not configured. The offline template is being used.', 'info');
      } else if (error && error.status !== 0) {
        ui.toast('The AI service is unavailable. The offline template is being used.', 'info');
      }
      return { reply: offlineReply(value), offline: true };
    }).then(function (outcome) {
      if (!outcome) return;
      state.sending = false;
      push({ role: 'assistant', content: outcome.reply, offline: outcome.offline });
      if (state.speakNext || (state.autoSpeak && !outcome.offline)) speak(outcome.reply);
    }).finally(function () {
      state.sending = false;
      var typing = document.getElementById('chat-typing');
      if (typing) typing.remove();
      if (state.composer) state.composer.focus();
    });
  }

  function speak(text) {
    if (!EG.voice.speechSupported) {
      ui.toast('Speech playback is not available in this browser.', 'info');
      return;
    }
    var orb = state.orb;
    if (orb) orb.classList.add('is-speaking');
    if (state.voiceStatus) state.voiceStatus.textContent = 'Speaking the reply aloud...';
    EG.voice.speak(text, {
      onEnd: function () {
        if (orb) orb.classList.remove('is-speaking');
        if (state.voiceStatus) state.voiceStatus.textContent = 'Tap the orb to speak, or type below.';
      },
      onError: function () {
        if (orb) orb.classList.remove('is-speaking');
        if (state.voiceStatus) state.voiceStatus.textContent = 'Speech playback stopped.';
      }
    });
  }

  function toggleListening() {
    if (state.listening) {
      if (state.recognition) state.recognition.stop();
      return;
    }
    if (!EG.voice.supported) {
      ui.toast('Voice input is not supported in this browser. Use Chrome, Edge or Safari, or type your message.', 'info');
      return;
    }
    EG.voice.cancel();
    state.recognition = EG.voice.listen({
      onInterim: function (text) {
        if (state.voiceStatus) state.voiceStatus.textContent = text ? 'Hearing: ' + text : 'Listening...';
      },
      onError: function (error) {
        state.listening = false;
        if (state.orb) state.orb.classList.remove('is-listening');
        if (state.voiceStatus) state.voiceStatus.textContent = 'Tap the orb to speak, or type below.';
        ui.toast(error.message, 'error');
      },
      onEnd: function (text) {
        state.listening = false;
        state.recognition = null;
        if (state.orb) state.orb.classList.remove('is-listening');
        if (state.voiceStatus) state.voiceStatus.textContent = 'Tap the orb to speak, or type below.';
        if (text) send(text, true);
      }
    });
    if (!state.recognition) return;
    state.listening = true;
    if (state.orb) state.orb.classList.add('is-listening');
    if (state.voiceStatus) state.voiceStatus.textContent = 'Listening... speak naturally.';
  }

  function weeklyTemplate(counters) {
    var summary = 'Across ' + counters.students + ' students, ' + counters.high + ' need support and ' +
      counters.medium + ' are on the watch list. ' + counters.improved + ' showed a rising assessment trend recently.';
    if (counters.scope) summary += ' This view covers ' + counters.scope + '.';
    var actions = [];
    if (counters.high) actions.push('Choose the two highest-priority students and agree one small step with each this week.');
    if (counters.reasons.length) {
      actions.push('Reteach the most common pattern: ' + counters.reasons[0].label.toLowerCase() + '.');
    }
    if (counters.needsAttention.length) {
      actions.push('Look at ' + counters.needsAttention[0].section + ' first; its flagged share is ' + Math.round(counters.needsAttention[0].flaggedShare) + '%.');
    }
    actions.push('Check attendance for any student whose weekly trend has dropped by 10 points or more.');
    actions.push('After the next assessment, compare the class average with this week and note what changed.');
    actions.push('Share one clear next step with home for the students who are still on the watch list.');
    return { summary: summary, actions: actions.slice(0, 5), offline: true };
  }

  function renderWeekly(result) {
    if (!state.weeklyHost) return;
    state.weeklyHost.textContent = '';
    if (!result) return;
    state.weeklyHost.appendChild(el('div', { class: 'ai-block' },
      el('div', { class: 'row row--between gap-2' },
        el('h3', { text: 'This week in your classes' }),
        result.offline ? el('span', { class: 'pill pill--nodata', text: 'Offline template' }) : el('span', { class: 'pill pill--brand', text: 'AI draft' })
      ),
      el('p', { class: 'mt-2', text: result.summary }),
      el('div', { class: 'mt-3' }, (result.actions || []).map(function (action, index) {
        return el('div', { class: 'ai-step' },
          el('span', { class: 'ai-step__num', text: String(index + 1) }),
          el('span', { text: action })
        );
      })),
      el('div', { class: 'btn-row mt-3' },
        el('button', {
          class: 'btn btn--sm', type: 'button',
          onClick: function () { speak(result.summary + '. ' + (result.actions || []).join('. ')); }
        }, el('span', { html: icon('volume', 13) }), 'Read aloud'),
        el('button', {
          class: 'btn btn--sm btn--ghost', type: 'button',
          onClick: function () {
            pages.copy(result.summary + '\n\n' + (result.actions || []).map(function (line, index) { return (index + 1) + '. ' + line; }).join('\n'));
          }
        }, el('span', { html: icon('copy', 13) }), 'Copy')
      )
    ));
  }

  function weeklyFallback(error) {
    if (error && error.status === 401) return null;
    var sectionId = state.sectionSelect ? state.sectionSelect.value : '';
    return EG.api.get('/api/analytics/dashboard', { sectionId: sectionId || undefined }).then(function (data) {
      var attention = data.needsAttention || [];
      renderWeekly(weeklyTemplate({
        students: data.summary.students,
        high: data.summary.high,
        medium: data.summary.medium,
        improved: data.summary.improved,
        reasons: data.reasons || [],
        needsAttention: attention,
        scope: sectionId ? 'the selected section' : (data.scope && data.scope.mode === 'department' ? 'the whole department' : 'your assigned classes')
      }));
      ui.toast('The AI draft was unavailable, so a local template was used.', 'info');
    }).catch(function (fallbackError) {
      if (fallbackError.status === 401) return;
      if (state.weeklyHost) {
        state.weeklyHost.textContent = '';
        state.weeklyHost.appendChild(ui.errorState(fallbackError, function () { generateWeekly(); }));
      }
    });
  }

  function generateWeekly() {
    if (!state.weeklyHost) return;
    var sectionId = state.sectionSelect ? state.sectionSelect.value : '';
    state.weeklyHost.textContent = '';
    state.weeklyHost.appendChild(el('div', { class: 'skeleton', style: { height: '150px' } }));
    if (state.weeklyButton) pages.busy(state.weeklyButton, EG.api.post('/api/ai', {
      type: 'weekly', sectionId: sectionId || undefined
    }).then(function (result) {
      var payload = result && result.result;
      if (!payload) throw new Error('The assistant returned an empty draft.');
      renderWeekly(payload);
    }).catch(function (error) {
      if (error && error.status === 429) ui.toast('You have reached the AI request limit for this minute.', 'info');
      return weeklyFallback(error);
    }));
  }

  function renderPlan(result) {
    if (!state.planHost) return;
    state.planHost.textContent = '';
    if (!result) return;
    var message = result.parentMessage || {};
    var language = message.hi ? 'hi' : 'en';
    var messageText = el('p', { text: message[language] || '' });
    var enButton = el('button', {
      class: 'chip' + (language === 'en' ? ' is-active' : ''), type: 'button',
      onClick: function () {
        language = 'en';
        messageText.textContent = message.en || '';
        enButton.classList.add('is-active');
        hiButton.classList.remove('is-active');
      }
    }, 'English');
    var hiButton = el('button', {
      class: 'chip' + (language === 'hi' ? ' is-active' : ''), type: 'button',
      onClick: function () {
        language = 'hi';
        messageText.textContent = message.hi || message.en || '';
        hiButton.classList.add('is-active');
        enButton.classList.remove('is-active');
      }
    }, 'Hindi');
    state.planHost.appendChild(el('div', { class: 'ai-block' },
      el('div', { class: 'row row--between gap-2' },
        el('h3', { text: 'Support plan draft' }),
        result.offline ? el('span', { class: 'pill pill--nodata', text: 'Offline template' }) : el('span', { class: 'pill pill--brand', text: 'AI draft' })
      ),
      el('p', { class: 'mt-2', text: result.summary }),
      el('div', { class: 'mt-3' }, (result.plan || []).map(function (step, index) {
        return el('div', { class: 'ai-step' },
          el('span', { class: 'ai-step__num', text: String(index + 1) }),
          el('div', null,
            el('div', { class: 'row row--between gap-2' },
              el('strong', { text: step.step }),
              step.priority ? el('span', { class: 'priority priority--' + String(step.priority).toLowerCase(), text: step.priority }) : null
            ),
            el('div', { class: 'xs muted', text: step.detail })
          )
        );
      })),
      el('div', { class: 'hr-text mt-4', text: 'Message for home' }),
      el('div', { class: 'chips mt-2' }, enButton, message.hi ? hiButton : null),
      messageText,
      el('div', { class: 'btn-row mt-3' },
        el('button', {
          class: 'btn btn--sm', type: 'button',
          onClick: function () { pages.copy(messageText.textContent); }
        }, el('span', { html: icon('copy', 13) }), 'Copy message'),
        el('button', {
          class: 'btn btn--sm btn--ghost', type: 'button',
          onClick: function () { speak(result.summary + '. This is a draft, so please review it before sharing.'); }
        }, el('span', { html: icon('volume', 13) }), 'Read aloud')
      ),
      el('p', { class: 'xs faint mt-2', text: 'This is a draft. Review the wording, then use your own judgement before sharing it.' })
    ));
  }

  function localPlan(report) {
    var analysis = report.analysis || {};
    var factors = (analysis.factors || []).filter(function (item) { return item.tone !== 'positive'; });
    var actions = analysis.actions || [];
    var summary = 'This student currently sits in the ' + (analysis.levelLabel || 'review') + ' band. ' +
      (factors.length ? 'The main pattern is: ' + factors.slice(0, 2).map(function (item) { return item.title.toLowerCase(); }).join(' and ') + '.' : 'No single risk factor stands out.');
    var plan = actions.slice(0, 4).map(function (action) {
      return { step: action.title, detail: action.detail, priority: action.priority };
    });
    if (!plan.length) {
      plan = [{ step: 'Keep the current supports in place', detail: 'Review the full picture after the next assessment.', priority: 'Monitor' }];
    }
    var message = {
      en: 'Thank you for your support at home. ' + (factors[0] ? 'We are focusing on ' + factors[0].title.toLowerCase() + ' this week. ' : '') + 'The next step is small and practical: ' + (plan[0] ? plan[0].detail : 'keep the current routine going') + ' We would be glad to hear what you have noticed as well.',
      hi: 'घर पर आपके सहयोग के लिए धन्यवाद। इस सप्ताह हम ' + (factors[0] ? factors[0].title.toLowerCase() : 'नियमित अभ्यास') + ' पर ध्यान दे रहे हैं। अगला कदम छोटा और व्यावहारिक है: ' + (plan[0] ? plan[0].detail : 'मौजूदा दिनचर्या जारी रखें') + ' आपने क्या देखा है, यह जानना हमारे लिए उपयोगी होगा।'
    };
    return { summary: summary, plan: plan, parentMessage: message, offline: true };
  }

  function planFallback(studentId) {
    return EG.api.get('/api/reports/student/' + encodeURIComponent(studentId)).then(function (report) {
      if (!report.analysis || !report.analysis.hasData) {
        renderPlan({
          summary: 'There is not enough recorded data for this student yet. Enter a few marks and attendance records, then try again.',
          plan: [{ step: 'Record the next assessment', detail: 'A single recent assessment will make the support plan useful.', priority: 'Soon' }],
          parentMessage: { en: 'We are still building a clear picture of how things are going and will share an update soon.', hi: 'हम अभी तस्वीर साफ कर रहे हैं और जल्द ही आपको जानकारी देंगे।' },
          offline: true
        });
        return;
      }
      renderPlan(localPlan(report));
      ui.toast('The AI draft was unavailable, so a local template was used.', 'info');
    }).catch(function (error) {
      if (error.status === 401) return;
      if (state.planHost) {
        state.planHost.textContent = '';
        state.planHost.appendChild(ui.errorState(error, function () { generatePlan(); }));
      }
    });
  }

  function generatePlan() {
    var studentId = state.studentSelect ? state.studentSelect.value : '';
    if (!studentId) {
      ui.toast('Choose a student first.', 'info');
      return;
    }
    if (!state.planHost) return;
    state.planHost.textContent = '';
    state.planHost.appendChild(el('div', { class: 'skeleton', style: { height: '170px' } }));
    if (state.planButton) pages.busy(state.planButton, EG.api.post('/api/ai', {
      type: 'student', studentId: studentId
    }).then(function (result) {
      var payload = result && result.result;
      if (!payload) throw new Error('The assistant returned an empty plan.');
      renderPlan(payload);
    }).catch(function (error) {
      if (error && error.status === 401) return;
      if (error && error.status === 429) ui.toast('You have reached the AI request limit for this minute.', 'info');
      return planFallback(studentId);
    }));
  }

  function loadStudents() {
    return EG.api.get('/api/students', { limit: 100, sort: 'name', direction: 'asc' }).then(function (data) {
      state.students = data.rows || [];
      if (!state.studentSelect) return;
      state.students.forEach(function (student) {
        state.studentSelect.appendChild(el('option', {
          value: student.id,
          text: student.name + ' - ' + student.roll + ' (' + student.sectionName + ')'
        }));
      });
    }).catch(function (error) {
      if (error.status === 401) return;
      ui.toast('The student list could not be loaded. Try refreshing the page.', 'error');
    });
  }

  function buildQuickPrompts() {
    var prompts = [
      'Attendance has dropped in one of my classes. Where should I start?',
      'How can I plan a short catch-up for missing coursework?',
      'Suggest a warm message to a parent about falling marks.',
      'What should I review after a low assessment?'
    ];
    return el('div', { class: 'chips' }, prompts.map(function (prompt) {
      return el('button', {
        class: 'chip', type: 'button',
        onClick: function () { send(prompt, false); }
      }, prompt);
    }));
  }

  pages.guard(function (session) {
    state.session = session;
    try {
      state.autoSpeak = localStorage.getItem(SPEAK_KEY) !== 'false';
    } catch (error) { state.autoSpeak = true; }
    state.thread = loadThread();

    state.scroll = el('div', { class: 'chat-scroll', id: 'chat-scroll', 'aria-live': 'polite', 'aria-label': 'Conversation' });
    state.composer = el('input', {
      class: 'input', type: 'text', placeholder: 'Ask about attendance, marks or next steps...',
      'aria-label': 'Message the assistant', autocomplete: 'off', maxlength: 600
    });
    state.composer.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        send(state.composer.value, false);
      }
    });

    var sendButton = el('button', { class: 'btn btn--primary', type: 'button', onClick: function () { send(state.composer.value, false); } },
      el('span', { html: icon('send', 15) }), 'Send');
    var micButton = el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Start voice input', title: 'Speak to the assistant', onClick: toggleListening },
      el('span', { html: icon('mic') }));

    var chat = el('div', { class: 'chat-window' },
      el('div', { class: 'card__head' },
        el('div', null,
          el('h2', { text: 'Conversation' }),
          el('p', { text: 'Answers are grounded in your assigned scope. Do not share student names.' })
        ),
        el('button', {
          class: 'btn btn--sm btn--ghost', type: 'button',
          onClick: function () {
            state.thread = [greeting()];
            saveThread();
            renderThread();
            EG.voice.cancel();
          }
        }, el('span', { html: icon('refresh', 13) }), 'New chat')
      ),
      state.scroll,
      el('div', { class: 'chat-input-row' }, micButton, state.composer, sendButton)
    );

    state.orb = el('button', { class: 'voice-orb', type: 'button', 'aria-label': 'Start voice mode', onClick: toggleListening },
      el('span', { html: icon('mic', 44) })
    );
    state.voiceStatus = el('p', { class: 'small muted', text: 'Tap the orb to speak, or type below.' });

    var speakToggle = el('label', { class: 'switch' },
      el('input', {
        type: 'checkbox', checked: state.autoSpeak,
        onChange: function (event) {
          state.autoSpeak = event.target.checked;
          try { localStorage.setItem(SPEAK_KEY, state.autoSpeak ? 'true' : 'false'); } catch (error) { /* ignore */ }
          if (!state.autoSpeak) EG.voice.cancel();
        }
      }),
      el('span', { class: 'switch__track' }),
      el('span', { text: 'Speak replies aloud' })
    );

    var voiceCard = pages.card({
      title: 'Voice mode',
      subtitle: 'Hands-free questions and spoken replies',
      body: el('div', { class: 'voice-panel' },
        state.orb,
        state.voiceStatus,
        el('div', { class: 'callout xs' }, EG.voice.supported
          ? 'Voice input uses your browser speech service. Audio is transcribed locally by the browser; only the text is sent.'
          : 'Voice input is not supported in this browser. Type your question instead; spoken replies may still work.'),
        speakToggle
      )
    });

    state.sectionSelect = pages.select([{ value: '', label: 'All my classes' }].concat(pages.sections().map(function (section) {
      return { value: section.id, label: section.name };
    })), { value: '' });
    state.weeklyButton = el('button', { class: 'btn btn--sm btn--primary', type: 'button', onClick: generateWeekly },
      el('span', { html: icon('sparkles', 13) }), 'Draft actions');
    state.weeklyHost = el('div', { class: 'stack--sm' });
    var weeklyCard = pages.card({
      title: 'Weekly actions',
      subtitle: 'A short, practical class summary',
      body: el('div', { class: 'stack' },
        el('div', { class: 'row row--wrap gap-2' }, el('div', { class: 'field grow' }, el('label', { text: 'Section' }), state.sectionSelect), state.weeklyButton),
        state.weeklyHost
      )
    });

    state.studentSelect = el('select', { class: 'select', 'aria-label': 'Student' });
    state.studentSelect.appendChild(el('option', { value: '', text: 'Choose a student...' }));
    state.planButton = el('button', { class: 'btn btn--sm btn--primary', type: 'button', onClick: generatePlan },
      el('span', { html: icon('sparkles', 13) }), 'Draft plan');
    state.planHost = el('div', { class: 'stack--sm' });
    var planCard = pages.card({
      title: 'Student support plan',
      subtitle: 'Uses anonymous signals only',
      body: el('div', { class: 'stack' },
        el('div', { class: 'field' }, el('label', { text: 'Student' }), state.studentSelect),
        el('div', { class: 'btn-row' }, state.planButton),
        state.planHost
      )
    });

    var privacyCard = pages.card({
      title: 'Privacy by design',
      className: 'card--accent',
      body: el('div', { class: 'stack--sm small muted' },
        el('p', { text: 'EduGuard sends only anonymous numbers and your typed text to the AI provider. Names, roll numbers and section labels are removed first.' }),
        el('p', { text: 'AI output is a draft, not a decision. Check it against what you know about the student before acting on it.' }),
        el('p', { class: 'xs faint', text: 'AI requests are limited to 20 per minute and require a signed-in session.' })
      )
    });

    pages.mount({
      title: 'EduGuard Assistant',
      subtitle: 'Think through a class, a student or a family conversation with a private assistant.',
      actions: el('div', { class: 'btn-row' },
        el('a', { class: 'btn btn--sm', href: '/dashboard' }, el('span', { html: icon('dashboard', 13) }), 'Dashboard')
      ),
      content: el('div', { class: 'stack' },
        buildQuickPrompts(),
        el('div', { class: 'assistant-grid' },
          chat,
          el('div', { class: 'stack' }, voiceCard, weeklyCard, planCard, privacyCard)
        )
      )
    });

    renderThread();
    state.scroll.scrollTop = state.scroll.scrollHeight;
    loadStudents();
    return Promise.resolve();
  });
})();
