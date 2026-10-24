import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { describeAudio, designVoice, listVoices, synthesize, transcribe, VoiceError } from "@/lib/gemini-voice";

/**
 * مختبر الأصوات — مؤقت لاختيار صوت المحامي الأسري، ويُحذف بعد الاختيار.
 *
 * محمي برمز VOICE_LAB_TOKEN (متغيّر بيئة)؛ بدونه يعيد 404 وكأنه غير موجود.
 * لا يمس بيانات الزوار، ولا يحفظ شيئًا عندنا.
 */

export const maxDuration = 60;

function authorized(request: Request): boolean {
  const expected = process.env.VOICE_LAB_TOKEN;
  const given = request.headers.get("x-lab-token") ?? "";
  if (!expected || expected.length < 24 || given.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

const notFound = () => NextResponse.json({ error: "not found" }, { status: 404 });

export async function POST(request: Request) {
  if (!authorized(request)) return notFound();
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  try {
    switch (body.action) {
      case "list":
        return NextResponse.json(await listVoices((body.params as Record<string, string | string[]>) ?? {}));
      case "design":
        return NextResponse.json(
          await designVoice({
            displayName: String(body.displayName),
            gender: body.gender === "female" ? "female" : "male",
            languageCode: String(body.languageCode),
            description: String(body.description),
          }),
        );
      case "tts": {
        const started = Date.now();
        const wav = await synthesize({
          text: String(body.text),
          style: body.style ? String(body.style) : undefined,
          voice: body.voice ? String(body.voice) : undefined,
          model: body.model ? String(body.model) : undefined,
        });
        return new Response(new Uint8Array(wav), {
          headers: { "Content-Type": "audio/wav", "X-Elapsed-Ms": String(Date.now() - started) },
        });
      }
      case "stream-probe": {
        // يفحص شكل البث من الخدمة: نوع المحتوى وأول ما يصل وزمن أول بايت
        const started = Date.now();
        const upstream = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY ?? "" },
          body: JSON.stringify({
            model: body.model ? String(body.model) : "gemini-3.8-flash-tts",
            store: false,
            stream: true,
            input: [{ type: "user_input", content: [{ type: "text", text: String(body.text) }] }],
            response_format: { type: "audio" },
            generation_config: { speech_config: [{ voice: String(body.voice) }] },
          }),
        });
        const reader = upstream.body?.getReader();
        const decoder = new TextDecoder();
        let raw = "";
        let firstByteMs = -1;
        let total = 0;
        if (reader) {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (firstByteMs < 0) firstByteMs = Date.now() - started;
            total += value.length;
            if (raw.length < 4000) raw += decoder.decode(value, { stream: true });
          }
        }
        // نُخفي بيانات الصوت الطويلة ونُبقي البنية
        const shape = raw.replace(/"data":\s*"[A-Za-z0-9+/=]{40,}"/g, '"data":"<b64>"').slice(0, 3000);
        return NextResponse.json({
          status: upstream.status,
          contentType: upstream.headers.get("content-type"),
          firstByteMs,
          totalMs: Date.now() - started,
          totalBytes: total,
          shape,
        });
      }
      case "describe": {
        const wav = Buffer.from(String(body.audio), "base64");
        return NextResponse.json({ text: await describeAudio(wav, String(body.question)) });
      }
      case "transcribe": {
        const wav = Buffer.from(String(body.audio), "base64");
        const started = Date.now();
        return NextResponse.json({ text: await transcribe(wav), elapsedMs: Date.now() - started });
      }
      default:
        return NextResponse.json({ error: "unknown action" }, { status: 400 });
    }
  } catch (error) {
    if (error instanceof VoiceError) {
      return NextResponse.json({ error: error.detail, status: error.status }, { status: 502 });
    }
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
