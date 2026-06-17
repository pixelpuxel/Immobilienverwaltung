"use client";

import { useEffect } from "react";

export function ScrollToQueryTarget() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("tenantId") ? `tenant-${params.get("tenantId")}` : params.get("userId") ? `user-${params.get("userId")}` : "";
    if (!id) return;
    window.requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  }, []);
  return null;
}
