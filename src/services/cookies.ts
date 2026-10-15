const attributes =
  /^(?:path|domain|expires|max-age|samesite|secure|httponly|priority|partitioned)$/i;

export function normalizeCookieHeader(value: string): string {
  return value
    .split(";")
    .map((p) => p.trim())
    .filter((p) => {
      const equal = p.indexOf("=");
      return equal > 0 && !attributes.test(p.slice(0, equal));
    })
    .join("; ");
}

// Set-Cookie contains response attributes and may contain Expires commas.
// Only name=value pairs belong in the next request's Cookie header.
export function mergeResponseCookies(
  current: string,
  incoming: string | string[],
): string {
  const jar = new Map<string, string>();
  for (const pair of normalizeCookieHeader(current).split("; ")) {
    const equal = pair.indexOf("=");
    if (equal > 0) jar.set(pair.slice(0, equal), pair.slice(equal + 1));
  }
  for (const header of Array.isArray(incoming) ? incoming : [incoming]) {
    for (const cookie of header.split(/,(?=\s*[^\s;,=]+\s*=)/)) {
      const [pair, ...attrs] = cookie.split(";");
      const equal = pair.indexOf("=");
      if (equal < 1) continue;
      const name = pair.slice(0, equal).trim();
      const value = pair.slice(equal + 1).trim();
      const maxAge = attrs.find((a) => /^\s*max-age\s*=/i.test(a));
      const expires = attrs.find((a) => /^\s*expires\s*=/i.test(a));
      const expired = maxAge
        ? Number(maxAge.split("=")[1]) <= 0
        : expires
          ? Date.parse(expires.slice(expires.indexOf("=") + 1)) <= Date.now()
          : false;
      if (expired || !value) jar.delete(name);
      else jar.set(name, value);
    }
  }
  return Array.from(jar, ([name, value]) => `${name}=${value}`).join("; ");
}
