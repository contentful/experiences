/**
 * Main entry point for the package
 */

export interface Config {
  apiKey?: string;
  timeout?: number;
  retries?: number;
}

export class Client {
  private config: Config;

  constructor(config: Config = {}) {
    this.config = {
      timeout: 5000,
      retries: 3,
      ...config,
    };
  }

  /**
   * Example method
   */
  async doSomething(): Promise<string> {
    return 'Hello from your SDK!';
  }

  /**
   * Get current configuration
   */
  getConfig(): Readonly<Config> {
    return { ...this.config };
  }
}

// Default export
export default Client;
