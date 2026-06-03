try:
    import mido
except ImportError:  # pragma: no cover - reported at runtime by the engine.
    mido = None


TRANSPORT_CC = {
    "play": 1,
    "stop": 2,
    "record": 3,
    "cycle": 4,
    "metronome": 5,
}

KEY_VALUES = {
    "C major": 0,
    "C# major": 1,
    "D major": 2,
    "D# major": 3,
    "E major": 4,
    "F major": 5,
    "F# major": 6,
    "G major": 7,
    "G# major": 8,
    "A major": 9,
    "A# major": 10,
    "B major": 11,
    "C minor": 12,
    "C# minor": 13,
    "D minor": 14,
    "D# minor": 15,
    "E minor": 16,
    "F minor": 17,
    "F# minor": 18,
    "G minor": 19,
    "G# minor": 20,
    "A minor": 21,
    "A# minor": 22,
    "B minor": 23,
}


def list_outputs() -> list[str]:
    if mido is None:
        raise RuntimeError("Missing dependency: mido/python-rtmidi. Install Python requirements first.")
    return mido.get_output_names()


def send_transport(action: str, output_name: str = "") -> None:
    if mido is None:
        raise RuntimeError("Missing dependency: mido/python-rtmidi. Install Python requirements first.")
    if action not in TRANSPORT_CC:
        raise ValueError(f"Unsupported Cubase transport action: {action}")

    outputs = mido.get_output_names()
    if not outputs:
        raise RuntimeError("No MIDI output ports found.")

    target = output_name if output_name in outputs else outputs[0]
    control = TRANSPORT_CC[action]

    with mido.open_output(target) as port:
        port.send(mido.Message("control_change", channel=0, control=control, value=127))


def send_key_cc(key_name: str, output_name: str = "", channel: int = 0, control: int = 30) -> None:
    if mido is None:
        raise RuntimeError("Missing dependency: mido/python-rtmidi. Install Python requirements first.")
    if key_name not in KEY_VALUES:
        raise ValueError(f"Unsupported key name: {key_name}")

    outputs = mido.get_output_names()
    if not outputs:
        raise RuntimeError("No MIDI output ports found.")

    target = output_name if output_name in outputs else outputs[0]
    value = KEY_VALUES[key_name]

    with mido.open_output(target) as port:
        port.send(mido.Message("control_change", channel=channel, control=control, value=value))


def send_control_cc(control: int, value: int, output_name: str = "", channel: int = 0) -> None:
    if mido is None:
        raise RuntimeError("Missing dependency: mido/python-rtmidi. Install Python requirements first.")

    outputs = mido.get_output_names()
    if not outputs:
        raise RuntimeError("No MIDI output ports found.")

    target = output_name if output_name in outputs else outputs[0]
    safe_control = max(0, min(127, int(control)))
    safe_value = max(0, min(127, int(value)))

    with mido.open_output(target) as port:
        port.send(mido.Message("control_change", channel=channel, control=safe_control, value=safe_value))
