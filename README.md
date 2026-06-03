# Cubase YouTube Tone Assistant

App Windows dùng Electron làm UI và Python/librosa làm engine để:

- Tự mở YouTube khi bật app.
- Mở YouTube trong một cửa sổ Electron riêng và theo dõi video được chọn để tự trigger dò tone.
- Tự mở Cubase nếu đã cấu hình đường dẫn `.exe`.
- Nghe audio hệ thống bằng WASAPI loopback.
- Dò tone realtime từ bài đang phát trên YouTube.
- Điều khiển Cubase cơ bản qua MIDI Remote API: Play, Stop, Record.
- Gửi tone hiện tại sang Cubase qua MIDI CC 30 để bạn map thêm nếu cần transpose/tone workflow.
- Điều khiển selected track volume/pan/mute/solo/monitor/record và Send 1/2 theo ToneLink MIDI Remote script.

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

## Cấu hình Cubase

Để nhận lệnh từ app:

1. Tạo một MIDI loopback port bằng loopMIDI.
2. Trong Cubase, bật input MIDI từ port đó.
3. Cài MIDI Remote script trong thư mục `cubase_remote`, hoặc chạy lệnh install bên dưới.
4. Chọn selected track trong Cubase để các control volume/pan/mute/solo/monitor/record tác động đúng track.
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

Mapping mặc định của script:

- `CC 1`: Play.
- `CC 2`: Stop.
- `CC 3`: Record.
- `CC 4`: Cycle.
- `CC 5`: Metronome.
- `CC 10`: Selected track volume.
- `CC 11`: Selected track pan.
- `CC 12`: Selected track mute.
- `CC 13`: Selected track solo.
- `CC 14`: Selected track monitor.
- `CC 15`: Selected track record enable.
- `CC 20`: Send 1 level.
- `CC 21`: Send 1 on.
- `CC 22`: Send 2 level.
- `CC 23`: Send 2 on.
- `CC 30`: Detected key, sent by the app but not mapped in the provided ToneLink script yet.

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
- `engine/key_detector.py`: Dò tone bằng `librosa` chroma + Krumhansl key profile.
- `engine/cubase_midi.py`: Gửi MIDI CC sang Cubase/loopMIDI.
- `cubase_remote/*`: Cubase MIDI Remote API script.

## Ghi chú về realtime

Engine đang phân tích theo streaming window để phản hồi nhanh hơn:

- Thu audio theo chunk 0.5 giây.
- Có kết quả đầu tiên sau khoảng 1 giây nếu audio đủ lớn.
- Cửa sổ phân tích trượt tối đa 2 giây.
- Mode `fast` dùng chroma thuần `numpy` để tránh chi phí khởi tạo `librosa` ở lần dò đầu tiên.
- Engine warm-up detector trong nền khi khởi động để tránh lần phân tích đầu tiên bị chậm.

Nếu muốn kết quả ổn định hơn nhưng chậm hơn, có thể tăng `window_seconds` hoặc đổi mode sang `accurate` trong `engine/audio_loopback.py`. Mode `accurate` mới dùng `librosa.chroma_cqt`.

UI có thêm chỉ báo `UI: hh:mm:ss` trong panel dò tone. Chỉ báo này được render bằng `requestAnimationFrame`. Khi đang click/xem YouTube nhúng, nếu `UI` vẫn đổi thời gian nhưng tone không đổi thì vấn đề nằm ở engine/audio event. Nếu `UI` cũng đứng, vấn đề là renderer/webview bị throttle hoặc compositor không repaint.
