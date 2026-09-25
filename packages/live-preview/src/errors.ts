export class LivePreviewConnectionError extends Error {
  constructor() {
    super('Live Preview connection failed.');
    this.name = 'LivePreviewConnectionError';
  }
}
