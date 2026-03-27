declare module 'dompurify' {
  interface Config {
    ALLOWED_TAGS?: string[];
    ALLOWED_ATTR?: string[];
    ALLOWED_URI_REGEXP?: RegExp;
    [key: string]: any;
  }

  interface DOMPurify {
    sanitize(dirty: string, config?: Config): string;
    sanitize(dirty: Node, config?: Config): DocumentFragment;
    sanitize(dirty: string | Node, config?: Config): string | DocumentFragment;
    addHook(hook: string, cb: Function): void;
    removeHook(hook: string): void;
    removeHooks(hook: string): void;
    removeAllHooks(): void;
    setConfig(cfg?: Config): void;
    clearConfig(): void;
    isValidAttribute(tag: string, attr: string, value: string): boolean;
  }

  const DOMPurify: DOMPurify;
  export default DOMPurify;
}