"use client";

import { useState } from "react";

export function ContractTabs({
  children,
  templates,
  contractsLabel,
  templatesLabel
}: {
  children: React.ReactNode;
  templates: React.ReactNode;
  contractsLabel: string;
  templatesLabel: string;
}) {
  const [tab, setTab] = useState<"contracts" | "templates">("contracts");

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
      </div>
      <div className="-mt-px">
        {tab === "contracts" ? children : templates}
      </div>
    </div>
  );
}
