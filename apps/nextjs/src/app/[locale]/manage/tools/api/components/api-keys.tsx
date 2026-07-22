"use client";

import { useCallback, useMemo } from "react";
import { ActionIcon, Badge, Button, Group, Stack, Text, Title, Tooltip } from "@mantine/core";
import { IconTrash } from "@tabler/icons-react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import type { MRT_ColumnDef } from "mantine-react-table";
import { MantineReactTable, useMantineReactTable } from "mantine-react-table";

import type { RouterOutputs } from "@homarr/api";
import { clientApi } from "@homarr/api/client";
import { revalidatePathActionAsync } from "@homarr/common/client";
import { useConfirmModal, useModalAction } from "@homarr/modals";
import { useScopedI18n } from "@homarr/translation/client";
import { UserAvatar } from "@homarr/ui";

import { CreateApiKeyModal } from "~/app/[locale]/manage/tools/api/components/create-api-key-modal";

dayjs.extend(relativeTime);

interface ApiKeysManagementProps {
  apiKeys: RouterOutputs["apiKeys"]["getAll"];
}

type ApiKeyRow = RouterOutputs["apiKeys"]["getAll"][number];

const parseScopes = (scopes: string | null): string[] => {
  if (!scopes) return [];
  try {
    const parsed = JSON.parse(scopes) as unknown;
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
};

export const ApiKeysManagement = ({ apiKeys }: ApiKeysManagementProps) => {
  const { openModal: openCreateModal } = useModalAction(CreateApiKeyModal);
  const { openConfirmModal } = useConfirmModal();
  const { mutateAsync: mutateDeleteAsync, isPending: isPendingDelete } = clientApi.apiKeys.delete.useMutation({
    async onSuccess() {
      await revalidatePathActionAsync("/manage/tools/api");
    },
  });

  const t = useScopedI18n("management.page.tool.api.tab.apiKey");
  const handleDelete = useCallback(
    (id: string) => {
      openConfirmModal({
        title: t("modal.delete.title"),
        children: t("modal.delete.text"),
        // eslint-disable-next-line no-restricted-syntax
        async onConfirm() {
          await mutateDeleteAsync({ apiKeyId: id });
        },
      });
    },
    [t, openConfirmModal, mutateDeleteAsync],
  );

  const columns = useMemo<MRT_ColumnDef<ApiKeyRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: t("table.header.name"),
        Cell: ({ row }) => {
          const scopes = parseScopes(row.original.scopes);
          const isLegacy = scopes.length === 0;
          return (
            <Stack gap={2}>
              <Text size="sm">{row.original.name || row.original.id}</Text>
              {isLegacy ? (
                <Badge color="yellow" variant="light" size="xs">
                  {t("table.legacyBadge")}
                </Badge>
              ) : (
                <Tooltip label={scopes.join(", ")} multiline maw={320}>
                  <Text size="xs" c="dimmed">
                    {t("table.scopeCount", { count: scopes.length })}
                  </Text>
                </Tooltip>
              )}
            </Stack>
          );
        },
      },
      {
        accessorKey: "user",
        header: t("table.header.createdBy"),
        Cell: ({ row }) => (
          <Group gap={"xs"}>
            <UserAvatar user={row.original.user} size={"sm"} />
            <Text>{row.original.user.name}</Text>
          </Group>
        ),
      },
      {
        accessorKey: "createdAt",
        header: t("table.header.created"),
        Cell: ({ row }) => <Text size="sm">{dayjs(row.original.createdAt).format("YYYY-MM-DD HH:mm")}</Text>,
      },
      {
        accessorKey: "expiresAt",
        header: t("table.header.expires"),
        Cell: ({ row }) => {
          const expiresAt = row.original.expiresAt;
          if (!expiresAt) {
            return (
              <Text size="sm" c="dimmed">
                {t("table.never")}
              </Text>
            );
          }
          const isExpired = dayjs(expiresAt).isBefore(dayjs());
          return (
            <Text size="sm" c={isExpired ? "red" : undefined}>
              {dayjs(expiresAt).format("YYYY-MM-DD HH:mm")}
            </Text>
          );
        },
      },
      {
        accessorKey: "lastUsedAt",
        header: t("table.header.lastUsed"),
        Cell: ({ row }) =>
          row.original.lastUsedAt ? (
            <Text size="sm">{dayjs(row.original.lastUsedAt).fromNow()}</Text>
          ) : (
            <Text size="sm" c="dimmed">
              {t("table.neverUsed")}
            </Text>
          ),
      },
      {
        header: t("table.header.actions"),
        Cell: ({ row }) => (
          <Group gap="xs">
            <ActionIcon onClick={() => handleDelete(row.original.id)} loading={isPendingDelete} c="red">
              <IconTrash size="1rem" />
            </ActionIcon>
          </Group>
        ),
      },
    ],
    [t, handleDelete, isPendingDelete],
  );

  const table = useMantineReactTable({
    columns,
    data: apiKeys,
    renderTopToolbarCustomActions: () => (
      <Button onClick={() => openCreateModal({})}>{t("button.createApiToken")}</Button>
    ),
    enableDensityToggle: false,
    state: {
      density: "xs",
    },
  });

  return (
    <Stack>
      <Title>{t("title")}</Title>
      <MantineReactTable table={table} />
    </Stack>
  );
};
