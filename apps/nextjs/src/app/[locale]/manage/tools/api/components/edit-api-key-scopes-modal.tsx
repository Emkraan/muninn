"use client";

import { useMemo } from "react";
import { MultiSelect, Stack, TextInput } from "@mantine/core";
import { z } from "zod/v4";

import { clientApi } from "@homarr/api/client";
import { revalidatePathActionAsync } from "@homarr/common/client";
import type { GroupPermissionKey } from "@homarr/definitions";
import { groupPermissionKeys } from "@homarr/definitions";
import { useZodForm } from "@homarr/form";
import { createModal, ModalFormFooter } from "@homarr/modals";
import { showErrorNotification, showSuccessNotification } from "@homarr/notifications";
import { useI18n, useScopedI18n } from "@homarr/translation/client";

import { scopeOption } from "./create-api-key-modal";

const formSchema = z.object({
  scopes: z.array(z.string()).min(1),
});

export const EditApiKeyScopesModal = createModal<{ id: string; name: string; scopes: string[] }>(
  ({ actions, innerProps }) => {
    const t = useScopedI18n("management.page.tool.api.tab.apiKey");
    const tRoot = useI18n();

    const form = useZodForm(formSchema, {
      initialValues: { scopes: innerProps.scopes },
    });

    const scopeOptions = useMemo(() => groupPermissionKeys.map((permission) => scopeOption(permission)), []);

    const { mutate, isPending } = clientApi.apiKeys.update.useMutation({
      async onSuccess() {
        actions.closeModal();
        showSuccessNotification({ message: tRoot("common.notification.update.success") });
        await revalidatePathActionAsync("/manage/tools/api");
      },
      onError(error) {
        showErrorNotification({ title: tRoot("common.notification.update.error"), message: error.message });
      },
    });

    const handleSubmit = (values: z.infer<typeof formSchema>) => {
      // Values originate from groupPermissionKeys, so the cast is safe.
      mutate({ id: innerProps.id, scopes: values.scopes as GroupPermissionKey[] });
    };

    return (
      <form onSubmit={form.onSubmit(handleSubmit)}>
        <Stack gap="md">
          <TextInput label={t("create.field.name.label")} value={innerProps.name} disabled readOnly />
          <MultiSelect
            label={t("create.field.scopes.label")}
            description={t("create.field.scopes.description")}
            data={scopeOptions}
            searchable
            clearable
            data-autofocus
            {...form.getInputProps("scopes")}
          />
          <ModalFormFooter onCancel={actions.closeModal} loading={isPending} submitLabel={tRoot("common.action.saveChanges")} />
        </Stack>
      </form>
    );
  },
).withOptions({
  defaultTitle(t) {
    return t("management.page.tool.api.tab.apiKey.editScopes.title");
  },
});
