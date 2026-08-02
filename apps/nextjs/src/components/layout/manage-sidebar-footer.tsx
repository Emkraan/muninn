import type { JSX } from "react";
import { Anchor, Group, Image, Stack, Text } from "@mantine/core";
import { IconBrandGithub } from "@tabler/icons-react";

import { getPackageVersion } from "~/versions/package-reader";

export const ManageSidebarFooter = (): JSX.Element => {
  const version = getPackageVersion();
  return (
    <Group justify="space-between" align="center" wrap="nowrap" gap="xs">
      <Group gap="xs" align="center" wrap="nowrap" style={{ minWidth: 0, overflow: "hidden" }}>
        <Image src="/logo/logo.png" w={18} h={18} alt="" aria-hidden />
        <Stack gap={0} style={{ minWidth: 0 }}>
          <Text size="xs" c="dimmed" lh={1.2} truncate>
            v{version}
          </Text>
          <Text size="xs" c="dimmed" lh={1.2} truncate>
            Built by Emkraan
          </Text>
        </Stack>
      </Group>
      <Anchor
        href="https://github.com/Emkraan/muninn"
        target="_blank"
        rel="noopener noreferrer"
        c="dimmed"
        style={{ flexShrink: 0, lineHeight: 0 }}
        title="GitHub"
      >
        <IconBrandGithub size={16} />
      </Anchor>
    </Group>
  );
};
