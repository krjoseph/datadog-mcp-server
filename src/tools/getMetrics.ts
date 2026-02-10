import { client, v1 } from "@datadog/datadog-api-client";
import { getCredentials, validateCredentials, getDdSite } from "../utils/requestContext.js";

type GetMetricsParams = {
  q?: string;
};

let configuration: client.Configuration;

export const getMetrics = {
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

  execute: async (params: GetMetricsParams) => {
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

      const { q } = params;

      const apiInstance = new v1.MetricsApi(requestConfig);

      const queryStr = q || "*";

      const apiParams: v1.MetricsApiListMetricsRequest = {
        q: queryStr
      };

      const response = await apiInstance.listMetrics(apiParams);
      return response;
    } catch (error) {
      console.error("Error fetching metrics:", error);
      throw error;
    }
  }
};
