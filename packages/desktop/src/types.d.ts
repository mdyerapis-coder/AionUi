declare module 'diff';

declare module 'cookie' {
  export type CookieParseOptions = {
    decode?: (value: string) => string;
  };

  export function parse(cookieHeader: string, options?: CookieParseOptions): Record<string, string>;
}
