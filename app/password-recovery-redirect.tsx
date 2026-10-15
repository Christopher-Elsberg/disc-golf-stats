"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";

/**
 * A Supabase recovery email may redirect to the Site URL ("/") when
 * /reset-password is not listed under Authentication > Redirect URLs.
 * In that case, complete session extraction and forward to the password form.
 */
export default function PasswordRecoveryRedirect() {
  useEffect(() => {
    if (window.location.pathname !== "/") return;

    let navigating = false;
    const navigate = (destination: string) => {
      if (navigating) return;
      navigating = true;
      window.location.replace(destination);
    };

    const query = new URLSearchParams(window.location.search);
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const isRecoveryLink =
      fragment.get("type") === "recovery" ||
      (query.get("type") === "recovery" &&
        (query.has("token_hash") || query.has("token") || query.has("code")));

    // Subscribe before awaiting session initialization so PASSWORD_RECOVERY
    // is handled even if Supabase consumes the URL fragment during startup.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" && session) {
        navigate("/reset-password");
      }
    });

    if (isRecoveryLink) {
      const originalLink = "/reset-password" + window.location.search + window.location.hash;
      // Wait until Supabase has processed its callback and stored the session.
      void supabase.auth.getSession().then(({ data }) => {
        navigate(data.session ? "/reset-password" : originalLink);
      }).catch(() => navigate(originalLink));
    } else if (
      query.has("error") && (query.has("error_code") || query.has("error_description"))
    ) {
      // Expired or used reset links should display a useful error, not login.
      navigate("/reset-password" + window.location.search + window.location.hash);
    }

    return () => subscription.unsubscribe();
  }, []);

  return null;
}
