const fs = require('fs');
const path = require('path');

const directoryPath = path.join(__dirname, 'web', 'src');

function replaceUrlsInFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  // Reemplazar "http://localhost:8000" por `\${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}`
  if (content.includes('"http://localhost:8000')) {
    content = content.replace(/"http:\/\/localhost:8000/g, '`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}');
    content = content.replace(/http:\/\/localhost:8000`/g, '${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}`');
    changed = true;
  }
  
  if (content.includes('`http://localhost:8000')) {
    content = content.replace(/`http:\/\/localhost:8000/g, '`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}');
    changed = true;
  }

  // Reemplazar "http://localhost:3005" por `\${process.env.NEXT_PUBLIC_BOT_URL || "http://localhost:3005"}`
  if (content.includes("'http://localhost:3005")) {
    content = content.replace(/'http:\/\/localhost:3005/g, '`${process.env.NEXT_PUBLIC_BOT_URL || "http://localhost:3005"}');
    // Para cerrar bien el backtick de las URLs del bot si terminan en comilla simple
    content = content.replace(/\/api\/send-message'/g, '/api/send-message`');
    changed = true;
  }

  if (content.includes('"http://localhost:3005')) {
    content = content.replace(/"http:\/\/localhost:3005/g, '`${process.env.NEXT_PUBLIC_BOT_URL || "http://localhost:3005"}');
    content = content.replace(/\/api\/extract-order"/g, '/api/extract-order`');
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✅ Arreglado: ${filePath}`);
  }
}

function scanDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      scanDir(fullPath);
    } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx')) {
      replaceUrlsInFile(fullPath);
    }
  }
}

scanDir(directoryPath);
console.log("¡Todo listo! Las URLs de localhost fueron reemplazadas por variables de entorno.");
