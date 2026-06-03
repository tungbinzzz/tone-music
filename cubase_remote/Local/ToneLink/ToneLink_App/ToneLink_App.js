var midiremote_api = require('midiremote_api_v1')

var driver = midiremote_api.makeDeviceDriver(
  'ToneLink',
  'ToneLink App',
  'Nguyen Tung'
)

var midiInput = driver.mPorts.makeMidiInput('ToneLink Input')
var midiOutput = driver.mPorts.makeMidiOutput('ToneLink Output')

driver.makeDetectionUnit()
  .detectPortPair(midiInput, midiOutput)
  .expectInputNameContains('ToneLink')
  .expectOutputNameContains('ToneLink')

var surface = driver.mSurface
var page = driver.mMapping.makePage('Main')
var host = page.mHostAccess

function makeCCButton(name, x, y, cc, hostValue) {
  var btn = surface.makeButton(x, y, 1, 1)

  btn.mSurfaceValue.mMidiBinding
    .setInputPort(midiInput)
    .bindToControlChange(0, cc)

  page.makeValueBinding(btn.mSurfaceValue, hostValue)

  var label = surface.makeLabelField(x, y + 1, 1, 0.3)
  page.setLabelFieldText(label, name)

  return btn
}

function makeCCKnob(name, x, y, cc, hostValue) {
  var knob = surface.makeKnob(x, y, 1, 1)

  knob.mSurfaceValue.mMidiBinding
    .setInputPort(midiInput)
    .bindToControlChange(0, cc)

  page.makeValueBinding(knob.mSurfaceValue, hostValue)

  var label = surface.makeLabelField(x, y + 1, 1, 0.3)
  page.setLabelFieldText(label, name)

  return knob
}

// Transport
makeCCButton('Play',      0, 0, 1, host.mTransport.mValue.mStart)
makeCCButton('Stop',      1, 0, 2, host.mTransport.mValue.mStop)
makeCCButton('Record',    2, 0, 3, host.mTransport.mValue.mRecord)
makeCCButton('Cycle',     3, 0, 4, host.mTransport.mValue.mCycleActive)
makeCCButton('Metronome', 4, 0, 5, host.mTransport.mValue.mMetronomeActive)

// Selected track controls
var selectedTrack = host.mTrackSelection.mMixerChannel

makeCCKnob('Selected Volume', 0, 2, 10, selectedTrack.mValue.mVolume)
makeCCKnob('Selected Pan',    1, 2, 11, selectedTrack.mValue.mPan)
makeCCButton('Selected Mute', 2, 2, 12, selectedTrack.mValue.mMute)
makeCCButton('Selected Solo', 3, 2, 13, selectedTrack.mValue.mSolo)
makeCCButton('Selected Mon',  4, 2, 14, selectedTrack.mValue.mMonitorEnable)
makeCCButton('Selected Rec',  5, 2, 15, selectedTrack.mValue.mRecordEnable)

// Sends / Inserts co ban tren selected track
makeCCKnob('Send 1 Level', 0, 4, 20, selectedTrack.mSends.getByIndex(0).mLevel)
makeCCButton('Send 1 On',  1, 4, 21, selectedTrack.mSends.getByIndex(0).mOn)

makeCCKnob('Send 2 Level', 2, 4, 22, selectedTrack.mSends.getByIndex(1).mLevel)
makeCCButton('Send 2 On',  3, 4, 23, selectedTrack.mSends.getByIndex(1).mOn)
