import { Anchor, Card, Stack, Text } from "@mantine/core";

import type { TablerIcon } from "@homarr/ui";

interface NoResultsProps {
  icon: TablerIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    href: string;
    hidden?: boolean;
  };
}

export const NoResults = ({ icon: Icon, title, description, action }: NoResultsProps) => {
  return (
    <Card bg="transparent" withBorder={false}>
      <Stack align="center" gap="sm">
        <Icon size="2rem" />
        <Text fw={500} size="lg">
          {title}
        </Text>
        {description && (
          <Text size="sm" c="dimmed" ta="center">
            {description}
          </Text>
        )}
        {action && !action.hidden && <Anchor href={action.href}>{action.label}</Anchor>}
      </Stack>
    </Card>
  );
};
