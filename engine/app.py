import json
import sys
import threading

from audio_loopback import RealtimeAnalyzer
from cubase_midi import list_outputs, send_control_cc, send_key_cc, send_transport
from key_detector import warmup_detector


stdout_lock = threading.Lock()
analyzer = None
config = {
    "midi_output_name": "",
}


def emit(payload: dict) -> None:
    with stdout_lock:
        sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
        sys.stdout.flush()


def reply(request_id: int, ok: bool = True, **payload) -> None:
    emit({"id": request_id, "ok": ok, **payload})


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

        if command == "start_analyzer":
            if analyzer is None:
                analyzer = RealtimeAnalyzer(emit)
            analyzer.start()
            reply(request_id, running=True)
            return

        if command == "stop_analyzer":
            if analyzer:
                analyzer.stop()
            reply(request_id, running=False)
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
            send_control_cc(payload.get("control", 0), payload.get("value", 0), output_name)
            reply(request_id, sent=True)
            return

        if command == "shutdown":
            if analyzer:
                analyzer.stop()
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
