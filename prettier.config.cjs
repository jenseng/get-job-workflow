/**
 * @type {import('prettier').Options}
 */
module.exports = {
  trailingComma: "es5",
  printWidth: 100,
  overrides: [
    {
      files: ["tsconfig*.json"],
      options: {
        trailingComma: "none",
      },
    },
  ],
};
