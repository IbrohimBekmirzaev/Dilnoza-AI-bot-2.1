# Dilnoza AI — Shaxsiy Telegram AI Bot 🤖✨

Ushbu loyiha sizning shaxsiy va aqlli Telegram yordamchingiz bo'lib, u **Dilnoza AI** modeli yordamida ishlaydi. Bot siz bilan o'zbek tilida tez, muloyim va tabiiy muloqot qila oladi. Telegram botingiz 24/7 rejimda Railway platformasida ishlaydi.

---

## 🌟 Asosiy Imkoniyatlar (Features)

*   **Dilnoza AI:** Tez va tabiiy javoblar beruvchi aqlli model.
*   **Doimiy Xotira va Sozlamalar:** Bot suhbat tarixini, admin huquqlarini va foydalanuvchi sozlamalarini SQLite ichida saqlaydi.
*   **Suhbat Kontekstini Eslab Qolish (Memory):** Bot oxirgi 12 ta xabarni (6 ta savol-javob turnini) eslab qoladi, bu esa suhbatni tabiiy davom ettirishga imkon beradi.
*   **Chiroyli Formatlash:** Markdown kodlarini chiroyli HTML formatiga o'tkazadi (Code blocks, Bold, Italic, Headers qo'llab-quvvatlanadi).
*   **Yozayotganlik Indikatori ("typing..."):** Bot javob o'ylayotgan paytda Telegramda "yozmoqda..." statusini ko'rsatib turadi.
*   **Xotirani Tozalash:** `/clear` buyrug'i orqali eski suhbatni butunlay tozalab, yangi mavzuni boshlash mumkin.
*   **Tabiiy Buyruq Tushunish:** Asosiy admin oddiy matn orqali admin tayinlash, huquqni pasaytirish, ro'yxatni ko'rish va boshqa buyruqlarni bera oladi.
*   **Suhbat Uslubi Boshqaruvi:** `qisqa javob ber`, `batafsil javob ber`, `insondek suhbat qur`, `texnik rejimni yoq` kabi iboralar bilan bot uslubi o'zgaradi.
*   **Xavfli Buyruqlar Tasdiqlanishi:** Adminni o'chirish yoki to'liq huquq berish kabi amallarda tasdiqlash kodi so'raladi.
*   **Ovozli Suhbat:** Foydalanuvchi ovozli xabar yuborsa, bot uni matnga aylantiradi, javob tayyorlaydi va yana ovozli xabar yuboradi.
*   **Railway Tayyorligi:** Railway uchun maxsus kichik HTTP server va avtomatik port sozlamalari yozilgan (Health check muvaffaqiyatli o'tishi uchun).

---

## 🛠 Mahalliy Kompyuterda Ishga Tushirish (Local Setup)

Agar botni o'zingizning kompyuteringizda sinab ko'rmoqchi bo'lsangiz, quyidagi bosqichlarni bajaring:

### 1. Talablar
*   [Node.js](https://nodejs.org/) (v18 yoki undan yuqori) kompyuteringizda o'rnatilgan bo'lishi kerak.

### 2. Kutubxonalarni O'rnatish
Loyiha papkasida terminalni oching va quyidagi buyruqni ishga tushiring:
```bash
npm install
```

### 3. Konfiguratsiya
Loyiha papkasida `.env` nomli fayl yarating (yoki `.env.example` faylini nusxalab nomini o'zgartiring) va quyidagi ma'lumotlarni yozing:
```env
BOT_TOKEN=telegram_bot_tokeningiz
DILNOZA_AI_API_KEY=sizning_dilnoza_ai_kalitingiz
DILNOZA_AI_TRANSCRIBE_MODEL=gpt-4o-mini-transcribe
DILNOZA_AI_TTS_MODEL=gpt-4o-mini-tts
DILNOZA_AI_VOICE_NAME=alloy
DILNOZA_AI_CUSTOM_VOICE_ID=
DILNOZA_AI_VOICE_LANGUAGE=uz
```
`DILNOZA_AI_VOICE_NAME` qatorini almashtirib ovozni o'zgartirasiz. Masalan `alloy`, `nova` yoki `shimmer`.
Agar o'zingizning maxsus ovozingiz bo'lsa, `DILNOZA_AI_CUSTOM_VOICE_ID` ga shu ovoz ID sini yozasiz. Shunda oddiy ovoz nomi emas, aynan siz yaratgan ovoz ishlatiladi.

*(Dilnoza AI uchun mos kalitni xizmat sozlamalaringizdan olishingiz mumkin)*

### 4. Ishga Tushirish
Botni sinov rejimida ishga tushirish:
```bash
npm run dev
```

### 5. Foydali Matn Buyruqlar
```text
/start
qisqa javob ber
batafsil javob ber
insondek suhbat qur
texnik rejimni yoq
sozlamalarimni ko'rsat
xotirani tozala
ovozli xabar yuborish
```

---

## 🚀 GitHub orqali Railway'ga Yuklash va 24/7 Ishlatish (Deployment)

Botni har doim (24/7) ishlab turadigan qilish uchun uni GitHub'ga yuklab, keyin Railway platformasiga bog'laymiz.

### 1-Qadam: GitHub'da yangi repozitoriy yarating
1. [GitHub.com](https://github.com/) saytiga kiring va yangi **Private** (shaxsiy) yoki **Public** (ommaviy) repozitoriy yarating (masalan, `dilnoza-ai-bot` deb nomlang).
2. Repozitoriy yaratilgandan so'ng, u sizga beradigan Git buyruqlarini nusxalab oling.

### 2-Qadam: Loyihani GitHub'ga yuklang
Kompyuteringiz terminalida (loyiha papkasi ichida) quyidagi buyruqlarni ketma-ket yuboring:
```bash
# Git tizimini faollashtirish
git init

# Barcha fayllarni tayyorlash (.gitignore tufayli maxfiy fayllar yuklanmaydi)
git add .

# Ilk commit'ni yozish
git commit -m "Dilnoza AI bot initialization"

# GitHub repozitoriyingizni bog'lash (o'z havolangizni qo'ying!)
git branch -M main
git remote add origin https://github.com/SIZNING_USERNAME/dilnoza-ai-bot.git

# Kodni GitHub'ga yuklash
git push -u origin main
```

### 3-Qadam: Railway'da Deploy qilish
1. [Railway.app](https://railway.app/) saytiga kiring va profilingiz orqali ro'yxatdan o'ting.
2. Bosh sahifada **"New Project"** (Yangi Loyiha) tugmasini bosing.
3. Ro'yxatdan **"Deploy from GitHub repo"**-ni tanlang va yaratgan `dilnoza-ai-bot` repozitoriyingizni tanlang.
4. **"Deploy Now"** tugmasini bosing.

### 4-Qadam: Muhit O'zgaruvchilarini (Variables) Sozlash (MUHIM!)
Railway kodni yuklab bo'lgandan so'ng, loyiha sozlamalariga kirib, API kalitlarini kiritishingiz kerak:
1. Railway loyiha panelida botingiz ustiga bosing va **Variables** (O'zgaruvchilar) bo'limiga o'ting.
2. Quyidagi 2 ta o'zgaruvchini qo'shing (Add Variable):
   *   `BOT_TOKEN` ➡️ `telegram_bot_tokeningiz`
   *   `DILNOZA_AI_API_KEY` ➡️ `sizning_haqiqiy_dilnoza_ai_kalitingiz`
3. Agar SQLite ichidagi xotira, adminlar va sozlamalar restartdan keyin ham saqlansin desangiz, Railway'da persistent volume ulash tavsiya qilinadi.
4. O'zgaruvchilar saqlangandan so'ng, Railway loyihani avtomatik ravishda qayta ishga tushiradi va botingiz 24/7 rejimida ishlashni boshlaydi! 🎉

---

## 👨‍💻 Yaratuvchi haqida
Bu bot **Antigravity AI** tomonidan **Dilnoza** uchun maxsus va eng yuqori sifat standartlariga muvofiq yaratildi.
 Savollaringiz yoki qo'shimcha takliflaringiz bo'lsa, bemalol murojaat qilishingiz mumkin!
