import React from "react";
import Layout from "@theme/Layout";
import BrowserOnly from "@docusaurus/BrowserOnly";
import useBaseUrl from "@docusaurus/useBaseUrl";

export default function ApiReferencePage() {
  const schemaUrl = useBaseUrl("/api/open-api-schema.json");

  return (
    <Layout title="API Reference" description="Muninn OpenAPI Reference">
      <BrowserOnly fallback={<div style={{ height: "100vh" }} />}>
        {() => {
          const { ThemedApiReference } = require("@site/src/components/themed-api-reference");
          return (
            <ThemedApiReference
              configuration={{
                url: schemaUrl,
                theme: "kepler",
                hideModels: false,
                hideDownloadButton: false,
                mcp: { disabled: true },
                customCss: `
                  .scalar-sidebar-footer a[href="https://www.scalar.com"] { display: none !important; }
                `,
              }}
            />
          );
        }}
      </BrowserOnly>
    </Layout>
  );
}
