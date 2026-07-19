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
    <div className="flex flex-col gap-2 rounded-xl border border-neutral-content bg-base-200 p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={clsx(
              "inline-block h-2.5 w-2.5 rounded-full shrink-0",
              isLoading
                ? "bg-neutral-content animate-pulse"
                : healthy
                  ? "bg-success"
                  : "bg-error"
            )}
            title={healthy ? "OK" : "Problem"}
          />
          <p className="font-semibold truncate">
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
        <p className="text-sm text-neutral">{status.summary}</p>
      )}

      {status?.metrics && status.metrics.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {status.metrics.map((m, i) => (
            <div key={i} className="flex flex-col">
              <span className="text-lg font-bold tabular-nums leading-tight">
                {m.value}
                {m.unit ? (
                  <span className="text-xs font-normal text-neutral ml-0.5">
                    {m.unit}
                  </span>
                ) : null}
              </span>
              <span className="text-[11px] uppercase tracking-wide text-neutral">
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
                <span className="text-xs truncate">{it.title}</span>
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
                <span className="text-[11px] text-neutral truncate">
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
