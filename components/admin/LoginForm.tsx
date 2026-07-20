"use client";

import { useState } from "react";
import Icon from "@/components/Icon";

export default function LoginForm() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");

    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (response.ok) {
      window.location.href = "/admin";
      return;
    }

    const data = await response.json().catch(() => ({}));
    setError(data.error ?? "كلمة المرور غير صحيحة.");
    setBusy(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="card-soft w-full max-w-sm p-8">
        <span className="brand-gradient mx-auto flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-lg">
          <Icon name="lock" className="h-7 w-7" />
        </span>

        <h1 className="mt-5 text-center text-xl font-black text-slate-900">لوحة الإدارة</h1>
        <p className="mt-1.5 text-center text-sm text-slate-500">
          هذه الصفحة خاصة بإدارة المنصة.
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <label className="label" htmlFor="password">
              كلمة المرور
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="field"
              autoComplete="current-password"
              required
            />
          </div>

          {error && (
            <p className="rounded-xl bg-rose-50 px-4 py-2.5 text-sm font-bold text-rose-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="btn-brand w-full justify-center disabled:opacity-50"
          >
            {busy ? "جارٍ التحقق..." : "دخول"}
          </button>
        </form>

        <p className="mt-5 text-center text-[11px] leading-relaxed text-slate-400">
          كلمة المرور تُقرأ من متغيّر البيئة ADMIN_PASSWORD ولا توجد داخل كود الموقع.
          فعّل المصادقة الثنائية قبل النشر الحقيقي.
        </p>
      </div>
    </div>
  );
}
