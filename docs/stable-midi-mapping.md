# ToneLink stable MIDI mapping

This file records the current stable control strategy. Keep this as the
baseline before adding new controls, so a new feature does not accidentally
break the working Cubase integration.

## Control modes

Use MIDI Remote API with two-way sync for:

- Beat on/off
- Mic on/off
- Vang on/off
- Beat volume
- Mic volume
- Vang volume
- Vang ngan volume
- Delay volume

Use Generic Remote for one-way controls:

- Tune
- Lofi
- Remix
- Key
- Scale
- Tang tong

## Port names

The app config should use the base loopMIDI names:

- MIDI output: `ToneLink To Cubase`
- MIDI feedback input: `ToneLink From Cubase`

The Python MIDI layer resolves these base names to the real Windows port names
that may include suffixes, for example:

- `ToneLink To Cubase 1`
- `ToneLink From Cubase 1`

Do not hard-code the suffix in the app config.

## Current CC split

MIDI Remote API, two-way feedback:

- `CC40`: Beat on/off
- `CC41`: Mic on/off
- `CC42`: Vang on/off
- `CC50`: Beat volume
- `CC51`: Mic volume
- `CC52`: Vang volume
- `CC53`: Vang ngan volume
- `CC54`: Delay volume

Generic Remote, one-way:

- `CC27`: Tune
- `CC25`: Lofi
- `CC22`: Remix
- `CC6`: Return Speed
- `CC17`: Key
- `CC18`: Scale
- `CC7`: Tang tong

## Rule

Do not move a control between MIDI Remote API and Generic Remote unless the
Cubase script, XML mapping, UI state logic, and startup sync behavior are
changed together.
