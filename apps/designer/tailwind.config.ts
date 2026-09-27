import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        cus: {
          background: "var(--cus-background)",
          foreground: "var(--cus-foreground)",
          primary: {
            DEFAULT: "var(--cus-primary)",
            foreground: "var(--cus-primary-foreground)",
          },
          muted: "var(--cus-muted)",
          border: "var(--cus-border)",
          focus: "var(--cus-focus)",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
