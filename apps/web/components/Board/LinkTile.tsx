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
  const [imgFailed, setImgFailed] = React.useState(false);

  return (
    <div className="group/tile relative">
      <a
        href={link.url || "#"}
        target="_blank"
        rel="noreferrer"
        className="board-tile flex items-center gap-3.5 p-3.5"
      >
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-base-300 text-xl ring-1 ring-base-content/10"
          style={link.color ? { color: link.color } : undefined}
        >
          {favicon && !imgFailed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={favicon}
              alt=""
              width={28}
              height={28}
              className="rounded-md"
              onError={() => setImgFailed(true)}
            />
          ) : link.icon ? (
            <i className={link.icon} />
          ) : (
            <span className="font-semibold text-base-content/70">
              {label.charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-base-content truncate leading-tight">
            {label}
          </p>
          {link.collection?.name && (
            <p className="text-[11px] font-medium text-base-content/55 truncate">
              {link.collection.name}
            </p>
          )}
        </div>
      </a>
      {editable && onDelete && (
        <button
          onClick={onDelete}
          className="btn btn-ghost btn-xs absolute right-1.5 top-1.5 opacity-0 transition-opacity group-hover/tile:opacity-100"
          aria-label="Remove link"
        >
          <i className="bi-x-lg" />
        </button>
      )}
    </div>
  );
}
