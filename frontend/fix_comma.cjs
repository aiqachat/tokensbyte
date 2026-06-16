const fs = require('fs');
const path = require('path');

const files = [
  'src/pages/Playground/components/GenerationLogWidget.tsx',
  'src/pages/Playground/components/ResourceManagerWidget.tsx'
];

for (const file of files) {
  const p = path.resolve(file);
  let content = fs.readFileSync(p, 'utf-8');
  
  content = content.replace(/style=\{\{\s*,\s*/g, 'style={{ ');
  
  fs.writeFileSync(p, content, 'utf-8');
}
console.log('Commas fixed!');
