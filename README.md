# Plugin_Tecnomatix

An Insights Hub Monitor Plugin that bridges Siemens Insights Hub asset and time-series data to **Tecnomatix Plant Simulation** — supporting both Plant Simulation X (cloud/SaaS) and Plant Simulation Classic (on-premises).

---

## Overview

Plugin_Tecnomatix runs as an embedded tab inside **Insights Hub Monitor** (the Explore → Assets view). It reads real machine data from IH and forwards it to Plant Simulation so simulation engineers can run models with live or historic sensor data.

**Key capabilities:**
- Full asset hierarchy browser with real-time search
- Aspect + variable multi-selector with live last-known values
- Historic data export (last 1h / 4h / 8h / 24h / custom range)
- Live polling mode (every 2 minutes, automatic stop on tab hide)
- Dual delivery: cloud MQTT broker or HTTP REST endpoint (Plant Simulation X) / local middleware (Classic)
- Activity log with retry status

---

## Prerequisites

- **Node.js** 18 or newer
- **Angular CLI** 15 or newer (`npm install -g @angular/cli`)
- **@insights-hub/ihm-plugin-sdk** — download from the [SIOS Portal](https://support.industry.siemens.com/sios)
  - Place the downloaded `.tgz` file in the project root and update `package.json` accordingly, e.g.:
    ```json
    "@insights-hub/ihm-plugin-sdk": "file:./ihm-plugin-sdk-x.y.z.tgz"
    ```
- An active **Insights Hub** tenant with developer access

---

## Installation

```bash
cd plugin-tecnomatix
npm install
```

---

## Local Development

```bash
ng serve
```

The plugin opens at `http://localhost:4200`. Note: without the IH Monitor host, the SDK Observables (`assetId`, `dateRange`, `active`) will not fire. You can mock them in `main.ts` during development.

---

## Build for Deployment

```bash
ng build --configuration production
```

Output is in `dist/plugin-tecnomatix/`. These static files are what you upload to the IH Developer Cockpit.

---

## Deployment to Insights Hub Developer Cockpit

1. Run `ng build --configuration production`.
2. Compress the `dist/plugin-tecnomatix/` folder contents into a `.zip` file.
3. Open the **Insights Hub Developer Cockpit** → Plugin Manager.
4. Create a new plugin entry with:
   - **Display Name:** Plugin_Tecnomatix
   - **Plugin ID:** plugin-tecnomatix
   - **Plugin type:** Monitor Plugin
5. Upload the `.zip` file.
6. Declare the required scopes in the plugin manifest:
   ```json
   {
     "scopes": [
       "assetmanagement.standardasset.read",
       "iot.timeseries.read",
       "assetmanagement.assettype.read",
       "iot.timeseries.data.read"
     ]
   }
   ```
7. Publish the plugin and assign it to users/groups.

---

## Configuration Guide

On first launch the plugin shows a **Setup screen**. Fill in the settings that match your Plant Simulation deployment.

### Cloud Mode (Plant Simulation X — SaaS)

**MQTT (recommended for live data)**

| Field | Example |
|---|---|
| MQTT Broker URL | `wss://broker.hivemq.com:8884/mqtt` |
| MQTT Topic | `ih/plantsim/data` |
| MQTT Username | *(your broker credentials)* |
| MQTT Password | *(your broker credentials)* |

Plant Simulation X must be configured to subscribe to the same MQTT broker and topic.

**HTTP REST**

| Field | Example |
|---|---|
| Plant Sim X Endpoint | `https://your-plantsimx.example.com/api/ingest` |
| API Key | *(your API key)* |

### On-Premises Mode (Plant Simulation Classic — Desktop)

| Field | Example |
|---|---|
| Middleware URL | `https://your-pc.ngrok.io` |
| API Key | *(set in your middleware config)* |
| Plant Sim Port | `30001` (default) |

---

## On-Premises Middleware Setup

When using Plant Simulation Classic, a lightweight Node.js middleware must run on the **same PC** as Plant Simulation.

The middleware:
1. Listens on port 3000 for `POST /ingest`
2. Receives the JSON payload from this plugin
3. Translates each variable/value into a Plant Simulation HTML interface call:
   ```
   http://localhost:30001/SC_CallMethod:.Model.IngestMethod:{csv_row}
   ```
4. Plant Simulation's built-in HTML interface must be **enabled** (Tools → Options → HTML interface, port 30001)

To expose the middleware to Insights Hub over the internet, use a tunneling tool such as [ngrok](https://ngrok.com/):
```bash
ngrok http 3000
```
Copy the generated HTTPS URL into the plugin's **Middleware URL** field.

---

## Data Format

The plugin sends a structured JSON payload to Plant Simulation:

```json
{
  "assetId": "f9f1ff3ccaa1401a98cf37d0c9144c7e",
  "assetName": "Assembly_Line_01",
  "mode": "live",
  "from": "2026-03-10T10:00:00Z",
  "to": "2026-03-10T10:02:00Z",
  "variables": [
    {
      "aspect": "Vibration",
      "name": "velocity",
      "unit": "mm/s",
      "dataType": "DOUBLE",
      "values": [
        { "time": "2026-03-10T10:00:30Z", "value": 3.21 },
        { "time": "2026-03-10T10:01:30Z", "value": 3.45 }
      ]
    }
  ]
}
```

In Plant Simulation this maps to a TableFile with columns:
`Timestamp | AssetId | AssetName | Aspect | VariableName | Value | Unit`

---

## Troubleshooting

### MQTT broker connection fails
- Verify the broker URL format: `wss://hostname:port/mqtt`
- Check credentials (username/password)
- Ensure the broker's WebSocket port is open (commonly 8884 for TLS)
- HiveMQ Cloud free tier works out of the box; confirm your cluster is running

### CORS errors when calling IH APIs
- All IH API calls use **relative paths** — they are proxied by the IH Monitor host
- Never add a base URL; calls like `/api/assetmanagement/v3/assets` are correct
- CORS issues indicate the plugin is being loaded outside of IH Monitor

### Session timeout
- The plugin sends a keep-alive ping every 60 seconds automatically
- If sessions still expire, check tenant-level session timeout settings

### "No data available for selected time range"
- Confirm the asset has data in the selected period (check IH Fleet Manager / Data Explorer)
- Widen the time range
- Verify the selected variables are actively ingesting data

### localStorage blocked in iframe
- The plugin automatically falls back to `sessionStorage`, then to in-memory storage
- Settings will be lost on page reload if both storage types are blocked; re-run setup

### Plugin tab not visible in Monitor
- The plugin must be published and assigned in the Developer Cockpit
- Ensure the user account has the plugin assigned and the required scopes granted

---

## Required IH API Scopes

| Scope | Purpose |
|---|---|
| `assetmanagement.standardasset.read` | Read asset hierarchy |
| `iot.timeseries.read` | Read time-series data |
| `assetmanagement.assettype.read` | Read asset type metadata |
| `iot.timeseries.data.read` | Read raw time-series data points |
