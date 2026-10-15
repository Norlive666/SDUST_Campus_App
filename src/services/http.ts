import {
  Capacitor,
  CapacitorHttp,
  CapacitorCookies,
  HttpResponse,
} from "@capacitor/core";

import { mergeResponseCookies, normalizeCookieHeader } from "./cookies";

export const SDUST_BASE_URL = "https://jwglxt.sdust.edu.cn/jsxsd/";
export const WEB_PROXY_BASE_URL = "/api/jsxsd/";

class HttpService {
  private cookieStr = "";

  private getBaseUrl(): string {
    if (Capacitor.isNativePlatform()) {
      return SDUST_BASE_URL;
    }
    // Web 浏览器开发环境走 Vite 代理，避免跨域
    return WEB_PROXY_BASE_URL;
  }

  public setCookie(cookie: string) {
    this.cookieStr = cookie;
    try {
      localStorage.setItem("sdust_cookie", cookie);
    } catch (_) {}
  }

  public getCookie(): string {
    if (!this.cookieStr) {
      try {
        this.cookieStr = localStorage.getItem("sdust_cookie") || "";
      } catch (_) {}
    }
    this.cookieStr = normalizeCookieHeader(this.cookieStr);
    return this.cookieStr;
  }

  public async clearCookie() {
    this.cookieStr = "";
    try {
      localStorage.removeItem("sdust_cookie");
    } catch (_) {}
    if (Capacitor.isNativePlatform()) {
      await CapacitorCookies.clearCookies({ url: SDUST_BASE_URL });
    }
  }

  public async request<T = string>(options: {
    url: string; // 相对路径如 "xk/LoginToXk" 或绝对路径
    method?: "GET" | "POST";
    params?: Record<string, any>;
    data?: Record<string, any> | string;
    headers?: Record<string, string>;
    responseType?: "text" | "arraybuffer" | "blob" | "json";
  }): Promise<{
    status: number;
    data: T;
    headers: Record<string, string>;
    url?: string;
  }> {
    const method = options.method || "GET";
    const relativeUrl = options.url.startsWith("/")
      ? options.url.slice(1)
      : options.url;
    const fullUrl = options.url.startsWith("http")
      ? options.url
      : `${this.getBaseUrl()}${relativeUrl}`;

    const headers: Record<string, string> = {
      "User-Agent":
        "Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
      ...(options.headers || {}),
    };

    const cookie = this.getCookie();
    if (
      Capacitor.isNativePlatform() &&
      cookie &&
      !headers["Cookie"] &&
      !headers["cookie"]
    ) {
      headers["Cookie"] = cookie;
    }

    if (Capacitor.isNativePlatform()) {
      // Android 原生环境：使用 CapacitorHttp 调用原生网络栈，完全无 CORS 限制
      if (
        options.data &&
        typeof options.data === "object" &&
        !(options.data instanceof FormData)
      ) {
        headers["Content-Type"] = "application/x-www-form-urlencoded";
      }

      const nativeRes: HttpResponse = await CapacitorHttp.request({
        url: fullUrl,
        method: method,
        connectTimeout: 15000,
        readTimeout: 20000,
        params: options.params,
        data: options.data,
        headers: headers,
        responseType:
          options.responseType === "arraybuffer" ? "arraybuffer" : "text",
      });

      // 提取 Set-Cookie
      const setCookieHeader =
        nativeRes.headers["Set-Cookie"] ||
        nativeRes.headers["set-cookie"] ||
        nativeRes.headers["SET-COOKIE"];
      if (setCookieHeader) {
        this.setCookie(mergeResponseCookies(this.getCookie(), setCookieHeader));
      }

      return {
        url: nativeRes.url,
        status: nativeRes.status,
        data: nativeRes.data as T,
        headers: nativeRes.headers,
      };
    } else {
      delete headers["User-Agent"];
      delete headers["Cookie"];
      delete headers["cookie"];
      // 浏览器 Web 调试环境
      let requestUrl = fullUrl;
      if (options.params) {
        const query = new URLSearchParams(options.params).toString();
        requestUrl += (requestUrl.includes("?") ? "&" : "?") + query;
      }

      let body: any = undefined;
      if (options.data) {
        if (typeof options.data === "object") {
          headers["Content-Type"] = "application/x-www-form-urlencoded";
          body = new URLSearchParams(options.data as any).toString();
        } else {
          body = options.data;
        }
      }

      const res = await fetch(requestUrl, {
        method,
        headers,
        body,
        credentials: "include",
      });

      let resData: any;
      if (options.responseType === "arraybuffer") {
        resData = await res.arrayBuffer();
      } else if (options.responseType === "json") {
        resData = await res.json();
      } else {
        resData = await res.text();
      }

      const resHeaders: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        resHeaders[k] = v;
      });

      return {
        url: res.url,
        status: res.status,
        data: resData as T,
        headers: resHeaders,
      };
    }
  }
}

export const http = new HttpService();
