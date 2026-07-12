import type { DemoWebSearchStatusPart } from "../lib/demo-ui-message";

export function WebSearchToolStatus({ status }: { status: DemoWebSearchStatusPart }) {
  return (
    <div className={`web-search-status web-search-status-${status.status}`}>
      <span>{formatStatus(status)}</span>
      {status.query !== undefined ? <code>{status.query}</code> : null}
    </div>
  );
}

function formatStatus(status: DemoWebSearchStatusPart): string {
  if (status.message !== undefined) {
    return status.message;
  }

  switch (status.status) {
    case "searching":
      return "正在搜索 Web...";
    case "completed":
      return "已搜索 Web";
    case "empty":
      return "搜索完成，但未找到可靠来源";
    case "failed":
      return "Web Search 失败，本轮未提供联网来源";
  }
}
