import { config } from "../../package.json";
import { getPref, setPref } from "../utils/prefs";

export function registerPrefsScripts(window: Window): void {
  const doc = window.document;
  const mode = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-mode`,
  ) as XUL.MenuList | null;
  const url = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-url`,
  ) as HTMLInputElement | null;
  const token = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-token`,
  ) as HTMLInputElement | null;
  const timeout = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-timeout`,
  ) as HTMLInputElement | null;
  const health = doc.querySelector(
    `#zotero-prefpane-${config.addonRef}-health`,
  ) as XUL.Button | null;
  if (!mode || !url || !token || !timeout || !health) return;

  mode.value = getPref("hermes-mode");
  url.value = getPref("bridge-url");
  token.value = getPref("auth-token");
  timeout.value = String(getPref("request-timeout"));

  mode.addEventListener("command", () => setPref("hermes-mode", mode.value));
  url.addEventListener("change", () => setPref("bridge-url", url.value.trim()));
  token.addEventListener("change", () => setPref("auth-token", token.value));
  timeout.addEventListener("change", () => {
    const value = Math.max(1000, Number.parseInt(timeout.value, 10) || 30000);
    timeout.value = String(value);
    setPref("request-timeout", value);
  });
  health.addEventListener("command", () => void testBridge(window));
}

async function testBridge(window: Window): Promise<void> {
  const baseURL = getPref("bridge-url").replace(/\/$/, "");
  const token = getPref("auth-token");
  try {
    const response = await (Zotero as any).HTTP.request(
      "GET",
      `${baseURL}/health`,
      {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        responseType: "text",
      },
    );
    const body = JSON.parse(
      response.responseText ?? response.response ?? response,
    );
    window.alert(`Bridge disponível: ${body.service ?? "ok"}`);
  } catch (error) {
    window.alert(`Não foi possível conectar ao bridge: ${String(error)}`);
  }
}
