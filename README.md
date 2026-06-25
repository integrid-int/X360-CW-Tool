# ConnectWise Shim — x360Recover API Observer

Impersonates a ConnectWise Manage instance. x360Recover connects successfully,
then every API call it makes is logged to Application Insights. First step in
building the Axcient → Halo PSA middleware.

---

## Deploy to Azure

### Option 1 — One-click (push to GitHub first)

> **Before clicking:** push this repo to GitHub, then replace `{YOU}` and `{REPO}`
> in the URL below with your GitHub username and repo name.

[![Deploy to Azure](https://aka.ms/deploytoazure)](https://portal.azure.com/#create/Microsoft.Template/uri/https%3A%2F%2Fraw.githubusercontent.com%2F{YOU}%2F{REPO}%2Fmain%2Fazuredeploy.json)

This creates all Azure infrastructure (Function App, Storage, App Insights,
Log Analytics) in about 2 minutes. Then deploy the code:

```bash
npm install && npm run build
func azure functionapp publish <function-app-name> --typescript
```

The function app name is shown in the deployment outputs in the Azure portal.

---

### Option 2 — Azure Developer CLI (one command, handles infra + code)

```bash
# Install azd if needed: https://aka.ms/azd-install
azd up
```

Prompts for subscription, resource group, and region. Done.

---

### Option 3 — GitHub Actions (auto-deploy on push to main)

After the Deploy to Azure button run, add two repo secrets:

| Secret | Value |
|--------|-------|
| `AZURE_FUNCTIONAPP_NAME` | Function app name from deployment outputs |
| `AZURE_FUNCTIONAPP_PUBLISH_PROFILE` | Portal → Function App → Deployment Center → Manage publish profile |

Every push to `main` builds and deploys automatically.

---

### Option 4 — Local with ngrok (fastest for testing)

```bash
npm install && npm run build && npm start
# In another terminal:
ngrok http 7071
```

Point x360Recover at the ngrok HTTPS URL. Logs stream live in your terminal.

---

## x360Recover PSA Settings

| Field | Value |
|-------|-------|
| Configure Using | ConnectWise |
| URL | `https://{your-function-app}.azurewebsites.net` |
| API Key | anything (shim accepts all auth) |
| API Secret | anything |
| MSP Company ID | `INTEGRID` |
| Company ID | `1` |

Click Save — the shim returns a valid CW connection response and the integration
activates. Trigger a test alert to start capturing payloads.

---

## Reading the Logs

**Azure portal → Function App → Application Insights → Logs**

```kusto
// All requests, newest first
traces
| where message == "CW_SHIM_REQUEST"
| extend r = parse_json(tostring(customDimensions))
| project timestamp,
          method = tostring(r.method),
          path   = tostring(r.path),
          query  = tostring(r.query),
          body   = tostring(r.body)
| order by timestamp desc

// Ticket operations only
traces
| where message == "CW_SHIM_REQUEST"
| extend r = parse_json(tostring(customDimensions))
| where tostring(r.path) contains "tickets"
| project timestamp, method = tostring(r.method),
          path = tostring(r.path), body = tostring(r.body)
| order by timestamp desc

// Routes not handled (add these to the shim)
traces
| where message startswith "UNHANDLED:"
| project timestamp, message
| order by timestamp desc
```

---

## What to Capture

When x360Recover connects and fires an alert, look for:

- **Connection test sequence** — which endpoints hit, in what order
- **Auth header** — decode the Base64 `Authorization: Basic ...` to confirm field mapping
- **Company lookup** — how `GET /company/companies` is filtered
- **Ticket create body** — every field: summary format, priority, board reference, company mapping
- **Dedup query** — the `?conditions=` string on `GET /service/tickets`
- **Close/update body** — what changes on alert resolution

Once you have one real create payload and one real close payload, the Halo
translation layer is straightforward field mapping.

---

## Project Structure

```
├── src/functions/cwShim.ts   # Catch-all HTTP trigger — logs + mock CW responses
├── infra/main.bicep          # Azure infrastructure (for azd)
├── azuredeploy.json          # ARM template (for Deploy to Azure button)
├── azure.yaml                # Azure Developer CLI config
├── .github/workflows/        # GitHub Actions CI/CD
├── host.json
├── package.json
└── tsconfig.json
```
