# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # Install dependencies
npm start            # Dev server at http://localhost:4200 (alias: ng serve)
npm run build        # Development build
npm run build:prod   # Production build → dist/plugin-tecnomatix/browser/
npm run watch        # Watch mode build
```

**Middleware (Python, for Plant Simulation Classic):**
```bash
uv run middleware/server.py   # Start local middleware on port 5000
```
Or use the VS Code task "Start IH Middleware Server".

## Architecture

This is an **Angular 21 standalone plugin** that runs as an embedded tab inside **Siemens Insights Hub Monitor**. It reads asset/time-series data from Insights Hub and forwards it to Tecnomatix Plant Simulation.

### SDK Integration

The plugin bootstraps via `@mindsphere/oi-plugin-sdk` / `@insights-hub/ihm-plugin-sdk`. In `main.ts`, the SDK is initialized before Angular boots. The `oiProxy` object provides Observables that fire only when running inside IH Monitor:
- `oiProxy.assetId$` — currently selected asset
- `oiProxy.dateRange$` — Monitor date range picker (sole time source)
- `oiProxy.active$` — tab visibility (used to pause/resume live polling)

During local development these Observables never fire. Mock them in `main.ts` if needed.

### Data Flow

```
IH Asset Tree → Variable Selector → Selection Basket → Timeseries Chart
                                                      ↓
                                               Send Panel → MQTT / HTTP / Middleware
```

- `AssetService` + `IhApiService` fetch asset hierarchy and aspects via IH REST APIs using **relative paths** (e.g., `/api/assetmanagement/v3/assets`). These are proxied by the IH Monitor host — never add a base URL.
- `TimeseriesService` fetches historic data and last-known values (`Promise.allSettled()` for safe parallel fetches).
- `DeliveryService` dispatches payloads via MQTT (`MqttService`), HTTP POST, or local middleware depending on config.
- `ConfigService` persists settings with multi-level fallback: localStorage → sessionStorage → in-memory.

### Key Patterns

- **Standalone components** — no NgModules anywhere.
- **OnPush change detection** everywhere; use `zone.run()` for external event callbacks (MQTT, SDK observables).
- **Custom canvas chart** in `timeseries-chart/` — no third-party charting library.
- **Entry key format** for time-series values is `{assetId}_{aspectName}_{variableName}`.
- A keep-alive ping fires every 60 seconds to prevent IH session timeout.

### Delivery Modes

| Mode | Target | Transport |
|------|--------|-----------|
| Cloud MQTT | Plant Simulation X (SaaS) | WebSocket MQTT over `wss://` |
| HTTP REST | Plant Simulation X (SaaS) | POST to configured endpoint |
| Middleware | Plant Simulation Classic (on-premises) | POST to `middleware/server.py` → Plant Sim HTML interface on port 30001 |

### Payload Format

```json
{
  "assetId": "...", "assetName": "...", "mode": "live|historic",
  "from": "ISO8601", "to": "ISO8601",
  "variables": [{ "aspect": "...", "name": "...", "unit": "...", "dataType": "...",
    "values": [{ "time": "ISO8601", "value": 3.21 }] }]
}
```

## Deployment

1. `npm run build:prod`
2. Zip contents of `dist/plugin-tecnomatix/browser/`
3. Upload zip to **Insights Hub Developer Cockpit → Plugin Manager**
4. Declare required scopes: `assetmanagement.standardasset.read`, `iot.timeseries.read`, `assetmanagement.assettype.read`, `iot.timeseries.data.read`

Also deployable to Vercel (`vercel.json`) or Cloud Foundry (`manifest.yml`).

## SDK Dependency Note

`@insights-hub/ihm-plugin-sdk` must be downloaded from the [SIOS Portal](https://support.industry.siemens.com/sios) and placed in the project root as a `.tgz` file. Reference it in `package.json` as:
```json
"@insights-hub/ihm-plugin-sdk": "file:./ihm-plugin-sdk-x.y.z.tgz"
```
