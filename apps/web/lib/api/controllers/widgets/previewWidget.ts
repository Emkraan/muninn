import { fetchWidgetStatus, isWidgetTypeKnown } from "@/lib/widgets";
import {
  WidgetPreviewSchema,
  WidgetPreviewSchemaType,
} from "@linkwarden/lib/schemaValidation";

// Test a widget config before saving it to a board item (the board editor's
// "test connection" action). The caller supplies the config, so any
// authenticated user may preview with their own credentials.
export default async function previewWidget(body: WidgetPreviewSchemaType) {
  const dataValidation = WidgetPreviewSchema.safeParse(body);
  if (!dataValidation.success) {
    return {
      response: `Error: ${
        dataValidation.error.issues[0].message
      } [${dataValidation.error.issues[0].path.join(", ")}]`,
      status: 400,
    };
  }

  const { widgetType, widgetConfig } = dataValidation.data;

  if (!(await isWidgetTypeKnown(widgetType)))
    return { response: "Unknown widget type.", status: 400 };

  const status = await fetchWidgetStatus(widgetType, widgetConfig);
  return { response: status, status: 200 };
}
