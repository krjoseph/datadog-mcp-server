import { client, v1 } from "@datadog/datadog-api-client";
import { getCredentials, validateCredentials, getDdSite } from "../utils/requestContext.js";

type GetDashboardParams = {
  dashboardId: string;
};

let configuration: client.Configuration;

export const getDashboard = {
  initialize: () => {
    const configOpts = {
      authMethods: {
        apiKeyAuth: process.env.DD_API_KEY,
        appKeyAuth: process.env.DD_APP_KEY
      }
    };

    configuration = client.createConfiguration(configOpts);

    if (process.env.DD_SITE) {
      configuration.setServerVariables({
        site: process.env.DD_SITE
      });
    }
  },

  execute: async (params: GetDashboardParams) => {
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
        site: getDdSite()
      });

      const { dashboardId } = params;

      const apiInstance = new v1.DashboardsApi(requestConfig);

      const apiParams: v1.DashboardsApiGetDashboardRequest = {
        dashboardId: dashboardId
      };

      const response = await apiInstance.getDashboard(apiParams);
      return response;
    } catch (error) {
      console.error(`Error fetching dashboard ${params.dashboardId}:`, error);
      throw error;
    }
  }
};
