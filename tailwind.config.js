/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,js,jsx,ts,tsx,css}",
    "./src/*.{html,js,jsx,ts,tsx,css}",
  ],
  theme: {
    extend: {
      colors: {
        st: {
          bg: "var(--st-bg-active)",
          text: "var(--st-text-active)",
          border: "var(--st-border)",
          hover: "var(--st-hover)",
          tint: "var(--st-bg-tint)",
          success: "var(--st-success)",
          error: "var(--st-error)",
          warning: "var(--st-warning)",
          info: "var(--st-info)",
        },
      },
      spacing: {
        "8xl": "96rem",
        "9xl": "128rem",
      },
      borderRadius: {
        "4xl": "2rem",
      },
    },
  },
};
