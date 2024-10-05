import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const buildPath = path.join(__dirname, 'build');
const publicPath = path.join(__dirname, 'public');

// Serve static files from 'build' if it exists, otherwise from 'public'
if (fs.existsSync(buildPath)) {
  app.use(express.static(buildPath));
} else {
  app.use(express.static(publicPath));
}

function serveHTML(filePath, res) {
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      console.error('Error reading file:', err);
      return res.status(500).send('Error reading HTML file');
    }
    // Replace %PUBLIC_URL% with an empty string or the appropriate URL
    const result = data.replace(/%PUBLIC_URL%/g, '');
    res.send(result);
  });
}

// Handle React routing, return all requests to React app
app.get('/*', function(req, res) {
  if (fs.existsSync(path.join(buildPath, 'index.html'))) {
    serveHTML(path.join(buildPath, 'index.html'), res);
  } else if (fs.existsSync(path.join(publicPath, 'index.html'))) {
    serveHTML(path.join(publicPath, 'index.html'), res);
  } else {
    res.status(404).send('No index.html found in build or public directory');
  }
});

const PORT = process.env.PORT || 3006;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  if (!fs.existsSync(buildPath)) {
    console.log('Note: Serving from public directory. For production build, run "npm run build".');
  }
});