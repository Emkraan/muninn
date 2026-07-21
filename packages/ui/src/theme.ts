import { createTheme, rem } from "@mantine/core";

import { modalComponent } from "./theme/modal";

export const theme = createTheme({
  // Emkraan Cobalt: logo-blue accent + a dark surface ladder that leans blue.
  primaryColor: "cobalt",
  // dark:6 (#1B6FB8) keeps white text on filled primary above WCAG AA (~5.2:1).
  primaryShade: { light: 6, dark: 6 },
  autoContrast: true,
  respectReducedMotion: true,
  cursorType: "pointer",

  colors: {
    // Logo-blue ramp (500 #2486B9 peak, 600 #1B6FB8 token).
    cobalt: [
      "#E8F1FB",
      "#C6DEF5",
      "#93C2EC",
      "#5FA4E0",
      "#4A9FE0",
      "#2486B9",
      "#1B6FB8",
      "#155A95",
      "#114B7C",
      "#0D3A61",
    ],
    // Cobalt "Elevated" dark ladder: [0..3]=text, 4=border, 5=hover, 6=card,
    // 7=canvas/body, 8=inset. Mantine maps body->dark[7], surfaces->dark[6],
    // borders->dark[4], text->dark[0].
    dark: [
      "#F4F7FB",
      "#AEB8C6",
      "#7C879A",
      "#5A6576",
      "#263049",
      "#182238",
      "#131B2E",
      "#0B1220",
      "#080E1A",
      "#05090F",
    ],
  },

  fontFamily: "var(--font-sans), Inter, system-ui, -apple-system, sans-serif",
  fontFamilyMonospace: "var(--font-mono), 'IBM Plex Mono', ui-monospace, 'Cascadia Code', monospace",

  headings: {
    fontFamily: "var(--font-display), Sora, Inter, system-ui, sans-serif",
    fontWeight: "600",
    sizes: {
      h1: { fontSize: rem(36), lineHeight: "1.1", fontWeight: "700" },
      h2: { fontSize: rem(24), lineHeight: "1.2", fontWeight: "700" },
      h3: { fontSize: rem(20), lineHeight: "1.3", fontWeight: "600" },
      h4: { fontSize: rem(16), lineHeight: "1.4", fontWeight: "600" },
      h5: { fontSize: rem(14), lineHeight: "1.5", fontWeight: "600" },
      h6: { fontSize: rem(12), lineHeight: "1.5", fontWeight: "600" },
    },
  },

  fontSizes: {
    xs: rem(12),
    sm: rem(14),
    md: rem(16),
    lg: rem(18),
    xl: rem(20),
  },

  spacing: {
    xs: rem(10),
    sm: rem(12),
    md: rem(16),
    lg: rem(20),
    xl: rem(32),
  },

  radius: {
    xs: rem(4),
    sm: rem(4),
    md: rem(8),
    lg: rem(12),
    xl: rem(16),
  },
  defaultRadius: "md",

  shadows: {
    xs: "0 1px 2px rgba(0, 0, 0, 0.04)",
    sm: "0 1px 3px rgba(0, 0, 0, 0.06)",
    md: "0 2px 8px rgba(0, 0, 0, 0.08)",
    lg: "0 4px 12px rgba(0, 0, 0, 0.10)",
    xl: "0 8px 24px rgba(0, 0, 0, 0.12)",
  },

  components: {
    Card: {
      defaultProps: {
        withBorder: true,
        radius: "lg",
      },
    },
    Paper: {
      defaultProps: {
        withBorder: true,
        radius: "md",
      },
    },
    Button: {
      defaultProps: {
        radius: "md",
      },
    },
    ActionIcon: {
      defaultProps: {
        radius: "md",
      },
    },
    Tooltip: {
      defaultProps: {
        openDelay: 300,
      },
    },
    Menu: {
      defaultProps: {
        withArrow: true,
      },
    },
    NavLink: {
      defaultProps: {
        style: { borderRadius: 5 },
      },
    },
    LoadingOverlay: {
      defaultProps: {
        zIndex: 1000,
        overlayProps: { radius: "sm", blur: 2 },
      },
    },
    Modal: modalComponent,
  },
});
