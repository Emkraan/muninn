import type { SupportedLanguage } from "@homarr/translation";

// the upstream Crowdin in-context (JIPT) live-translation script was
// bound to Homarr's Crowdin project (homarr_labs). Muninn has no Crowdin
// project, so this is a no-op.
export const CrowdinLiveTranslation = (_props: { locale: SupportedLanguage }) => {
  return null;
};
