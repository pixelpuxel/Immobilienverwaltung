"use client";

import { useState } from "react";

export function ContractTabs({
  children,
  steppedRent,
  templates,
  contractsLabel,
  steppedRentLabel = "Staffelmiete",
  templatesLabel
}: {
  children: React.ReactNode;
  steppedRent?: React.ReactNode;
  templates: React.ReactNode;
  contractsLabel: string;
  steppedRentLabel?: string;
  templatesLabel: string;
}) {
  const [tab, setTab] = useState<"contracts" | "templates" | "steppedRent">("contracts");

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-end gap-1">
        <button
          className={tab === "contracts" ? "rounded-b-none border border-line border-b-white bg-white px-4 py-3 text-sm font-bold text-ink" : "rounded-b-none border border-line bg-panel px-4 py-3 text-sm font-bold text-muted hover:bg-white"}
          type="button"
          onClick={() => setTab("contracts")}
        >
          {contractsLabel}
        </button>
        {templates ? (
          <button
            className={tab === "templates" ? "rounded-b-none border border-line border-b-white bg-white px-4 py-3 text-sm font-bold text-ink" : "rounded-b-none border border-line bg-panel px-4 py-3 text-sm font-bold text-muted hover:bg-white"}
            type="button"
            onClick={() => setTab("templates")}
          >
            {templatesLabel}
          </button>
        ) : null}
        {steppedRent ? (
          <button
            className={tab === "steppedRent" ? "rounded-b-none border border-line border-b-white bg-white px-4 py-3 text-sm font-bold text-ink" : "rounded-b-none border border-line bg-panel px-4 py-3 text-sm font-bold text-muted hover:bg-white"}
            type="button"
            onClick={() => setTab("steppedRent")}
          >
            {steppedRentLabel}
          </button>
        ) : null}
      </div>
      <div className="-mt-px">
        {tab === "contracts" ? children : tab === "templates" ? templates : steppedRent}
      </div>
    </div>
  );
}
