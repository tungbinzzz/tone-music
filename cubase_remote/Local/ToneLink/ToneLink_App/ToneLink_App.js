// Nap MIDI Remote API v1 cua Cubase/Nuendo.
var midiremote_api = require('midiremote_api_v1')

// Tao driver hien thi trong MIDI Remote Manager.
var driver = midiremote_api.makeDeviceDriver(
  'ToneLink',
  'ToneLink App',
  'Nguyen Tung'
)

// Ten "Input" va "Output" chi la ten logic trong script.
// Ten port that phai duoc tao trong loopMIDI:
// - ToneLink To Cubase: app gui MIDI vao Cubase.
// - ToneLink From Cubase: Cubase gui feedback ve app.
var midiInput = driver.mPorts.makeMidiInput('Input')
var midiOutput = driver.mPorts.makeMidiOutput('Output')

// Tu dong nhan dien dung cap port loopMIDI.
driver.makeDetectionUnit()
  .detectPortPair(midiInput, midiOutput)
  .expectInputNameContains('ToneLink To Cubase')
  .expectOutputNameContains('ToneLink From Cubase')

// Surface la mat dieu khien ao gom button, knob va label.
var surface = driver.mSurface

// Page la noi khai bao mapping giua MIDI CC va Cubase host value.
var page = driver.mMapping.makePage('Main')

// HostAccess cho phep truy cap mixer, transport, quick controls...
var host = page.mHostAccess

// App gui CC119 de yeu cau sync, nhung snapshot bang SurfaceValue dang khong
// on dinh trong project nay nen realtime feedback duoc lay tu HostValue.
var SYNC_REQUEST_CC = 119

// Quy uoc project:
// Track 1 = Beat
// Track 2 = Mic
var beat = null
var mic = null

// Tao mixer bank de lay 2 track dau tien, bo qua input/output channels.
try {
  var mixerBankZone = host.mMixConsole.makeMixerBankZone('ToneLink Bank')
    .excludeInputChannels()
    .excludeOutputChannels()

  beat = mixerBankZone.makeMixerBankChannel()
  mic = mixerBankZone.makeMixerBankChannel()
} catch (e) {
  // Neu Cubase khong tao duoc mixer bank, script van load de tranh mat device.
}

// Lay host value an toan. Neu target khong ton tai thi tra ve null.
function safeGet(targetFactory) {
  if (!targetFactory) {
    return null
  }

  try {
    return targetFactory()
  } catch (e) {
    return null
  }
}

// Gan MIDI input/output cho mot control.
// Input: app gui CC vao Cubase qua "ToneLink To Cubase".
// Output: Cubase gui feedback CC ve app qua "ToneLink From Cubase".
function normalizeMidiValue(value, maxValue) {
  var safeMaxValue = maxValue === undefined ? 127 : maxValue
  return Math.round(Math.max(0, Math.min(1, value)) * safeMaxValue)
}

function registerHostFeedback(hostValue, cc, maxValue) {
  var safeMaxValue = maxValue === undefined ? 127 : maxValue

  // HostValue la gia tri that cua Cubase. Callback nay thay doi khi ban keo
  // fader/nut trong Cubase, khac voi SurfaceValue co the chi la gia tri MIDI vao.
  hostValue.mOnProcessValueChange = function (activeDevice, activeMapping, value) {
    midiOutput.sendMidi(activeDevice, [0xB0, cc, normalizeMidiValue(value, safeMaxValue)])
  }
}

// Nut an de app yeu cau dong bo lai UI sau khi vua mo feedback input.
var syncRequestButton = surface.makeButton(14, 4, 0.4, 0.4)
syncRequestButton.mSurfaceValue.mMidiBinding
  .setInputPort(midiInput)
  .bindToControlChange(0, SYNC_REQUEST_CC)

syncRequestButton.mSurfaceValue.mOnProcessValueChange = function (activeDevice, value) {
  // Snapshot doc SurfaceValue khong on dinh trong project nay, nen khong gui
  // de tranh app bi reset ve 0. Realtime feedback di qua HostValue callback.
}

page.mOnActivate = function (activeDevice) {
  // Khong gui snapshot tu SurfaceValue khi activate vi co the tra ve 0 sai.
}

function bindMidi(surfaceValue, cc, enableOutput, maxValue) {
  var midiBinding = surfaceValue.mMidiBinding
    .setInputPort(midiInput)

  var ccBinding = midiBinding.bindToControlChange(0, cc)
  if (ccBinding.setTypeAbsolute) {
    ccBinding.setTypeAbsolute()
  }

  return ccBinding
}

// Bind surface value vao host value, dung Jump de gia tri 0/127 di thang vao Cubase.
function bindHostValue(surfaceValue, targetFactory, takeoverMode, feedbackOptions) {
  var targetValue = safeGet(targetFactory)
  if (!targetValue) {
    return
  }

  try {
    var binding = page.makeValueBinding(surfaceValue, targetValue)

    if (takeoverMode === 'jump' && binding.setValueTakeOverModeJump) {
      binding.setValueTakeOverModeJump()
    }

    if (takeoverMode === 'scaled' && binding.setValueTakeOverModeScaled) {
      binding.setValueTakeOverModeScaled()
    }

    if (feedbackOptions && feedbackOptions.cc !== undefined) {
      registerHostFeedback(targetValue, feedbackOptions.cc, feedbackOptions.maxValue)
    }
  } catch (e) {
    // Neu Cubase khong bind duoc target, control van hien trong MIDI Remote.
  }
}

// Tao nut on/off nhan CC 0/127 tu app.
// Luu y: khong dung setTypeToggle() de tranh loi phai bam 2 lan.
function makeButton(label, x, y, cc, targetFactory) {
  var button = surface.makeButton(x, y, 1, 1)

  bindMidi(button.mSurfaceValue, cc, true, 127)
  bindHostValue(button.mSurfaceValue, targetFactory, 'jump', {
    cc: cc,
    maxValue: 127
  })

  var text = surface.makeLabelField(x, y + 1, 1.4, 0.3)
  page.setLabelFieldText(text, label)

  return button
}

// Tao nut nho dung chung CC de dieu khien them target khac.
function makeLinkedButton(x, y, cc, targetFactory) {
  var button = surface.makeButton(x, y, 0.4, 0.4)

  bindMidi(button.mSurfaceValue, cc, false)
  bindHostValue(button.mSurfaceValue, targetFactory, 'jump')

  return button
}

// Tao knob/slider nhan CC lien tuc.
function makeKnob(label, x, y, cc, targetFactory, options) {
  var knob = surface.makeKnob(x, y, 1, 1)
  var maxValue = options && options.maxValue !== undefined ? options.maxValue : 127

  var midiBinding = bindMidi(knob.mSurfaceValue, cc, true, maxValue)

  if (midiBinding.setValueRange) {
    midiBinding.setValueRange(0, maxValue)
  }

  bindHostValue(
    knob.mSurfaceValue,
    targetFactory,
    options && options.takeover ? options.takeover : 'jump',
    {
      cc: cc,
      maxValue: maxValue
    }
  )

  var text = surface.makeLabelField(x, y + 1, 1.4, 0.3)
  page.setLabelFieldText(text, label)

  return knob
}

// Mot nut CC24 dieu khien tat ca send slot cua track Mic.
function makeAllMicSendsButton(label, x, y, cc, sendCount) {
  makeButton(label, x, y, cc, function () {
    return mic && mic.mSends.getByIndex(0).mOn
  })

  for (var i = 1; i < sendCount; i++) {
    makeLinkedButton(x + (i * 0.45), y + 1.45, cc, function (index) {
      return function () {
        return mic && mic.mSends.getByIndex(index).mOn
      }
    }(i))
  }
}

// ---------------------------------------------------------------------------
// Buttons.
// ---------------------------------------------------------------------------

// CC40: bat/tat monitor track Beat.
makeButton('tatbeat', 0, 0, 40, function () {
  return beat && beat.mValue.mMonitorEnable
})

// CC41: bat/tat monitor track Mic.
makeButton('tatmic', 1.5, 0, 41, function () {
  return mic && mic.mValue.mMonitorEnable
})

// CC42: bat/tat tat ca send cua track Mic.
makeAllMicSendsButton('tat vang all sends', 3, 0, 42, 8)

// Tune/Lofi/Remix khong di qua MIDI Remote API nua.
// App gui Tune CC27, Lofi CC25, Remix CC22 de ban map bang Generic Remote/XML.

// CC43: bat/tat plugin tang tong qua Quick Control 2 cua track Beat.
// Neu ban muon target khac, map lai QC2 trong Cubase.
makeButton('tat bat tang tong qc2', 9, 0, 43, function () {
  return beat && beat.mQuickControls.getByIndex(1)
})

// ---------------------------------------------------------------------------
// Sliders/knobs.
// ---------------------------------------------------------------------------

// CC50: volume track Beat.
makeKnob('volumbeat', 0, 2, 50, function () {
  return beat && beat.mValue.mVolume
})

// CC51: volume track Mic.
makeKnob('volummic', 1.5, 2, 51, function () {
  return mic && mic.mValue.mVolume
})

// CC52: send 1 level cua track Mic.
makeKnob('volumvang', 3, 2, 52, function () {
  return mic && mic.mSends.getByIndex(0).mLevel
})

// CC53: send 2 level cua track Mic.
makeKnob('volum vang ngan', 4.5, 2, 53, function () {
  return mic && mic.mSends.getByIndex(1).mLevel
})

// CC54: send 3 level cua track Mic.
makeKnob('delay', 6, 2, 54, function () {
  return mic && mic.mSends.getByIndex(2).mLevel
})

// CC56: volume/amount Tune qua Mic Quick Control 3.
makeKnob('volumtune', 7.5, 2, 56, function () {
  return mic && mic.mQuickControls.getByIndex(2)
})

// CC59: be/harmony qua Mic Quick Control 5.
makeKnob('be', 9, 2, 59, function () {
  return mic && mic.mQuickControls.getByIndex(4)
})

// CC60: flex tune qua Mic Quick Control 4.
makeKnob('flex tune', 10.5, 2, 60, function () {
  return mic && mic.mQuickControls.getByIndex(3)
})

// CC55: tang tong amount qua Beat Quick Control 1.
makeKnob('tang tong', 12, 2, 55, function () {
  return beat && beat.mQuickControls.getByIndex(0)
}, { maxValue: 48 })

// Key/Scale khong di qua MIDI Remote API nua.
// App gui CC17/CC18 rieng de ban map bang Generic Remote/XML hoac MIDI Learn.
