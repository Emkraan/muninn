"use client";

import { useState } from "react";
import { Alert, Badge, Button, Group, Stack, Text, Tooltip } from "@mantine/core";
import { IconAlertTriangle, IconCheck, IconRefresh, IconShieldCheck } from "@tabler/icons-react";
import type { MRT_ColumnDef } from "mantine-react-table";
import { MantineReactTable } from "mantine-react-table";

import type { RouterOutputs } from "@homarr/api";
import { clientApi } from "@homarr/api/client";
import { useScopedI18n } from "@homarr/translation/client";
import { useTranslatedMantineReactTable } from "@homarr/ui/hooks";

type AuditEntry = RouterOutputs["audit"]["list"]["entries"][number];

interface AuditTableProps {
  initialEntries: AuditEntry[];
}

export function AuditTable({ initialEntries }: AuditTableProps) {
  const t = useScopedI18n("management.page.tool.audit");
  const [verifyResult, setVerifyResult] = useState<{ ok: boolean; totalEntries: number; firstBrokenId: string | null } | null>(null);

  const { data: listData, refetch, isFetching } = clientApi.audit.list.useQuery(
    { limit: 100 },
    { initialData: { entries: initialEntries, nextCursor: null } },
  );

  const { mutate: runVerify, isPending: isVerifying } = clientApi.audit.verify.useMutation({
    onSuccess: (result) => setVerifyResult(result),
  });

  const entries = listData?.entries ?? initialEntries;

  const columns: MRT_ColumnDef<AuditEntry>[] = [
    {
      accessorKey: "id",
      header: t("columns.id"),
      size: 70,
      Cell: ({ cell }) => <Text size="xs" c="dimmed" ff="monospace">{cell.getValue<string>().slice(0, 8)}</Text>,
    },
    {
      accessorKey: "timestamp",
      header: t("columns.timestamp"),
      size: 180,
      Cell: ({ cell }) => (
        <Tooltip label={cell.getValue<string>()} withArrow>
          <Text size="sm">{new Date(cell.getValue<string>()).toLocaleString()}</Text>
        </Tooltip>
      ),
    },
    {
      accessorKey: "userEmail",
      header: t("columns.user"),
      size: 200,
    },
    {
      accessorKey: "action",
      header: t("columns.action"),
      size: 200,
      Cell: ({ cell }) => (
        <Badge variant="light" color="indigo" size="sm">
          {cell.getValue<string>()}
        </Badge>
      ),
    },
    {
      accessorKey: "targetId",
      header: t("columns.target"),
      size: 120,
      Cell: ({ cell }) => {
        const val = cell.getValue<string | null>();
        return val ? <Text size="xs" ff="monospace">{val}</Text> : <Text size="xs" c="dimmed">-</Text>;
      },
    },
    {
      accessorKey: "detail",
      header: t("columns.detail"),
      size: 200,
      Cell: ({ cell }) => {
        const val = cell.getValue<string | null>();
        if (!val) return <Text size="xs" c="dimmed">-</Text>;
        try {
          return <Text size="xs" ff="monospace">{JSON.stringify(JSON.parse(val), null, 0)}</Text>;
        } catch {
          return <Text size="xs" ff="monospace">{val}</Text>;
        }
      },
    },
    {
      accessorKey: "hash",
      header: t("columns.hash"),
      size: 100,
      Cell: ({ cell }) => (
        <Tooltip label={cell.getValue<string>()} withArrow>
          <Text size="xs" ff="monospace" c="dimmed">{cell.getValue<string>().slice(0, 8)}…</Text>
        </Tooltip>
      ),
    },
  ];

  const table = useTranslatedMantineReactTable({
    columns,
    data: entries,
    enableTopToolbar: false,
    enableBottomToolbar: true,
    initialState: { density: "xs" },
  });

  return (
    <Stack>
      <Group justify="space-between">
        <Group gap="sm">
          <Button
            leftSection={<IconRefresh size={16} />}
            variant="light"
            size="sm"
            onClick={() => void refetch()}
            loading={isFetching}
          >
            {t("actions.refresh")}
          </Button>
          <Button
            leftSection={<IconShieldCheck size={16} />}
            variant="light"
            color="indigo"
            size="sm"
            onClick={() => runVerify(undefined)}
            loading={isVerifying}
          >
            {t("actions.verify")}
          </Button>
        </Group>
        <Text size="sm" c="dimmed">
          {t("entryCount", { count: entries.length })}
        </Text>
      </Group>

      {verifyResult && (
        <Alert
          icon={verifyResult.ok ? <IconCheck size={16} /> : <IconAlertTriangle size={16} />}
          color={verifyResult.ok ? "green" : "red"}
          title={verifyResult.ok ? t("verify.ok.title") : t("verify.broken.title")}
          withCloseButton
          onClose={() => setVerifyResult(null)}
        >
          {verifyResult.ok
            ? t("verify.ok.message", { count: verifyResult.totalEntries })
            : t("verify.broken.message", { id: verifyResult.firstBrokenId ?? "" })}
        </Alert>
      )}

      <MantineReactTable table={table} />
    </Stack>
  );
}
