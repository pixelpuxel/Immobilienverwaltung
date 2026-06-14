import { describe, expect, it } from "vitest";
import { fallbackDecisionForTest } from "../src/lib/agent";
import { agentToolRegistry, validateAgentToolCalls } from "../src/lib/agent-tools";

describe("agent tool pipeline", () => {
  it("exposes the required guarded tools", () => {
    expect(Object.keys(agentToolRegistry)).toEqual(expect.arrayContaining([
      "global_search",
      "search_properties",
      "get_property",
      "search_units",
      "get_unit",
      "search_tenants",
      "get_tenant",
      "search_templates",
      "get_template",
      "search_documents",
      "get_document",
      "create_contract",
      "create_landlord_confirmation",
      "render_document_pdf",
      "get_document_download_url",
      "send_telegram_document"
    ]));
  });

  it("rejects unknown tools before execution", () => {
    expect(() => validateAgentToolCalls([{ tool: "prisma_raw_query", args: {} }])).toThrow(/Unbekanntes Agent-Tool/);
  });

  it("plans tenant lookup for natural current-resident questions", () => {
    const decision = fallbackDecisionForTest("Wer wohnt aktuell in meinen Objekten?");
    expect(decision.type).toBe("tool_calls");
    if (decision.type === "tool_calls") {
      expect(decision.toolCalls[0].tool).toBe("search_tenants");
      expect(decision.toolCalls[0].args).toMatchObject({ currentOnly: true });
    }
  });

  it("plans a guarded contract creation tool for free-form contract requests", () => {
    const decision = fallbackDecisionForTest("Mach einen Mietvertrag fuer Mueller in der Mainzer Strasse.");
    expect(decision.type).toBe("tool_calls");
    if (decision.type === "tool_calls") {
      expect(decision.toolCalls[0].tool).toBe("create_contract");
    }
  });
});
