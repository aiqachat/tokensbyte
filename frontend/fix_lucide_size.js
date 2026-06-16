import fs from 'fs';
import path from 'path';

const files = [
  'src/pages/Playground/components/GenerationLogWidget.tsx',
  'src/pages/Playground/components/ResourceManagerWidget.tsx'
];

for (const file of files) {
  const p = path.resolve(file);
  let content = fs.readFileSync(p, 'utf-8');
  
  // Find all <IconName ... style={{ ... fontSize: XX ... }} /> and convert to size={XX}
  // This is a bit tricky with regex, we can just replace `fontSize: (\d+)` with `width: $1, height: $1` inside style
  content = content.replace(/fontSize:\s*(\d+)/g, 'width: $1, height: $1');
  
  fs.writeFileSync(p, content, 'utf-8');
}
console.log('Sizes fixed!');
