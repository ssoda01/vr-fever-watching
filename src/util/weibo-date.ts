const WEIBO_DATE_REGEX =
  /(\w+) (\w+) (\d+) (\d+):(\d+):(\d+) ([+-]\d{4}) (\d{4})/;

const MONTH_MAP: Record<string, number> = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
};

/** 解析微博 created_at，如 Sun May 24 23:55:38 +0800 2026 */
export const parseWeiboDateString = (dateString: string): Date | null => {
  if (!dateString) return null;

  const match = dateString.match(WEIBO_DATE_REGEX);
  if (!match) return null;

  const [, , month, day, hour, minute, second, timezone, year] = match;
  const monthIndex = MONTH_MAP[month];
  if (monthIndex === undefined) return null;

  const date = new Date(
    Date.UTC(+year, monthIndex, +day, +hour, +minute, +second),
  );

  const timezoneOffsetHours = parseInt(timezone.slice(0, 3), 10);
  const timezoneOffsetMinutes = parseInt(
    timezone.slice(0, 1) + timezone.slice(3),
    10,
  );
  const timezoneOffset = timezoneOffsetHours * 60 + timezoneOffsetMinutes;
  date.setUTCMinutes(date.getUTCMinutes() - timezoneOffset);

  return date;
};

export const formatWeiboDate = (date: Date): string => {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const formatWeiboDateString = (dateString: string): string => {
  const date = parseWeiboDateString(dateString);
  return date ? formatWeiboDate(date) : dateString;
};
