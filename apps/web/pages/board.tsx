import MainLayout from "@/layouts/MainLayout";
import React, { ReactElement, useMemo, useState } from "react";
import { useTranslation } from "next-i18next";
import getServerSideProps from "@/lib/client/getServerSideProps";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { toast } from "react-hot-toast";
import { NextPageWithLayout } from "./_app";
import {
  useBoards,
  useBoard,
  useCreateBoard,
  useCreateSection,
  useDeleteSection,
  useCreateItem,
  useDeleteItem,
  useWidgetTypes,
} from "@linkwarden/router/board";
import WidgetTile from "@/components/Board/WidgetTile";
import LinkTile from "@/components/Board/LinkTile";

type WidgetTypeDescriptor = {
  id: string;
  displayName: string;
  configSchema: {
    properties: Record<
      string,
      { type: string; title?: string; default?: unknown; "x-secret"?: boolean }
    >;
    required?: string[];
  };
  defaultRefreshIntervalSeconds: number;
};

const Board: NextPageWithLayout = () => {
  const { t } = useTranslation();
  const { data: boards, isLoading: boardsLoading } = useBoards();
  const [activeBoardId, setActiveBoardId] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);

  const boardList: any[] = boards || [];
  const selectedId =
    activeBoardId ??
    boardList.find((b) => b.isDefault)?.id ??
    boardList[0]?.id ??
    null;

  const { data: board } = useBoard(selectedId ?? undefined);
  const { data: widgetTypes } = useWidgetTypes();

  const createBoard = useCreateBoard();
  const createSection = useCreateSection(selectedId ?? 0);
  const deleteSection = useDeleteSection(selectedId ?? 0);
  const deleteItem = useDeleteItem(selectedId ?? 0);

  const refreshByType = useMemo(() => {
    const map = new Map<string, number>();
    (widgetTypes as WidgetTypeDescriptor[] | undefined)?.forEach((w) =>
      map.set(w.id, w.defaultRefreshIntervalSeconds)
    );
    return map;
  }, [widgetTypes]);

  const handleCreateBoard = async () => {
    try {
      await createBoard.mutateAsync({ name: "Home", isDefault: true });
      toast.success("Board created.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleAddSection = async () => {
    const name = window.prompt("Section name");
    if (!name) return;
    try {
      await createSection.mutateAsync({ name });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (boardsLoading) {
    return (
      <div className="p-6">
        <span className="loading loading-spinner loading-md" />
      </div>
    );
  }

  if (!selectedId) {
    return (
      <div className="p-6">
        <PageHeader icon="bi-grid-1x2" title={t("board")} description="" />
        <div className="mt-8 flex flex-col items-center gap-3 text-center">
          <p className="text-neutral">{"You don't have a board yet."}</p>
          <Button onClick={handleCreateBoard} disabled={createBoard.isPending}>
            <i className="bi-plus-lg mr-1" /> Create your first board
          </Button>
        </div>
      </div>
    );
  }

  const sections: any[] = (board as any)?.sections || [];

  return (
    <div className="p-6 flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <PageHeader
            icon="bi-grid-1x2"
            title={(board as any)?.name || t("board")}
            description=""
          />
          {boardList.length > 1 && (
            <select
              className="select select-sm select-bordered"
              value={selectedId}
              onChange={(e) => setActiveBoardId(Number(e.target.value))}
            >
              {boardList.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => setEditing((v) => !v)}>
            <i className={editing ? "bi-check2 mr-1" : "bi-pencil mr-1"} />
            {editing ? "Done" : "Edit"}
          </Button>
          {editing && (
            <Button onClick={handleAddSection}>
              <i className="bi-plus-lg mr-1" /> Add section
            </Button>
          )}
        </div>
      </div>

      {sections.length === 0 && (
        <p className="text-neutral">
          This board is empty.{" "}
          {editing ? "Add a section to get started." : "Enable Edit to add sections."}
        </p>
      )}

      <div className="flex flex-col gap-6">
        {sections.map((section: any) => (
          <div key={section.id} className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral">
                {section.name}
              </h2>
              {editing && (
                <div className="flex items-center gap-2">
                  <AddWidgetInline
                    boardId={selectedId}
                    sectionId={section.id}
                    widgetTypes={
                      (widgetTypes as WidgetTypeDescriptor[] | undefined) || []
                    }
                  />
                  <button
                    className="btn btn-ghost btn-xs text-error"
                    onClick={() => {
                      if (confirm(`Delete section "${section.name}"?`))
                        deleteSection.mutate(section.id);
                    }}
                  >
                    <i className="bi-trash" />
                  </button>
                </div>
              )}
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(min(240px,100%),1fr))] gap-3">
              {section.items.map((item: any) =>
                item.kind === "widget" ? (
                  <WidgetTile
                    key={item.id}
                    boardId={selectedId}
                    itemId={item.id}
                    widgetType={item.widgetType}
                    refreshSeconds={refreshByType.get(item.widgetType) ?? 30}
                    editable={editing}
                    onDelete={() => deleteItem.mutate(item.id)}
                  />
                ) : item.link ? (
                  <LinkTile
                    key={item.id}
                    link={item.link}
                    editable={editing}
                    onDelete={() => deleteItem.mutate(item.id)}
                  />
                ) : null
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Inline "add widget" affordance: pick a type, fill the schema-driven config,
// test it against the live preview endpoint, then save it as a board item.
function AddWidgetInline({
  boardId,
  sectionId,
  widgetTypes,
}: {
  boardId: number;
  sectionId: number;
  widgetTypes: WidgetTypeDescriptor[];
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("");
  const [config, setConfig] = useState<Record<string, string>>({});
  const [testResult, setTestResult] = useState<string | null>(null);
  const createItem = useCreateItem(boardId);

  const selected = widgetTypes.find((w) => w.id === type);

  const test = async () => {
    if (!type) return;
    try {
      const r = await fetch("/api/v1/widgets/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ widgetType: type, widgetConfig: coerce(config, selected) }),
      });
      const d = await r.json();
      setTestResult(
        d.response?.ok
          ? `OK: ${d.response.summary || "reachable"}`
          : `Error: ${d.response?.error || d.response}`
      );
    } catch (e) {
      setTestResult(`Error: ${(e as Error).message}`);
    }
  };

  const save = async () => {
    try {
      await createItem.mutateAsync({
        sectionId,
        kind: "widget",
        widgetType: type,
        widgetConfig: coerce(config, selected),
      } as any);
      setOpen(false);
      setType("");
      setConfig({});
      setTestResult(null);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (!open)
    return (
      <button className="btn btn-ghost btn-xs" onClick={() => setOpen(true)}>
        <i className="bi-plus-lg" /> Widget
      </button>
    );

  return (
    <div className="absolute right-6 z-20 mt-8 w-80 rounded-xl border border-neutral-content bg-base-100 p-3 shadow-lg">
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold text-sm">Add widget</span>
        <button className="btn btn-ghost btn-xs" onClick={() => setOpen(false)}>
          <i className="bi-x-lg" />
        </button>
      </div>
      <select
        className="select select-sm select-bordered w-full mb-2"
        value={type}
        onChange={(e) => {
          setType(e.target.value);
          setConfig({});
          setTestResult(null);
        }}
      >
        <option value="">Select a widget type</option>
        {widgetTypes.map((w) => (
          <option key={w.id} value={w.id}>
            {w.displayName}
          </option>
        ))}
      </select>
      {selected &&
        Object.entries(selected.configSchema.properties).map(([key, f]) => (
          <input
            key={key}
            className="input input-sm input-bordered w-full mb-2"
            type={f["x-secret"] ? "password" : f.type === "number" ? "number" : "text"}
            placeholder={f.title || key}
            value={config[key] ?? ""}
            onChange={(e) => setConfig({ ...config, [key]: e.target.value })}
          />
        ))}
      {testResult && (
        <p className="text-xs mb-2 text-neutral break-words">{testResult}</p>
      )}
      <div className="flex gap-2">
        <button
          className="btn btn-sm btn-ghost flex-1"
          onClick={test}
          disabled={!type}
        >
          Test
        </button>
        <button
          className="btn btn-sm btn-primary flex-1"
          onClick={save}
          disabled={!type || createItem.isPending}
        >
          Add
        </button>
      </div>
    </div>
  );
}

// Coerce number-typed fields from their string inputs before sending.
function coerce(
  config: Record<string, string>,
  selected?: WidgetTypeDescriptor
): Record<string, unknown> {
  if (!selected) return config;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(config)) {
    const f = selected.configSchema.properties[k];
    out[k] = f?.type === "number" && v !== "" ? Number(v) : v;
  }
  return out;
}

Board.getLayout = function getLayout(page: ReactElement) {
  return <MainLayout>{page}</MainLayout>;
};

export { getServerSideProps };

export default Board;
