type AnyCookie = any;

export async function saveCookiesToDatabase(ctx: any, cookies: AnyCookie[]) {
  const now = new Date();
  const simplifiedCookies = cookies.map((c) => ({
    name: c.name,
    value: c.value,
    domain: c.domain,
    updatedAt: now,
  }));

  await ctx.database.upsert("weibo_cookies", simplifiedCookies);
}

export async function loadCookiesFromDatabase(
  ctx: any,
): Promise<AnyCookie[] | null> {
  try {
    const cookies = await ctx.database.get("weibo_cookies", {});
    return cookies.length > 0 ? cookies : null;
  } catch {
    return null;
  }
}

export async function loadCookieStringFromDatabase(
  ctx: any,
): Promise<string | null> {
  try {
    const cookies = await loadCookiesFromDatabase(ctx);
    if (!cookies) return null;
    return buildCookieString(cookies);
  } catch {
    return null;
  }
}

export function buildCookieString(cookies: AnyCookie[]): string {
  const filtered = cookies.filter(
    (c) => c.domain.includes("weibo.com") || c.domain.includes("weibo.cn"),
  );
  return filtered.map((c) => `${c.name}=${c.value}`).join("; ");
}

export function getXsrfTokenFromCookies(
  cookies: AnyCookie[] | null | undefined,
): string | null {
  return cookies?.find((cookie) => cookie.name === "XSRF-TOKEN")?.value || null;
}

export function toPuppeteerCookies(cookies: AnyCookie[]) {
  return cookies
    .filter((cookie) => cookie.name && cookie.value && cookie.domain)
    .map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: "/",
    }));
}
