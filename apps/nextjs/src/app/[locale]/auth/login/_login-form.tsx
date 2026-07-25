"use client";

import type { PropsWithChildren } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Anchor, Button, Card, Code, Collapse, Divider, PasswordInput, Stack, Text, TextInput } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconBrandGithub, IconBrandGoogle, IconBrandWindows, IconLogin2 } from "@tabler/icons-react";
import { z } from "zod/v4";

import { signIn } from "@homarr/auth/client";
import { revalidatePathActionAsync } from "@homarr/common/client";
import type { UseFormReturnType } from "@homarr/form";
import { useZodForm } from "@homarr/form";
import { showErrorNotification, showSuccessNotification } from "@homarr/notifications";
import { useScopedI18n } from "@homarr/translation/client";
import { sanitizeRedirectionUrl } from "@homarr/validation/redirection-url";
import { userSignInSchema } from "@homarr/validation/user";

interface OidcProviderButton {
  id: string;
  displayName: string;
  providerType: string;
  isDefault: boolean;
}

// Brand icon per provider type for the snagarr-style sign-in buttons.
const oidcProviderIcon = (providerType: string) => {
  switch (providerType) {
    case "microsoft":
      return IconBrandWindows;
    case "google":
      return IconBrandGoogle;
    case "github":
      return IconBrandGithub;
    default:
      return IconLogin2;
  }
};

interface LoginFormProps {
  providers: string[];
  oidcProviders: OidcProviderButton[];
  callbackUrl: string;
}

const extendedValidation = userSignInSchema.extend({ provider: z.enum(["credentials", "ldap"]) });

export const LoginForm = ({ providers, oidcProviders, callbackUrl }: LoginFormProps) => {
  const t = useScopedI18n("user");
  const searchParams = useSearchParams();
  const isError = searchParams.has("error");
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const form = useZodForm(extendedValidation, {
    initialValues: {
      name: "",
      password: "",
      provider: "credentials",
    },
  });

  const credentialInputsVisible = providers.includes("credentials") || providers.includes("ldap");

  const onSuccess = useCallback(
    async (provider: string, response: Awaited<ReturnType<typeof signIn>>) => {
      if (!response.ok || response.error) {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw response.error;
      }

      // Any non-credentials provider (every OIDC provider, id "oidc-<key>") is
      // redirected to the IdP by Auth.js.
      if (provider !== "credentials" && provider !== "ldap") {
        if (!response.url) {
          showErrorNotification({
            title: t("action.login.notification.error.title"),
            message: t("action.login.notification.error.message"),
            autoClose: 10000,
          });
          return;
        }

        router.push(response.url);
        return;
      }

      showSuccessNotification({
        title: t("action.login.notification.success.title"),
        message: t("action.login.notification.success.message"),
      });

      // Redirect to the callback URL if the response is defined and comes from a credentials provider (ldap or credentials). oidc is redirected automatically.
      await revalidatePathActionAsync("/");
      router.push(sanitizeRedirectionUrl(callbackUrl));
    },
    [t, router, callbackUrl],
  );

  const onError = useCallback(() => {
    setIsPending(false);

    showErrorNotification({
      title: t("action.login.notification.error.title"),
      message: t("action.login.notification.error.message"),
      autoClose: 10000,
    });
  }, [t]);

  const signInAsync = useCallback(
    async (provider: string, options?: Parameters<typeof signIn>[1]) => {
      setIsPending(true);
      await signIn(provider, {
        ...options,
        redirect: false,
        callbackUrl: new URL(callbackUrl, window.location.href).href,
      })
        .then((response) => onSuccess(provider, response))
        .catch(onError);
    },
    [setIsPending, onSuccess, onError, callbackUrl],
  );

  // Auto-login to the provider marked as default (generalizes the old single
  // AUTH_OIDC_AUTO_LOGIN env flag to the DB provider store).
  const defaultProvider = oidcProviders.find((provider) => provider.isDefault);
  const isLoginInProgress = useRef(false);

  useEffect(() => {
    if (isError || !defaultProvider) return;
    if (!isPending && !isLoginInProgress.current) {
      isLoginInProgress.current = true;
      void signInAsync(defaultProvider.id);
    }
  }, [signInAsync, defaultProvider, isPending, isError]);

  return (
    <Stack gap="xl">
      <Stack gap="lg">
        {credentialInputsVisible && (
          <>
            <form onSubmit={form.onSubmit((credentials) => void signInAsync(credentials.provider, credentials))}>
              <Stack gap="lg">
                <TextInput
                  label={t("field.username.label")}
                  id="username"
                  autoComplete="username"
                  {...form.getInputProps("name")}
                />
                <PasswordInput
                  label={t("field.password.label")}
                  id="password"
                  autoComplete="current-password"
                  {...form.getInputProps("password")}
                />

                {providers.includes("credentials") && (
                  <Stack gap="sm">
                    <SubmitButton isPending={isPending} form={form} provider="credentials">
                      {t("action.login.label")}
                    </SubmitButton>
                    <PasswordForgottenCollapse username={form.values.name} />
                  </Stack>
                )}

                {providers.includes("ldap") && (
                  <SubmitButton isPending={isPending} form={form} provider="ldap">
                    {t("action.login.labelWith", { provider: "LDAP" })}
                  </SubmitButton>
                )}
              </Stack>
            </form>
            {oidcProviders.length > 0 && <Divider label="Single sign-on" labelPosition="center" />}
          </>
        )}

        {oidcProviders.map((provider) => {
          const ProviderIcon = oidcProviderIcon(provider.providerType);
          return (
            <Button
              key={provider.id}
              fullWidth
              variant="light"
              leftSection={<ProviderIcon size={18} stroke={1.5} />}
              onClick={async () => await signInAsync(provider.id)}
            >
              {t("action.login.labelWith", { provider: provider.displayName })}
            </Button>
          );
        })}
      </Stack>
    </Stack>
  );
};

interface SubmitButtonProps {
  isPending: boolean;
  form: UseFormReturnType<FormType>;
  provider: "credentials" | "ldap";
}

const SubmitButton = ({ isPending, form, provider, children }: PropsWithChildren<SubmitButtonProps>) => {
  const isCurrentProviderActive = form.getValues().provider === provider;

  return (
    <Button
      type="submit"
      name={provider}
      fullWidth
      onClick={() => form.setFieldValue("provider", provider)}
      loading={isPending && isCurrentProviderActive}
      disabled={isPending && !isCurrentProviderActive}
    >
      {children}
    </Button>
  );
};

interface PasswordForgottenCollapseProps {
  username: string;
}
const PasswordForgottenCollapse = ({ username }: PasswordForgottenCollapseProps) => {
  const [visible, { toggle }] = useDisclosure(false);
  const tForgotPassword = useScopedI18n("user.action.login.forgotPassword");

  const commandUsername = username.trim().length >= 1 ? username.trim() : "<username>";

  return (
    <>
      <Anchor type="button" component="button" onClick={toggle}>
        {tForgotPassword("label")}
      </Anchor>

      <Collapse expanded={visible}>
        <Card>
          <Stack gap="xs">
            <Text size="sm">{tForgotPassword("description")}</Text>

            <Code>muninn reset-password -u {commandUsername}</Code>
          </Stack>
        </Card>
      </Collapse>
    </>
  );
};

type FormType = z.infer<typeof extendedValidation>;
