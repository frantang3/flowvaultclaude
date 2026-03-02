// Global type declarations for web APIs available in React Native/Expo

declare global {
  // Blob API (available in React Native via polyfill or native support)
  interface Blob {
    readonly size: number;
    readonly type: string;
    slice(start?: number, end?: number, contentType?: string): Blob;
  }

  interface BlobPropertyBag {
    type?: string;
    endings?: 'transparent' | 'native';
  }

  var Blob: {
    prototype: Blob;
    new (blobParts?: BlobPart[], options?: BlobPropertyBag): Blob;
  };

  type BlobPart = string | Blob | ArrayBuffer | ArrayBufferView;

  // File API (extends Blob)
  interface File extends Blob {
    readonly lastModified: number;
    readonly name: string;
  }

  var File: {
    prototype: File;
    new (fileBits: BlobPart[], fileName: string, options?: FilePropertyBag): File;
  };

  interface FilePropertyBag extends BlobPropertyBag {
    lastModified?: number;
  }

  // XMLHttpRequest for upload progress tracking
  interface XMLHttpRequest extends EventTarget {
    readonly upload: XMLHttpRequestUpload;
    readonly status: number;
    readonly statusText: string;
    readonly responseText: string;
    open(method: string, url: string, async?: boolean): void;
    setRequestHeader(name: string, value: string): void;
    send(body?: Document | BodyInit | null): void;
    abort(): void;
  }

  interface XMLHttpRequestUpload extends EventTarget {
    addEventListener(
      type: 'progress',
      listener: (this: XMLHttpRequestUpload, ev: ProgressEvent) => any,
      options?: boolean | AddEventListenerOptions
    ): void;
  }

  var XMLHttpRequest: {
    prototype: XMLHttpRequest;
    new (): XMLHttpRequest;
  };

  // AbortController and AbortSignal for cancellable operations
  interface AbortSignal extends EventTarget {
    readonly aborted: boolean;
    addEventListener(
      type: 'abort',
      listener: (this: AbortSignal, ev: Event) => any,
      options?: boolean | AddEventListenerOptions
    ): void;
  }

  interface AbortController {
    readonly signal: AbortSignal;
    abort(): void;
  }

  var AbortController: {
    prototype: AbortController;
    new (): AbortController;
  };

  // Extend globalThis to include SUPABASE keys (runtime injection)
  var SUPABASE_URL: string | undefined;
  var SUPABASE_ANON_KEY: string | undefined;
}

export {};