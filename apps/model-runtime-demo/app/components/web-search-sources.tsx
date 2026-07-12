import type { DemoWorkflowWebSearchMetadata } from "../lib/web-search-result-metadata";

export function WebSearchSources({ metadata }: { metadata: DemoWorkflowWebSearchMetadata }) {
  if (metadata.sources.length === 0) {
    return null;
  }

  return (
    <div className="web-search-sources">
      <div className="web-search-sources-head">
        <span>Sources</span>
        <small>{metadata.provider}</small>
      </div>
      <div className="web-search-source-list">
        {metadata.sources.slice(0, 5).map((source) => {
          const url = toSafeUrl(source.url);

          if (url === null) {
            return null;
          }

          return (
            <a
              className="web-search-source"
              key={source.id}
              href={url.href}
              target="_blank"
              rel="noopener noreferrer"
            >
              {source.faviconUrl !== undefined ? (
                <img src={source.faviconUrl} alt="" width={16} height={16} />
              ) : null}
              <span>
                <strong>{source.title}</strong>
                <small>{url.hostname}</small>
                <em>{truncate(source.snippet, 180)}</em>
              </span>
            </a>
          );
        })}
      </div>
    </div>
  );
}

function toSafeUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1)}…`;
}
