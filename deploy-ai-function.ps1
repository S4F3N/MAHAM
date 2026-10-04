# سكربت تفعيل مساعد الذكاء الاصطناعي في "مهام صَفوان"
# شغّله من داخل مجلد المشروع (اللي فيه index.html) بأمر:
#   powershell -ExecutionPolicy Bypass -File .\deploy-ai-function.ps1

function Fail($msg) {
    Write-Host $msg -ForegroundColor Red
    Read-Host "اضغط Enter للإغلاق"
    exit 1
}

if (-not (Test-Path ".\index.html")) {
    Fail "ما لقيت ملف index.html بهذا المجلد. افتح الطرفية داخل مجلد المشروع (اللي نزّلته من GitHub) وشغّل السكربت من هناك."
}

Write-Host "===== 1) التحقق من Node.js =====" -ForegroundColor Cyan
node --version
if ($LASTEXITCODE -ne 0) {
    Fail "Node.js غير مثبت على جهازك. حمّله من https://nodejs.org (النسخة LTS)، ثبّته، ثم شغّل هذا السكربت من جديد."
}

Write-Host "`n===== 2) التحقق من Firebase CLI =====" -ForegroundColor Cyan
firebase --version
if ($LASTEXITCODE -ne 0) {
    Write-Host "Firebase CLI غير مثبتة — جارٍ تثبيتها الآن (قد تأخذ دقيقة)..." -ForegroundColor Yellow
    npm install -g firebase-tools
    if ($LASTEXITCODE -ne 0) { Fail "تعذر تثبيت firebase-tools. جرّب تشغيل الطرفية كمسؤول (Run as Administrator) وأعد المحاولة." }
}

Write-Host "`n===== 3) سحب آخر تحديثات المشروع من GitHub =====" -ForegroundColor Cyan
git pull
if ($LASTEXITCODE -ne 0) { Fail "تعذر سحب التحديثات. تأكد إن المجلد فيه مستودع git صحيح (git status)." }

Write-Host "`n===== تنبيه قبل المتابعة =====" -ForegroundColor Yellow
Write-Host "تأكد إنك فعّلت خطة Blaze (الدفع حسب الاستخدام) على مشروع Firebase:" -ForegroundColor Yellow
Write-Host "console.firebase.google.com -> اختر maham-3d4d7 -> الإعدادات ⚙ -> Usage and billing -> Upgrade" -ForegroundColor Yellow
Read-Host "اضغط Enter للمتابعة بعد التأكد (أو أغلق النافذة إذا لسه ما فعّلتها)"

Write-Host "`n===== 4) تسجيل الدخول بحساب Google (بيفتح المتصفح) =====" -ForegroundColor Cyan
firebase login
if ($LASTEXITCODE -ne 0) { Fail "تعذر تسجيل الدخول." }

Write-Host "`n===== 5) تخزين مفتاح OpenAI بأمان =====" -ForegroundColor Cyan
Write-Host "سيُطلب منك الآن لصق مفتاح OpenAI (يبدأ عادة بـ sk-...) — يروح مباشرة لخزنة Google المشفّرة، ما يُحفظ بأي ملف." -ForegroundColor Yellow
firebase functions:secrets:set OPENAI_API_KEY
if ($LASTEXITCODE -ne 0) { Fail "تعذر حفظ المفتاح." }

Write-Host "`n===== 6) تثبيت مكتبات الدالة =====" -ForegroundColor Cyan
Push-Location functions
npm install
$npmOk = ($LASTEXITCODE -eq 0)
Pop-Location
if (-not $npmOk) { Fail "تعذر تثبيت مكتبات الدالة (functions/npm install)." }

Write-Host "`n===== 7) نشر الدالة =====" -ForegroundColor Cyan
firebase deploy --only functions
if ($LASTEXITCODE -ne 0) { Fail "فشل النشر — انسخ رسالة الخطأ أعلاه وأرسلها لمراجعتها." }

Write-Host "`n===== تم بنجاح! =====" -ForegroundColor Green
Write-Host "تأكد أن الرابط المطبوع أعلاه (Function URL) يطابق بالضبط:" -ForegroundColor Green
Write-Host "https://us-central1-maham-3d4d7.cloudfunctions.net/aiAssist" -ForegroundColor Yellow
Write-Host "إذا اختلف، انسخه وأرسله لتعديل الكود." -ForegroundColor Yellow
Read-Host "اضغط Enter للإغلاق"
