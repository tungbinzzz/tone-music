import json
import os
import sys
import threading
import time

from audio_loopback import RealtimeAnalyzer
from cubase_midi import list_inputs, list_outputs, mido, resolve_port_name, send_control_cc, send_key_cc, send_transport
from key_detector import warmup_detector
from license_guard import init_guard, is_licensed


stdout_lock = threading.Lock()
analyzer = None
midi_feedback_thread = None
midi_feedback_stop = threading.Event()
config = {
    "midi_output_name": "",
    "midi_input_name": "",
}


def emit(payload: dict) -> None:
    with stdout_lock:
        sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
        sys.stdout.flush()


def reply(request_id: int, ok: bool = True, **payload) -> None:
    emit({"id": request_id, "ok": ok, **payload})


def stop_midi_feedback() -> None:
    midi_feedback_stop.set()


def start_midi_feedback(input_name: str = "") -> str:
    global midi_feedback_thread

    if mido is None:
        raise RuntimeError("Missing dependency: mido/python-rtmidi. Install Python requirements first.")

    inputs = mido.get_input_names()
    if not inputs:
        raise RuntimeError("No MIDI input ports found.")

    target = resolve_port_name(input_name, inputs)

    if midi_feedback_thread and midi_feedback_thread.is_alive():
        stop_midi_feedback()
        midi_feedback_thread.join(timeout=1.0)

    midi_feedback_stop.clear()

    def run() -> None:
        try:
            with mido.open_input(target) as port:
                emit({"type": "midi_feedback_status", "status": "listening", "midi_input_name": target})
                while not midi_feedback_stop.is_set():
                    for message in port.iter_pending():
                        if message.type == "control_change":
                            emit({
                                "type": "midi_feedback",
                                "channel": int(message.channel),
                                "control": int(message.control),
                                "value": int(message.value),
                                "midi_input_name": target,
                            })
                    time.sleep(0.01)
        except Exception as error:
            emit({"type": "error", "message": f"MIDI feedback listener failed: {error}"})
        finally:
            emit({"type": "midi_feedback_status", "status": "stopped", "midi_input_name": target})

    midi_feedback_thread = threading.Thread(target=run, name="midi-feedback-listener", daemon=True)
    midi_feedback_thread.start()
    return target


def handle(request: dict) -> None:
    global analyzer, config

    request_id = request.get("id")
    command = request.get("command")
    payload = request.get("payload") or {}

    try:
        if command == "configure":
            config.update(payload)
            reply(request_id, config=config)
            return

        if command == "list_midi_outputs":
            reply(request_id, ports=list_outputs())
            return

        if command == "list_midi_inputs":
            reply(request_id, ports=list_inputs())
            return

        if command == "start_midi_feedback":
            input_name = payload.get("midi_input_name") or config.get("midi_input_name", "")
            target = start_midi_feedback(input_name)
            config["midi_input_name"] = target
            reply(request_id, listening=True, midi_input_name=target)
            return

        if command == "stop_midi_feedback":
            stop_midi_feedback()
            reply(request_id, listening=False)
            return

        if command == "start_analyzer":
            if not is_licensed():
                reply(request_id, ok=False, error="LICENSE_INVALID",
                      message="License không hợp lệ. Vui lòng kích hoạt ToneLink.")
                return
            if analyzer is None:
                analyzer = RealtimeAnalyzer(emit)
            if payload.get("reset_statistics"):
                analyzer.reset_statistics()
            analyzer.start()
            reply(request_id, running=True)
            return

        if command == "reset_analyzer_statistics":
            if analyzer:
                analyzer.reset_statistics()
            reply(request_id, reset=True)
            return

        if command == "stop_analyzer":
            if analyzer:
                analyzer.stop()
            reply(request_id, running=False)
            return

        if command == "set_playback_position":
            if analyzer:
                analyzer.update_playback_position(
                    current_time=payload.get("current_time", 0),
                    duration=payload.get("duration", 0),
                    progress_ratio=payload.get("progress_ratio", 0),
                    playing=payload.get("playing", False),
                )
            reply(request_id, updated=True)
            return

        if command == "cubase_transport":
            action = payload.get("action", "")
            output_name = payload.get("midi_output_name") or config.get("midi_output_name", "")
            send_transport(action, output_name)
            reply(request_id, sent=True)
            return

        if command == "send_key_to_cubase":
            key_name = payload.get("key", "")
            output_name = payload.get("midi_output_name") or config.get("midi_output_name", "")
            send_key_cc(key_name, output_name)
            reply(request_id, sent=True)
            return

        if command == "set_cubase_cc":
            output_name = payload.get("midi_output_name") or config.get("midi_output_name", "")
            send_control_cc(payload.get("control", 0), payload.get("value", 0), output_name, payload.get("channel", 0))
            reply(request_id, sent=True)
            return

        if command == "shutdown":
            if analyzer:
                analyzer.stop()
            stop_midi_feedback()
            reply(request_id, stopped=True)
            raise SystemExit(0)

        raise ValueError(f"Unknown command: {command}")

    except Exception as error:
        reply(request_id, ok=False, error=str(error))


def warmup_engine() -> None:
    try:
        warmup_detector()
        emit({"type": "warmup", "message": "Key detector warmup complete"})
    except Exception as error:
        emit({"type": "error", "message": f"Key detector warmup failed: {error}"})


def main() -> None:
    # Initialize license guard (skip in dev mode)
    skip_license = os.environ.get("TONELINK_DEV") == "1"
    init_guard(skip_check=skip_license)

    emit({"type": "ready", "message": "Python engine ready"})
    threading.Thread(target=warmup_engine, name="key-detector-warmup", daemon=True).start()
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            handle(json.loads(line))
        except json.JSONDecodeError as error:
            emit({"type": "error", "message": f"Invalid JSON request: {error}"})


if __name__ == "__main__":
    main()
