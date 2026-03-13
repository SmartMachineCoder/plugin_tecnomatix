import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';
import { oiPluginBootstrapper } from '@mindsphere/oi-plugin-sdk';

(async () => {
  // Must await boot() so the SDK handshake with the IH Monitor host completes
  // before Angular initializes — mirrors the reference demo pattern exactly.
  // The try/catch allows standalone mode (direct browser / local dev) when
  // there is no IH Monitor host to complete the SWAC handshake.
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
