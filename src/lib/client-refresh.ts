"use client";

import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

export function refreshCurrentView(router: AppRouterInstance) {
  router.refresh();
  window.setTimeout(() => {
    router.refresh();
  }, 150);
}

export function reloadCurrentView(router: AppRouterInstance) {
  router.refresh();
  window.setTimeout(() => {
    window.location.reload();
  }, 150);
}
