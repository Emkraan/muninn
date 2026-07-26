"use client";

import { useState } from "react";
import {
  Badge,
  Button,
  Group,
  Select,
  Stack,
  Table,
  TableTbody,
  TableTd,
  TableTh,
  TableThead,
  TableTr,
  Text,
  Title,
} from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";

import type { RouterOutputs } from "@homarr/api";
import { clientApi } from "@homarr/api/client";
import type { AppPermission, BoardPermission, IntegrationPermission } from "@homarr/definitions";
import { appPermissions, boardPermissions, integrationPermissions } from "@homarr/definitions";
import { showErrorNotification, showSuccessNotification } from "@homarr/notifications";
import { useI18n, useScopedI18n } from "@homarr/translation/client";

type AccessData = RouterOutputs["user"]["getAccessById"];
type AccessItem = AccessData["apps"][number];

interface UserAccessSectionsProps {
  userId: string;
  initialData: AccessData;
  canManage: boolean;
}

export const UserAccessSections = ({ userId, initialData, canManage }: UserAccessSectionsProps) => {
  const utils = clientApi.useUtils();
  const { data } = clientApi.user.getAccessById.useQuery(
    { userId },
    {
      initialData,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  );
  const invalidate = () => utils.user.getAccessById.invalidate({ userId });

  return (
    <Stack>
      <AppsSection userId={userId} items={data.apps} canManage={canManage} invalidate={invalidate} />
      <BoardsSection userId={userId} items={data.boards} canManage={canManage} invalidate={invalidate} />
      <IntegrationsSection userId={userId} items={data.integrations} canManage={canManage} invalidate={invalidate} />
    </Stack>
  );
};

interface SectionProps {
  userId: string;
  items: AccessItem[];
  canManage: boolean;
  invalidate: () => Promise<void>;
}

const AppsSection = ({ userId, items, canManage, invalidate }: SectionProps) => {
  const t = useI18n();
  const tAccess = useScopedI18n("management.page.user.setting.access");
  const grant = clientApi.user.grantAppToUser.useMutation();
  const revoke = clientApi.user.revokeAppFromUser.useMutation();
  const { data: allApps } = clientApi.app.all.useQuery(undefined, { enabled: canManage });

  const directIds = items.filter((item) => item.source === "direct").map((item) => item.id);
  const addOptions = (allApps ?? [])
    .filter((app) => !directIds.includes(app.id))
    .map((app) => ({ value: app.id, label: app.name }));

  const notify = createNotifier(
    t("common.notification.update.success"),
    t("common.notification.update.error"),
    invalidate,
  );

  return (
    <AccessSectionView
      title={tAccess("apps.title")}
      items={items}
      permissions={appPermissions}
      defaultPermission="use"
      translatePermission={(permission) => t(`app.permission.${permission as AppPermission}`)}
      canManage={canManage}
      isMutating={grant.isPending || revoke.isPending}
      addOptions={addOptions}
      onGrant={(resourceId, permission) =>
        grant.mutate({ userId, appId: resourceId, permission: permission as AppPermission }, notify)
      }
      onRevoke={(resourceId) => revoke.mutate({ userId, appId: resourceId }, notify)}
    />
  );
};

const BoardsSection = ({ userId, items, canManage, invalidate }: SectionProps) => {
  const t = useI18n();
  const tAccess = useScopedI18n("management.page.user.setting.access");
  const grant = clientApi.user.grantBoardToUser.useMutation();
  const revoke = clientApi.user.revokeBoardFromUser.useMutation();
  const { data: allBoards } = clientApi.board.getAllBoards.useQuery(undefined, { enabled: canManage });

  const directIds = items.filter((item) => item.source === "direct").map((item) => item.id);
  const addOptions = (allBoards ?? [])
    .filter((board) => !directIds.includes(board.id))
    .map((board) => ({ value: board.id, label: board.name }));

  const notify = createNotifier(
    t("common.notification.update.success"),
    t("common.notification.update.error"),
    invalidate,
  );

  return (
    <AccessSectionView
      title={tAccess("boards.title")}
      items={items}
      permissions={boardPermissions}
      defaultPermission="view"
      translatePermission={(permission) =>
        t(`board.setting.section.access.permission.item.${permission as BoardPermission}.label`)
      }
      canManage={canManage}
      isMutating={grant.isPending || revoke.isPending}
      addOptions={addOptions}
      onGrant={(resourceId, permission) =>
        grant.mutate({ userId, boardId: resourceId, permission: permission as BoardPermission }, notify)
      }
      onRevoke={(resourceId) => revoke.mutate({ userId, boardId: resourceId }, notify)}
    />
  );
};

const IntegrationsSection = ({ userId, items, canManage, invalidate }: SectionProps) => {
  const t = useI18n();
  const tAccess = useScopedI18n("management.page.user.setting.access");
  const grant = clientApi.user.grantIntegrationToUser.useMutation();
  const revoke = clientApi.user.revokeIntegrationFromUser.useMutation();
  const { data: allIntegrations } = clientApi.integration.all.useQuery(undefined, { enabled: canManage });

  const directIds = items.filter((item) => item.source === "direct").map((item) => item.id);
  const addOptions = (allIntegrations ?? [])
    .filter((integration) => !directIds.includes(integration.id))
    .map((integration) => ({ value: integration.id, label: integration.name }));

  const notify = createNotifier(
    t("common.notification.update.success"),
    t("common.notification.update.error"),
    invalidate,
  );

  return (
    <AccessSectionView
      title={tAccess("integrations.title")}
      items={items}
      permissions={integrationPermissions}
      defaultPermission="use"
      translatePermission={(permission) => t(`integration.permission.${permission as IntegrationPermission}`)}
      canManage={canManage}
      isMutating={grant.isPending || revoke.isPending}
      addOptions={addOptions}
      onGrant={(resourceId, permission) =>
        grant.mutate(
          { userId, integrationId: resourceId, permission: permission as IntegrationPermission },
          notify,
        )
      }
      onRevoke={(resourceId) => revoke.mutate({ userId, integrationId: resourceId }, notify)}
    />
  );
};

// Shared success/error handling for every grant/revoke mutation in this view.
// Messages are resolved by the caller so the (very large) i18n function type is
// not threaded through here.
const createNotifier = (successMessage: string, errorMessage: string, invalidate: () => Promise<void>) => ({
  onSuccess: () => {
    showSuccessNotification({ message: successMessage });
    void invalidate();
  },
  onError: () => {
    showErrorNotification({ message: errorMessage });
  },
});

interface AccessSectionViewProps {
  title: string;
  items: AccessItem[];
  permissions: readonly string[];
  defaultPermission: string;
  translatePermission: (permission: string) => string;
  canManage: boolean;
  isMutating: boolean;
  addOptions: { value: string; label: string }[];
  onGrant: (resourceId: string, permission: string) => void;
  onRevoke: (resourceId: string) => void;
}

const AccessSectionView = ({
  title,
  items,
  permissions,
  defaultPermission,
  translatePermission,
  canManage,
  isMutating,
  addOptions,
  onGrant,
  onRevoke,
}: AccessSectionViewProps) => {
  const t = useI18n();
  const tAccess = useScopedI18n("management.page.user.setting.access");
  const [selectedResource, setSelectedResource] = useState<string | null>(null);
  const [selectedPermission, setSelectedPermission] = useState<string>(defaultPermission);

  const permissionData = permissions.map((permission) => ({
    value: permission,
    label: translatePermission(permission),
  }));

  const handleAdd = () => {
    if (!selectedResource) return;
    onGrant(selectedResource, selectedPermission);
    setSelectedResource(null);
    setSelectedPermission(defaultPermission);
  };

  return (
    <Stack gap="sm">
      <Title order={2}>{title}</Title>

      {items.length === 0 ? (
        <Text c="gray.6">{tAccess("empty")}</Text>
      ) : (
        <Table striped highlightOnHover>
          <TableThead>
            <TableTr>
              <TableTh>{tAccess("column.resource")}</TableTh>
              <TableTh>{tAccess("column.permission")}</TableTh>
              <TableTh w={100} />
            </TableTr>
          </TableThead>
          <TableTbody>
            {items.map((item) => (
              <TableTr key={item.id}>
                <TableTd>
                  <Group gap="xs" wrap="nowrap">
                    <Text size="sm">{item.name}</Text>
                    {item.source === "group" && (
                      <Badge size="sm" variant="light" color="gray">
                        {tAccess("viaGroup")}
                      </Badge>
                    )}
                  </Group>
                </TableTd>
                <TableTd>
                  {item.source === "direct" && canManage ? (
                    <Select
                      size="xs"
                      w={220}
                      data={permissionData}
                      value={item.permission}
                      allowDeselect={false}
                      disabled={isMutating}
                      onChange={(value) => value && onGrant(item.id, value)}
                    />
                  ) : (
                    <Text size="sm">{translatePermission(item.permission)}</Text>
                  )}
                </TableTd>
                <TableTd>
                  {item.source === "direct" && canManage && (
                    <Button
                      variant="subtle"
                      color="red.9"
                      size="compact-sm"
                      loading={isMutating}
                      onClick={() => onRevoke(item.id)}
                    >
                      {t("common.action.remove")}
                    </Button>
                  )}
                </TableTd>
              </TableTr>
            ))}
          </TableTbody>
        </Table>
      )}

      {canManage && (
        <Group align="end" gap="sm" wrap="nowrap">
          <Select
            size="xs"
            style={{ flex: 1 }}
            searchable
            clearable
            data={addOptions}
            value={selectedResource}
            onChange={setSelectedResource}
            placeholder={tAccess("add.resourcePlaceholder")}
            nothingFoundMessage={tAccess("add.nothingFound")}
          />
          <Select
            size="xs"
            w={220}
            data={permissionData}
            value={selectedPermission}
            allowDeselect={false}
            onChange={(value) => value && setSelectedPermission(value)}
          />
          <Button
            size="xs"
            variant="light"
            leftSection={<IconPlus size="1rem" />}
            disabled={!selectedResource}
            loading={isMutating}
            onClick={handleAdd}
          >
            {t("common.action.add")}
          </Button>
        </Group>
      )}
    </Stack>
  );
};
