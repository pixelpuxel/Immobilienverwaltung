import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "MCP Explorer Mobile",
    template: "%s – MCP Explorer Mobile"
  },
  description: "Support and privacy information for the native MCP Explorer app."
};

export default function MCPExplorerLegalLayout({ children }: { children: React.ReactNode }) {
  return children;
}
