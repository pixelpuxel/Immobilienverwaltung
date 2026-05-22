import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#18201b",
        muted: "#66716b",
        line: "#d9dfdb",
        panel: "#f7faf8",
        accent: "#17695f"
      }
    }
  },
  plugins: []
};

export default config;
