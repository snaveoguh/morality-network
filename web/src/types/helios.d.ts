declare module "@a16z/helios" {
  export function createHeliosProvider(config: {
    executionRpc: string;
    network?: string;
  }): unknown;
}
