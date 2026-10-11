"use client";

import { type FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type ResetStatus = "checking" | "ready" | "invalid" | "saved";

export default function ResetPasswordPage() {
  const [status, setStatus] = useState<ResetStatus>("checking");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    const query = new URLSearchParams(window.location.search);
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const callbackError = query.get("error_description") || fragment.get("error_description");

    if (callbackError || query.get("error") || fragment.get("error")) {
      setError("Linket er udl\u00f8bet eller ugyldigt. Bed om et nyt link p\u00e5 login-siden.");
      setStatus("invalid");
      return;
    }

    // Supabase handles the emailed access token / PKCE code automatically
    // because detectSessionInUrl is enabled in lib/supabase.ts.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === "PASSWORD_RECOVERY" && session) {
        setError("");
        setStatus("ready");
      }
    });

    // Also cover redirects whose recovery event was processed before this
    // component subscribed (the Supabase client is initialized on import).
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!mounted) return;
      if (data.session && !sessionError) {
        setStatus((current) => current === "checking" ? "ready" : current);
      } else {
        setStatus((current) => current === "checking" ? "invalid" : current);
      }
    }).catch(() => {
      if (mounted) setStatus((current) => current === "checking" ? "invalid" : current);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || status !== "ready") return;
    setError("");

    if (password.length < 8) {
      setError("Adgangskoden skal v\u00e6re mindst 8 tegn lang.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Adgangskoderne er ikke ens.");
      return;
    }

    setBusy(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setPassword("");
      setConfirmPassword("");
      setStatus("saved");
      // A locally ended recovery session means the user signs in
      // deliberately with the new password after changing it.
      const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
      if (signOutError) throw signOutError;
      window.location.replace("/?password_reset=success");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Adgangskoden kunne ikke opdateres.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-decoration auth-decoration-one" />
      <div className="auth-decoration auth-decoration-two" />
      <section className="auth-card">
        <div className="brand-mark large" aria-hidden="true">
          <span className="disc-ring" />
          <span className="disc-dot" />
        </div>
        <div className="auth-copy">
          <span className="eyebrow">Disc Golf Stats</span>
          <h1>V&#xE6;lg en ny adgangskode</h1>
          <p>Din spillerprofil, venner og tidligere runder bliver bevaret.</p>
        </div>

        {status === "checking" ? (
          <div className="form-message">Kontrollerer nulstillingslinket&#x2026;</div>
        ) : null}

        {status === "invalid" ? (
          <div className="form-message error">
            {error || "Vi kunne ikke godkende linket. Det kan v\u00e6re udl\u00f8bet eller allerede brugt."}
          </div>
        ) : null}

        {status === "ready" ? (
          <form className="auth-form" onSubmit={savePassword}>
            <label>
              Ny adgangskode
              <input
                type={showPasswords ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={8}
                required
                placeholder="Mindst 8 tegn"
              />
            </label>
            <label>
              Gentag ny adgangskode
              <input
                type={showPasswords ? "text" : "password"}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                minLength={8}
                required
                placeholder="Skriv adgangskoden igen"
              />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={showPasswords}
                onChange={(event) => setShowPasswords(event.target.checked)}
                style={{ width: "auto" }}
              />
              Vis adgangskoder
            </label>
            {error ? <div className="form-message error" role="alert">{error}</div> : null}
            <button type="submit" className="primary-button auth-submit" disabled={busy}>
              {busy ? "Gemmer..." : "Gem ny adgangskode"}
            </button>
          </form>
        ) : null}

        {status === "saved" ? (
          <div className="form-message success">
            Adgangskoden er opdateret. Du kan nu logge ind med den nye adgangskode.
          </div>
        ) : null}

        <a
          href="/"
          className="logout-button"
          style={{ display: "block", textAlign: "center", marginTop: 16, padding: 12 }}
        >
          Tilbage til login
        </a>
      </section>
    </main>
  );
}
