const http = require('http');

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain');
    res.end('Auto-Continue Plus Plus - Deployment Successful!\\n\\nNote: This is a placeholder server for Render deployments. The actual VS Code extension must be compiled and installed locally (.vsix).');
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Auto-Continue Plus Plus Render placeholder is active.`);
});
