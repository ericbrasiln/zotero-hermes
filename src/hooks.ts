import { registerCollectionAuditMenu } from "./modules/audit";
import { registerPrefsScripts } from "./modules/preferenceScript";
import { getString, initLocale } from "./utils/locale";
import { createZToolkit } from "./utils/ztoolkit";

async function onStartup() {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);
  initLocale();
  registerPreferencePane();
  await Promise.all(
    Zotero.getMainWindows().map((win) => onMainWindowLoad(win)),
  );
  addon.data.initialized = true;
}

async function onMainWindowLoad(win: _ZoteroTypes.MainWindow): Promise<void> {
  addon.data.ztoolkit = createZToolkit();
  win.MozXULElement.insertFTLIfNeeded(
    `${addon.data.config.addonRef}-mainWindow.ftl`,
  );
  registerCollectionAuditMenu();
}

async function onMainWindowUnload(_win: Window): Promise<void> {
  ztoolkit.unregisterAll();
}

function onShutdown(): void {
  ztoolkit.unregisterAll();
  addon.data.alive = false;
  // @ts-expect-error - Plugin instance is not typed
  delete Zotero[addon.data.config.addonInstance];
}

function registerPreferencePane(): void {
  Zotero.PreferencePanes.register({
    pluginID: addon.data.config.addonID,
    src: `${rootURI}content/preferences.xhtml`,
    label: getString("prefs-title"),
    image: `chrome://${addon.data.config.addonRef}/content/icons/favicon.png`,
  });
}

function onPrefsEvent(type: string, data: { window: Window }): void {
  if (type === "load") registerPrefsScripts(data.window);
}

export default {
  onStartup,
  onShutdown,
  onMainWindowLoad,
  onMainWindowUnload,
  onPrefsEvent,
};
