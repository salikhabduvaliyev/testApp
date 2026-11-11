# DONO — O‘z Bazali Test Platformasi (Port 8000 · API kalitsiz)

To‘liq 3 qismli tizim (**O‘z SQLite Baza + Node Server (port 8000)** · **Veb Admin Panel** · **Android Material 3 APK**) — **tashqi API token yoki API kalit talab qilinmaydi**:

- **Server va O‘z Baza (`server/`)**: Node.js `node:sqlite` (`server/dono.db`) bazasi va HTTP/SSE serveri **8000-portda** ishlaydi. Testlar (`question_banks`), fanlar (`subjects`), test to‘plamlari (`quizzes` ↔ `quiz_banks`), savollar, o‘quvchilar va urinishlar lokal SQLite faylida saqlanadi.
- **Veb Admin Panel (`admin-web/`)**: Port `8000` orqali ochiladi (`http://localhost:8000`). Admin login/parol (`admin` / `admin123`) bilan kirib:
  - **Testlar** bo‘limida raqamlangan testlar ro‘yxatini ko‘radi va **+ Yangi test yuklash** tugmasi orqali test nomi + fanini biriktirib **Word (`.docx`)** yoki **PDF (`.pdf`)** (shuningdek `.txt`, `.xlsx`, `.csv`, `.json`) faylni `#a)` formatida yuklaydi:
    ```text
    1. Savol matni
    #a) To‘g‘ri variant
    b) Ikkinchi variant
    c) Uchinchi variant
    d) To‘rtinchi variant
    ```
  - **Fanlar va Testlar**da **+ Test to‘plami qo‘shish** tugmasi orqali yuklangan testlardan tanlab fanga biriktiradi hamda APKdan kelayotgan natijalarni **real vaqtda (SSE)** kuzatadi.
- **Android APK (`android-app/`)**: O‘quvchilar **F.I.O** va **telefon raqami** orqali kiradi (har bir telefon raqam faqat bitta foydalanuvchiga tegishli), fanni va test to‘plamini tanlaydi va **10 / 25 / 50 ta** rejimda test yechadi. Har bir urinishda **savollar ketma-ketligi ham, A/B/C/D javob variantlari (to‘g‘ri javob harfi) ham avtomatik chalkashtirilib** beriladi va serverda `shuffled_token` orqali aniq tekshiriladi.

---

## Loyihani ishga tushirish

### 1. Sayt (Admin Web) ni yig‘ish (`admin-web/`)
```bash
cd admin-web
npm install
npm run build
```

### 2. Server va Baza (`server/`)
```bash
cd server
npm install
node server.mjs
```
- Baza birinchi ishga tushishda toza holda yaratiladi (faqat standart admin hisobi qo‘shiladi).
- Admin sayt manzili: `http://localhost:8000`
- Standart admin kirish: **Login:** `admin` · **Parol:** `admin123`

---

### 3. Android APK ni yig‘ish va ulash (`android-app/`)
APK standart holatda **API kalitsiz** emulatorda `http://10.0.2.2:8000`, real telefonda esa build paytida aniqlangan lokal Wi-Fi IP (`http://<LAN-IP>:8000`) manziliga ulanadi.

- Agar **real telefonda (Wi-Fi)** sinasangiz, ilova ichidagi **Server sozlamalari** tugmasidan kompyuteringizning lokal IP manzilini kiriting (masalan, `http://192.168.1.50:8000`), yoki build oldidan `android-app/local.properties` fayliga yozing:
  ```properties
  SERVER_URL=http://192.168.1.50:8000
  ```
- APK yig‘ish:
  ```bash
  cd android-app
  ./gradlew assembleDebug
  ```
Tayyor APK manzili: `android-app/app/build/outputs/apk/debug/app-debug.apk`.
