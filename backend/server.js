/**
 * ShieldPort — Backend Server
 * Serves the static web frontend.
 */
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve the frontend directory
app.use(express.static(path.join(__dirname, '../frontend')));

app.listen(PORT, () => {
  console.log(`\n🛡️  ShieldPort Web Interface running on http://localhost:${PORT}`);
  console.log(`Make sure to also run the Desktop Agent for USB features.\n`);
});
