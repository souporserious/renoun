const fs = require('fs');
const path = require('path');

// This runs before pnpm resolves anything
const cliDir = path.join(__dirname, 'packages/renoun/dist/cli');
const cliIndex = path.join(cliDir, 'index.js');

if (!fs.existsSync(cliIndex)) {
  fs.mkdirSync(cliDir, { recursive: true });
  fs.writeFileSync(cliIndex, '#!/usr/bin/env node\n');
}

module.exports = {
  hooks: {
    readPackage(pkg) {
      return pkg;
    }
  }
};