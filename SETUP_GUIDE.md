# 🎮 Live Zone Website v3.0 — دليل الإعداد

## المتطلبات
- Node.js >= 18
- MongoDB Atlas (أو محلي)
- Discord Application (OAuth2)

## متغيرات البيئة المطلوبة

```env
CLIENT_ID=     # معرف تطبيق Discord
CLIENT_SECRET= # سر تطبيق Discord  
SESSION_SECRET= # سر عشوائي للجلسات
BOT_TOKEN=     # توكن البوت
BOT_SECRET=    # سر البوت للـ API
MONGO_URI=     # رابط MongoDB
REDIRECT_URI=  # https://yourdomain.com/auth/callback
PORT=3000
```

## التثبيت

```bash
npm install
npm start
```

## التحديثات الجديدة في v3.0

### 1. نظام الجلسات بالـ IP
- المستخدم يسجل دخول مرة واحدة فقط
- يبقى مسجلاً لمدة 30 يوماً
- إذا مسح الكوكيز، يستعيد الجلسة تلقائياً بالـ IP
- عند تسجيل الخروج يُمسح سجل الـ IP أيضاً

### 2. لعبة Codenames
- يوجد في `/codenames`
- لعبة كاملة: 25 كلمة، فريقان
- دعم اللعب الحقيقي (4 لاعبين) أو ضد الذكاء الاصطناعي
- نظام نقاط وترتيب
- رتبة TOP للاعب الأفضل (ID: 1481684788996739143)
- Real-time بالـ Socket.IO

### 3. الـ Socket.IO
المشروع يستخدم Socket.IO للـ real-time، تأكد من أن المشروع يستخدم `server.listen` وليس `app.listen`

## صفحات الموقع
- `/` — صفحة تسجيل الدخول
- `/dashboard` — لوحة التحكم الرئيسية
- `/codenames` — لعبة Codenames

## Collections في MongoDB
- `website_ratings` — التقييمات
- `website_announcements` — الإعلانات
- `rp_members_cache` — ذاكرة الـ RP
- `website_tweets` — التغريدات
- `website_comments` — التعليقات
- `ip_sessions` — جلسات الـ IP (حفظ تسجيل الدخول)
- `codenames_games` — ألعاب Codenames
- `codenames_stats` — إحصائيات اللاعبين
