# DONO — Django Fullstack Test Platformasi (Port 8000 · PythonAnywhere Ready · API kalitsiz)

To‘liq **Python + Django 5.2 Fullstack** tizim (**Django Templates Veb Admin + SQLite Baza + Android APK REST API**) — tashqi API token yoki Node.js talab qilinmaydi va **PythonAnywhere**ga to‘g‘ridan-to‘g‘ri yuklashga moslashtirilgan.

---

## Loyiha tuzilishi

- **`dono_project/`** — Django asosiy sozlamalari (`settings.py`, `urls.py`, `wsgi.py`, `middleware.py`, WhiteNoise static xizmati).
- **`tests_app/`** — Barcha modellar (`Subject`, `QuestionBank`, `Quiz`, `Question`, `Student`, `Friendship`, `TestAttempt`, `AttemptAnswer`), **Word (`.docx`) / PDF (`.pdf`) / TXT / Excel / CSV / JSON** `#a)` parser (`test_parser.py`), HTML sahifalar (`views_pages.py`) va **Android APK REST API** (`views_api.py`).
- **`templates/` & `static/`** — Serverda render qilinadigan toza HTML/CSS/JS admin paneli.
- **`pythonanywhere_wsgi_example.py`** — PythonAnywhere WSGI konfiguratsiyasi namunasi.
- **`android-app/`** — Material 3 Kotlin Android ilovasi (`DonoApiClient.kt` barcha `/api/...` endpointlarga to‘liq mos).

---

## Imkoniyatlar

- **API kalitsiz va o‘z SQLite bazasi (`db.sqlite3`)**: Baza birinchi `migrate` da toza holda yaratiladi (faqat standart `admin` / `admin123` hisobi qo‘shiladi).
- **Testlar bo‘limi (`/tests/`)**: Raqamlangan ro‘yxat (`1. Ona tili yangi`, `2. matem`, ...). **+ Yangi test yuklash** bosilganda test nomi va fan biriktirilib **Word (`.docx`)** yoki **PDF (`.pdf`)** (`#a)` formatida) yuklanadi:
  ```text
  1. Savol matni?
  #a) To‘g‘ri variant
  b) Ikkinchi variant
  c) Uchinchi variant
  d) To‘rtinchi variant
  ```
- **Fanlar va To‘plamlar (`/subjects/`)**: Fan yaratish va yuklangan testlarni APK uchun test to‘plamlariga biriktirish.
- **Avtomatik chalkashtirish (`shuffle` + `shuffled_token`)**: Android APK `10 / 25 / 50` rejimda test yechganda savollar ketma-ketligi ham, `a/b/c/d` variantlari (to‘g‘ri javob harfi) ham har safar yangidan chalkashtiriladi va HMAC token orqali serverda aniq baholanadi.
- **Foydalanuvchi kirishi (`/api/student/login`)**: O‘quvchi **F.I.O** va **telefon raqami** orqali kiradi — har bir telefon raqami faqat bitta foydalanuvchiga biriktiriladi.

---

## 1. Lokal kompyuterda ishga tushirish (8000-port)

```bash
python -m venv .venv
# Windows PowerShell:
.\.venv\Scripts\Activate.ps1
# Linux / macOS:
# source .venv/bin/activate

pip install -r requirements.txt
python manage.py migrate
python manage.py collectstatic --noinput
python manage.py runserver 0.0.0.0:8000
```

- Admin panel: `http://localhost:8000`
- Standart admin kirish: **Login:** `admin` · **Parol:** `admin123`

---

## 2. PythonAnywhere ga yuklash va ishga tushirish

1. **PythonAnywhere Bash console** da repozitoriyani yuklang va Python 3.12 virtualenv yarating:
   ```bash
   git clone https://github.com/salikhabduvaliyev/testApp.git ~/testApp
   cd ~/testApp
   mkvirtualenv --python=/usr/bin/python3.12 dono-env
   pip install -r requirements.txt
   python manage.py migrate
   python manage.py collectstatic --noinput
   ```
2. **Web** bo‘limida **Add a new web app** &rarr; **Manual configuration** &rarr; **Python 3.12** ni tanlang.
3. **Virtualenv** maydoniga `/home/<username>/.virtualenvs/dono-env` kiriting (bu yerda `<username>` — PythonAnywhere foydalanuvchi nomingiz).
4. **WSGI configuration file** ni ochib, `pythonanywhere_wsgi_example.py` dagi kodni joylashtiring (`<username>` ni almashtiring, xavfsizlik uchun `DJANGO_SECRET_KEY` o‘zgaruvchisini ham bering).
5. **Static files** bo‘limida qator qo‘shing:
   - **URL:** `/static/`
   - **Directory:** `/home/<username>/testApp/staticfiles`
6. Yuqoridagi yashil **Reload** tugmasini bosing. Saytingiz `https://<username>.pythonanywhere.com` da ishga tushadi!
7. **Android APK**: Ilova standart holatda `http://apptest7777.pythonanywhere.com` serveriga to‘g‘ridan-to‘g‘ri ulangan (boshqa manzil uchun `android-app/local.properties` da `SERVER_URL=...` berib qayta yig‘ish mumkin).
