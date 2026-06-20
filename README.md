# Dilnoza AI — Shaxsiy Telegram AI Bot 🤖✨

Ushbu loyiha sizning shaxsiy va aqlli Telegram yordamchingiz bo'lib, u **Dilnoza AI** modeli yordamida ishlaydi. Bot siz bilan o'zbek, rus, ingliz va boshqa tillarda juda tez va muloyim muloqot qila oladi. Telegram botingiz 24/7 rejimda, mutlaqo bepul yoki juda arzon narxda Railway platformasida ishlaydi.

---

## 🌟 Asosiy Imkoniyatlar (Features)

*   **Dilnoza AI:** Tez va tabiiy javoblar beruvchi aqlli model.
*   **Suhbat Kontekstini Eslab Qolish (Memory):** Bot oxirgi 12 ta xabarni (6 ta savol-javob turnini) eslab qoladi, bu esa suhbatni tabiiy davom ettirishga imkon beradi.
*   **Chiroyli Formatlash:** Markdown kodlarini chiroyli HTML formatiga o'tkazadi (Code blocks, Bold, Italic, Headers qo'llab-quvvatlanadi).
*   **Yozayotganlik Indikatori ("typing..."):** Bot javob o'ylayotgan paytda Telegramda "yozmoqda..." statusini ko'rsatib turadi.
*   **Xotirani Tozalash:** `/clear` buyrug'i orqali eski suhbatni butunlay tozalab, yangi mavzuni boshlash mumkin.
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
```
*(Dilnoza AI uchun mos kalitni xizmat sozlamalaringizdan olishingiz mumkin)*

### 4. Ishga Tushirish
Botni sinov rejimida ishga tushirish:
```bash
npm run dev
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
3. O'zgaruvchilar saqlangandan so'ng, Railway loyihani avtomatik ravishda qayta ishga tushiradi va botingiz 24/7 rejimida ishlashni boshlaydi! 🎉

---

## 👨‍💻 Yaratuvchi haqida
Bu bot **Antigravity AI** tomonidan **Dilnoza** uchun maxsus va eng yuqori sifat standartlariga muvofiq yaratildi.
 Savollaringiz yoki qo'shimcha takliflaringiz bo'lsa, bemalol murojaat qilishingiz mumkin!
