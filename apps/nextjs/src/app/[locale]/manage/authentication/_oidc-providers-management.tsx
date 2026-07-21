"use client";

import { useCallback } from "react";
import { ActionIcon, ActionIconGroup, Badge, Card, Group, Stack, Text } from "@mantine/core";
import { IconKey, IconPencil, IconTrash } from "@tabler/icons-react";

import type { RouterOutputs } from "@homarr/api";
import { clientApi } from "@homarr/api/client";
import { revalidatePathActionAsync } from "@homarr/common/client";
import { useConfirmModal, useModalAction } from "@homarr/modals";

import { MobileAffixButton } from "~/components/manage/mobile-affix-button";
import { NoResults } from "~/components/no-results";
import { OidcProviderModal } from "./_oidc-provider-modal";

type ProviderRow = RouterOutputs["oidcProvider"]["all"][number];

interface OidcProvidersManagementProps {
  providers: RouterOutputs["oidcProvider"]["all"];
}

export const OidcProvidersManagement = ({ providers }: OidcProvidersManagementProps) => {
  const { openModal } = useModalAction(OidcProviderModal);

  if (providers.length === 0) {
    return (
      <>
        <Group justify="flex-end">
          <MobileAffixButton onClick={() => openModal({})}>Add provider</MobileAffixButton>
        </Group>
        <NoResults icon={IconKey} title="No identity providers configured yet" />
      </>
    );
  }

  return (
    <Stack gap="sm">
      <Group justify="flex-end">
        <MobileAffixButton onClick={() => openModal({})}>Add provider</MobileAffixButton>
      </Group>
      {providers.map((provider) => (
        <OidcProviderCard key={provider.id} provider={provider} />
      ))}
    </Stack>
  );
};

const providerTypeLabels: Record<string, string> = {
  microsoft: "Microsoft Entra ID",
  google: "Google",
  github: "GitHub",
  okta: "Okta",
  keycloak: "Keycloak",
  authentik: "Authentik",
  oidc: "Generic OIDC",
  oauth2: "Manual OAuth2",
};

interface OidcProviderCardProps {
  provider: ProviderRow;
}

const OidcProviderCard = ({ provider }: OidcProviderCardProps) => {
  const { openModal } = useModalAction(OidcProviderModal);
  const { openConfirmModal } = useConfirmModal();
  const { mutateAsync: deleteAsync, isPending: isDeleting } = clientApi.oidcProvider.delete.useMutation({
    async onSuccess() {
      await revalidatePathActionAsync("/manage/authentication");
    },
  });

  const handleDelete = useCallback(() => {
    openConfirmModal({
      title: "Delete provider",
      children: (
        <Text size="sm">
          Delete <b>{provider.displayName}</b>? Users who signed in with it will need another provider to
          authenticate. This does not remove their accounts.
        </Text>
      ),
      // eslint-disable-next-line no-restricted-syntax
      async onConfirm() {
        await deleteAsync({ id: provider.id });
      },
    });
  }, [openConfirmModal, deleteAsync, provider.id, provider.displayName]);

  return (
    <Card>
      <Group justify="space-between" wrap="nowrap">
        <Stack gap={4} style={{ flex: 1 }}>
          <Group gap="xs" wrap="wrap">
            <Text fw={500} lineClamp={1}>
              {provider.displayName}
            </Text>
            <Badge size="sm" variant="light" color="gray">
              {providerTypeLabels[provider.providerType] ?? provider.providerType}
            </Badge>
            {!provider.enabled && (
              <Badge size="sm" variant="light" color="red">
                Disabled
              </Badge>
            )}
            {provider.isDefault && (
              <Badge size="sm" variant="light" color="indigo">
                Default
              </Badge>
            )}
            {!provider.showOnLogin && (
              <Badge size="sm" variant="light" color="gray">
                Hidden
              </Badge>
            )}
          </Group>
          <Text size="sm" c="dimmed">
            /api/auth/callback/oidc-{provider.key}
          </Text>
        </Stack>
        <ActionIconGroup>
          <ActionIcon
            variant="subtle"
            color="gray"
            aria-label="Edit provider"
            onClick={() => openModal({ provider })}
          >
            <IconPencil size={16} stroke={1.5} />
          </ActionIcon>
          <ActionIcon
            variant="subtle"
            color="red"
            aria-label="Delete provider"
            loading={isDeleting}
            onClick={handleDelete}
          >
            <IconTrash size={16} stroke={1.5} />
          </ActionIcon>
        </ActionIconGroup>
      </Group>
    </Card>
  );
};
