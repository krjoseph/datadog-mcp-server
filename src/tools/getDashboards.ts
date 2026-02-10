import { client, v1 } from "@datadog/datadog-api-client";
import { getCredentials, validateCredentials, getDdSite } from "../utils/requestContext.js";

type GetDashboardsParams = {
  filterConfigured?: boolean;
  limit?: number;
};

let configuration: client.Configuration;

export const getDashboards = {
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

  execute: async (params: GetDashboardsParams) => {
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

      const { filterConfigured, limit } = params;

      const apiInstance = new v1.DashboardsApi(requestConfig);

      // No parameters needed for listDashboards
      const response = await apiInstance.listDashboards();

      // Apply client-side filtering if specified
      let filteredDashboards = response.dashboards || [];

      // Apply client-side limit if specified
      if (limit && filteredDashboards.length > limit) {
        filteredDashboards = filteredDashboards.slice(0, limit);
      }

      return {
        ...response,
        dashboards: filteredDashboards
      };
    } catch (error) {
      console.error("Error fetching dashboards:", error);
      throw error;
    }
  }
};
