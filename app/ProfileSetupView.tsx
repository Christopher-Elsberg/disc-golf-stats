"use client";

import { type FormEvent, useState } from "react";
import { supabase } from "@/lib/supabase";

type PlayerProfile = { id: string; name: string };

type Props = {
  initialName?: string;
  onCreated: (player: PlayerProfile) => void;
};

export default function ProfileSetupView({ initialName = "", onCreated }: Props) {
  const [name, setName] = useState(initialName.trim());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const chosenName = name.trim();

    if (chosenName.length < 2 || chosenName.length > 40) {
      setError("Brugernavnet skal v\u00e6re mellem 2 og 40 tegn.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const { data, error: claimError } = await supabase.rpc(
        "complete_disc_golf_signup",
        { p_name: chosenName },
      );

      if (claimError) {
        if (claimError.code === "23505" || /already taken/i.test(claimError.message)) {
          throw new Error("Navnet er allerede optaget. V\u00e6lg et andet.");
        }
        throw claimError;
      }

      const profile = Array.isArray(data) ? data[0] : null;
      if (!profile || typeof profile.player_id !== "string") {
        throw new Error("Der blev ikke oprettet en spillerprofil. Pr\u00f8v igen.");
      }

      onCreated({ id: profile.player_id, name: profile.player_name });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ukendt fejl under oprettelse.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-copy">
          <h1>Velkommen til Disc Golf Stats</h1>
          <p>
            Din e-mail er bekr&#xE6;ftet. V&#xE6;lg dit unikke spillernavn for at
            aktivere din profil.
          </p>
        </div>

        <form onSubmit={submit} className="auth-form">
          <label>
            Spillernavn
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              minLength={2}
              maxLength={40}
              autoComplete="nickname"
              placeholder="Dit spillernavn"
              required
            />
          </label>

          {error ? <div className="form-message error" role="alert">{error}</div> : null}

          <button className="primary-button auth-submit" type="submit" disabled={busy}>
            {busy ? "Opretter profil..." : "Aktiv\u00e9r spillerprofil"}
          </button>
        </form>

        <button
          type="button"
          className="logout-button"
          style={{ marginTop: 12, width: "auto", padding: 10 }}
          onClick={() => void supabase.auth.signOut({ scope: "local" })}
        >
          Log ud
        </button>
      </section>
    </main>
  );
}
