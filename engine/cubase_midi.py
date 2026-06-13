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


def list_inputs() -> list[str]:
    if mido is None:
        raise RuntimeError("Missing dependency: mido/python-rtmidi. Install Python requirements first.")
    return mido.get_input_names()


def resolve_port_name(requested_name: str, available_ports: list[str]) -> str:
    if not available_ports:
        raise RuntimeError("No MIDI ports found.")

    requested = (requested_name or "").strip()
    if not requested:
      return available_ports[0]

    if requested in available_ports:
        return requested

    requested_lower = requested.lower()
    for port_name in available_ports:
        if requested_lower in port_name.lower():
            return port_name

    for port_name in available_ports:
        if port_name.lower() in requested_lower:
            return port_name

    return available_ports[0]


def send_transport(action: str, output_name: str = "") -> None:
    if mido is None:
        raise RuntimeError("Missing dependency: mido/python-rtmidi. Install Python requirements first.")
    if action not in TRANSPORT_CC:
        raise ValueError(f"Unsupported Cubase transport action: {action}")

    outputs = mido.get_output_names()
    target = resolve_port_name(output_name, outputs)
    control = TRANSPORT_CC[action]

    with mido.open_output(target) as port:
        port.send(mido.Message("control_change", channel=0, control=control, value=127))


def send_key_cc(key_name: str, output_name: str = "", channel: int = 0, control: int = 30) -> None:
    if mido is None:
        raise RuntimeError("Missing dependency: mido/python-rtmidi. Install Python requirements first.")
    if key_name not in KEY_VALUES:
        raise ValueError(f"Unsupported key name: {key_name}")

    outputs = mido.get_output_names()
    target = resolve_port_name(output_name, outputs)
    value = KEY_VALUES[key_name]

    with mido.open_output(target) as port:
        port.send(mido.Message("control_change", channel=channel, control=control, value=value))


def send_control_cc(control: int, value: int, output_name: str = "", channel: int = 0) -> dict:
    if mido is None:
        raise RuntimeError("Missing dependency: mido/python-rtmidi. Install Python requirements first.")

    outputs = mido.get_output_names()
    target = resolve_port_name(output_name, outputs)
    safe_control = max(0, min(127, int(control)))
    safe_value = max(0, min(127, int(value)))
    safe_channel = max(0, min(15, int(channel)))

    with mido.open_output(target) as port:
        port.send(mido.Message("control_change", channel=safe_channel, control=safe_control, value=safe_value))

    return {
        "target": target,
        "channel": safe_channel,
        "control": safe_control,
        "value": safe_value,
    }
