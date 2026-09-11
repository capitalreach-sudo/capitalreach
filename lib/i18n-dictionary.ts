import type { Locale } from "./locale";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Dictionary = Record<string, any>;

/**
 * The single place a locale JSON is read, on the server and on the client.
 *
 * It has to stay a template-literal `import()`. That is what makes webpack emit
 * one lazy chunk per locale rather than folding all fifteen into whichever
 * bundle imports this. The shape to never go back to is a static
 * `import en from "../messages/en.json"` inside a client module: en.json is
 * 247 KB, and a static import of it from a module that every page's client
 * tree touches puts all 247 KB in the first-load JS of every route -- including
 * the routes whose entire body is server-rendered.
 */
export async function loadDictionary(locale: Locale): Promise<Dictionary> {
  try {
    return (await import(`../messages/${locale}.json`)).default as Dictionary;
  } catch {
    return (await import("../messages/en.json")).default as Dictionary;
  }
}
