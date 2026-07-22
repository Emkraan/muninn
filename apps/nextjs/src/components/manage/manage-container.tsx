import type { PropsWithChildren } from "react";
import type { MantineSize } from "@mantine/core";
import { Container } from "@mantine/core";

export const ManageContainer = ({
  children,
  size,
  fluid,
}: PropsWithChildren<{ size?: MantineSize; fluid?: boolean }>) => {
  return (
    <Container size={size} fluid={fluid} px={{ base: "0 !important", md: "var(--mantine-spacing-md) !important" }}>
      {children}
    </Container>
  );
};
