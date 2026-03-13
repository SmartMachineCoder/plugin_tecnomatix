import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';
import { oiPluginBootstrapper } from '@mindsphere/oi-plugin-sdk';

// Per the SDK README: boot() does not need to be awaited.
// The SDK retains all output until the host connection is ready.
// Fire-and-forget allows Angular to bootstrap immediately.
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

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));
