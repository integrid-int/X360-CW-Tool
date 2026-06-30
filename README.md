# ConnectWise Shim — x360Recover API Observer

Impersonates a ConnectWise Manage instance. x360Recover connects successfully
and every API call it makes is logged to Application Insights.

---

## Deploy

### Step 1 — Infrastructure (one click)

[![Deploy to Azure](https://aka.ms/deploytoazure)](https://portal.azure.com/#create/Microsoft.Template/uri/https%3A%2F%2Fraw.githubusercontent.com%2Fintegrid-int%2FX360-CW-Tool%2Fmain%2Fazuredeploy.json)

Creates: Function App, Storage Account, App Insights, Log Analytics.

Note the **Function App name** from the deployment outputs — you need it in Step 2.

---

### Step 2 — Code (GitHub Actions, runs automatically on push)

1. **Get publish profile**
   Portal → Function App → Overview → **Download publish profile**

2. **Add GitHub secrets**
   Repo → Settings → Secrets and variables → Actions → New repository secret

   | Secret | Value |
   |--------|-------|
   | `AZURE_FUNCTIONAPP_PUBLISH_PROFILE` | Paste full contents of the downloaded publish profile file |
   | `AZURE_FUNCTIONAPP_NAME` *(optional)* | Function App name from Step 1 outputs. If omitted, workflow derives it from publish profile. |

3. **Trigger deploy**
   Push any change to `main` — GitHub Actions builds and deploys automatically.
   Or: Actions tab → "Deploy to Azure Functions" → **Run workflow**.

4. **If deployment fails with Kudu 401 (`Failed to fetch Kudu App Settings`)**
   - Download a **fresh** publish profile from the same Function App and replace `AZURE_FUNCTIONAPP_PUBLISH_PROFILE`.
   - In the Function App, ensure **SCM Basic Auth Publishing Credentials** is enabled.
   - Re-run the workflow.

---

### Verify it's running

```bash
curl https://{your-function-app}.azurewebsites.net/v4_6_release/apis/3.0/system/info
```

Should return:
```json
{"version":"v2023.1.0.0","isCloud":false,"serverTimeZone":"Eastern Standard Time"}
```

---

## x360Recover PSA Settings

| Field | Value |
|-------|-------|
| Configure Using | ConnectWise |
| URL | `https://{your-function-app}.azurewebsites.net` |
| API Key | anything |
| API Secret | anything |
| MSP Company ID | `INTEGRID` |
| Company ID | `1` |

---

## Reading the Logs

Portal → Function App → Application Insights → Logs

```kusto
// All requests
traces
| where message == "CW_SHIM_REQUEST"
| extend r = parse_json(tostring(customDimensions))
| project timestamp, method = tostring(r.method), path = tostring(r.path),
          query = tostring(r.query), body = tostring(r.body)
| order by timestamp desc

// Ticket operations only
traces
| where message == "CW_SHIM_REQUEST"
| extend r = parse_json(tostring(customDimensions))
| where tostring(r.path) contains "tickets"
| project timestamp, method = tostring(r.method), path = tostring(r.path), body = tostring(r.body)
| order by timestamp desc
```
