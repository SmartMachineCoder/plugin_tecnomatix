import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';
import { oiPluginBootstrapper } from '@mindsphere/oi-plugin-sdk';

// Bootstrap the OI Plugin SDK — must happen before Angular bootstraps
oiPluginBootstrapper.boot({
  enableDateTimeRangePicker: true,
  appInfoI18n: {
    en: {
      displayName: 'Plugin_Tecnomatix',
      appVersion: '1.0.0',
      appCopyright: 'Siemens AG'
    }
  }
});

// Session keep-alive: prevents IH session timeout by pinging the asset API every minute
setInterval(() => {
  fetch('/api/assetmanagement/v3/assets?size=1').catch(() => {
    // Intentionally silent — this is a background keep-alive ping
  });
}, 60000);

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));
