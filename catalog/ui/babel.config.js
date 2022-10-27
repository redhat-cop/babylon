module.exports = {
  presets: ['@babel/preset-env', '@babel/preset-typescript', '@babel/preset-react'],
  plugins: [
    '@babel/proposal-class-properties',
    '@babel/proposal-object-rest-spread',
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
