"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

export default function OpenSurveyPage() {
  const params = useParams();
  const uuid = params.uuid as string;
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    setIsIOS(/iPad|iPhone|iPod/.test(navigator.userAgent));
  }, []);

  useEffect(() => {
    if (!uuid) return;

    const appUrl = `vhortosecreto://open/${uuid}`;
    const storeUrl = isIOS
      ? "https://apps.apple.com/app/id6774578274"
      : "https://play.google.com/store/apps/details?id=com.termibululu.vhortosecreto";

    let redirected = false;

    const onVisibility = () => {
      if (document.hidden) redirected = true;
    };
    document.addEventListener("visibilitychange", onVisibility);

    window.location.href = appUrl;

    const timer = setTimeout(() => {
      if (!redirected) {
        window.location.href = storeUrl;
      }
    }, 1500);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [uuid, isIOS]);

  return (
    <main style={{ padding: 40, fontFamily: "system-ui, sans-serif", textAlign: "center" }}>
      <h1>Voto Secreto</h1>
      <p>Abriendo la encuesta...</p>
      {!isIOS && (
        <p style={{ fontSize: 14, color: "#666" }}>
          Si la app no se abre,{" "}
          <a href={`vhortosecreto://open/${uuid}`}>toca aquí</a>
        </p>
      )}
    </main>
  );
}
