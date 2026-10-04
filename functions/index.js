/**
 * AI proxy for "مهام صَفوان".
 *
 * The app itself is a single static HTML page with no backend — this is
 * the one exception: a small Cloud Function that holds the OpenAI API key
 * (set via `firebase functions:secrets:set OPENAI_API_KEY`, never written
 * to this file or to git) and forwards requests to OpenAI on behalf of a
 * signed-in user. The browser never sees the key.
 *
 * Every request must carry a valid Firebase Auth ID token in the
 * Authorization header (the same account the app already signs in with
 * for Firestore sync) — this keeps the public function URL from being
 * hammered by anyone who finds it, which would otherwise burn the owner's
 * OpenAI quota.
 */
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');

admin.initializeApp();

const OPENAI_API_KEY = defineSecret('OPENAI_API_KEY');
const MODEL = 'gpt-4o-mini'; // change here if you'd rather use a different OpenAI model

function systemPromptFor(mode) {
  switch (mode) {
    case 'summarize':
      return 'أنت مساعد قانوني يلخص ملفات وجولات متابعة قضايا بالعربية الفصحى، بإيجاز ودقة، دون اختلاق أي معلومة غير موجودة في البيانات المعطاة. اذكر الحالة الراهنة وآخر المستجدات والإجراء القادم المطلوب إن وُجد، في فقرات قصيرة واضحة.';
    case 'suggest':
      return 'أنت مساعد قانوني. بناءً على وصف جولة متابعة (ما تم اكتشافه والإجراء المتخذ)، اقترح نص "الإجراء المطلوب" (الخطوة القادمة) بإيجاز، وحدد أولوية مناسبة من (عاجل/متوسط/عادي) مع سبب مختصر. أعد الرد بصيغة JSON فقط بالحقول التالية بالضبط: {"actionNeeded": "...", "priority": "عاجل|متوسط|عادي", "reason": "..."}.';
    case 'search':
      return 'أنت مساعد بحث ذكي داخل قائمة ملفات قضايا. يُعطى لك سؤال المستخدم وقائمة مختصرة بالملفات (JSON). أعد JSON فقط بصيغة {"matches":[{"id":"...","reason":"..."}]} مرتبة من الأكثر صلة للأقل، ولا تُدرج ملفًا غير ذي صلة فعليًا. إن لم يوجد أي ملف مطابق أعد {"matches":[]}.';
    case 'chat':
    default:
      return 'أنت مساعد ذكي داخل برنامج "مهام صَفوان" لمتابعة ملفات قضايا قانونية. تجيب بالعربية بإيجاز ووضوح بناءً فقط على بيانات السياق المعطاة لك (الملفات، حالتها، الإجراءات المستحقة). إذا لم تكفِ المعلومات المعطاة للإجابة بثقة، قل ذلك صراحة بدل التخمين أو اختلاق تفاصيل.';
  }
}

exports.aiAssist = onRequest(
  { secrets: [OPENAI_API_KEY], cors: true, region: 'us-central1', maxInstances: 5 },
  async (req, res) => {
    try {
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'method not allowed' });
        return;
      }

      const authHeader = req.headers.authorization || '';
      const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
      if (!idToken) {
        res.status(401).json({ error: 'unauthorized' });
        return;
      }
      try {
        await admin.auth().verifyIdToken(idToken);
      } catch (e) {
        res.status(401).json({ error: 'invalid token' });
        return;
      }

      const { mode, message, context, history } = req.body || {};
      if (!mode || !message) {
        res.status(400).json({ error: 'missing mode/message' });
        return;
      }

      const messages = [{ role: 'system', content: systemPromptFor(mode) }];
      if (context) {
        // Cap the context payload so one runaway request can't blow up token usage.
        messages.push({ role: 'system', content: 'بيانات السياق (JSON):\n' + JSON.stringify(context).slice(0, 60000) });
      }
      if (Array.isArray(history)) {
        history.slice(-10).forEach((h) => {
          if (h && (h.role === 'user' || h.role === 'assistant') && h.content) {
            messages.push({ role: h.role, content: String(h.content).slice(0, 4000) });
          }
        });
      }
      messages.push({ role: 'user', content: String(message).slice(0, 8000) });

      const wantsJson = mode === 'suggest' || mode === 'search';
      const body = {
        model: MODEL,
        messages,
        temperature: mode === 'chat' ? 0.4 : 0.2,
      };
      if (wantsJson) body.response_format = { type: 'json_object' };

      const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENAI_API_KEY.value()}`,
        },
        body: JSON.stringify(body),
      });

      if (!openaiRes.ok) {
        const errText = await openaiRes.text();
        console.error('OpenAI error:', openaiRes.status, errText);
        res.status(502).json({ error: 'openai_error', detail: errText.slice(0, 500) });
        return;
      }

      const data = await openaiRes.json();
      const content = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
      res.status(200).json({ content });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'server_error', detail: String((e && e.message) || e) });
    }
  }
);
