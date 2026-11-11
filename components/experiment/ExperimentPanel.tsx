"use client";

import { useEffect, useRef, useState } from "react";
import { LogoMark } from "@/components/Logo";

/**
 * واجهة الصفحة التجريبية: البوّابة، إشعار الخصوصية، القنوات الأربع.
 * مكتبة LiveKit تُحمَّل عند بدء مكالمة الفيديو فقط، فلا تدخل حزمة بقية الموقع.
 */

interface Info {
  whatsappNumber: string;
  inboundNumber: string;
  whatsappReady: boolean;
  livekitReady: boolean;
}

const REASONS = ["حضانة", "نفقة", "طلاق أو خلع", "زواج", "مواريث أو وصية", "إثبات أو إجراءات", "أخرى"];

async function post(url: string, body: unknown): Promise<{ ok: boolean; error?: string; [key: string]: unknown }> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { ok: false, ...((await response.json().catch(() => ({}))) as object) } as { ok: boolean; error?: string };
  } catch {
    return { ok: false, error: "تعذّر الاتصال." };
  }
}

export default function ExperimentPanel({ open, info }: { open: boolean; info: Info | null }) {
  if (!open || !info) return <Gate />;
  return (
    <div className="mt-6 space-y-6">
      <PrivacyNotice />
      <section className="card-soft p-5">
        <h2 className="text-base font-extrabold text-slate-900">1. واتساب</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          أرسل رسالة نصية أو صوتية إلى الرقم، ويرد المساعد كتابةً. كل رسالة تُجاب وحدها (لا نحفظ المحادثة).
        </p>
        <Number value={info.whatsappNumber} ready={info.whatsappReady} />
      </section>
      <section className="card-soft p-5">
        <h2 className="text-base font-extrabold text-slate-900">2. مكالمة هاتفية واردة</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          اتصل على الرقم التجريبي (أجنبي)، ويرد المساعد بصوته. قاطعه متى شئت فيسكت.
        </p>
        <Number value={info.inboundNumber} ready={info.livekitReady} />
      </section>
      <Callback ready={info.whatsappReady && info.livekitReady} />
      <VideoCall ready={info.livekitReady} />
      <section className="card-soft p-5">
        <h2 className="text-base font-extrabold text-slate-900">Google Meet</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          مؤجَّل: واجهة Meet الرسمية للوسائط تتوقف في يناير 2027 ولا تسمح للمساعد بالكلام، والبدائل مدفوعة أو
          هشة. التفاصيل والخيارات في EXPERIMENT-VOICE.md.
        </p>
      </section>
    </div>
  );
}

function Number({ value, ready }: { value: string; ready: boolean }) {
  return (
    <p className="mt-3 text-sm font-bold text-slate-800">
      {value ? (
        <span dir="ltr" className="rounded-lg bg-gold-50 px-3 py-1.5">
          {value}
        </span>
      ) : (
        <span className="text-amber-800">لم يُضبط الرقم بعد.</span>
      )}
      {!ready && <span className="ms-2 text-xs font-normal text-amber-800">(المفاتيح غير مكتملة)</span>}
    </p>
  );
}

function Gate() {
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const result = await post("/api/experiment/gate", { key });
    if (result.ok) window.location.reload();
    else setError("المفتاح غير صحيح.");
  };
  return (
    <form onSubmit={submit} className="card-soft mt-6 space-y-3 p-5">
      <label htmlFor="exp-key" className="block text-sm font-bold text-slate-800">
        مفتاح التجربة
      </label>
      <input
        id="exp-key"
        type="password"
        autoComplete="off"
        value={key}
        onChange={(event) => setKey(event.target.value)}
        className="field w-full"
        dir="ltr"
      />
      {error && <p className="text-sm font-bold text-rose-700">{error}</p>}
      <button type="submit" className="btn-brand px-6 py-2.5">
        دخول
      </button>
    </form>
  );
}

function PrivacyNotice() {
  return (
    <section className="card-soft legal-box p-5 text-sm leading-relaxed text-slate-700">
      <h2 className="text-base font-extrabold text-slate-900">إشعار الخصوصية لهذه التجربة</h2>
      <ul className="mt-2 list-disc space-y-1 ps-5">
        <li>المعالجة آلية بالكامل: يرد عليك مساعد آلي لا إنسان.</li>
        <li>
          رقمك وصوتك يمران عبر مزوّدي الخدمة: واتساب (Meta)، LiveKit ومزوّد الاتصال الهاتفي، وGoogle Gemini
          لفهم الكلام والإجابة. هؤلاء يحتفظون بسجلاتهم وفق سياساتهم.
        </li>
        <li>
          ما نحتفظ به نحن: بصمة مشفّرة لرقمك لمنع الإساءة تنتهي تلقائيًا خلال 24 ساعة، وسجل فني مجهّل (مدة،
          نتيجة، أخطاء).
        </li>
        <li>ما لا نحتفظ به: رقمك بصيغته، التسجيلات الصوتية، ونصوص المحادثات.</li>
        <li>لا اتصال صادر إلا لمن طلبه بنفسه من هذه الصفحة وتحقق من رقمه برمز.</li>
      </ul>
    </section>
  );
}

function Callback({ ready }: { ready: boolean }) {
  const [phone, setPhone] = useState("");
  const [reason, setReason] = useState(REASONS[0]);
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"form" | "code" | "done">("form");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const request = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const result = await post("/api/experiment/callback", { action: "request", phone, reason });
    setBusy(false);
    setMessage(result.ok ? "أرسلنا رمز التحقق إلى واتساب الرقم." : (result.error ?? "تعذّر الطلب."));
    if (result.ok) setStage("code");
  };
  const verify = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const result = await post("/api/experiment/callback", { action: "verify", phone, code });
    setBusy(false);
    setMessage(result.ok ? "تم. سيتصل بك المساعد خلال دقيقة من رقم أجنبي." : (result.error ?? "تعذّر التحقق."));
    if (result.ok) setStage("done");
  };

  return (
    <section className="card-soft p-5">
      <h2 className="text-base font-extrabold text-slate-900">3. اتصلوا بي</h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">
        اكتب رقم جوالك (ضمن قائمة التجربة)، يصلك رمز تحقق في واتساب، ثم يتصل بك المساعد.
      </p>
      {stage === "form" && (
        <form onSubmit={request} className="mt-4 space-y-3">
          <label className="block text-sm font-bold text-slate-800">
            رقم الجوال
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              inputMode="tel"
              dir="ltr"
              placeholder="05XXXXXXXX"
              className="field mt-1 w-full"
              required
            />
          </label>
          <label className="block text-sm font-bold text-slate-800">
            الموضوع
            <select value={reason} onChange={(event) => setReason(event.target.value)} className="field mt-1 w-full">
              {REASONS.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={busy || !ready} className="btn-brand px-6 py-2.5 disabled:opacity-50">
            أرسل رمز التحقق
          </button>
        </form>
      )}
      {stage === "code" && (
        <form onSubmit={verify} className="mt-4 space-y-3">
          <label className="block text-sm font-bold text-slate-800">
            رمز التحقق (6 أرقام)
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              inputMode="numeric"
              dir="ltr"
              maxLength={6}
              className="field mt-1 w-full"
              required
            />
          </label>
          <button type="submit" disabled={busy} className="btn-brand px-6 py-2.5 disabled:opacity-50">
            تحقّق واتصل بي
          </button>
        </form>
      )}
      {message && <p className="mt-3 text-sm font-bold text-slate-700">{message}</p>}
      {!ready && <p className="mt-3 text-xs text-amber-800">يحتاج مفاتيح واتساب وLiveKit.</p>}
    </section>
  );
}

function VideoCall({ ready }: { ready: boolean }) {
  const [state, setState] = useState<"idle" | "connecting" | "live" | "ended">("idle");
  const [error, setError] = useState("");
  const [muted, setMuted] = useState(false);
  const cameraRef = useRef<HTMLVideoElement>(null);
  const orbRef = useRef<HTMLSpanElement>(null);
  const cleanupRef = useRef<() => void>(() => {});
  const micRef = useRef<((on: boolean) => Promise<unknown>) | null>(null);

  useEffect(() => () => cleanupRef.current(), []);

  const start = async () => {
    setError("");
    setState("connecting");
    const session = await post("/api/experiment/video-token", {});
    if (!session.ok) {
      setError(session.error ?? "تعذّر بدء المكالمة.");
      setState("idle");
      return;
    }
    try {
      const { Room, RoomEvent, Track } = await import("livekit-client");
      const room = new Room();
      const audioContext = new AudioContext();
      let frame = 0;
      let camera: MediaStream | null = null;

      room.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind !== Track.Kind.Audio) return;
        const element = track.attach();
        element.style.display = "none";
        document.body.appendChild(element);
        // الهوية البصرية تتفاعل مع صوت المساعد: حلقة تتسع مع ارتفاع الصوت
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        audioContext.createMediaStreamSource(new MediaStream([track.mediaStreamTrack])).connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          analyser.getByteTimeDomainData(data);
          let peak = 0;
          for (const value of data) peak = Math.max(peak, Math.abs(value - 128));
          if (orbRef.current) orbRef.current.style.transform = `scale(${1 + Math.min(0.35, peak / 90)})`;
          frame = requestAnimationFrame(tick);
        };
        tick();
      });
      room.on(RoomEvent.Disconnected, () => setState("ended"));

      await room.connect(String(session.url), String(session.token));
      await room.localParticipant.setMicrophoneEnabled(true);
      // الكاميرا معاينة محلية فقط: لا تُرسل صورتك إلى أي خادم (المساعد لا يحتاجها)
      try {
        camera = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 } });
        if (cameraRef.current) cameraRef.current.srcObject = camera;
      } catch {
        // بلا كاميرا — تكمل المكالمة صوتًا
      }

      cleanupRef.current = () => {
        cancelAnimationFrame(frame);
        camera?.getTracks().forEach((track) => track.stop());
        void room.disconnect();
        void audioContext.close().catch(() => {});
      };
      micRef.current = (on) => room.localParticipant.setMicrophoneEnabled(on);
      setState("live");
    } catch {
      setError("تعذّر الاتصال بخدمة المكالمات.");
      setState("idle");
    }
  };

  const toggleMute = async () => {
    await micRef.current?.(muted);
    setMuted(!muted);
  };

  const end = () => {
    cleanupRef.current();
    cleanupRef.current = () => {};
    setState("ended");
  };

  return (
    <section className="card-soft p-5">
      <h2 className="text-base font-extrabold text-slate-900">4. مكالمة مرئية داخل الموقع</h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">
        تتحدث مع المساعد مباشرة. يظهر المساعد بهوية المنصة المتحركة لا بوجه بشري، وكاميرتك معاينة لك فقط ولا تُرسل.
      </p>
      {state === "live" || state === "connecting" ? (
        <div className="hero-ink mt-4 rounded-2xl p-6 text-center text-white">
          <span
            ref={orbRef}
            className="mx-auto flex h-28 w-28 items-center justify-center rounded-full bg-white/10 ring-4 ring-gold-300 transition-transform duration-75"
          >
            <LogoMark className="h-16 w-auto" />
          </span>
          <p className="mt-4 text-sm font-bold text-gold-200">
            {state === "connecting" ? "جارٍ الاتصال…" : "المحامي الاصطناعي على الخط"}
          </p>
          <video ref={cameraRef} autoPlay muted playsInline className="mx-auto mt-4 h-28 rounded-xl bg-black/40" />
          <div className="mt-4 flex justify-center gap-3">
            <button type="button" onClick={toggleMute} className="btn-outline-light px-5 py-2">
              {muted ? "إلغاء الكتم" : "كتم"}
            </button>
            <button type="button" onClick={end} className="rounded-full bg-rose-700 px-5 py-2 text-sm font-bold text-white">
              إنهاء
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={start} disabled={!ready} className="btn-brand mt-4 px-6 py-2.5 disabled:opacity-50">
          {state === "ended" ? "اتصال جديد" : "ابدأ المكالمة"}
        </button>
      )}
      {error && <p className="mt-3 text-sm font-bold text-rose-700">{error}</p>}
      {!ready && <p className="mt-3 text-xs text-amber-800">يحتاج مفاتيح LiveKit وتشغيل خدمة voice-agent.</p>}
    </section>
  );
}
