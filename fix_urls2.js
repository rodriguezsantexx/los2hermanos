const fs = require('fs');
const path = require('path');

const directoryPath = path.join(__dirname, 'web', 'src');

function fixUrlsInFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  // Arreglar las comillas mal cerradas
  const oldContent = content;
  
  // Expresión regular para encontrar las cadenas que empiezan con backtick pero terminan con comilla doble
  // Ejemplo: `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/productos")
  
  content = content.replace(/(`\$\{process\.env\.NEXT_PUBLIC_API_URL \|\| "http:\/\/localhost:8000"\}[^"]*)"/g, '$1`');
  content = content.replace(/(`\$\{process\.env\.NEXT_PUBLIC_BOT_URL \|\| "http:\/\/localhost:3005"\}[^"]*)"/g, '$1`');

  if (content !== oldContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✅ Arreglada la sintaxis en: ${filePath}`);
  }
}

function scanDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      scanDir(fullPath);
    } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx')) {
      fixUrlsInFile(fullPath);
    }
  }
}

scanDir(directoryPath);
console.log("¡Todo listo! Comillas dobles rebeldes corregidas a backticks.");
