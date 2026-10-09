const ts = require('typescript');
const { pathToFileURL } = require('node:url');

// Test the real browser build. Its import.meta.url cannot run in Jest's
// CommonJS VM, and the Node build's createRequire is incompatible with jsdom.
module.exports = {
  process(source, filename) {
    const result = ts.transpileModule(
      source.replace(/import\.meta\.url/g, JSON.stringify(pathToFileURL(filename).href)),
      {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
        fileName: filename,
      },
    );
    return { code: result.outputText };
  },
};
