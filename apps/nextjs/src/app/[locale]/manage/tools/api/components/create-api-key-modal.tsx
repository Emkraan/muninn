"use client";

import { useMemo } from "react";
import { MultiSelect, NumberInput, Stack, Switch, Text, TextInput } from "@mantine/core";
import { z } from "zod/v4";

import { clientApi } from "@homarr/api/client";
import { revalidatePathActionAsync } from "@homarr/common/client";
import type { GroupPermissionKey } from "@homarr/definitions";
import { groupPermissionKeys } from "@homarr/definitions";
import { useZodForm } from "@homarr/form";
import { createModal, ModalFormFooter, useModalAction } from "@homarr/modals";
import { showErrorNotification } from "@homarr/notifications";
import { useScopedI18n } from "@homarr/translation/client";
import { defaultApiKeyScopes } from "@homarr/validation/api-key";

import { CopyApiKeyModal } from "./copy-api-key-modal";

const formSchema = z.object({
  name: z.string().trim().min(1),
  scopes: z.array(z.string()).min(1),
  neverExpires: z.boolean(),
  expiresInDays: z.number().int().positive().max(3650),
});

export const CreateApiKeyModal = createModal(({ actions }) => {
  const t = useScopedI18n("management.page.tool.api.tab.apiKey");
  const { openModal: openCopyModal } = useModalAction(CopyApiKeyModal);

  const form = useZodForm(formSchema, {
    initialValues: {
      name: "",
      scopes: [...defaultApiKeyScopes],
      neverExpires: true,
      expiresInDays: 90,
    },
  });

  const scopeOptions = useMemo(
    () => groupPermissionKeys.map((permission) => ({ value: permission, label: permission })),
    [],
  );

  const { mutate, isPending } = clientApi.apiKeys.create.useMutation({
    async onSuccess(data) {
      actions.closeModal();
      await revalidatePathActionAsync("/manage/tools/api");
      openCopyModal({ apiKey: data.apiKey });
    },
    onError(error) {
      showErrorNotification({
        title: t("create.error.title"),
        message: error.message,
      });
    },
  });

  const handleSubmit = (values: z.infer<typeof formSchema>) => {
    mutate({
      name: values.name,
      // Values originate from groupPermissionKeys, so the cast is safe.
      scopes: values.scopes as GroupPermissionKey[],
      expiresInDays: values.neverExpires ? null : values.expiresInDays,
    });
  };

  return (
    <form onSubmit={form.onSubmit(handleSubmit)}>
      <Stack gap="md">
        <TextInput
          label={t("create.field.name.label")}
          placeholder={t("create.field.name.placeholder")}
          data-autofocus
          {...form.getInputProps("name")}
        />
        <MultiSelect
          label={t("create.field.scopes.label")}
          description={t("create.field.scopes.description")}
          data={scopeOptions}
          searchable
          clearable
          {...form.getInputProps("scopes")}
        />
        <Stack gap="xs">
          <Switch
            label={t("create.field.expiration.never")}
            {...form.getInputProps("neverExpires", { type: "checkbox" })}
          />
          {!form.values.neverExpires && (
            <NumberInput
              label={t("create.field.expiration.label")}
              min={1}
              max={3650}
              {...form.getInputProps("expiresInDays")}
            />
          )}
        </Stack>
        <Text size="xs" c="dimmed">
          {t("create.hint")}
        </Text>
        <ModalFormFooter onCancel={actions.closeModal} loading={isPending} submitLabel={t("create.submit")} />
      </Stack>
    </form>
  );
}).withOptions({
  defaultTitle(t) {
    return t("management.page.tool.api.tab.apiKey.create.title");
  },
});
