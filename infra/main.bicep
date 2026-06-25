@description('Azure region for all resources')
param location string = resourceGroup().location

@description('Base name for all resources — auto-generated from resource group if blank')
param baseName string = 'cw-shim-${uniqueString(resourceGroup().id)}'

@description('Storage account name (3-24 lowercase alphanumeric)')
param storageAccountName string = 'cwshim${uniqueString(resourceGroup().id)}'

// ── Log Analytics Workspace ────────────────────────────────────────────────────
resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: '${baseName}-logs'
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

// ── Application Insights ───────────────────────────────────────────────────────
resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: '${baseName}-insights'
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
  }
}

// ── Storage Account ────────────────────────────────────────────────────────────
resource storage 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: storageAccountName
  location: location
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
  properties: {
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
  }
}

// ── Consumption Plan ───────────────────────────────────────────────────────────
resource hostingPlan 'Microsoft.Web/serverfarms@2022-09-01' = {
  name: '${baseName}-plan'
  location: location
  sku: {
    name: 'Y1'
    tier: 'Dynamic'
  }
  properties: {}
}

// ── Function App ───────────────────────────────────────────────────────────────
var storageConnStr = 'DefaultEndpointsProtocol=https;AccountName=${storage.name};EndpointSuffix=${environment().suffixes.storage};AccountKey=${storage.listKeys().keys[0].value}'

resource functionApp 'Microsoft.Web/sites@2022-09-01' = {
  name: baseName
  location: location
  kind: 'functionapp'
  properties: {
    serverFarmId: hostingPlan.id
    httpsOnly: true
    siteConfig: {
      nodeVersion: '~20'
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      appSettings: [
        { name: 'AzureWebJobsStorage',                      value: storageConnStr }
        { name: 'WEBSITE_CONTENTAZUREFILECONNECTIONSTRING',  value: storageConnStr }
        { name: 'WEBSITE_CONTENTSHARE',                     value: toLower(baseName) }
        { name: 'FUNCTIONS_EXTENSION_VERSION',              value: '~4' }
        { name: 'FUNCTIONS_WORKER_RUNTIME',                 value: 'node' }
        { name: 'WEBSITE_NODE_DEFAULT_VERSION',             value: '~20' }
        { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING',    value: appInsights.properties.ConnectionString }
        { name: 'WEBSITE_RUN_FROM_PACKAGE',                 value: '1' }
      ]
    }
  }
}

// ── Outputs ────────────────────────────────────────────────────────────────────
output functionAppName string = functionApp.name
output functionAppUrl  string = 'https://${functionApp.properties.defaultHostName}'
output appInsightsName string = appInsights.name
output resourceGroup   string = resourceGroup().name
