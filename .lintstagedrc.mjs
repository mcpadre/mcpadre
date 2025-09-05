export default {
  "**/*.{ts,tsx}": (filenames) => {
    const filtered = filenames.filter(filename => !filename.includes('vitest.config'));
    if (filtered.length === 0) return [];
    return [
      `eslint --fix ${filtered.join(' ')}`,
      `prettier --write ${filtered.join(' ')}`
    ];
  },
  "**/*.{json,md,yml,yaml}": [
    "prettier --write"
  ]
};