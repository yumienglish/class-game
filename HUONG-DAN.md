# 🏴‍☠️ Yumi Treasure Quiz — Hướng dẫn

Game quiz thi đua cho nhóm học sinh chơi cùng lúc trên điện thoại hoặc máy tính riêng.
Mỗi em trả lời theo tốc độ của mình. Trả lời đúng thì được chọn 1 trong 3 rương; rương có thể cho
+điểm, nhân đôi/nhân ba, **cướp 25% điểm** hoặc **đổi điểm** với một bạn, cũng có khi trống hoặc làm rơi điểm.
Hết giờ, ai nhiều điểm nhất thì thắng. Màn hình giáo viên hiện bảng xếp hạng chạy trực tiếp và bảng tin "ai vừa cướp của ai".

- Link chơi: `https://yumienglish.github.io/class-game/`
- Màn hình giáo viên: `https://yumienglish.github.io/class-game/#host`
- Chơi thử không cần Firebase: thêm `?demo` vào link, rồi mở nhiều tab trên **cùng một máy** (1 tab giáo viên, các tab còn lại là học sinh).

---

## Cài Firebase (làm 1 lần, khoảng 5 phút)

1. Vào <https://console.firebase.google.com> → **Create a project** → đặt tên (vd `yumi-quiz`) → tắt Google Analytics → **Create**.
2. **Build → Realtime Database → Create Database**
   - Location: **Singapore (asia-southeast1)**
   - Chọn **Start in locked mode** → Enable.
   - Mở tab **Rules**, xóa hết nội dung cũ, dán toàn bộ nội dung file `database.rules.json` vào → **Publish**.
3. **Build → Authentication → Get started → Sign-in method → Anonymous → Enable → Save.**
   (Học sinh không cần tài khoản; mỗi tab trình duyệt được cấp một mã ẩn danh.)
4. Bấm ⚙️ **Project settings** → kéo xuống **Your apps** → bấm biểu tượng **`</>`** (Web) → đặt tên → **Register app**.
   Firebase hiện ra đoạn `const firebaseConfig = { apiKey: ..., ... }`. Copy 5 dòng `apiKey`, `authDomain`,
   `databaseURL`, `projectId`, `appId` vào file `firebase-config.js` (hoặc gửi đoạn đó cho Claude dán và đẩy lên giúp).
   Nếu đoạn config không có `databaseURL`, lấy địa chỉ ở đầu trang Realtime Database (dạng `https://...firebasedatabase.app`).
5. Đẩy code lên GitHub. Mở link chơi: dải vàng "Chế độ thử" phải **biến mất**, như vậy là đã chạy bằng Firebase.

> `apiKey` của Firebase được thiết kế để công khai, để trong repo public không sao. Dữ liệu được bảo vệ bằng luật ở bước 2:
> chỉ giáo viên tạo phòng mới đổi được trạng thái phòng, học sinh chỉ ghi được phần người chơi và bảng tin.

Gói miễn phí (Spark) cho phép 100 kết nối cùng lúc, thừa sức cho lớp 4 em.

---

## Cách chơi trên lớp

**Giáo viên** (nên dùng laptop chiếu lên màn hình):
Giao diện game bằng tiếng Anh. Tên các nút được ghi trong ngoặc ở dưới.
1. Mở link `#host`. Ở ô **📚 Questions**, chọn bộ đề có sẵn hoặc dán câu hỏi mới, mỗi dòng 1 câu:
   ```
   She ___ to school every day. | goes | go | going | gone
   ```
   Đáp án **đầu tiên là đáp án đúng** (game tự xáo trộn khi hiện). Mỗi câu có 2–4 đáp án. Dòng bắt đầu bằng `#` bị bỏ qua.
2. Bấm **💾 Save set** để lần sau chọn lại. Bộ đề được lưu trong trình duyệt của máy đang dùng.
3. Chọn thời gian (3–15 min) → **🚀 Create game** → màn hình hiện mã 6 số (PIN) và link.
4. Khi đủ học sinh → **▶️ Start!**. Trong lúc chơi có thể bấm **➕ 1 min** hoặc **⏹ End now**.
5. Màn kết quả (**Results**) hiện bục 1-2-3 và bảng số câu đúng/sai, tỉ lệ đúng của từng em.
   **🔁 Play again** giữ nguyên nhóm và đề, điểm về 0.

**Bộ từ vựng có tranh** (ô 📚 Questions → nhóm "Picture word sets"):
- 🖼️ **Unit 8 – Get Set, Go! (PET B1)**: 55 từ. 14 tranh lấy từ artifact flashcard Unit 8 (file `.webp`), 41 tranh vẽ thêm (file `.svg`), tất cả nằm trong `img/u8/`.
- Chọn dạng câu (trộn lẫn): 🖼️ Tranh → từ · 💬 Nghĩa Việt → từ · 📖 Định nghĩa tiếng Anh → từ · 🔤 Từ → chọn tranh.
- Chọn chủ đề (Sports, Places, Gear…) để chỉ ôn một phần từ.
- Đáp án nhiễu lấy cùng chủ đề. Những tranh dễ nhầm nhau (vd: equipment / helmet, coach / instructor) không bao giờ là đáp án nhiễu của nhau; danh sách này nằm ở `confuse` trong `decks/unit8.js`.
- Muốn sửa nghĩa hoặc định nghĩa: sửa trong `decks/unit8.js`, rồi tăng `?v=` của file đó trong `app.js` (biến `DECKS`).

**Học sinh**: mở link → nhập mã phòng (Game PIN), tên (Your name), chọn con vật → **Join! 🚀**.
Tải lại trang hoặc rớt mạng vẫn giữ được điểm (miễn là không đóng tab).

**Âm thanh** (tự tạo bằng code, không dùng file):
- Màn giáo viên có nhạc nền: bản nhẹ ở phòng chờ, bản sôi động lúc chơi. 30 giây cuối nhạc nhanh dần, 10 giây cuối có tiếng tích tắc. Ngoài ra có tiếng "pop" khi có em vào phòng, tiếng hiệu ứng khi có em cướp hoặc đổi điểm, và tiếng trống kèm kèn lúc công bố kết quả.
- Máy học sinh chỉ có hiệu ứng (đúng, sai, mở rương, từng loại quà, bị cướp điểm, hết giờ…), không có nhạc nền.
- Nút 🎵 (bật/tắt nhạc, chỉ có ở màn giáo viên) và nút 🔊 (tắt mọi tiếng) nằm ở góc dưới bên phải. Lúc học sinh đang trả lời câu hỏi, nút 🔊 chuyển lên thanh điểm ở đầu màn hình.
- Trình duyệt chỉ cho phát tiếng sau lần chạm hoặc bấm đầu tiên. Nếu tải lại trang giữa chừng, chạm vào màn hình một lần là có tiếng lại.

**Lưu ý**
- Phải giữ tab giáo viên mở suốt ván, vì tab này báo hết giờ cho cả phòng.
- Ở phòng chờ, giáo viên bấm × để cho một em ra khỏi phòng (ví dụ em gõ tên sai).
- Hai em không được trùng tên trong cùng một phòng.

## Rương (tỉ lệ xuất hiện)
Chữ trên rương là tiếng Anh ngắn gọn:

| Chữ trên rương | Ý nghĩa | Tỉ lệ |
|---|---|---|
| 🪙 +10 / +20 | cộng điểm | 34% |
| 💰 +30 / +50 | cộng điểm | 19% |
| 💎 +100 | cộng điểm | 3% |
| ✨ Double! / 🌟 Triple! | nhân đôi / nhân ba điểm | 8% |
| 🦝 Steal! | lấy 25% điểm của 1 bạn | 12% |
| 🔄 Swap! | đổi điểm với 1 bạn | 4% |
| 💸 Oops! -10% | mất 10% điểm | 6% |
| 🕸️ Empty | rương trống | 8% |

Muốn đổi tỉ lệ: sửa bảng `PRIZES` ở đầu file `app.js` (cột `w`).
