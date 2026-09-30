export function relativeTime(unixSeconds: number | null): string {
  if (!unixSeconds) return "";
  const diffSec = Date.now() / 1000 - unixSeconds;
  const abs = Math.abs(diffSec);
  const suffix = diffSec >= 0 ? "前" : "后";
  if (abs < 60) return "刚刚";
  if (abs < 3600) return `${Math.floor(abs / 60)} 分钟${suffix}`;
  if (abs < 86400) return `${Math.floor(abs / 3600)} 小时${suffix}`;
  if (abs < 86400 * 30) return `${Math.floor(abs / 86400)} 天${suffix}`;
  if (abs < 86400 * 365) {
    return `${Math.floor(abs / (86400 * 30))} 个月${suffix}`;
  }
  return `${Math.floor(abs / (86400 * 365))} 年${suffix}`;
}

export function absoluteTime(unixSeconds: number | null): string {
  if (!unixSeconds) return "";
  return new Date(unixSeconds * 1000).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
