import { notFound } from "next/navigation";
import { Center } from "@mantine/core";

import { api } from "@homarr/api/server";
import { env } from "@homarr/common/env";
import type { WidgetKind } from "@homarr/definitions";
import { widgetImports } from "@homarr/widgets";

import { WidgetPreviewPageContent } from "./_content";

interface Props {
  params: Promise<{ kind: string }>;
}

export default async function WidgetPreview(props: Props) {
  const { kind } = await props.params;

  // Development-only scratch page. The previous guard read
  // `!(kind in widgetImports || NODE_ENV !== "development")`, and because `||`
  // is satisfied by the second operand in production, notFound() never fired
  // for any kind at all.
  if (env.NODE_ENV !== "development" || !(kind in widgetImports)) {
    notFound();
  }

  // Scoped router call rather than a raw findMany: this used to hand the whole
  // integrations table, urls included, to an unauthenticated caller.
  const integrationData = await api.integration.all();

  return (
    <Center h="100vh">
      <WidgetPreviewPageContent kind={kind as WidgetKind} integrationData={integrationData} />
    </Center>
  );
}
