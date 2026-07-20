import React from "react";
import clsx from "clsx";
import { useWidgetStatus } from "@linkwarden/router/board";

type Props = {
  boardId: number;
  itemId: number;
  widgetType: string;
  refreshSeconds: number;
  onDelete?: () => void;
  editable?: boolean;
};

// Renders one widget item as a compact Cobalt card and polls its live status at
// the widget type's refresh cadence.
export default function WidgetTile({
  boardId,
  itemId,
  widgetType,
  refreshSeconds,
  onDelete,
  editable,
}: Props) {
  const { data, isLoading, isError, error } = useWidgetStatus(
    boardId,
    itemId,
    refreshSeconds
  );

  const status = data as
    | {
        ok: boolean;
        title?: string;
        summary?: string;
        metrics?: { label: string; value: string | number; unit?: string }[];
        items?: {
          title: string;
          subtitle?: string;
          progress?: number;
          badge?: string;
        }[];
        error?: string;
        fetchedAt?: string;
      }
    | undefined;

  const healthy = status?.ok;

  return (
    <div className="flex flex-col gap-2.5 rounded-2xl border border-base-content/10 bg-base-200 p-4 shadow-sm transition-colors hover:border-base-content/20">
      <div className="flex items-center justify-between gap-2 border-b border-base-content/10 pb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={clsx(
              "inline-block h-2.5 w-2.5 rounded-full shrink-0",
              isLoading
                ? "bg-base-content/30 animate-pulse"
                : healthy
                  ? "bg-success ring-2 ring-success/30"
                  : "bg-error ring-2 ring-error/30"
            )}
            title={healthy ? "OK" : "Problem"}
          />
          <p className="font-semibold text-base-content truncate">
            {status?.title || widgetType}
          </p>
        </div>
        {editable && onDelete && (
          <button
            onClick={onDelete}
            className="btn btn-ghost btn-xs"
            aria-label="Remove widget"
          >
            <i className="bi-x-lg" />
          </button>
        )}
      </div>

      {isError && (
        <p className="text-xs text-error">
          {(error as Error)?.message || "Failed to load"}
        </p>
      )}

      {status && !status.ok && status.error && (
        <p className="text-xs text-error truncate">{status.error}</p>
      )}

      {status?.summary && (
        <p className="text-sm text-base-content/70">{status.summary}</p>
      )}

      {status?.metrics && status.metrics.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {status.metrics.map((m, i) => (
            <div
              key={i}
              className="flex flex-col rounded-lg bg-base-300/60 px-3 py-1.5 min-w-[64px]"
            >
              <span className="text-lg font-bold tabular-nums leading-tight">
                {m.value}
                {m.unit ? (
                  <span className="text-xs font-normal text-base-content/50 ml-0.5">
                    {m.unit}
                  </span>
                ) : null}
              </span>
              <span className="text-[10px] font-medium uppercase tracking-wider text-base-content/50">
                {m.label}
              </span>
            </div>
          ))}
        </div>
      )}

      {status?.items && status.items.length > 0 && (
        <ul className="flex flex-col gap-1.5 mt-1">
          {status.items.slice(0, 6).map((it, i) => (
            <li key={i} className="flex flex-col gap-0.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-base-content/85 truncate">
                  {it.title}
                </span>
                {it.badge && (
                  <span className="badge badge-sm badge-ghost shrink-0">
                    {it.badge}
                  </span>
                )}
              </div>
              {typeof it.progress === "number" && (
                <progress
                  className="progress progress-primary h-1"
                  value={it.progress}
                  max={100}
                />
              )}
              {it.subtitle && (
                <span className="text-[11px] text-base-content/50 truncate">
                  {it.subtitle}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
