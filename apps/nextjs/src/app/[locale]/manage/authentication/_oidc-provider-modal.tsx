"use client";

import { useMemo } from "react";
import {
  Accordion,
  Alert,
  Anchor,
  Code,
  CopyButton,
  Divider,
  Group,
  PasswordInput,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
} from "@mantine/core";
import { IconCheck, IconCopy, IconInfoCircle } from "@tabler/icons-react";
import { z } from "zod/v4";

import type { RouterOutputs } from "@homarr/api";
import { clientApi } from "@homarr/api/client";
import { revalidatePathActionAsync } from "@homarr/common/client";
import { oidcProviderTypes } from "@homarr/definitions";
import { useZodForm } from "@homarr/form";
import { createModal, ModalFormFooter } from "@homarr/modals";
import { showErrorNotification, showSuccessNotification } from "@homarr/notifications";

// Kept in sync with the sentinel in oidc-provider-router.ts: sending it back on
// save means "leave the stored client secret unchanged".
const SECRET_SENTINEL = "__emkraan_secret_unchanged__";

type ProviderRow = RouterOutputs["oidcProvider"]["all"][number];

const providerTypeOptions: { value: (typeof oidcProviderTypes)[number]; label: string }[] = [
  { value: "microsoft", label: "Microsoft Entra ID" },
  { value: "google", label: "Google" },
  { value: "github", label: "GitHub" },
  { value: "okta", label: "Okta" },
  { value: "keycloak", label: "Keycloak" },
  { value: "authentik", label: "Authentik" },
  { value: "oidc", label: "Generic OIDC (discovery)" },
  { value: "oauth2", label: "Manual OAuth2" },
];

const authMethodOptions = [
  { value: "client_secret_basic", label: "client_secret_basic" },
  { value: "client_secret_post", label: "client_secret_post" },
  { value: "none", label: "none (PKCE / public client)" },
];

const formSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(59)
    .regex(/^[a-z0-9-]+$/, "Lowercase slug only (a-z, 0-9, hyphen)"),
  displayName: z.string().min(1),
  providerType: z.enum(oidcProviderTypes),
  enabled: z.boolean(),
  showOnLogin: z.boolean(),
  isDefault: z.boolean(),
  clientId: z.string().min(1),
  clientSecret: z.string(),
  tenant: z.string(),
  issuer: z.string(),
  discoveryUrl: z.string(),
  authorizationUrl: z.string(),
  tokenUrl: z.string(),
  userinfoUrl: z.string(),
  scopes: z.string(),
  tokenEndpointAuthMethod: z.string(),
  allowDangerousEmailAccountLinking: z.boolean(),
  forceUserinfo: z.boolean(),
  nameClaim: z.string(),
  emailClaim: z.string(),
  pictureClaim: z.string(),
  usernameClaim: z.string(),
  groupsClaim: z.string(),
  allowedGroups: z.string(),
  adminGroups: z.string(),
  groupsLocalManagement: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

const emptyValues = (): FormValues => ({
  key: "",
  displayName: "",
  providerType: "microsoft",
  enabled: true,
  showOnLogin: true,
  isDefault: false,
  clientId: "",
  clientSecret: "",
  tenant: "",
  issuer: "",
  discoveryUrl: "",
  authorizationUrl: "",
  tokenUrl: "",
  userinfoUrl: "",
  scopes: "",
  tokenEndpointAuthMethod: "client_secret_basic",
  allowDangerousEmailAccountLinking: false,
  forceUserinfo: false,
  nameClaim: "",
  emailClaim: "",
  pictureClaim: "",
  usernameClaim: "",
  groupsClaim: "",
  allowedGroups: "",
  adminGroups: "",
  groupsLocalManagement: false,
});

const s = (value: string | null | undefined) => value ?? "";

const fromRow = (row: ProviderRow): FormValues => ({
  key: row.key,
  displayName: row.displayName,
  providerType: row.providerType,
  enabled: row.enabled,
  showOnLogin: row.showOnLogin,
  isDefault: row.isDefault,
  clientId: row.clientId,
  clientSecret: "", // never round-tripped; blank means "keep current"
  tenant: s(row.tenant),
  issuer: s(row.issuer),
  discoveryUrl: s(row.discoveryUrl),
  authorizationUrl: s(row.authorizationUrl),
  tokenUrl: s(row.tokenUrl),
  userinfoUrl: s(row.userinfoUrl),
  scopes: s(row.scopes),
  tokenEndpointAuthMethod: row.tokenEndpointAuthMethod || "client_secret_basic",
  allowDangerousEmailAccountLinking: row.allowDangerousEmailAccountLinking,
  forceUserinfo: row.forceUserinfo,
  nameClaim: s(row.nameClaim),
  emailClaim: s(row.emailClaim),
  pictureClaim: s(row.pictureClaim),
  usernameClaim: s(row.usernameClaim),
  groupsClaim: s(row.groupsClaim),
  allowedGroups: s(row.allowedGroups),
  adminGroups: s(row.adminGroups),
  groupsLocalManagement: row.groupsLocalManagement,
});

const nullIfEmpty = (value: string) => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const OidcProviderModal = createModal<{ provider?: ProviderRow }>(({ actions, innerProps }) => {
  const isEditing = Boolean(innerProps.provider);
  const utils = clientApi.useUtils();

  const form = useZodForm(formSchema, {
    initialValues: innerProps.provider ? fromRow(innerProps.provider) : emptyValues(),
  });

  const { mutate, isPending } = clientApi.oidcProvider.upsert.useMutation({
    async onSuccess() {
      showSuccessNotification({
        title: "Provider saved",
        message: `${form.values.displayName} was saved. Changes apply on the next sign-in (no restart needed).`,
      });
      await utils.oidcProvider.all.invalidate();
      await revalidatePathActionAsync("/manage/authentication");
      actions.closeModal();
    },
    onError(error) {
      showErrorNotification({
        title: "Could not save provider",
        message: error.message,
      });
    },
  });

  const providerType = form.values.providerType;
  const showTenant = providerType === "microsoft";
  const showIssuer = ["okta", "keycloak", "authentik", "oidc"].includes(providerType);
  const showDiscovery = providerType === "oidc";
  const showManualEndpoints = providerType === "oauth2";
  const isPresetOnly = providerType === "google" || providerType === "github";

  const callbackPath = useMemo(
    () => (form.values.key ? `/api/auth/callback/oidc-${form.values.key}` : "/api/auth/callback/oidc-<key>"),
    [form.values.key],
  );

  const handleSubmit = (values: FormValues) => {
    if (!isEditing && nullIfEmpty(values.clientSecret) === null) {
      form.setFieldError("clientSecret", "A client secret is required when creating a provider");
      return;
    }

    if (values.isDefault && !values.showOnLogin) {
      form.setFieldError("isDefault", "A default (auto sign-in) provider must also be shown on the login page.");
      return;
    }

    mutate({
      id: innerProps.provider?.id,
      key: values.key,
      displayName: values.displayName,
      providerType: values.providerType,
      enabled: values.enabled,
      showOnLogin: values.showOnLogin,
      isDefault: values.isDefault,
      clientId: values.clientId,
      // Blank on edit -> sentinel (keep current). Otherwise send the typed value.
      clientSecret: nullIfEmpty(values.clientSecret) ?? SECRET_SENTINEL,
      tenant: nullIfEmpty(values.tenant),
      issuer: nullIfEmpty(values.issuer),
      discoveryUrl: nullIfEmpty(values.discoveryUrl),
      authorizationUrl: nullIfEmpty(values.authorizationUrl),
      tokenUrl: nullIfEmpty(values.tokenUrl),
      userinfoUrl: nullIfEmpty(values.userinfoUrl),
      scopes: nullIfEmpty(values.scopes),
      tokenEndpointAuthMethod: values.tokenEndpointAuthMethod || "client_secret_basic",
      allowDangerousEmailAccountLinking: values.allowDangerousEmailAccountLinking,
      forceUserinfo: values.forceUserinfo,
      nameClaim: nullIfEmpty(values.nameClaim),
      emailClaim: nullIfEmpty(values.emailClaim),
      pictureClaim: nullIfEmpty(values.pictureClaim),
      usernameClaim: nullIfEmpty(values.usernameClaim),
      groupsClaim: nullIfEmpty(values.groupsClaim),
      allowedGroups: nullIfEmpty(values.allowedGroups),
      adminGroups: nullIfEmpty(values.adminGroups),
      groupsLocalManagement: values.groupsLocalManagement,
    });
  };

  return (
    <form onSubmit={form.onSubmit(handleSubmit)}>
      <Stack gap="md">
        <Select
          label="Provider type"
          description="Presets fill in the standard endpoints; anything you set below overrides them."
          data={providerTypeOptions}
          allowDeselect={false}
          {...form.getInputProps("providerType")}
        />

        <Group grow align="flex-start">
          <TextInput
            label="Key"
            description="Stable slug used in the callback URL. Cannot be changed later."
            placeholder="entra"
            disabled={isEditing}
            {...form.getInputProps("key")}
          />
          <TextInput
            label="Display name"
            description="Shown on the sign-in button."
            placeholder="Company SSO"
            {...form.getInputProps("displayName")}
          />
        </Group>

        <Alert variant="light" color="blue" icon={<IconInfoCircle size={16} />}>
          <Stack gap={4}>
            <Text size="sm">Register this redirect URI with the identity provider:</Text>
            <Group gap="xs" wrap="nowrap">
              <Code style={{ flex: 1, overflowWrap: "anywhere" }}>{callbackPath}</Code>
              <CopyButton value={callbackPath}>
                {({ copied, copy }) => (
                  <Anchor component="button" type="button" size="sm" onClick={copy}>
                    {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                  </Anchor>
                )}
              </CopyButton>
            </Group>
          </Stack>
        </Alert>

        <Group grow align="flex-start">
          <TextInput label="Client ID" {...form.getInputProps("clientId")} />
          <PasswordInput
            label="Client secret"
            description={isEditing ? "Leave blank to keep the current secret." : undefined}
            placeholder={isEditing ? "••••••••" : undefined}
            {...form.getInputProps("clientSecret")}
          />
        </Group>

        {showTenant && (
          <TextInput
            label="Tenant ID"
            description="Entra directory (tenant) ID, or 'organizations' / 'common'."
            {...form.getInputProps("tenant")}
          />
        )}
        {showIssuer && (
          <TextInput
            label="Issuer URL"
            description="Base issuer; discovery is derived as {issuer}/.well-known/openid-configuration."
            placeholder="https://id.example.com/realms/main"
            {...form.getInputProps("issuer")}
          />
        )}
        {showDiscovery && (
          <TextInput
            label="Discovery URL"
            description="Full .well-known/openid-configuration URL (or set the issuer under Advanced)."
            placeholder="https://id.example.com/.well-known/openid-configuration"
            {...form.getInputProps("discoveryUrl")}
          />
        )}
        {showManualEndpoints && (
          <Stack gap="sm">
            <TextInput label="Authorization URL" {...form.getInputProps("authorizationUrl")} />
            <TextInput label="Token URL" {...form.getInputProps("tokenUrl")} />
            <TextInput label="Userinfo URL" {...form.getInputProps("userinfoUrl")} />
          </Stack>
        )}
        {isPresetOnly && (
          <Text size="sm" c="dimmed">
            Endpoints are preset for this provider. Only the client ID and secret are required.
          </Text>
        )}

        <Group>
          <Switch label="Enabled" {...form.getInputProps("enabled", { type: "checkbox" })} />
          <Switch label="Show on login page" {...form.getInputProps("showOnLogin", { type: "checkbox" })} />
          <Switch
            label="Default (auto sign-in)"
            {...form.getInputProps("isDefault", { type: "checkbox" })}
          />
        </Group>

        <Accordion variant="separated">
          <Accordion.Item value="advanced">
            <Accordion.Control>Advanced</Accordion.Control>
            <Accordion.Panel>
              <Stack gap="sm">
                <TextInput
                  label="Scopes"
                  description="Space-separated. Defaults to the provider preset (usually 'openid profile email')."
                  placeholder="openid profile email"
                  {...form.getInputProps("scopes")}
                />
                <Select
                  label="Token endpoint auth method"
                  data={authMethodOptions}
                  allowDeselect={false}
                  {...form.getInputProps("tokenEndpointAuthMethod")}
                />
                <Group>
                  <Switch
                    label="Force userinfo request"
                    {...form.getInputProps("forceUserinfo", { type: "checkbox" })}
                  />
                  <Switch
                    label="Allow dangerous email account linking"
                    {...form.getInputProps("allowDangerousEmailAccountLinking", { type: "checkbox" })}
                  />
                </Group>

                <Divider label="Endpoint overrides" labelPosition="left" />
                <TextInput label="Issuer URL" {...form.getInputProps("issuer")} />
                <TextInput label="Discovery URL" {...form.getInputProps("discoveryUrl")} />
                <TextInput label="Authorization URL" {...form.getInputProps("authorizationUrl")} />
                <TextInput label="Token URL" {...form.getInputProps("tokenUrl")} />
                <TextInput label="Userinfo URL" {...form.getInputProps("userinfoUrl")} />

                <Divider label="Claim mapping" labelPosition="left" />
                <Group grow align="flex-start">
                  <TextInput label="Name claim" placeholder="name" {...form.getInputProps("nameClaim")} />
                  <TextInput label="Email claim" placeholder="email" {...form.getInputProps("emailClaim")} />
                </Group>
                <Group grow align="flex-start">
                  <TextInput label="Picture claim" placeholder="picture" {...form.getInputProps("pictureClaim")} />
                  <TextInput
                    label="Username claim"
                    placeholder="preferred_username"
                    {...form.getInputProps("usernameClaim")}
                  />
                </Group>

                <Divider label="Group mapping" labelPosition="left" />
                <TextInput
                  label="Groups claim"
                  placeholder="groups"
                  {...form.getInputProps("groupsClaim")}
                />
                <TextInput
                  label="Allowed groups"
                  description="Comma-separated. If set, only members of these groups may sign in."
                  {...form.getInputProps("allowedGroups")}
                />
                <TextInput
                  label="Admin groups"
                  description="Comma-separated. Not yet enforced: to grant admin, create a Muninn group whose name matches the IdP group and give it the admin permission."
                  {...form.getInputProps("adminGroups")}
                />
                <Switch
                  label="Manage group membership locally"
                  description="When on, IdP groups are ignored after the first sign-in and membership is managed in Muninn."
                  {...form.getInputProps("groupsLocalManagement", { type: "checkbox" })}
                />
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>

        <ModalFormFooter onCancel={actions.closeModal} loading={isPending} />
      </Stack>
    </form>
  );
}).withOptions({
  size: "lg",
  defaultTitle() {
    return "Identity provider";
  },
});
