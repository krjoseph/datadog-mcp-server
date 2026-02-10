import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import http from "http";
import { requestContext } from "../utils/requestContext.js";

export interface HttpTransportConfig {
  port?: number;
  host?: string;
}

export class HttpTransportHandler {
  constructor(
    private mcpServer: McpServer,
    private config: HttpTransportConfig = {}
  ) {}

  async connect(): Promise<void> {
    const port =
      this.config.port ?? parseInt(process.env.PORT || "3000", 10);
    const host = this.config.host ?? "0.0.0.0";

    const httpServer = http.createServer(async (req, res) => {
      console.log(`Received request: ${req.method} ${req.url}`);

      // Set proper HTTP headers for connection management
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");

      // Set up request timeout (25 seconds to be safe with common proxy timeouts)
      const timeout = setTimeout(() => {
        if (!res.headersSent) {
          console.log(`Request timeout for ${req.method} ${req.url}`);
          res.writeHead(408, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              jsonrpc: "2.0",
              error: {
                code: -32000,
                message: "Request timeout"
              },
              id: null
            })
          );
        }
      }, 25000); // 25 second timeout

      // Track response body for logging
      const responseChunks: Buffer[] = [];
      const originalWrite = res.write;
      res.write = function (chunk: any, encoding?: any, cb?: any) {
        if (chunk) {
          responseChunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk));
        }
        return originalWrite.call(this, chunk, encoding, cb);
      };

      // Capture original end method to log response and clear timeout
      const originalEnd = res.end;
      res.end = function (chunk?: any, encoding?: any, cb?: any) {
        clearTimeout(timeout);
        
        if (chunk) {
          responseChunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk));
        }
        
        const responseBody = Buffer.concat(responseChunks).toString('utf8');
        
        // Log response with status code
        const statusCode = res.statusCode;
        let logLevel = 'info';
        let statusType = 'Success';
        
        if (statusCode >= 400 && statusCode < 500) {
          logLevel = 'warn';
          statusType = 'Client Error';
        } else if (statusCode >= 500) {
          logLevel = 'error';
          statusType = 'Server Error';
        }
        
        const logMessage = `Response: ${req.method} ${req.url} - Status: ${statusCode} (${statusType})`;
        
        if (logLevel === 'error') {
          console.error(logMessage);
        } else if (logLevel === 'warn') {
          console.warn(logMessage);
        } else {
          console.log(logMessage);
        }
        
        // Try to parse and log error details for non-2xx responses
        if (statusCode >= 400 && responseBody) {
          try {
            const responseJson = JSON.parse(responseBody);
            
            if (responseJson.error) {
              console.error(`[Error Details] Code: ${responseJson.error.code}, Message: ${responseJson.error.message}`);
              
              // Log specific error types
              if (responseJson.error.message?.includes('DD_API_KEY') || 
                  responseJson.error.message?.includes('DD_APP_KEY')) {
                console.error('[Error Type] Authentication/Credentials Error');
              } else if (responseJson.error.code === -32600) {
                console.error('[Error Type] Invalid JSON-RPC Request');
              } else if (responseJson.error.code === -32601) {
                console.error('[Error Type] Method Not Found');
              } else if (responseJson.error.code === -32602) {
                console.error('[Error Type] Invalid Parameters');
              } else if (responseJson.error.code === -32603) {
                console.error('[Error Type] Internal Error');
              }
            } else if (responseJson.result) {
              // Sometimes errors are in the result with an error field
              console.error(`[Error Details] Response contains result but status is ${statusCode}`);
            } else {
              console.error(`[Error Details] Response body: ${responseBody.substring(0, 200)}`);
            }
          } catch (parseError) {
            // Log that we couldn't parse the response
            const responsePreview = responseBody.substring(0, 200);
            console.error(`[Error Details] Could not parse response body: ${responsePreview}`);
          }
        }
        
        return originalEnd.call(this, chunk, encoding, cb);
      };

      // Clean up timeout on request close/error
      req.on("close", () => {
        clearTimeout(timeout);
        console.log(`Request closed: ${req.method} ${req.url}`);
      });
      req.on("error", (error: NodeJS.ErrnoException) => {
        clearTimeout(timeout);
        // Client aborts and connection resets are normal
        const isClientAbort =
          error.message === "aborted" || error.code === "ECONNRESET";
        if (!isClientAbort) {
          console.log(`Request error: ${req.method} ${req.url}`, error.message);
        }
      });

      // Health check endpoint
      if (req.method === "GET" && req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            status: "healthy",
            server: "datadog-mcp",
            version: "1.0.0",
            timestamp: new Date().toISOString()
          })
        );
        return;
      }

      try {
        // Extract credentials and config from headers
        // Authorization: Bearer <app_key> (user key)
        // X-DD-API-Key: <api_key>
        // X-DD-Host: <dd_site> (optional, e.g. "datadoghq.eu")
        const authHeader = req.headers.authorization;
        const apiKeyHeader = req.headers["x-dd-api-key"] as string | undefined;
        const ddHostHeader = req.headers["x-dd-host"] as string | undefined;

        let appKey: string | undefined;
        if (authHeader && authHeader.startsWith("Bearer ")) {
          appKey = authHeader.substring(7);
        }

        // Helper function to mask credentials for logging
        const maskCredential = (credential: string | undefined): string => {
          if (!credential) return "not provided";
          if (credential.length <= 8) return "***";
          return `${credential.substring(0, 4)}...${credential.substring(credential.length - 4)}`;
        };

        // Log received headers (credentials masked for security)
        console.log(`[Auth] API Key: ${maskCredential(apiKeyHeader)}`);
        console.log(`[Auth] App Key: ${maskCredential(appKey)}`);
        if (ddHostHeader) {
          console.log(`[Config] DD Host: ${ddHostHeader}`);
        }
        
        // Warn if credentials are missing
        if (!apiKeyHeader || !appKey) {
          console.warn('[Auth Warning] Missing credentials - request will likely fail during tool execution');
          if (!apiKeyHeader) console.warn('[Auth Warning] - Missing X-DD-API-Key header');
          if (!appKey) console.warn('[Auth Warning] - Missing Authorization Bearer header');
        }

        // Create a new stateless transport for each request.
        // sessionIdGenerator: undefined = stateless mode so every request is
        // fully self-contained (no session tracking).
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
          enableJsonResponse: true
        });

        // Create an isolated Server instance per request.
        // The MCP SDK only allows one transport per Server at a time, so we
        // cannot reuse the main McpServer across concurrent requests.  Instead
        // we spin up a lightweight Server and copy the registered handlers.
        const server = new Server(
          { name: "datadog", version: "1.0.0" },
          { capabilities: { tools: {} } }
        );

        // Copy request/notification handlers from the main McpServer
        const mainServer = (this.mcpServer as any).server ?? (this.mcpServer as any)._server;
        if (mainServer) {
          const src = mainServer as any;
          if (src._requestHandlers) {
            (server as any)._requestHandlers = new Map(src._requestHandlers);
          }
          if (src._notificationHandlers) {
            (server as any)._notificationHandlers = new Map(src._notificationHandlers);
          }
        }

        console.log(`Created isolated server + stateless transport for request`);

        // Connect the per-request server to the transport
        await server.connect(transport);

        // Run the request handler within the async context with credentials + config
        await requestContext.run(
          {
            credentials: {
              apiKey: apiKeyHeader,
              appKey: appKey
            },
            ddHost: ddHostHeader
          },
          async () => {
            await transport.handleRequest(req, res);
          }
        );

        console.log(`Request handled successfully`);

        // Clean up the per-request server and transport
        await server.close();
        console.log(`Transport closed`);
      } catch (error) {
        clearTimeout(timeout);
        console.error(`Error handling request ${req.method} ${req.url}:`, error);

        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              jsonrpc: "2.0",
              error: {
                code: -32603,
                message: "Internal server error"
              },
              id: null
            })
          );
        }
      }
    });

    // Configure server settings for better connection handling
    httpServer.keepAliveTimeout = 5000; // 5 seconds
    httpServer.headersTimeout = 6000; // 6 seconds
    httpServer.timeout = 30000; // 30 seconds total timeout
    httpServer.maxHeadersCount = 100;

    httpServer.listen(port, host, () => {
      console.log(`Datadog MCP Server listening on http://${host}:${port}/mcp`);
      console.log(`Health check available at http://${host}:${port}/health`);
    });

    // Handle server errors
    httpServer.on("error", (error) => {
      console.error("HTTP Server error:", error);
    });

    // Handle client errors
    httpServer.on("clientError", (error, socket) => {
      console.error("Client error:", error.message);
      if (!socket.destroyed) {
        socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
      }
    });
  }
}
