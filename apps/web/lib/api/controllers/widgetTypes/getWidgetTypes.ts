import { getAllWidgetTypeDescriptors } from "@/lib/widgets";

// Any authenticated user can discover the pluggable widget types + their config
// JSON Schema, so a client can build a widget without reading source.
export default async function getWidgetTypes() {
  const types = await getAllWidgetTypeDescriptors();
  return { response: types, status: 200 };
}
