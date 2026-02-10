import { client, v1 } from "@datadog/datadog-api-client";
import { getCredentials, validateCredentials, getDdSite } from "../utils/requestContext.js";

type GetMonitorParams = {
  monitorId: number;
};

let configuration: client.Configuration;

export const getMonitor = {
  initialize: () => {
    const configOpts = {
      authMethods: {
        apiKeyAuth: process.env.DD_API_KEY,
        appKeyAuth: process.env.DD_APP_KEY
      }
    };

    configuration = client.createConfiguration(configOpts);

    if (process.env.DD_METRICS_SITE) {
      configuration.setServerVariables({
        site: process.env.DD_METRICS_SITE
      });
    }
  },

  execute: async (params: GetMonitorParams) => {
    try {
      // Get credentials from request context (HTTP mode) or environment (stdio mode)
      const credentials = getCredentials();
      validateCredentials(credentials);

      // Create configuration per-request for HTTP mode security
      const configOpts = {
        authMethods: {
          apiKeyAuth: credentials.apiKey,
          appKeyAuth: credentials.appKey
        }
      };

      const requestConfig = client.createConfiguration(configOpts);

      requestConfig.setServerVariables({
        site: getDdSite("metrics")
      });

      const { monitorId } = params;

      const apiInstance = new v1.MonitorsApi(requestConfig);

      const apiParams: v1.MonitorsApiGetMonitorRequest = {
        monitorId: monitorId
      };

      const response = await apiInstance.getMonitor(apiParams);
      return response;
    } catch (error) {
      console.error(`Error fetching monitor ${params.monitorId}:`, error);
      throw error;
    }
  }
};
