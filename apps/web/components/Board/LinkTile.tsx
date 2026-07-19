import React from "react";

type LinkItem = {
  id: number;
  name?: string;
  url?: string;
  icon?: string | null;
  color?: string | null;
  collection?: { name?: string; color?: string } | null;
};

type Props = {
  link: LinkItem;
  onDelete?: () => void;
  editable?: boolean;
};

function faviconFor(url?: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return `https://icons.duckduckgo.com/ip3/${u.hostname}.ico`;
  } catch {
    return null;
  }
}

// A launcher tile for a link BoardItem. The underlying link's read permission
// is enforced server-side before it ever reaches this component.
export default function LinkTile({ link, onDelete, editable }: Props) {
  const favicon = faviconFor(link.url);
  const label = link.name || link.url || "Untitled";

  return (
    <div className="group relative">
      <a
        href={link.url || "#"}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-3 rounded-xl border border-neutral-content bg-base-200 p-3 shadow-sm transition-transform hover:-translate-y-0.5 hover:border-primary"
      >
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-base-300"
          style={link.color ? { color: link.color } : undefined}
        >
          {favicon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={favicon}
              alt=""
              width={20}
              height={20}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <i className={link.icon || "bi-link-45deg"} />
          )}
        </div>
        <div className="min-w-0">
          <p className="font-medium truncate">{label}</p>
          {link.collection?.name && (
            <p className="text-[11px] text-neutral truncate">
              {link.collection.name}
            </p>
          )}
        </div>
      </a>
      {editable && onDelete && (
        <button
          onClick={onDelete}
          className="btn btn-ghost btn-xs absolute right-1 top-1 opacity-0 group-hover:opacity-100"
          aria-label="Remove link"
        >
          <i className="bi-x-lg" />
        </button>
      )}
    </div>
  );
}
