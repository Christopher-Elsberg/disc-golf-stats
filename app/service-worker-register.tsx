"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    const registerServiceWorker = async () => {
      try {
        const registration = await navigator.serviceWorker.register(
          "/sw.js",
          {
            scope: "/",
          },
        );

        console.log(
          "Service Worker registreret:",
          registration.scope,
        );
      } catch (error) {
        console.error(
          "Service Worker kunne ikke registreres:",
          error,
        );
      }
    };

    registerServiceWorker();
  }, []);

  return null;
}
