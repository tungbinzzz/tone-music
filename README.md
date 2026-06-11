# Cubase YouTube Tone Assistant

App Windows dùng Electron làm UI và Python/Essentia làm engine để:

- Tự mở YouTube khi bật app.
- Mở YouTube trong một cửa sổ Electron riêng và theo dõi video được chọn để tự trigger dò tone.
- Tự mở Cubase nếu đã cấu hình đường dẫn `.exe`.
- Nghe audio hệ thống bằng WASAPI loopback.
- Dò tone chính của bài đang phát trên YouTube bằng cách gom nhiều cửa sổ phân tích.
- Điều khiển Cubase cơ bản qua MIDI Remote API: Play, Stop, Record.
- Gửi tone hiện tại sang Cubase qua MIDI CC 30 để bạn map thêm nếu cần transpose/tone workflow.
- Điều khiển đúng các chức năng trong XML remote description: Beat/Mic monitor, Remix, Lofi, Vang, Tune, Key, Scale, Delay, Bè, Flex Tune.

## Yêu cầu

- Windows 10/11.
- Node.js 18+.
- Python 3.10 hoặc 3.11.
- Cubase đã bật MIDI Remote/Generic Remote.
- Một MIDI loopback port, ví dụ loopMIDI, nếu muốn app gửi MIDI vào Cubase trên cùng máy.

## Cài đặt

```powershell
npm install
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

Essentia la optional tonal engine. Neu runtime da co Essentia, engine se dung `KeyExtractor`; neu khong, engine tu fallback ve NumPy legacy detector. Cai dat thu cong bang:

```powershell
python -m pip install -r requirements-essentia.txt
```

Luu y: PyPI `essentia` hien co the fail khi build tren Windows/Python 3.12. Dung Python 3.10/3.11 hoac mot build Essentia tuong thich cho ban release.

Nếu bạn dùng virtualenv, trong app hãy đặt trường `Python` thành:

```text
C:\Users\Windows\Documents\nhac\.venv\Scripts\python.exe
```

## Chạy app

```powershell
npm start
```

Lần đầu mở app:

1. Chọn đường dẫn `Cubase.exe`.
2. Chọn MIDI output port trỏ vào Cubase, ví dụ port loopMIDI.
3. Lưu cấu hình.
4. Mở cửa sổ YouTube từ app và chọn một video.
5. App sẽ tự trigger dò tone khi URL chuyển sang video YouTube. Nút `Bắt đầu dò tone` vẫn dùng được để bật thủ công.

## Giảm RAM khi sử dụng

App dùng Electron nên mỗi cửa sổ là một Chromium process. Cửa sổ YouTube thường là phần tốn RAM nhất.

Các tối ưu hiện có:

- Python engine không khởi động ngay khi mở app; chỉ khởi động khi bấm `Làm mới MIDI`, `Test MIDI`, dùng control MIDI, hoặc bắt đầu dò tone.
- App không tự refresh MIDI ở startup để tránh bật Python engine sớm.
- Bấm `Dừng` sẽ dừng analyzer và tắt Python engine để giải phóng RAM.
- Bấm `Đóng YouTube` để đóng cửa sổ YouTube riêng và giải phóng Chromium process đó.

Nếu muốn dùng RAM thấp nhất, tắt `Tự mở YouTube khi bật app`, chỉ mở YouTube khi cần dò tone.

## Cấu hình Cubase

Để nhận lệnh từ app:

1. Tạo một MIDI loopback port bằng loopMIDI.
2. Trong Cubase, bật input MIDI từ port đó.
3. Cài MIDI Remote script trong thư mục `cubase_remote`, hoặc chạy lệnh install bên dưới.
4. Trong project Cubase, mixer bank cần đặt Track 1 là Beat/Nhạc và Track 2 là Mic/Vocal để mapping tác động đúng.
5. Với tone, app đang gửi MIDI CC 30. Script ToneLink hiện chưa map CC30, nên bạn có thể thêm mapping tone/transpose sau.

## Cài Cubase MIDI Remote API script

Dự án có sẵn script MIDI Remote API tại:

```text
cubase_remote\Local\ToneLink\ToneLink_App\ToneLink_App.js
```

Cài vào Cubase 15 bằng:

```powershell
npm.cmd run install:cubase-remote
```

Nếu bạn dùng folder khác, ví dụ `Cubase 14`, chạy:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install-cubase-midi-remote.ps1 -CubaseFolder "Cubase 14"
```

Sau đó trong Cubase:

1. Mở `MIDI Remote`.
2. Bật `Scripting Tools` nếu cần.
3. Bấm `Reload Scripts`.
4. Chọn device `ToneLink / ToneLink App`.
5. Chọn MIDI input là loopMIDI port mà app đang gửi tới.

Mapping của script và UI hiện tại:

- Channel 1, CC20: Beat monitor.
- Channel 1, CC21: Mic monitor.
- Channel 1, CC2: Volume Beat.
- Channel 1, CC3: Volume Mic.
- Channel 1, CC5: Volume Vang Dài.
- Channel 1, CC8: Volume Vang Ngắn.
- Channel 1, CC9: Delay.
- Channel 1, CC24: Vang on/off.
- Channel 1, CC25: Lofi bypass.
- Channel 1, CC22: Remix bypass.
- Channel 1, CC27: Autotune bypass.
- Channel 1, CC26: Tăng tông beat plugin on/off.
- Channel 1, CC13: Mở Auto Key.
- Channel 1, CC18: Scale Autotune.
- Channel 1, CC17: Key Autotune.
- Channel 1, CC6: Tune Amount.
- Channel 1, CC11: Flex Tune.
- Channel 1, CC10: Bè / Harmony quick control.
- Channel 1, CC7: Tăng tông beat quick control.

## Kiểm tra loopMIDI và Cubase

Trong app, bấm `Làm mới MIDI` để đọc danh sách MIDI output. Nếu loopMIDI đã chạy đúng, bạn sẽ thấy port kiểu `loopMIDI Port ...` trong dropdown.

Bấm `Test MIDI` để app gửi MIDI CC 23 giá trị 127 tới port đang chọn. Nếu log hiện `Test MIDI OK`, app đã mở được MIDI output và đã gửi message ra loopMIDI. Trong ToneLink script hiện tại, CC23 cũng là `Send 2 On`.

Để biết Cubase có nhận không:

1. Trong Cubase, chọn đúng loopMIDI port làm MIDI input.
2. Bật MIDI activity/monitor trong Cubase hoặc mở MIDI Remote mapping.
3. Bấm `Test MIDI` trong app.
4. Nếu Cubase báo MIDI activity hoặc mapping learn nhận CC 23, nghĩa là loopMIDI -> Cubase hoạt động.

Các nút transport hiện gửi MIDI CC để MIDI Remote API script bắt được:

- `Play`: CC 1, value 127.
- `Stop`: CC 2, value 127.
- `Record`: CC 3, value 127.
- `Cycle`: CC 4, value 127.
- `Metronome`: CC 5, value 127.

Nếu Cubase chưa load đúng MIDI Remote script hoặc chưa chọn đúng loopMIDI input, app vẫn gửi MIDI thành công nhưng Cubase sẽ không chạy/dừng/record.

Giá trị CC 30 đang dùng cho tone:

- `0..11`: C major tới B major.
- `12..23`: C minor tới B minor.

Cubase không cung cấp một API desktop đơn giản để app ngoài tự sửa toàn bộ project theo tone trong thời gian thực. Vì vậy MVP này gửi tone ra MIDI CC để bạn quyết định map vào transpose/pitch plugin, macro, hoặc workflow riêng trong Cubase.

## Theo dõi người dùng chọn video YouTube

App hiện mở YouTube bằng một `BrowserWindow` riêng của Electron. Khi người dùng click một video và URL đổi sang `watch?v=...` hoặc `/shorts/...`, main process gửi event về UI và app xem đó là trigger để bật engine dò tone.

Nếu mở YouTube bằng trình duyệt ngoài như Chrome/Edge độc lập, app desktop không thể biết người dùng click video nào nếu không có thêm browser extension hoặc cơ chế automation riêng. Vì vậy nút `Mở YouTube` hiện mở cửa sổ YouTube do app quản lý để trigger hoạt động ổn định.

## Kiến trúc

- `src/main/main.js`: Electron main process, mở YouTube/Cubase, spawn Python engine, IPC.
- `src/main/preload.js`: Bridge an toàn giữa renderer và main.
- `src/renderer/*`: UI.
- `engine/app.py`: JSON command server qua stdio.
- `engine/audio_loopback.py`: Thu audio hệ thống qua `soundcard`.
- `engine/key_detector.py`: Dò tone bằng Essentia `KeyExtractor`, fallback về detector NumPy legacy nếu Essentia chưa có sẵn.
- `engine/cubase_midi.py`: Gửi MIDI CC sang Cubase/loopMIDI.
- `cubase_remote/*`: Cubase MIDI Remote API script.

## Ghi chú về realtime

Engine đang phân tích theo streaming window, nhưng UI hiển thị tone chính của bài thay vì tone tức thời từng cửa sổ:

- Thu audio theo chunk 0.5 giây.
- Tính `instant_key` cho từng cửa sổ để tham khảo/debug.
- Gom các kết quả đủ confidence thành phiếu bầu.
- Chỉ hiển thị `Tone chính` sau khi đủ số phiếu tối thiểu, mặc định 12 phiếu.
- Cửa sổ phân tích trượt tối đa 2 giây.
- Mode mặc định `essentia` dùng `KeyExtractor` và trả thêm `strength`/`detector_source`.
- Analyzer dùng weighted hysteresis để bỏ qua key thoáng qua sau khi đã lock tone chính.
- Transition/cao trào được arm bằng multi-feature trend: RMS, spectral flux, spectral centroid và high-band ratio.
- MIDI auto-send chỉ commit khi engine đặt `midi_should_send=true`, gồm `send_initial_key` và `send_climax_key`.
- Debug timeline được ghi vào `%LOCALAPPDATA%/ToneLink/debug-timeline.jsonl` hoặc `TONELINK_DEBUG_DIR`.
- Engine warm-up detector trong nền khi khởi động để tránh lần phân tích đầu tiên bị chậm.

Khi người dùng chọn video YouTube mới hoặc bấm `Bắt đầu dò tone`, app reset bộ gom để tone chính không bị lẫn với bài trước.

Nếu muốn kết quả ổn định hơn nhưng chậm hơn, có thể tăng `min_main_key_votes` hoặc `window_seconds` trong `engine/audio_loopback.py`.

UI có thêm chỉ báo `UI: hh:mm:ss` trong panel dò tone. Chỉ báo này được render bằng `requestAnimationFrame`. Khi đang click/xem YouTube nhúng, nếu `UI` vẫn đổi thời gian nhưng tone không đổi thì vấn đề nằm ở engine/audio event. Nếu `UI` cũng đứng, vấn đề là renderer/webview bị throttle hoặc compositor không repaint.
