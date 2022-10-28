module.exports = {
  presets: ['@babel/preset-typescript', '@babel/preset-env', '@babel/preset-react'],
  plugins: [
    [
      'transform-imports',
      {
        '@patternfly/react-icons': {
          transform: (importName, matches) =>
            `@patternfly/react-icons/dist/js/icons/${importName
              .split(/(?=[A-Z])/)
              .join('-')
              .toLowerCase()}`,
          preventFullImport: true,
        },
      },
    ],
  ],
};
