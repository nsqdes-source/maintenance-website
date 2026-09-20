# وصول رسائل الحساب إلى البريد الوارد

فُحص DNS في 14 سبتمبر 2026: لم يظهر سجل TXT لـ `_dmarc.mueenfix.com` ولا لـ `_dmarc.mail.mueenfix.com` من محلّل DNS المحلي. هذا عامل محتمل لوصول رسالة التأكيد إلى «غير مرغوب»، لكنه ليس تشخيصًا نهائيًا؛ قرار التصنيف يعود إلى مزود بريد المستلم وسمعة النطاق ومحتوى الرسالة وروابطها.

## خطوة Cloudflare المقترحة

في **mueenfix.com → DNS → Records → Add record** أضف سجل TXT:

- Name: `_dmarc`
- Content: `v=DMARC1; p=none;`
- TTL: Auto

ابدأ بسياسة المراقبة `p=none` حتى تتأكد من مرور SPF وDKIM وDMARC في رأس رسالة اختبار من Supabase Auth عبر Resend، وفي رسالة فاتورة اختبار. لا تغيّر إلى `quarantine` أو `reject` قبل التحقق من كل مصادر الإرسال. يمكن إضافة عنوان تقارير `rua` لاحقًا بعد إنشاء صندوق مناسب لها.

افحص أيضًا أن النطاق `mail.mueenfix.com` يظهر Verified في Resend، وأن عنوان From لرسائل Supabase والفواتير يستخدم نطاق الإرسال المُتحقق منه. استخدم عنوان موقع `www.mueenfix.com` في الروابط داخل الرسائل قدر الإمكان، وراجع قالب التأكيد حتى يكون اسم الجهة واضحًا. جرّب رسائل إلى Gmail وOutlook، ثم اعرض **Show original / عرض الرسالة الأصلية** للتحقق من `spf=pass`, `dkim=pass`, `dmarc=pass`.

المراجع: https://resend.com/docs/dashboard/domains/dmarc و https://resend.com/docs/dashboard/emails/deliverability-insights و https://resend.com/docs/knowledge-base/how-do-i-avoid-gmails-spam-folder
