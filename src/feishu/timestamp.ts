function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatFeishuTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return value;
  }
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function formatOptionalFeishuTimestamp(value?: string): string {
  if (!value) {
    return 'n/a';
  }
  return formatFeishuTimestamp(value);
}
