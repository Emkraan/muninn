import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Inter, Sora } from "next/font/google";

import "@gfazioli/mantine-onboarding-tour/styles.css";
import "@homarr/notifications/styles.css";
import "@homarr/spotlight/styles.css";
import "@homarr/ui/styles.css";
import "mantine-datatable/styles.css";
import "~/styles/color-scheme.scss";
import "~/styles/scroll-area.scss";

import { notFound } from "next/navigation";
import type { DayOfWeek } from "@mantine/dates";
import { NextIntlClientProvider } from "next-intl";

import { api } from "@homarr/api/server";
import { env } from "@homarr/auth/env";
import { auth } from "@homarr/auth/next";
import { db } from "@homarr/db";
import { getServerSettingsAsync } from "@homarr/db/queries";
import { ModalProvider } from "@homarr/modals";
import { Notifications } from "@homarr/notifications";
import { SettingsProvider } from "@homarr/settings";
import { SpotlightProvider } from "@homarr/spotlight";
import type { SupportedLanguage } from "@homarr/translation";
import { isLocaleRTL, isLocaleSupported } from "@homarr/translation";

import { env as appEnv } from "~/env";

import { Analytics } from "~/components/layout/analytics";
import { CrowdinLiveTranslation } from "~/components/layout/crowdin-live-translation";

import { SearchEngineOptimization } from "~/components/layout/search-engine-optimization";
import { ServiceWorkerRegistration } from "~/components/layout/service-worker-registration";
import { getCurrentColorSchemeAsync } from "~/theme/color-scheme";
import { DayJsLoader } from "./_client-providers/dayjs-loader";
import { JotaiProvider } from "./_client-providers/jotai";
import { CustomMantineProvider } from "./_client-providers/mantine";
import { AuthProvider } from "./_client-providers/session";
import { TRPCReactProvider } from "./_client-providers/trpc";
import { composeWrappers } from "./compose";

const fontSans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

// Cobalt display + mono faces (self-hosted via next/font).
const fontDisplay = Sora({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-display",
});

const fontMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
});

// eslint-disable-next-line no-restricted-syntax
export const generateMetadata = async (): Promise<Metadata> => ({
  title: "Muninn",
  description:
    "A self-hosted dashboard and app launcher for your entire homelab. Integrates with 50+ services, real-time widgets, per-user access control.",
  openGraph: {
    title: "Muninn Dashboard",
    description:
      "A self-hosted dashboard and app launcher for your entire homelab. Integrates with 50+ services, real-time widgets, per-user access control.",
    url: "https://github.com/Emkraan/muninn",
    siteName: "Muninn",
    images: [{ url: "/logo/logo.png", width: 512, height: 512, alt: "Muninn" }],
  },
  appleWebApp: {
    title: "Muninn",
    capable: true,
    startupImage: { url: "/logo/logo.png" },
    statusBarStyle: (await getCurrentColorSchemeAsync()) === "dark" ? "black-translucent" : "default",
  },
});

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "white" },
    { media: "(prefers-color-scheme: dark)", color: "#0B1220" },
  ],
};

export default async function Layout(props: {
  children: React.ReactNode;
  params: Promise<{ locale: SupportedLanguage }>;
}) {
  if (!isLocaleSupported((await props.params).locale)) {
    notFound();
  }

  const session = await auth();
  const user = session ? await api.user.getById({ userId: session.user.id }).catch(() => null) : null;
  const serverSettings = await getServerSettingsAsync(db);
  const colorScheme = await getCurrentColorSchemeAsync();
  const direction = isLocaleRTL((await props.params).locale) ? "rtl" : "ltr";

  const StackedProvider = composeWrappers([
    (innerProps) => {
      return <AuthProvider session={session} logoutUrl={env.AUTH_LOGOUT_REDIRECT_URL} {...innerProps} />;
    },
    (innerProps) => (
      <SettingsProvider
        user={
          user
            ? {
                ...user,
                // Convert type, because output schema is not smart enough to infer $type from drizzle
                firstDayOfWeek: user.firstDayOfWeek as DayOfWeek,
              }
            : null
        }
        serverSettings={{
          board: {
            homeBoardId: serverSettings.board.homeBoardId,
            mobileHomeBoardId: serverSettings.board.mobileHomeBoardId,
            enableStatusByDefault: serverSettings.board.enableStatusByDefault,
            forceDisableStatus: serverSettings.board.forceDisableStatus,
          },
          search: { defaultSearchEngineId: serverSettings.search.defaultSearchEngineId },
          user: { enableGravatar: serverSettings.user.enableGravatar },
        }}
        {...innerProps}
      />
    ),
    (innerProps) => <JotaiProvider {...innerProps} />,
    (innerProps) => <TRPCReactProvider {...innerProps} />,
    (innerProps) => <DayJsLoader {...innerProps} />,
    (innerProps) => <NextIntlClientProvider {...innerProps} />,
    (innerProps) => <CustomMantineProvider {...innerProps} defaultColorScheme={colorScheme} />,
    (innerProps) => <ModalProvider {...innerProps} />,
    (innerProps) => <SpotlightProvider {...innerProps} />,
  ]);

  const { locale } = await props.params;

  return (
    // Instead of ColorSchemScript we use data-mantine-color-scheme to prevent flickering
    <html
      lang={locale}
      dir={direction}
      data-mantine-color-scheme={colorScheme}
      style={{
        // Cobalt is a dark-first system: dark + auto get the cobalt canvas
        // (prevents a light flash before hydration); only explicit light is white.
        backgroundColor: colorScheme === "light" ? "#fff" : "#0B1220",
      }}
      suppressHydrationWarning
    >
      <head>
        <SearchEngineOptimization />
        <CrowdinLiveTranslation locale={locale} />
      </head>
      <body
        className={[fontSans.className, fontSans.variable, fontDisplay.variable, fontMono.variable].join(" ")}
        suppressHydrationWarning
      >
        {/* Live animated background (Cobalt). Fixed behind all content;
            painted at z-index:-1 above the html canvas. See styles.css .muninn-bg. */}
        <div className="muninn-bg" aria-hidden="true">
          <span className="muninn-blob b1" />
          <span className="muninn-blob b2" />
          <span className="muninn-blob b3" />
          <span className="muninn-blob b4" />
        </div>
        {appEnv.BRAND_ATTRIBUTION && (
          <a
            className="brand-tag"
            href="https://github.com/Emkraan/muninn"
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Built by ${appEnv.BRAND_ATTRIBUTION}`}
          >
            <span className="brand-tag-text">
              Built by <b>{appEnv.BRAND_ATTRIBUTION}</b>
            </span>
          </a>
        )}
        <Analytics enabled={serverSettings.analytics.enableGeneral} />
        <StackedProvider>
          <Notifications pauseResetOnHover="notification" />
          <ServiceWorkerRegistration />
          {props.children}
        </StackedProvider>
      </body>
    </html>
  );
}
