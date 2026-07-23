"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslations } from "next-intl";
import { requestPasswordReset } from "@/lib/auth-api";
import TackIcon from "@/components/TackIcon";

const inputCls =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm w-full focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500";

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-sm font-medium text-slate-700">{label}</label>
      {children}
    </div>
  );
}

function SubmitButton({ loading, label, pleaseWait }: { loading: boolean; label: string; pleaseWait: string }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="w-full bg-rose-700 hover:bg-rose-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg transition-colors"
    >
      {loading ? pleaseWait : label}
    </button>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-red-700 text-sm">
      {message}
    </div>
  );
}

function LoginPageContent() {
  const { user, isLoading, login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("login");

  const [stage, setStage] = useState<"form" | "reset-request">("form");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [resetSent, setResetSent] = useState(false);

  useEffect(() => {
    if (!isLoading && user) router.replace("/");
  }, [isLoading, user, router]);

  useEffect(() => {
    if (searchParams.get("error") === "no_access") {
      setError(t("errors.noAccessQuery"));
    }
  }, [searchParams, t]);

  function errMsg(err: unknown, fallback: string): string {
    const msg = err instanceof Error ? err.message : "";
    if (/^HTTP 5/.test(msg)) return t("errors.serverError");
    if (msg === "no_tack_access") return t("errors.noAccess");
    return msg || fallback;
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      router.push("/");
    } catch (err) {
      setError(errMsg(err, t("errors.loginFailed")));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResetRequest(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await requestPasswordReset(resetEmail, window.location.origin);
      setResetSent(true);
    } catch (err) {
      setError(errMsg(err, t("errors.resetFailed")));
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading) return null;

  if (stage === "reset-request") {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm w-full max-w-md p-8">
          <div className="flex items-center gap-2 mb-6">
            <TackIcon className="w-7 h-7" />
            <span className="font-bold text-lg text-slate-800">{t("resetPasswordTitle")}</span>
          </div>
          {error && <ErrorBox message={error} />}
          {resetSent ? (
            <div className="text-center space-y-4">
              <div className="text-4xl">📧</div>
              <p className="text-sm text-slate-600">{t("checkInbox")}</p>
              <button type="button" onClick={() => { setStage("form"); setError(null); setResetSent(false); }} className="text-sm text-slate-500 hover:text-slate-700 transition-colors">
                {t("backToSignIn")}
              </button>
            </div>
          ) : (
            <form onSubmit={handleResetRequest} className="space-y-4">
              <Field label={t("emailLabel")} htmlFor="reset-email">
                <input id="reset-email" type="email" required autoFocus value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} className={inputCls} />
              </Field>
              <SubmitButton loading={submitting} label={t("sendResetLink")} pleaseWait={t("pleaseWait")} />
              <button type="button" onClick={() => { setStage("form"); setError(null); }} className="w-full text-sm text-slate-500 hover:text-slate-700 transition-colors">
                {t("backToSignIn")}
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm w-full max-w-md p-8">
        <div className="flex items-center gap-2.5 mb-8">
          <TackIcon className="w-8 h-8" />
          <div>
            <span className="font-bold text-lg text-slate-800 block">Tack</span>
            <span className="text-xs text-slate-500">{t("appTagline")}</span>
          </div>
        </div>

        {error && <ErrorBox message={error} />}

        <form onSubmit={handleLogin} className="space-y-4">
          <Field label={t("emailLabel")} htmlFor="login-email">
            <input id="login-email" type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
          </Field>
          <Field label={t("passwordLabel")} htmlFor="login-password">
            <input id="login-password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} />
          </Field>
          <SubmitButton loading={submitting} label={t("signIn")} pleaseWait={t("pleaseWait")} />
          <div className="text-center">
            <button type="button" onClick={() => { setStage("reset-request"); setError(null); }} className="text-sm text-slate-500 hover:text-rose-700 transition-colors">
              {t("forgotPassword")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageContent />
    </Suspense>
  );
}
