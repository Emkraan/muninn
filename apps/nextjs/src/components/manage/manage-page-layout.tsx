import type { ReactNode } from "react";
import type { MantineSize } from "@mantine/core";
import { Group, Stack, Title } from "@mantine/core";

import { DynamicBreadcrumb } from "~/components/navigation/dynamic-breadcrumb";
import { ManageContainer } from "./manage-container";
import { MANAGE_FLOATING_ACTION_BOTTOM_OFFSET } from "./manage-page.constants";

interface ManagePageLayoutProps {
  title?: ReactNode;
  primaryAction?: ReactNode;
  toolbar?: ReactNode;
  footer?: ReactNode;
  floatingPrimaryAction?: boolean;
  size?: MantineSize;
  fluid?: boolean;
  /**
   * Overrides the default breadcrumb. Pass a preconfigured `<DynamicBreadcrumb />`
   * when the route contains dynamic segments that need mappings.
   */
  breadcrumb?: ReactNode;
  children: ReactNode;
}

export const ManagePageLayout = ({
  title,
  primaryAction,
  toolbar,
  footer,
  floatingPrimaryAction,
  size,
  fluid,
  breadcrumb,
  children,
}: ManagePageLayoutProps) => {
  const titleNode = typeof title === "string" ? <Title>{title}</Title> : title;
  const hasHeader = Boolean(titleNode) || Boolean(primaryAction);

  return (
    <ManageContainer size={size} fluid={fluid}>
      {breadcrumb ?? <DynamicBreadcrumb />}
      <Stack pb={floatingPrimaryAction ? { base: MANAGE_FLOATING_ACTION_BOTTOM_OFFSET, md: 0 } : undefined}>
        {hasHeader && (
          <Group justify="space-between" align="center">
            {titleNode}
            {primaryAction}
          </Group>
        )}
        {toolbar}
        {children}
        {footer && <Group justify="end">{footer}</Group>}
      </Stack>
    </ManageContainer>
  );
};
