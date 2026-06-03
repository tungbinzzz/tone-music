const state = {
  config: null,
  midiPorts: [],
  currentKey: '',
  activeVideoId: '',
  analyzerRunning: false,
  pendingToneEvent: null,
  latestRenderedToneId: 0,
  latestToneId: 0,
  frameCount: 0,
  lastToneLogAt: 0,
  lastLoggedKey: '',
  volumeTimers: new Map()
};

const $ = (selector) => document.querySelector(selector);

function log(message, level = 'info') {
  const now = new Date().toLocaleTimeString();
  const logEl = $('#log');
  logEl.textContent += `[${now}] ${level.toUpperCase()} ${message}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

function renderToneEvent(event) {
  const confidence = Math.round((event.confidence || 0) * 100);
  state.currentKey = event.key || '';
  $('#currentKey').textContent = event.key || '--';
  $('#confidence').textContent = `${confidence}%`;
  $('#confidenceBar').style.width = `${Math.max(0, Math.min(confidence, 100))}%`;
  $('#analysisLatency').textContent = `Analysis: ${event.analysis_ms ?? '--'} ms`;
  $('#analysisWindow').textContent = `Window: ${event.window_seconds ?? '--'} s`;
  $('#engineStatus').textContent = event.mode ? `${event.source} / ${event.mode}` : event.source || 'Đang nghe';
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
    log(`UI nhận tone realtime: ${event.key || '--'} (${Math.round((event.confidence || 0) * 100)}%)`);
  }
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
    micVolume: Number($('#micVolume').value),
    cubaseVolume: Number($('#cubaseVolume').value),
    send1Level: Number($('#send1Level').value),
    send2Level: Number($('#send2Level').value),
    autoLaunchYoutube: $('#autoYoutube').checked,
    autoLaunchCubase: $('#autoCubase').checked
  };
}

function fillConfigForm(config) {
  $('#youtubeUrl').value = config.youtubeUrl || 'https://www.youtube.com';
  $('#cubasePath').value = config.cubasePath || '';
  $('#pythonPath').value = config.pythonPath || 'python';
  $('#micVolume').value = config.micVolume ?? 90;
  $('#micVolumeValue').textContent = $('#micVolume').value;
  $('#cubaseVolume').value = config.cubaseVolume ?? 64;
  $('#cubaseVolumeValue').textContent = $('#cubaseVolume').value;
  $('#send1Level').value = config.send1Level ?? 0;
  $('#send1LevelValue').textContent = $('#send1Level').value;
  $('#send2Level').value = config.send2Level ?? 0;
  $('#send2LevelValue').textContent = $('#send2Level').value;
  $('#autoYoutube').checked = Boolean(config.autoLaunchYoutube);
  $('#autoCubase').checked = Boolean(config.autoLaunchCubase);
}

function normalizeYoutubeUrl(url) {
  const trimmed = (url || '').trim();
  if (!trimmed) return 'https://www.youtube.com';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function getYoutubeVideoId(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');
    if (host === 'youtube.com' && parsed.pathname === '/watch') {
      return parsed.searchParams.get('v') || '';
    }
    if (host === 'youtube.com' && parsed.pathname.startsWith('/shorts/')) {
      return parsed.pathname.split('/').filter(Boolean)[1] || '';
    }
    if (host === 'youtu.be') {
      return parsed.pathname.split('/').filter(Boolean)[0] || '';
    }
  } catch {
    return '';
  }
  return '';
}

async function openYoutube(url) {
  const nextUrl = normalizeYoutubeUrl(url);
  $('#youtubeNavigateUrl').value = nextUrl;
  await window.nhacApp.launchYoutube(nextUrl);
}

async function ensureAnalyzerForVideo(videoId, url) {
  if (!videoId || videoId === state.activeVideoId) return;

  state.activeVideoId = videoId;
  $('#youtubeStatus').textContent = `Đang theo dõi video: ${videoId}`;
  log(`Video YouTube mới được chọn: ${url}`);

  const config = readConfigForm();
  state.config = await window.nhacApp.saveConfig(config);
  await window.nhacApp.engineRequest('configure', {
    midi_output_name: config.midiOutputName
  });
  await window.nhacApp.engineRequest('start_analyzer');
  state.analyzerRunning = true;
  $('#engineStatus').textContent = 'Đang nghe';
  log('Đã tự động bật dò tone từ trigger chọn video YouTube.');
}

function updateMidiSelect(ports, selected = '') {
  const select = $('#midiOutput');
  select.innerHTML = '';

  if (!ports.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'Không tìm thấy MIDI output';
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
    const response = await window.nhacApp.engineRequest('list_midi_outputs');
    state.midiPorts = response.ports || [];
    updateMidiSelect(state.midiPorts, state.config?.midiOutputName || '');
    const selected = $('#midiOutput').value;
    $('#midiStatus').textContent = selected ? `MIDI: ${selected}` : `${state.midiPorts.length} output`;
    log(`MIDI outputs: ${state.midiPorts.length ? state.midiPorts.join(', ') : 'không có'}`);
  } catch (error) {
    $('#midiStatus').textContent = 'MIDI lỗi';
    log(`Không đọc được MIDI ports: ${error.message}`, 'error');
  }
}

async function init() {
  state.config = await window.nhacApp.getConfig();
  fillConfigForm(state.config);
  $('#youtubeNavigateUrl').value = state.config.youtubeUrl || 'https://www.youtube.com';
  await refreshMidiPorts();
  startRenderPump();

  if (state.config.autoLaunchYoutube) {
    await openYoutube(state.config.youtubeUrl);
  }

  window.nhacApp.onYoutubeVideoSelected((payload) => {
    ensureAnalyzerForVideo(payload.videoId, payload.url).catch((error) => {
      log(`Không trigger được dò tone từ YouTube: ${error.message}`, 'error');
    });
  });

  window.nhacApp.onEngineEvent((event) => {
    if (event.type === 'tone') {
      scheduleToneRender(event);
    } else if (event.type === 'analyzer_status') {
      $('#engineStatus').textContent = event.status === 'analyzing' ? 'Đang phân tích' : 'Đang thu audio';
      $('#analysisWindow').textContent = `Window: ${event.window_seconds ?? '--'} s`;
    } else if (event.type === 'warmup') {
      log(event.message || 'Key detector warmup complete');
    } else if (event.type === 'error') {
      log(event.message || 'Engine error', 'error');
    }
  });

  window.nhacApp.onEngineLog((entry) => {
    log(entry.text, entry.level || 'info');
  });
}

$('#openYoutube').addEventListener('click', async () => {
  const config = readConfigForm();
  await window.nhacApp.saveConfig(config);
  await openYoutube(config.youtubeUrl);
});

$('#navigateYoutube').addEventListener('click', async () => {
  const url = $('#youtubeNavigateUrl').value || $('#youtubeUrl').value;
  const config = { ...readConfigForm(), youtubeUrl: normalizeYoutubeUrl(url) };
  state.config = await window.nhacApp.saveConfig(config);
  $('#youtubeUrl').value = config.youtubeUrl;
  await openYoutube(config.youtubeUrl);
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
  log('Đã lưu cấu hình.');
});

$('#refreshMidi').addEventListener('click', refreshMidiPorts);

$('#midiOutput').addEventListener('change', async () => {
  state.config = await window.nhacApp.saveConfig(readConfigForm());
  $('#midiStatus').textContent = `MIDI: ${$('#midiOutput').value || 'chưa chọn'}`;
  log(`Đã chọn MIDI output: ${$('#midiOutput').value || 'chưa chọn'}`);
});

$('#testMidi').addEventListener('click', async () => {
  const config = readConfigForm();
  if (!config.midiOutputName) {
    $('#midiStatus').textContent = 'Chưa chọn MIDI';
    log('Chưa chọn MIDI output. Hãy chọn loopMIDI port trước.', 'warn');
    return;
  }

  try {
    state.config = await window.nhacApp.saveConfig(config);
    await window.nhacApp.engineRequest('set_cubase_cc', {
      control: 23,
      value: 127,
      midi_output_name: config.midiOutputName
    });
    $('#midiStatus').textContent = 'MIDI OK';
    log(`Test MIDI OK: đã gửi CC 23 = 127 tới "${config.midiOutputName}".`);
  } catch (error) {
    $('#midiStatus').textContent = 'MIDI lỗi';
    log(`Test MIDI lỗi: ${error.message}`, 'error');
  }
});

$('#startAnalyze').addEventListener('click', async () => {
  const config = readConfigForm();
  state.config = await window.nhacApp.saveConfig(config);
  await window.nhacApp.engineRequest('configure', {
    midi_output_name: config.midiOutputName
  });
  await window.nhacApp.engineRequest('start_analyzer');
  state.analyzerRunning = true;
  $('#engineStatus').textContent = 'Đang nghe';
  log('Đã bật realtime tone detection.');
});

$('#stopAnalyze').addEventListener('click', async () => {
  await window.nhacApp.engineRequest('stop_analyzer');
  if (state.pendingToneEvent) {
    renderToneEvent(state.pendingToneEvent);
  }
  state.analyzerRunning = false;
  $('#engineStatus').textContent = 'Đã dừng';
  log('Đã dừng tone detection.');
});

$('#sendKeyCubase').addEventListener('click', async () => {
  if (!state.currentKey || state.currentKey === '--') {
    log('Chưa có tone hợp lệ để gửi sang Cubase.', 'warn');
    return;
  }

  const config = readConfigForm();
  state.config = await window.nhacApp.saveConfig(config);
  await window.nhacApp.engineRequest('send_key_to_cubase', {
    key: state.currentKey,
    midi_output_name: config.midiOutputName
  });
  log(`Đã gửi tone sang Cubase qua MIDI CC 30: ${state.currentKey}`);
});

document.querySelectorAll('[data-cubase]').forEach((button) => {
  button.addEventListener('click', async () => {
    const config = readConfigForm();
    state.config = await window.nhacApp.saveConfig(config);
    await window.nhacApp.engineRequest('cubase_transport', {
      action: button.dataset.cubase,
      midi_output_name: config.midiOutputName
    });
    log(`Đã gửi lệnh Cubase: ${button.dataset.cubase}`);
  });
});

async function sendVolumeControl(kind, control, value) {
  const config = readConfigForm();
  state.config = await window.nhacApp.saveConfig(config);
  await window.nhacApp.engineRequest('set_cubase_cc', {
    control,
    value,
    midi_output_name: config.midiOutputName
  });
  log(`Đã gửi ${kind} sang Cubase: CC ${control} = ${value}`);
}

function bindVolumeSlider(selector, valueSelector) {
  const slider = $(selector);
  const valueEl = $(valueSelector);
  const control = Number(slider.dataset.midiCc);
  const kind = slider.dataset.controlName || `CC ${control}`;

  slider.addEventListener('input', () => {
    const value = Number(slider.value);
    valueEl.textContent = value;

    clearTimeout(state.volumeTimers.get(selector));
    state.volumeTimers.set(
      selector,
      setTimeout(() => {
        sendVolumeControl(kind, control, value).catch((error) => {
          log(`Không gửi được ${kind}: ${error.message}`, 'error');
        });
      }, 80)
    );
  });
}

bindVolumeSlider('#micVolume', '#micVolumeValue');
bindVolumeSlider('#cubaseVolume', '#cubaseVolumeValue');
bindVolumeSlider('#send1Level', '#send1LevelValue');
bindVolumeSlider('#send2Level', '#send2LevelValue');

document.querySelectorAll('[data-midi-button]').forEach((button) => {
  button.addEventListener('click', async () => {
    const control = Number(button.dataset.midiButton);
    try {
      await sendVolumeControl(button.textContent.trim(), control, 127);
    } catch (error) {
      log(`Không gửi được ${button.textContent.trim()}: ${error.message}`, 'error');
    }
  });
});

$('#clearLog').addEventListener('click', () => {
  $('#log').textContent = '';
});

init().catch((error) => {
  log(`Không khởi tạo được app: ${error.message}`, 'error');
});
