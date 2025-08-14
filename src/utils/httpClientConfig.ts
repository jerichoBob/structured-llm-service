import { Agent as HttpAgent } from 'http';
import { Agent as HttpsAgent } from 'https';

/**
 * HTTP connection pool configuration options
 */
export interface ConnectionPoolConfig {
  /** Maximum number of sockets to allow per host */
  maxSockets?: number;
  /** Maximum number of free sockets to keep open per host */
  maxFreeSockets?: number;
  /** Keep-alive timeout in milliseconds */
  keepAliveTimeout?: number;
  /** Enable keep-alive connections */
  keepAlive?: boolean;
  /** Socket timeout in milliseconds */
  timeout?: number;
  /** Maximum total sockets across all hosts */
  maxTotalSockets?: number;
}

/**
 * Default connection pool configuration optimized for LLM API calls
 */
export const DEFAULT_CONNECTION_POOL_CONFIG: Required<ConnectionPoolConfig> = {
  maxSockets: 50,           // Allow up to 50 concurrent connections per host
  maxFreeSockets: 10,       // Keep 10 idle connections ready for reuse
  keepAliveTimeout: 30000,  // 30 seconds keep-alive
  keepAlive: true,          // Enable keep-alive
  timeout: 60000,           // 60 second socket timeout
  maxTotalSockets: 100,     // Maximum total sockets across all hosts
};

/**
 * HTTP agents configured for connection pooling
 */
export class ConnectionPoolManager {
  private static instance: ConnectionPoolManager;
  private httpAgent: HttpAgent;
  private httpsAgent: HttpsAgent;
  private config: Required<ConnectionPoolConfig>;

  private constructor(config: ConnectionPoolConfig = {}) {
    this.config = { ...DEFAULT_CONNECTION_POOL_CONFIG, ...config };
    this.httpAgent = this.createHttpAgent();
    this.httpsAgent = this.createHttpsAgent();
  }

  /**
   * Get singleton instance of ConnectionPoolManager
   */
  public static getInstance(config?: ConnectionPoolConfig): ConnectionPoolManager {
    if (!ConnectionPoolManager.instance) {
      ConnectionPoolManager.instance = new ConnectionPoolManager(config);
    }
    return ConnectionPoolManager.instance;
  }

  /**
   * Create HTTP agent with connection pooling
   */
  private createHttpAgent(): HttpAgent {
    return new HttpAgent({
      keepAlive: this.config.keepAlive,
      keepAliveMsecs: this.config.keepAliveTimeout,
      maxSockets: this.config.maxSockets,
      maxFreeSockets: this.config.maxFreeSockets,
      timeout: this.config.timeout,
      maxTotalSockets: this.config.maxTotalSockets,
    });
  }

  /**
   * Create HTTPS agent with connection pooling
   */
  private createHttpsAgent(): HttpsAgent {
    return new HttpsAgent({
      keepAlive: this.config.keepAlive,
      keepAliveMsecs: this.config.keepAliveTimeout,
      maxSockets: this.config.maxSockets,
      maxFreeSockets: this.config.maxFreeSockets,
      timeout: this.config.timeout,
      maxTotalSockets: this.config.maxTotalSockets,
    });
  }

  /**
   * Get HTTP agent for connection pooling
   */
  public getHttpAgent(): HttpAgent {
    return this.httpAgent;
  }

  /**
   * Get HTTPS agent for connection pooling
   */
  public getHttpsAgent(): HttpsAgent {
    return this.httpsAgent;
  }

  /**
   * Get configuration for fetch-based clients
   */
  public getFetchConfig(): {
    agent?: any;
    keepalive?: boolean;
  } {
    // For Node.js fetch, we can use the agents
    return {
      agent: (url: string) => {
        return url.startsWith('https:') ? this.httpsAgent : this.httpAgent;
      },
      keepalive: this.config.keepAlive,
    };
  }

  /**
   * Get connection pool statistics
   */
  public getStats(): {
    http: {
      sockets: number;
      freeSockets: number;
      requests: number;
    };
    https: {
      sockets: number;
      freeSockets: number;
      requests: number;
    };
    config: Required<ConnectionPoolConfig>;
  } {
    return {
      http: {
        sockets: Object.keys(this.httpAgent.sockets || {}).reduce((total, host) => 
          total + (this.httpAgent.sockets[host]?.length || 0), 0),
        freeSockets: Object.keys(this.httpAgent.freeSockets || {}).reduce((total, host) => 
          total + (this.httpAgent.freeSockets[host]?.length || 0), 0),
        requests: Object.keys(this.httpAgent.requests || {}).reduce((total, host) => 
          total + (this.httpAgent.requests[host]?.length || 0), 0),
      },
      https: {
        sockets: Object.keys(this.httpsAgent.sockets || {}).reduce((total, host) => 
          total + (this.httpsAgent.sockets[host]?.length || 0), 0),
        freeSockets: Object.keys(this.httpsAgent.freeSockets || {}).reduce((total, host) => 
          total + (this.httpsAgent.freeSockets[host]?.length || 0), 0),
        requests: Object.keys(this.httpsAgent.requests || {}).reduce((total, host) => 
          total + (this.httpsAgent.requests[host]?.length || 0), 0),
      },
      config: this.config,
    };
  }

  /**
   * Update configuration and recreate agents
   */
  public updateConfig(newConfig: Partial<ConnectionPoolConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Destroy existing agents
    this.httpAgent.destroy();
    this.httpsAgent.destroy();
    
    // Create new agents with updated config
    this.httpAgent = this.createHttpAgent();
    this.httpsAgent = this.createHttpsAgent();
  }

  /**
   * Clean up and destroy all agents
   */
  public destroy(): void {
    this.httpAgent.destroy();
    this.httpsAgent.destroy();
  }
}

/**
 * Configure Anthropic SDK with connection pooling
 */
export function configureAnthropicHttpClient(config?: ConnectionPoolConfig) {
  const poolManager = ConnectionPoolManager.getInstance(config);
  
  return {
    httpAgent: poolManager.getHttpAgent(),
    httpsAgent: poolManager.getHttpsAgent(),
    // Configuration object that can be passed to Anthropic SDK
    clientOptions: {
      httpAgent: poolManager.getHttpAgent(),
      httpsAgent: poolManager.getHttpsAgent(),
    }
  };
}

/**
 * Configure Google Generative AI SDK with connection pooling
 * Note: Google's SDK uses fetch internally, so we need to configure it differently
 */
export function configureGoogleHttpClient(config?: ConnectionPoolConfig) {
  const poolManager = ConnectionPoolManager.getInstance(config);
  
  // For Google's SDK, we need to provide a custom fetch function
  const customFetch = (url: string | URL | Request, init?: RequestInit) => {
    const fetchConfig = poolManager.getFetchConfig();
    
    // Merge our connection config with the request init
    const enhancedInit: RequestInit = {
      ...init,
      // Note: Node.js fetch doesn't directly support agents in the same way
      // This is a placeholder for when Node.js fetch supports agent configuration
      ...fetchConfig,
    };
    
    return fetch(url, enhancedInit);
  };
  
  return {
    customFetch,
    poolManager,
    // Configuration that can be used with Google's SDK
    clientOptions: {
      // Google's SDK doesn't directly support custom agents yet
      // but we can provide a custom fetch function if needed
      fetch: customFetch,
    }
  };
}

/**
 * Global connection pool manager instance
 */
export const connectionPool = ConnectionPoolManager.getInstance();

/**
 * Initialize connection pooling for all providers
 */
export function initializeConnectionPooling(config?: ConnectionPoolConfig): {
  anthropic: ReturnType<typeof configureAnthropicHttpClient>;
  google: ReturnType<typeof configureGoogleHttpClient>;
  stats: () => ReturnType<ConnectionPoolManager['getStats']>;
} {
  const anthropicConfig = configureAnthropicHttpClient(config);
  const googleConfig = configureGoogleHttpClient(config);
  
  return {
    anthropic: anthropicConfig,
    google: googleConfig,
    stats: () => connectionPool.getStats(),
  };
}
