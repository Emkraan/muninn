import { IconBrandGithub, IconBrandGoogle, IconBrandWindows, IconKey } from "@tabler/icons-react";

import type { OidcProviderType } from "@homarr/definitions";
import type { TablerIcon } from "@homarr/ui";

// Provider type -> human label. Shared by the management card badges and the
// modal's visual type picker so the two never drift apart.
export const providerTypeOptions: { value: OidcProviderType; label: string }[] = [
  { value: "microsoft", label: "Microsoft Entra ID" },
  { value: "google", label: "Google" },
  { value: "github", label: "GitHub" },
  { value: "okta", label: "Okta" },
  { value: "keycloak", label: "Keycloak" },
  { value: "authentik", label: "Authentik" },
  { value: "oidc", label: "Generic OIDC" },
  { value: "oauth2", label: "Manual OAuth2" },
];

export const providerTypeLabels: Record<string, string> = Object.fromEntries(
  providerTypeOptions.map((option) => [option.value, option.label]),
);

// Brand icon per provider type, mirroring the sign-in button mapping in
// _login-form.tsx. The identity-provider families that share a glyph
// (okta / keycloak / authentik / oidc / oauth2) fall back to a generic key.
export const oidcProviderIcon = (providerType: string): TablerIcon => {
  switch (providerType) {
    case "microsoft":
      return IconBrandWindows;
    case "google":
      return IconBrandGoogle;
    case "github":
      return IconBrandGithub;
    default:
      return IconKey;
  }
};
