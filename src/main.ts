import { bootstrapApplication } from '@angular/platform-browser';
import { NgZone } from '@angular/core';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';
import { oiPluginBootstrapper } from '@mindsphere/oi-plugin-sdk';

(async () => {
  // Boot the SDK *before* zone.js patches window.addEventListener.
  // Running outside NgZone ensures SWAC's postMessage listener is registered
  // on the native (unpatched) event system — zone.js patching is the most
  // common cause of the SWAC handshake timing out in Angular apps.
  const zone = new NgZone({ enableLongStackTrace: false });
  await zone.runOutsideAngular(async () => {
    try {
      await oiPluginBootstrapper.boot({
        enableDateTimeRangePicker: true,
        appInfoI18n: {
          en: {
            displayName: 'Plugin_Tecnomatix',
            appVersion: '1.0.0',
            appCopyright: 'Siemens AG'
          }
        }
      });
    } catch (err) {
      console.warn('IH Monitor host not available (standalone mode):', err);
    }
  });

  // Session keep-alive: prevents IH session timeout by pinging the asset API every minute
  // Uses window.location.origin so the request goes to the IH proxy domain when inside Monitor
  setInterval(() => {
    fetch(`${window.location.origin}/api/assetmanagement/v3/assets?size=1`, { credentials: 'include' }).catch(() => {
      // Intentionally silent — this is a background keep-alive ping
    });
  }, 60000);

  bootstrapApplication(AppComponent, appConfig)
    .catch((err) => console.error(err));
})();
