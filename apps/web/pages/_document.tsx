import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="en" data-theme="dark">
      <Head>
        <meta name="color-scheme" content="dark" />
        <meta name="theme-color" content="#0B1220" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Sora:wght@600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </Head>
      <body>
        {/* Emkraan live animated background: slow-drifting cobalt blobs behind
            the whole app. Styles + reduced-motion in globals.css (.bg-blobs). */}
        <div className="bg-blobs" aria-hidden="true">
          <span className="blob b1" />
          <span className="blob b2" />
          <span className="blob b3" />
          <span className="blob b4" />
        </div>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
