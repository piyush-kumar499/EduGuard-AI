/* Browser voice helpers: speech recognition and speech synthesis with safe fallbacks. */
(function () {
  'use strict';

  var EG = window.EG = window.EG || {};
  var Recognition = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  var synthesis = window.speechSynthesis || null;

  var active = null;
  var speaking = false;

  var ERROR_TEXT = {
    'not-allowed': 'Microphone access was blocked. Allow the microphone in your browser settings and try again.',
    'service-not-allowed': 'Speech recognition is not available in this browser. Type your message instead.',
    'audio-capture': 'No microphone was found. Connect one and try again.',
    'no-speech': 'I did not catch that. Try speaking a little closer to the microphone.',
    network: 'The voice service could not be reached. Check your connection and try again.',
    aborted: 'Voice input stopped.'
  };

  function listen(options) {
    options = options || {};
    if (!Recognition) {
      var unsupported = new Error('Voice input is not supported in this browser. Use Chrome, Edge or Safari, or type instead.');
      if (options.onError) options.onError(unsupported);
      return null;
    }
    stopListening();
    var recognition = new Recognition();
    recognition.lang = options.lang || 'en-IN';
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    var finalText = '';
    var settled = false;
    var handle = {
      stop: function () {
        try { recognition.stop(); } catch (error) { /* already stopped */ }
      },
      abort: function () {
        settled = true;
        try { recognition.abort(); } catch (error) { /* already stopped */ }
        if (active === handle) active = null;
      }
    };

    function finish(text, withError) {
      if (settled) return;
      settled = true;
      if (active === handle) active = null;
      if (options.onEnd) options.onEnd(String(text || '').trim(), !withError);
    }

    recognition.onresult = function (event) {
      var interim = '';
      for (var index = event.resultIndex; index < event.results.length; index += 1) {
        var result = event.results[index];
        var text = result[0] ? result[0].transcript : '';
        if (result.isFinal) finalText += text;
        else interim += text;
      }
      if (options.onInterim) options.onInterim((finalText + ' ' + interim).trim());
    };

    recognition.onerror = function (event) {
      var message = ERROR_TEXT[event.error] || 'Voice input stopped unexpectedly. Please try again.';
      if (event.error === 'aborted') {
        finish(finalText, false);
        return;
      }
      if (options.onError) options.onError(new Error(message));
      finish(finalText, true);
    };

    recognition.onend = function () {
      finish(finalText, false);
    };

    try {
      recognition.start();
    } catch (error) {
      if (options.onError) options.onError(new Error('Voice input could not start. Wait a moment and try again.'));
      return null;
    }
    active = handle;
    return handle;
  }

  function stopListening() {
    if (active) {
      var current = active;
      current.abort();
      active = null;
    }
  }

  function stopSpeaking() {
    if (!synthesis) return;
    try { synthesis.cancel(); } catch (error) { /* ignore */ }
    speaking = false;
  }

  function preferredVoice() {
    if (!synthesis || !synthesis.getVoices) return null;
    var voices = synthesis.getVoices() || [];
    var priorities = ['en-IN', 'en-GB', 'en-US', 'en-AU'];
    for (var index = 0; index < priorities.length; index += 1) {
      var match = voices.filter(function (voice) { return voice.lang === priorities[index]; })[0];
      if (match) return match;
    }
    return voices.filter(function (voice) { return /^en/i.test(voice.lang); })[0] || null;
  }

  function speak(text, options) {
    options = options || {};
    if (!synthesis || !text) {
      if (options.onError) options.onError(new Error('Speech playback is not available in this browser.'));
      return false;
    }
    stopSpeaking();
    var utterance = new SpeechSynthesisUtterance(String(text).replace(/\s+/g, ' ').trim().slice(0, 1200));
    utterance.lang = options.lang || 'en-IN';
    utterance.rate = options.rate || 1;
    utterance.pitch = options.pitch || 1;
    utterance.volume = 1;
    var voice = preferredVoice();
    if (voice) utterance.voice = voice;
    utterance.onstart = function () {
      speaking = true;
      if (options.onStart) options.onStart();
    };
    utterance.onend = function () {
      speaking = false;
      if (options.onEnd) options.onEnd();
    };
    utterance.onerror = function (event) {
      speaking = false;
      if (event && event.error === 'interrupted') return;
      if (options.onError) options.onError(new Error('Speech playback stopped.'));
    };
    try {
      synthesis.speak(utterance);
      return true;
    } catch (error) {
      speaking = false;
      if (options.onError) options.onError(new Error('Speech playback could not start.'));
      return false;
    }
  }

  EG.voice = {
    supported: Boolean(Recognition),
    speechSupported: Boolean(synthesis),
    listen: listen,
    stop: stopListening,
    speak: speak,
    cancel: stopSpeaking,
    isListening: function () { return Boolean(active); },
    isSpeaking: function () { return speaking; }
  };
})();
