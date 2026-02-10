import { client, v1 } from "@datadog/datadog-api-client";
import { getCredentials, validateCredentials, getDdSite } from "../utils/requestContext.js";

type GetEventsParams = {
  start: number;
  end: number;
  priority?: "normal" | "low";
  sources?: string;
  tags?: string;
  unaggregated?: boolean;
  excludeAggregation?: boolean;
  limit?: number;
};

let configuration: client.Configuration;

export const getEvents = {
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

  execute: async (params: GetEventsParams) => {
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

      const {
        start,
        end,
        priority,
        sources,
        tags,
        unaggregated,
        excludeAggregation,
        limit
      } = params;

      const apiInstance = new v1.EventsApi(requestConfig);

      const apiParams: v1.EventsApiListEventsRequest = {
        start: start,
        end: end,
        priority: priority,
        sources: sources,
        tags: tags,
        unaggregated: unaggregated,
        excludeAggregate: excludeAggregation
      };

      const response = await apiInstance.listEvents(apiParams);

      // Apply client-side limit if specified
      if (limit && response.events && response.events.length > limit) {
        response.events = response.events.slice(0, limit);
      }

      return response;
    } catch (error) {
      console.error("Error fetching events:", error);
      throw error;
    }
  }
};
