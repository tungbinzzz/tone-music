const state = {
  config: null,
  midiPorts: [],
  midiInputPorts: [],
  currentKey: '',
  activeVideoId: '',
  analyzerRunning: false,
  pendingToneEvent: null,
  latestRenderedToneId: 0,
  latestToneId: 0,
  frameCount: 0,
  lastToneLogAt: 0,
  lastLoggedKey: '',
  lastAutoSentKey: '',
  lastScaleFeedbackValue: null,
  timers: new Map(),
  suppressedPulseFeedbackUntil: new Map(),
  lastMidiFeedbackByControl: new Map(),
  activeSliderKeys: new Map(),
  midiButtonValues: new Map(),
  controlValues: new Map()
};

const $ = (selector) => document.querySelector(selector);

function on(selector, eventName, handler) {
  const element = $(selector);
  if (element) {
    element.addEventListener(eventName, handler);
  }
}

const KEY_TO_INDEX = {
  C: 0,
  'C#': 12,
  Db: 12,
  D: 23,
  'D#': 35,
  Eb: 35,
  E: 46,
  F: 58,
  'F#': 69,
  Gb: 69,
  G: 81,
  'G#': 92,
  Ab: 92,
  A: 104,
  'A#': 115,
  Bb: 115,
  B: 126
};

const KEY_CC_CONTROL = 17;
const SCALE_CC_CONTROL = 18;
const KEY_CC_MAX = 126;
const SCALE_CC_MAX = 116;
const MIDI_SYNC_REQUEST_CC = 119;

const SCALE_VALUE_BY_NAME = {
  major: 0,
  minor: 5,
  chromatic: 9,
  'ling lun': 14,
  "scholar's lute": 18,
  'greek diatonic': 23,
  'greek chromatic': 27,
  'greek enharmonic': 32,
  pythagorean: 36,
  'just (major)': 41,
  'just (minor)': 45,
  'meantone chromatic': 50,
  'werckmeister i (iii)': 54,
  'vallotti & young': 59,
  'barnes-bach': 64,
  indian: 68,
  slendro: 73,
  pelog: 77,
  'arabic 1': 82,
  'arabic 2': 86,
  '19 tone': 91,
  '24 tone': 95,
  '31 tone': 100,
  '53 tone': 104,
  partch: 109,
  'carlos a': 113,
  'carlos b': 116,
  'carlos g': 116,
  harmonic: 116
};

const SCALE_NAME_BY_VALUE = new Map([
  [0, 'Major'],
  [5, 'Minor'],
  [9, 'Chromatic'],
  [14, 'Ling Lun'],
  [18, "Scholar's Lute"],
  [23, 'Greek Diatonic'],
  [27, 'Greek Chromatic'],
  [32, 'Greek Enharmonic'],
  [36, 'Pythagorean'],
  [41, 'Just (Major)'],
  [45, 'Just (Minor)'],
  [50, 'Meantone Chromatic'],
  [54, 'Werckmeister I (III)'],
  [59, 'Vallotti & Young'],
  [64, 'Barnes-Bach'],
  [68, 'Indian'],
  [73, 'Slendro'],
  [77, 'Pelog'],
  [82, 'Arabic 1'],
  [86, 'Arabic 2'],
  [91, '19 Tone'],
  [95, '24 Tone'],
  [100, '31 Tone'],
  [104, '53 Tone'],
  [109, 'Partch'],
  [113, 'Carlos A'],
  [116, 'Carlos B / Carlos G / Harmonic']
]);

const CONTROL_MAPPINGS = [
  { id: 'beatMonitor', label: 'Beat Monitor', type: 'button', channel: 0, cc: 40, defaultValue: 0 },
  { id: 'micMonitor', label: 'Mic Monitor', type: 'button', channel: 0, cc: 41, defaultValue: 0 },
  { id: 'allVang', label: 'All Vang Sends', type: 'button', channel: 0, cc: 42, defaultValue: 127, firstValue: 0 },
  { id: 'tuneBypass', label: 'Tune', type: 'button', channel: 0, cc: 27, defaultValue: 0, noFeedback: true, offText: 'Bật Tune', onText: 'Tắt Tune' },
  { id: 'lofiBypass', label: 'Lofi', type: 'button', channel: 0, cc: 25, defaultValue: 0, noFeedback: true, offText: 'Bật Lofi', onText: 'Tắt Lofi' },
  { id: 'remixBypass', label: 'Remix', type: 'button', channel: 0, cc: 22, defaultValue: 0, noFeedback: true, offText: 'Bật Remix', onText: 'Tắt Remix' },
  { id: 'pitchToggle', label: 'Pitch Toggle', type: 'button', channel: 0, cc: 43, defaultValue: 0 },
  { id: 'beatVolume', label: 'Beat Volume', type: 'range', channel: 0, cc: 50, min: 0, max: 127, defaultValue: 90 },
  { id: 'micVolume', label: 'Mic Volume', type: 'range', channel: 0, cc: 51, min: 0, max: 127, defaultValue: 90 },
  { id: 'vangLevel', label: 'Vang Level', type: 'range', channel: 0, cc: 52, min: 0, max: 127, defaultValue: 55 },
  { id: 'shortVangLevel', label: 'Short Vang Level', type: 'range', channel: 0, cc: 53, min: 0, max: 127, defaultValue: 45 },
  { id: 'delayLevel', label: 'Delay Level', type: 'range', channel: 0, cc: 54, min: 0, max: 127, defaultValue: 35 },
  { id: 'pitchShift', label: 'Pitch Shift', type: 'range', channel: 0, cc: 55, min: 0, max: 48, defaultValue: 24 },
  { id: 'tuneAmount', label: 'Tune Amount', type: 'range', channel: 0, cc: 56, min: 0, max: 127, defaultValue: 65 },
  { id: 'key', label: 'Key', type: 'range', channel: 0, cc: 17, min: 0, max: 126, defaultValue: 64, noFeedback: true },
  { id: 'scale', label: 'Scale', type: 'range', channel: 0, cc: 18, min: 0, max: 116, defaultValue: 58, noFeedback: true },
  { id: 'harmony', label: 'Harmony', type: 'range', channel: 0, cc: 59, min: 0, max: 127, defaultValue: 45 },
  { id: 'flexTune', label: 'Flex Tune', type: 'range', channel: 0, cc: 60, min: 0, max: 127, defaultValue: 35 }
];

const CONTROL_BY_CC = new Map(CONTROL_MAPPINGS.map((control) => [`${control.channel}:${control.cc}`, control]));
const CONTROL_BY_ID = new Map(CONTROL_MAPPINGS.map((control) => [control.id, control]));

function log(message, level = 'info') {
  const now = new Date().toLocaleTimeString();
  const logEl = $('#log');
  logEl.textContent += `[${now}] ${level.toUpperCase()} ${message}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

function findFeedbackControl(channel, control) {
  const mappedControl = CONTROL_BY_CC.get(getControlKey(channel, control)) || null;
  return mappedControl && !mappedControl.noFeedback ? mappedControl : null;
}

function renderToneEvent(event) {
  const confidence = Math.round((event.confidence || 0) * 100);
  state.currentKey = event.key || '';
  $('#currentKey').textContent = event.key || '--';
  $('#confidence').textContent = `${confidence}%`;
  $('#confidenceBar').style.width = `${Math.max(0, Math.min(confidence, 100))}%`;
  $('#analysisLatency').textContent = `Analysis: ${event.analysis_ms ?? '--'} ms`;
  $('#analysisWindow').textContent = `Votes: ${event.key_votes ?? 0}/${event.min_key_votes ?? '--'}`;
  $('#instantKey').textContent = `Instant: ${event.instant_key || '--'}`;
  $('#engineStatus').textContent = event.mode ? `${event.source} / ${event.mode}` : event.source || 'Dang nghe';
}

function scheduleToneRender(event) {
  state.latestToneId += 1;
  state.pendingToneEvent = { ...event, renderId: state.latestToneId };
  renderToneEvent(state.pendingToneEvent);
  state.latestRenderedToneId = state.pendingToneEvent.renderId;

  const now = Date.now();
  if (event.key !== state.lastLoggedKey || now - state.lastToneLogAt > 3000) {
    state.lastLoggedKey = event.key;
    state.lastToneLogAt = now;
    log(`Tone chinh: ${event.key || '--'} (${Math.round((event.confidence || 0) * 100)}%), instant: ${event.instant_key || '--'}`);
  }

  autoSendKeyScale(event).catch((error) => {
    log(`Khong tu dong gui Key/Scale duoc: ${error.message}`, 'error');
  });
}

function startRenderPump() {
  const pump = () => {
    state.frameCount += 1;
    if (state.frameCount % 30 === 0) {
      $('#uiHeartbeat').textContent = `UI: ${new Date().toLocaleTimeString()}`;
    }

    if (state.pendingToneEvent && state.pendingToneEvent.renderId !== state.latestRenderedToneId) {
      renderToneEvent(state.pendingToneEvent);
      state.latestRenderedToneId = state.pendingToneEvent.renderId;
    }
    window.requestAnimationFrame(pump);
  };

  window.requestAnimationFrame(pump);
}

function readConfigForm() {
  return {
    youtubeUrl: $('#youtubeUrl').value.trim() || 'https://www.youtube.com',
    cubasePath: $('#cubasePath').value.trim(),
    pythonPath: $('#pythonPath').value.trim() || 'python',
    midiOutputName: $('#midiOutput').value,
    midiInputName: $('#midiInput').value,
    autoSendKey: $('#autoSendKey').checked,
    autoLaunchYoutube: $('#autoYoutube').checked,
    autoLaunchCubase: $('#autoCubase').checked
  };
}

function fillConfigForm(config) {
  $('#youtubeUrl').value = config.youtubeUrl || 'https://www.youtube.com';
  $('#cubasePath').value = config.cubasePath || '';
  $('#pythonPath').value = config.pythonPath || 'python';
  $('#autoSendKey').checked = Boolean(config.autoSendKey);
  $('#autoYoutube').checked = Boolean(config.autoLaunchYoutube);
  $('#autoCubase').checked = Boolean(config.autoLaunchCubase);
}

function normalizeYoutubeUrl(url) {
  const trimmed = (url || '').trim();
  if (!trimmed) return 'https://www.youtube.com';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

async function openYoutube(url) {
  const nextUrl = normalizeYoutubeUrl(url);
  const youtubeNavigateUrl = $('#youtubeNavigateUrl');
  if (youtubeNavigateUrl) {
    youtubeNavigateUrl.value = nextUrl;
  }
  await window.nhacApp.launchYoutube(nextUrl);
}

async function ensureAnalyzerForVideo(videoId, url) {
  if (!videoId || videoId === state.activeVideoId) return;

  state.activeVideoId = videoId;
  $('#youtubeStatus').textContent = `Dang theo doi video: ${videoId}`;
  log(`Video YouTube moi duoc chon: ${url}`);

  const config = readConfigForm();
  state.config = await window.nhacApp.saveConfig(config);
  await window.nhacApp.engineRequest('configure', {
    midi_output_name: config.midiOutputName
  });
  await window.nhacApp.engineRequest('start_analyzer', {
    reset_statistics: true
  });

  state.analyzerRunning = true;
  state.lastAutoSentKey = '';
  $('#engineStatus').textContent = 'Dang nghe';
  $('#currentKey').textContent = '--';
  $('#confidence').textContent = '0%';
  $('#confidenceBar').style.width = '0%';
  $('#instantKey').textContent = 'Instant: --';
  log('Da reset va bat dau do tone chinh cho video moi.');
}

function updateMidiSelect(ports, selected = '') {
  const select = $('#midiOutput');
  select.innerHTML = '';

  if (!ports.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Khong tim thay MIDI output';
    select.append(option);
    return;
  }

  for (const port of ports) {
    const option = document.createElement('option');
    option.value = port;
    option.textContent = port;
    option.selected = port === selected;
    select.append(option);
  }
}

function updateMidiInputSelect(ports, selected = '') {
  const select = $('#midiInput');
  select.innerHTML = '';

  if (!ports.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Khong tim thay MIDI input';
    select.append(option);
    return;
  }

  for (const port of ports) {
    const option = document.createElement('option');
    option.value = port;
    option.textContent = port;
    option.selected = port === selected;
    select.append(option);
  }
}

async function refreshMidiPorts() {
  try {
    const [outputs, inputs] = await Promise.all([
      window.nhacApp.engineRequest('list_midi_outputs'),
      window.nhacApp.engineRequest('list_midi_inputs')
    ]);
    state.midiPorts = outputs.ports || [];
    state.midiInputPorts = inputs.ports || [];
    updateMidiSelect(state.midiPorts, state.config?.midiOutputName || '');
    updateMidiInputSelect(state.midiInputPorts, state.config?.midiInputName || '');
    const selected = $('#midiOutput').value;
    const feedback = $('#midiInput').value;
    $('#midiStatus').textContent = selected ? `MIDI: ${selected}` : `${state.midiPorts.length} output`;
    log(`MIDI outputs: ${state.midiPorts.length ? state.midiPorts.join(', ') : 'none'}`);
    log(`MIDI inputs: ${state.midiInputPorts.length ? state.midiInputPorts.join(', ') : 'none'}`);
    if (feedback) {
      await startMidiFeedback();
    }
  } catch (error) {
    $('#midiStatus').textContent = 'MIDI loi';
    log(`Khong doc duoc MIDI ports: ${error.message}`, 'error');
  }
}

async function sendMidiCc(label, channel, control, value) {
  return sendMidiCcValue(label, channel, control, value, true);
}

async function sendMidiCcValue(label, channel, control, value, shouldLog) {
  const config = readConfigForm();
  state.config = await window.nhacApp.saveConfig(config);
  await window.nhacApp.engineRequest('set_cubase_cc', {
    channel,
    control,
    value,
    midi_output_name: config.midiOutputName
  });
  if (shouldLog) {
    log(`Sent ${label}: CH ${channel + 1}, CC ${control} = ${value}`);
  }
}

function getControlKey(channel, control) {
  return `${channel}:${control}`;
}

function clampControlValue(control, value) {
  const min = control.min ?? 0;
  const max = control.max ?? 127;
  return Math.max(min, Math.min(max, Number(value)));
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, Number(value)));
}

function findControlElement(control) {
  if (control.type === 'range') {
    return document.querySelector(`[data-script-slider][data-midi-channel="${control.channel}"][data-midi-cc="${control.cc}"]`);
  }
  return document.querySelector(`[data-script-button][data-midi-channel="${control.channel}"][data-midi-cc="${control.cc}"]`);
}

function setControlUiValue(control, value) {
  const safeValue = clampControlValue(control, value);
  state.controlValues.set(control.id, safeValue);

  if (control.type === 'button') {
    const key = getControlKey(control.channel, control.cc);
    state.midiButtonValues.set(key, safeValue);
    const button = findControlElement(control);
    if (button) {
      const activeWhenZero = control.activeWhenZero;
      const isActive = activeWhenZero ? safeValue === 0 : safeValue > 0;
      button.classList.toggle('active', isActive);
      if (control.onText && control.offText) {
        button.textContent = isActive ? control.onText : control.offText;
      }
    }
    return;
  }

  const slider = findControlElement(control);
  if (slider) {
    slider.value = safeValue;
    const valueEl = slider.nextElementSibling;
    if (valueEl) valueEl.textContent = formatControlValue(control, safeValue);
  }
}

function formatControlValue(control, value) {
  return String(value);
}

function readControlValue(control) {
  if (state.controlValues.has(control.id)) {
    return state.controlValues.get(control.id);
  }

  const element = findControlElement(control);
  if (control.type === 'range' && element) {
    return clampControlValue(control, element.value);
  }

  return control.defaultValue ?? 0;
}

function syncInitialControlValues() {
  CONTROL_MAPPINGS.forEach((control) => {
    setControlUiValue(control, readControlValue(control));
  });
}

async function startMidiFeedback() {
  const config = readConfigForm();
  if (!config.midiInputName) {
    log('Chua chon MIDI feedback input.', 'warn');
    return;
  }

  state.config = await window.nhacApp.saveConfig(config);
  const response = await window.nhacApp.engineRequest('start_midi_feedback', {
    midi_input_name: config.midiInputName
  });
  $('#midiStatus').textContent = `Feedback: ${response.midi_input_name || config.midiInputName}`;
  log(`Dang nghe MIDI feedback: ${response.midi_input_name || config.midiInputName}`);
  await requestMidiFeedbackSync();
}

async function requestMidiFeedbackSync() {
  const config = readConfigForm();
  if (!config.midiOutputName) {
    log('Chua chon MIDI output nen chua the yeu cau Cubase sync lai UI.', 'warn');
    return;
  }

  state.config = await window.nhacApp.saveConfig(config);
  await window.nhacApp.engineRequest('set_cubase_cc', {
    channel: 0,
    control: MIDI_SYNC_REQUEST_CC,
    value: 127,
    midi_output_name: config.midiOutputName,
    control_mode: 'midi-remote-feedback'
  });
  log(`Request MIDI sync [MIDI Remote feedback]: CC ${MIDI_SYNC_REQUEST_CC} = 127`);
  await new Promise((resolve) => setTimeout(resolve, 40));
  await window.nhacApp.engineRequest('set_cubase_cc', {
    channel: 0,
    control: MIDI_SYNC_REQUEST_CC,
    value: 0,
    midi_output_name: config.midiOutputName,
    control_mode: 'midi-remote-feedback'
  });
}

function applyMidiFeedback(event) {
  const channel = Number(event.channel || 0);
  const midiControl = Number(event.control);
  const valueNumber = Number(event.value);
  applyControlFeedback(channel, midiControl, valueNumber);
}

function applyControlFeedback(channel, midiControl, valueNumber) {
  const feedbackKey = getControlKey(channel, midiControl);
  const now = Date.now();
  const suppressUntil = state.suppressedPulseFeedbackUntil.get(feedbackKey) || 0;

  if (now < suppressUntil && valueNumber === 0) {
    return;
  }

  state.suppressedPulseFeedbackUntil.delete(feedbackKey);

  const activeSliderUntil = state.activeSliderKeys.get(feedbackKey) || 0;
  if (now < activeSliderUntil) {
    return;
  }

  state.activeSliderKeys.delete(feedbackKey);

  const control = findFeedbackControl(channel, midiControl);
  if (!control) {
    log(`Feedback CC chua map: CH ${channel + 1}, CC ${event.control} = ${event.value}`);
    return;
  }

  const value = clampControlValue(control, valueNumber);
  const lastFeedback = state.lastMidiFeedbackByControl.get(feedbackKey);
  if (lastFeedback && lastFeedback.value === value && now - lastFeedback.at < 120) {
    return;
  }

  state.lastMidiFeedbackByControl.set(feedbackKey, {
    value,
    at: now
  });

  setControlUiValue(control, value);
  if (control.id === 'scale') {
    const testScaleValue = $('#testScaleValue');
    if (testScaleValue) {
      testScaleValue.value = value;
    }
    if (state.lastScaleFeedbackValue !== value) {
      state.lastScaleFeedbackValue = value;
      const scaleName = SCALE_NAME_BY_VALUE.get(value) || 'Unknown';
      log(`SCALE CHANGE FROM CUBASE: ${scaleName} = CC18 ${value}`);
    }
    return;
  }

  if (control.id === 'key') {
    const testKeyValue = $('#testKeyValue');
    if (testKeyValue) {
      testKeyValue.value = value;
    }
  }

  log(`Feedback ${control.label}: CC ${control.cc} = ${value}`);
}

async function sendMidiButton(label, channel, control, firstValue = 127) {
  const key = getControlKey(channel, control);
  const mappedControl = CONTROL_BY_CC.get(key);
  const currentValue = mappedControl ? readControlValue(mappedControl) : state.midiButtonValues.get(key);
  const safeFirstValue = firstValue === 0 ? 0 : 127;
  const nextValue = currentValue === undefined ? safeFirstValue : Number(currentValue) >= 64 ? 0 : 127;

  state.midiButtonValues.set(key, nextValue);
  if (mappedControl) setControlUiValue(mappedControl, nextValue);
  await sendMidiCcValue(label, channel, control, nextValue, true);
}

async function sendMidiPulseButton(label, channel, control) {
  const key = getControlKey(channel, control);
  const mappedControl = CONTROL_BY_CC.get(key);
  const currentValue = mappedControl ? readControlValue(mappedControl) : state.midiButtonValues.get(key);
  const nextValue = currentValue === undefined ? 127 : Number(currentValue) >= 64 ? 0 : 127;

  state.midiButtonValues.set(key, nextValue);
  if (mappedControl) setControlUiValue(mappedControl, nextValue);

  await sendMidiCcValue(label, channel, control, 127, true);
  await new Promise((resolve) => setTimeout(resolve, 40));
  state.suppressedPulseFeedbackUntil.set(key, Date.now() + 250);
  await sendMidiCcValue(label, channel, control, 0, false);
}

async function sendMidiTriggerToggleButton(label, channel, control) {
  const key = getControlKey(channel, control);
  const mappedControl = CONTROL_BY_CC.get(key);
  const currentValue = mappedControl ? readControlValue(mappedControl) : state.midiButtonValues.get(key);
  const nextValue = currentValue === undefined ? 127 : Number(currentValue) >= 64 ? 0 : 127;

  state.midiButtonValues.set(key, nextValue);
  if (mappedControl) setControlUiValue(mappedControl, nextValue);

  await sendMidiCcValue(label, channel, control, 127, true);
}

function getKeyScaleCcValues(keyName) {
  const match = String(keyName || '').trim().match(/^([A-G](?:#|b)?)\s+(.+)$/i);
  if (!match) {
    throw new Error(`Tone khong hop le: ${keyName || '--'}`);
  }

  const note = match[1]
    .replace('♭', 'b')
    .replace('♯', '#')
    .replace(/^([a-g])/, (letter) => letter.toUpperCase());
  const scale = match[2].trim().toLowerCase();
  const keyValue = KEY_TO_INDEX[note];
  if (keyValue === undefined) {
    throw new Error(`Note khong ho tro: ${note}`);
  }

  return {
    note,
    scale,
    keyValue,
    scaleValue: SCALE_VALUE_BY_NAME[scale]
  };
}

async function sendKeyScaleToCubase(keyName, reason = 'manual') {
  const values = getKeyScaleCcValues(keyName);
  const config = readConfigForm();
  state.config = await window.nhacApp.saveConfig(config);

  await window.nhacApp.engineRequest('set_cubase_cc', {
    channel: 0,
    control: KEY_CC_CONTROL,
    value: values.keyValue,
    midi_output_name: config.midiOutputName
  });
  if (values.scaleValue === undefined) {
    log(`Da gui Key ${values.note} = CC17 ${values.keyValue}. Scale "${values.scale}" chua co mapping CC18 nen khong gui scale.`, 'warn');
    return;
  }

  await window.nhacApp.engineRequest('set_cubase_cc', {
    channel: 0,
    control: SCALE_CC_CONTROL,
    value: values.scaleValue,
    midi_output_name: config.midiOutputName
  });

  log(`${reason === 'auto' ? 'Auto sent' : 'Da gui'} ${keyName}: CC${KEY_CC_CONTROL}=${values.keyValue}, CC${SCALE_CC_CONTROL}=${values.scaleValue}`);
}

async function sendTestCcValue(label, controlId, inputSelector) {
  const control = CONTROL_BY_ID.get(controlId);
  if (!control) {
    throw new Error(`Khong tim thay mapping ${controlId}`);
  }

  const input = $(inputSelector);
  const value = clampControlValue(control, input.value);
  input.value = value;
  setControlUiValue(control, value);
  await sendMidiCcValue(label, control.channel, control.cc, value, true);
}

async function stepTestCcValue(controlId, inputSelector, delta) {
  const control = CONTROL_BY_ID.get(controlId);
  const input = $(inputSelector);
  const nextValue = clampControlValue(control, Number(input.value || 0) + delta);
  input.value = nextValue;
  await sendTestCcValue(control.label, controlId, inputSelector);
}

function markScaleValue() {
  const value = clampControlValue(CONTROL_BY_ID.get('scale'), $('#testScaleValue').value);
  const name = $('#scaleMarkName').value.trim() || SCALE_NAME_BY_VALUE.get(value) || 'Scale chua dat ten';
  log(`MARK SCALE: ${name} = CC18 ${value}`);
}

async function autoSendKeyScale(event) {
  const config = readConfigForm();
  const keyName = event.key || '';
  if (!config.autoSendKey || !keyName || keyName === '--') {
    return;
  }
  if ((event.key_votes || 0) < (event.min_key_votes || 0)) {
    return;
  }
  if (keyName === state.lastAutoSentKey) {
    return;
  }

  state.lastAutoSentKey = keyName;
  try {
    await sendKeyScaleToCubase(keyName, 'auto');
  } catch (error) {
    state.lastAutoSentKey = '';
    throw error;
  }
}

function bindScriptControls() {
  document.querySelectorAll('[data-script-button]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        const label = button.textContent.trim();
        const channel = Number(button.dataset.midiChannel || 0);
        const control = Number(button.dataset.midiCc);
        if (button.dataset.midiMode === 'trigger-toggle') {
          await sendMidiTriggerToggleButton(label, channel, control);
        } else if (button.dataset.midiMode === 'pulse') {
          await sendMidiPulseButton(label, channel, control);
        } else {
          await sendMidiButton(
            label,
            channel,
            control,
            Number(button.dataset.midiFirstValue ?? 127)
          );
        }
      } catch (error) {
        log(`Khong gui duoc ${button.textContent.trim()}: ${error.message}`, 'error');
      }
    });
  });

  document.querySelectorAll('[data-script-slider]').forEach((slider, index) => {
    const valueEl = slider.nextElementSibling;
    const timerKey = `script-${index}-${slider.dataset.midiChannel}-${slider.dataset.midiCc}`;
    const sliderKey = getControlKey(Number(slider.dataset.midiChannel || 0), Number(slider.dataset.midiCc));
    const releaseSlider = () => {
      state.activeSliderKeys.set(sliderKey, Date.now() + 180);
    };

    slider.addEventListener('pointerdown', () => {
      state.activeSliderKeys.set(sliderKey, Date.now() + 1200);
    });
    slider.addEventListener('pointerup', releaseSlider);
    slider.addEventListener('pointercancel', releaseSlider);
    slider.addEventListener('change', releaseSlider);

    slider.addEventListener('input', () => {
      const value = Number(slider.value);
      state.activeSliderKeys.set(sliderKey, Date.now() + 300);
      const mappedControl = CONTROL_BY_CC.get(sliderKey);
      if (mappedControl) {
        state.controlValues.set(mappedControl.id, clampControlValue(mappedControl, value));
      }
      if (valueEl) valueEl.textContent = mappedControl ? formatControlValue(mappedControl, value) : value;

      clearTimeout(state.timers.get(timerKey));
      state.timers.set(
        timerKey,
        setTimeout(() => {
          sendMidiCc(
            slider.dataset.controlName || `CC ${slider.dataset.midiCc}`,
            Number(slider.dataset.midiChannel || 0),
            Number(slider.dataset.midiCc),
            value
          ).catch((error) => {
            log(`Khong gui duoc ${slider.dataset.controlName || 'control'}: ${error.message}`, 'error');
          });
        }, 80)
      );
    });
  });
}

function createPreset() {
  const controls = {};
  CONTROL_MAPPINGS.forEach((control) => {
    controls[control.id] = readControlValue(control);
  });

  return {
    name: `ToneLink preset ${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`,
    version: 1,
    createdAt: new Date().toISOString(),
    controls
  };
}

function normalizePreset(preset) {
  if (!preset || typeof preset !== 'object' || !preset.controls || typeof preset.controls !== 'object') {
    throw new Error('Preset khong hop le.');
  }

  const controls = {};
  Object.entries(preset.controls).forEach(([id, value]) => {
    const control = CONTROL_BY_ID.get(id);
    if (control) {
      controls[id] = clampControlValue(control, value);
    }
  });

  return {
    name: preset.name || 'Imported ToneLink preset',
    version: preset.version || 1,
    controls
  };
}

async function applyPreset(preset) {
  const normalized = normalizePreset(preset);
  const entries = Object.entries(normalized.controls);

  if (!entries.length) {
    throw new Error('Preset khong co control nao khop mapping hien tai.');
  }

  for (const [id, value] of entries) {
    const control = CONTROL_BY_ID.get(id);
    setControlUiValue(control, value);
    await sendMidiCcValue(control.label, control.channel, control.cc, value, false);
  }

  log(`Da ap dung preset "${normalized.name}" (${entries.length} controls).`);
}

async function resetGenericPluginTogglesOnStartup() {
  const controls = ['tuneBypass', 'lofiBypass', 'remixBypass']
    .map((id) => CONTROL_BY_ID.get(id))
    .filter(Boolean);

  controls.forEach((control) => {
    setControlUiValue(control, 0);
  });

  const config = readConfigForm();
  if (!config.midiOutputName) {
    log('Chua chon MIDI output nen chua gui duoc lenh tat Tune/Lofi/Remix khi mo app.', 'warn');
    return;
  }

  for (const control of controls) {
    await sendMidiCcValue(control.label, control.channel, control.cc, 0, false);
  }

  log('Da gui lenh tat mac dinh cho Tune/Lofi/Remix: CC27/25/22 = 0.');
}

async function init() {
  state.config = await window.nhacApp.getConfig();
  fillConfigForm(state.config);
  const youtubeNavigateUrl = $('#youtubeNavigateUrl');
  if (youtubeNavigateUrl) {
    youtubeNavigateUrl.value = state.config.youtubeUrl || 'https://www.youtube.com';
  }
  $('#midiStatus').textContent = state.config.midiOutputName ? `MIDI: ${state.config.midiOutputName}` : 'MIDI chua kiem tra';
  updateMidiSelect(state.config.midiOutputName ? [state.config.midiOutputName] : [], state.config.midiOutputName || '');
  updateMidiInputSelect(state.config.midiInputName ? [state.config.midiInputName] : [], state.config.midiInputName || '');
  bindScriptControls();
  syncInitialControlValues();
  startRenderPump();

  window.nhacApp.onYoutubeVideoSelected((payload) => {
    ensureAnalyzerForVideo(payload.videoId, payload.url).catch((error) => {
      log(`Khong trigger duoc do tone tu YouTube: ${error.message}`, 'error');
    });
  });

  window.nhacApp.onEngineEvent((event) => {
    if (event.type === 'tone') {
      scheduleToneRender(event);
    } else if (event.type === 'analyzer_status') {
      $('#engineStatus').textContent = event.status === 'analyzing' ? 'Dang phan tich' : 'Dang thu audio';
      $('#analysisWindow').textContent = `Window: ${event.window_seconds ?? '--'} s`;
    } else if (event.type === 'warmup') {
      log(event.message || 'Key detector warmup complete');
    } else if (event.type === 'error') {
      log(event.message || 'Engine error', 'error');
    } else if (event.type === 'midi_feedback') {
      applyMidiFeedback(event);
    } else if (event.type === 'midi_feedback_status') {
      log(`MIDI feedback: ${event.status} ${event.midi_input_name || ''}`);
    }
  });

  window.nhacApp.onEngineLog((entry) => {
    log(entry.text, entry.level || 'info');
  });

  if (state.config.midiInputName) {
    startMidiFeedback().catch((error) => {
      log(`Khong bat duoc MIDI feedback: ${error.message}`, 'error');
    });
  }

  resetGenericPluginTogglesOnStartup().catch((error) => {
    log(`Khong reset duoc Tune/Lofi/Remix khi mo app: ${error.message}`, 'error');
  });

  if (state.config.autoLaunchYoutube) {
    await openYoutube(state.config.youtubeUrl);
  }
}

on('#openYoutube', 'click', async () => {
  const config = readConfigForm();
  await window.nhacApp.saveConfig(config);
  await openYoutube(config.youtubeUrl);
});

on('#closeYoutube', 'click', async () => {
  await window.nhacApp.closeYoutube();
  $('#youtubeStatus').textContent = 'Da dong cua so YouTube';
  log('Da dong YouTube de giai phong RAM.');
});

on('#navigateYoutube', 'click', async () => {
  const url = $('#youtubeNavigateUrl')?.value || $('#youtubeUrl').value;
  const config = { ...readConfigForm(), youtubeUrl: normalizeYoutubeUrl(url) };
  state.config = await window.nhacApp.saveConfig(config);
  $('#youtubeUrl').value = config.youtubeUrl;
  await openYoutube(config.youtubeUrl);
});

on('#toggleSettings', 'click', () => {
  ['#midiPanel', '#settingsPanel'].forEach((selector) => {
    const panel = $(selector);
    if (panel) {
      panel.classList.toggle('is-hidden');
    }
  });
});

$('#openCubase').addEventListener('click', async () => {
  const config = readConfigForm();
  await window.nhacApp.launchCubase(config.cubasePath);
});

$('#pickCubase').addEventListener('click', async () => {
  const filePath = await window.nhacApp.selectCubase();
  if (filePath) $('#cubasePath').value = filePath;
});

$('#saveConfig').addEventListener('click', async () => {
  state.config = await window.nhacApp.saveConfig(readConfigForm());
  log('Da luu cau hinh.');
});

$('#autoSendKey').addEventListener('change', async () => {
  state.config = await window.nhacApp.saveConfig(readConfigForm());
  log(`Auto Send Key/Scale: ${$('#autoSendKey').checked ? 'ON' : 'OFF'}`);
});

$('#refreshMidi').addEventListener('click', refreshMidiPorts);

$('#exportPreset').addEventListener('click', async () => {
  try {
    const result = await window.nhacApp.exportPreset(createPreset());
    if (result.saved) {
      log(`Da luu preset: ${result.filePath}`);
    }
  } catch (error) {
    log(`Khong luu duoc preset: ${error.message}`, 'error');
  }
});

$('#importPreset').addEventListener('click', async () => {
  try {
    const result = await window.nhacApp.importPreset();
    if (!result.imported) return;
    await applyPreset(result.preset);
    log(`Da nhap preset: ${result.filePath}`);
  } catch (error) {
    log(`Khong nhap duoc preset: ${error.message}`, 'error');
  }
});

$('#midiOutput').addEventListener('change', async () => {
  state.config = await window.nhacApp.saveConfig(readConfigForm());
  $('#midiStatus').textContent = `MIDI: ${$('#midiOutput').value || 'chua chon'}`;
  log(`Da chon MIDI output: ${$('#midiOutput').value || 'chua chon'}`);
});

$('#midiInput').addEventListener('change', async () => {
  state.config = await window.nhacApp.saveConfig(readConfigForm());
  await startMidiFeedback();
});

$('#testMidi').addEventListener('click', async () => {
  const config = readConfigForm();
  if (!config.midiOutputName) {
    $('#midiStatus').textContent = 'Chua chon MIDI';
    log('Chua chon MIDI output. Hay chon ToneLink/loopMIDI port truoc.', 'warn');
    return;
  }

  try {
    state.config = await window.nhacApp.saveConfig(config);
    await sendMidiButton('Test MIDI', 0, 23);
    $('#midiStatus').textContent = 'MIDI OK';
  } catch (error) {
    $('#midiStatus').textContent = 'MIDI loi';
    log(`Test MIDI loi: ${error.message}`, 'error');
  }
});

$('#startAnalyze').addEventListener('click', async () => {
  const config = readConfigForm();
  state.config = await window.nhacApp.saveConfig(config);
  await window.nhacApp.engineRequest('configure', {
    midi_output_name: config.midiOutputName
  });
  await window.nhacApp.engineRequest('start_analyzer', {
    reset_statistics: true
  });
  state.analyzerRunning = true;
  state.lastAutoSentKey = '';
  $('#engineStatus').textContent = 'Dang nghe';
  $('#currentKey').textContent = '--';
  $('#confidence').textContent = '0%';
  $('#confidenceBar').style.width = '0%';
  $('#instantKey').textContent = 'Instant: --';
  log('Da reset va bat dau do tone chinh.');
});

$('#stopAnalyze').addEventListener('click', async () => {
  await window.nhacApp.engineRequest('stop_analyzer');
  if (state.pendingToneEvent) {
    renderToneEvent(state.pendingToneEvent);
  }
  state.analyzerRunning = false;
  $('#engineStatus').textContent = 'Da dung';
  log('Da dung tone detection.');
  await window.nhacApp.stopEngineProcess();
  log('Da tat Python engine de giam RAM.');
});

$('#sendKeyCubase').addEventListener('click', async () => {
  if (!state.currentKey || state.currentKey === '--') {
    log('Chua co tone hop le de gui sang Cubase.', 'warn');
    return;
  }

  try {
    await sendKeyScaleToCubase(state.currentKey);
  } catch (error) {
    log(`Khong gui duoc Key/Scale: ${error.message}`, 'error');
  }
});

on('#sendTestKey', 'click', async () => {
  try {
    await sendTestCcValue('Test Key', 'key', '#testKeyValue');
  } catch (error) {
    log(`Khong gui duoc Test Key: ${error.message}`, 'error');
  }
});

on('#sendTestScale', 'click', async () => {
  try {
    await sendTestCcValue('Test Scale', 'scale', '#testScaleValue');
  } catch (error) {
    log(`Khong gui duoc Test Scale: ${error.message}`, 'error');
  }
});

on('#decTestKey', 'click', async () => {
  try {
    await stepTestCcValue('key', '#testKeyValue', -1);
  } catch (error) {
    log(`Khong giam duoc Test Key: ${error.message}`, 'error');
  }
});

on('#incTestKey', 'click', async () => {
  try {
    await stepTestCcValue('key', '#testKeyValue', 1);
  } catch (error) {
    log(`Khong tang duoc Test Key: ${error.message}`, 'error');
  }
});

on('#decTestScale', 'click', async () => {
  try {
    await stepTestCcValue('scale', '#testScaleValue', -1);
  } catch (error) {
    log(`Khong giam duoc Test Scale: ${error.message}`, 'error');
  }
});

on('#incTestScale', 'click', async () => {
  try {
    await stepTestCcValue('scale', '#testScaleValue', 1);
  } catch (error) {
    log(`Khong tang duoc Test Scale: ${error.message}`, 'error');
  }
});

on('#decTestScaleFast', 'click', async () => {
  try {
    await stepTestCcValue('scale', '#testScaleValue', -10);
  } catch (error) {
    log(`Khong giam nhanh duoc Test Scale: ${error.message}`, 'error');
  }
});

on('#incTestScaleFast', 'click', async () => {
  try {
    await stepTestCcValue('scale', '#testScaleValue', 10);
  } catch (error) {
    log(`Khong tang nhanh duoc Test Scale: ${error.message}`, 'error');
  }
});

on('#markScaleValue', 'click', markScaleValue);

$('#clearLog').addEventListener('click', () => {
  $('#log').textContent = '';
});

init().catch((error) => {
  log(`Khong khoi tao duoc app: ${error.message}`, 'error');
});
