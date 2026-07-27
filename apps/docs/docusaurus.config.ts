import type * as Preset from "@docusaurus/preset-classic";
import type { Config } from "@docusaurus/types";
import { themes as prismThemes } from "prism-react-renderer";
const a11yEmoji = require("@fec/remark-a11y-emoji");

const config: Config = {
  title: "Muninn documentation",
  tagline: "A self-hosted dashboard and app launcher for your homelab.",
  // GitHub Pages for the Emkraan/muninn repo. `baseUrl` is the repo path, so
  // every site-relative link has to go through `useBaseUrl` / `<Link>` rather
  // than a raw "/..." href, and anything that matches on a pathname has to
  // account for the "/muninn" prefix (see createSitemapItems below).
  url: "https://emkraan.github.io",
  baseUrl: "/muninn/",
  trailingSlash: undefined,
  favicon: "img/logo.png",
  organizationName: "Emkraan",
  projectName: "muninn",
  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },
  onBrokenLinks: "throw",
  onBrokenAnchors: "throw",
  onDuplicateRoutes: "throw",

  future: {
    v4: {
      removeLegacyPostBuildHeadAttribute: true,
      useCssCascadeLayers: true,
      siteStorageNamespacing: true,
      fasterByDefault: true,
      mdx1CompatDisabledByDefault: false,
    },
    faster: {
      swcHtmlMinimizer: false,
    },
  },

  markdown: {
    mermaid: true,
    format: "detect",
    hooks: {
      onBrokenMarkdownLinks: "throw",
    },
  },

  themes: ["@docusaurus/theme-mermaid"],

  presets: [
    [
      "classic",
      {
        docs: {
          sidebarPath: require.resolve("./sidebars.js"),
          editUrl: ({ docPath }) => `https://github.com/Emkraan/muninn/edit/main/apps/docs/docs/${docPath}`,
          remarkPlugins: [a11yEmoji],
          exclude: [],
          showLastUpdateAuthor: false,
          showLastUpdateTime: false,
        },
        blog: {
          showReadingTime: true,
          // Please change this to your repo.
          // Remove this to remove the "edit this page" links.
          editUrl: "https://github.com/Emkraan/muninn/edit/main/apps/docs",
          authorsMapPath: "authors.yml",
        },
        theme: {
          customCss: require.resolve("./src/css/custom.css"),
        },
        sitemap: {
          changefreq: "weekly",
          priority: 0.5,
          ignorePatterns: ["/tags/**", "/docs/category/**"],
          filename: "sitemap.xml",
          createSitemapItems: async ({ routes, siteConfig, defaultCreateSitemapItems }) => {
            const items = await defaultCreateSitemapItems({ routes, siteConfig });
            // Sitemap locs carry the baseUrl prefix ("/muninn"), so strip it
            // before matching or none of the branches below ever fire.
            const basePrefix = siteConfig.baseUrl.replace(/\/$/, "");
            return items.map((item) => {
              const pathname = new URL(item.url).pathname;
              const path = basePrefix && pathname.startsWith(basePrefix) ? pathname.slice(basePrefix.length) : pathname;
              if (path === "/" || path === "") {
                return { ...item, priority: 1.0, changefreq: "weekly" };
              }
              if (path.startsWith("/docs/")) {
                return { ...item, priority: 0.7, changefreq: "monthly" };
              }
              if (path.startsWith("/blog/")) {
                return { ...item, priority: 0.3, changefreq: "never" };
              }
              if (path.startsWith("/about-us")) {
                return { ...item, priority: 0.4, changefreq: "yearly" };
              }
              return item;
            });
          },
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    navbar: {
      title: "Muninn",
      logo: {
        alt: "Muninn Logo",
        src: "img/logo.png",
      },
      items: [
        {
          label: "Documentation",
          type: "doc",
          position: "left",
          docId: "getting-started/index",
        },
        {
          label: "Blog",
          position: "left",
          to: "/blog",
        },
        {
          label: "About us",
          position: "left",
          to: "/about-us",
        },
        {
          to: "https://github.com/Emkraan/muninn",
          label: "Demo",
          position: "right",
        },
        {
          to: "https://www.buymeacoffee.com/emkraan",
          label: "💴 Donate",
          position: "right",
        },
        {
          type: "dropdown",
          label: "Community",
          position: "right",
          items: [
            {
              to: "https://github.com/Emkraan/muninn",
              label: "GitHub",
            },
            {
              to: "https://www.buymeacoffee.com/emkraan",
              label: "Donate",
            },
          ],
        },
        {
          type: "search",
          position: "right",
        },
      ],
      hideOnScroll: false,
    },
    algolia: {
      appId: "N69WSPZTID",
      apiKey: "b2b00f4ed8ca3dc87b5d211c55121416",
      indexName: "Docusaurus",
      contextualSearch: false,
      searchPagePath: "search",
      insights: false,
      replaceSearchResultPathname: {
        from: "/docs/(next|\\d+(?:\\.\\d+)*)/",
        to: "/docs/",
      },
    },
    footer: {
      links: [
        {
          title: "Documentation",
          items: [
            {
              label: "Installation",
              to: "/docs/category/getting-started",
            },
          ],
        },
        {
          title: "Community",
          items: [
            {
              label: "GitHub",
              to: "https://github.com/Emkraan/muninn",
            },
            {
              label: "Donate",
              to: "https://www.buymeacoffee.com/emkraan",
            },
          ],
        },
        {
          title: "More",
          items: [
            {
              label: "Blog",
              to: "/blog",
            },
            {
              label: "About us",
              to: "/about-us",
            },
          ],
        },
      ],
      logo: {
        alt: "Muninn Logo",
        src: "img/logo.png",
        height: 100,
      },
      copyright: `<span class="copyright_text">Copyright © ${new Date().getFullYear()} Muninn<span> - <a href="/muninn/docs/community/license">License</a>`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      defaultLanguage: "bash",
    },
    colorMode: {
      defaultMode: "dark",
      respectPrefersColorScheme: true,
    },
    metadata: [
      {
        name: "keywords",
        content: "Muninn, Dashboard, Selfhosted, Hosting, Modules, Open-Source",
      },
    ],
    zoom: {
      selector: ".markdown :not(em) > img",
      background: {
        light: "rgb(255, 255, 255)",
        dark: "rgb(50, 50, 50)",
      },
      config: {
        // options you can specify via https://github.com/francoischalifour/medium-zoom#usage
        margin: 80,
      },
    },
    tableOfContents: {
      minHeadingLevel: 2,
      maxHeadingLevel: 4,
    },
  } satisfies Preset.ThemeConfig,
  plugins: [
    function homarrPackagesPlugin() {
      return {
        name: "resolve-homarr-packages",
        configureWebpack() {
          return { resolve: { symlinks: false } };
        },
      };
    },
    // No analytics plugin here on purpose. Muninn does not phone home (see
    // packages/analytics/src/client.ts), and the docs site is held to the same
    // rule - upstream's PostHog project is not ours to send traffic to.
    "docusaurus-plugin-image-zoom",
    require.resolve("./plugins/validate-docs-coverage"),
    function disableExpensiveBundlerOptimizationPlugin() {
      return {
        name: "disable-expensive-bundler-optimizations",
        configureWebpack(_config: unknown, isServer: boolean) {
          return {
            optimization: {
              concatenateModules: process.env.CI != null && process.env.CI !== "false" ? !isServer : false,
            },
          };
        },
      };
    },
    "@signalwire/docusaurus-plugin-llms-txt",
    async function tailwindCssPlugin() {
      return {
        name: "docusaurus-tailwindcss",
        configurePostCss(postcssOptions) {
          postcssOptions.plugins.push(require("@tailwindcss/postcss"));
          return postcssOptions;
        },
      };
    },
  ],
};

export default config;
