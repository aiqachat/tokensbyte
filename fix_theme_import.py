import re
import os

files = [
    'frontend/src/pages/Playground/PlaygroundHome.tsx',
    'frontend/src/pages/Playground/Playground.tsx',
    'frontend/src/pages/ModelMarketplace/ModelMarketplace.tsx'
]

for filepath in files:
    if not os.path.exists(filepath): continue
    
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
        
    if 'const { themeMode } = useThemeStore();' not in content:
        # We need to insert it right after the component declaration
        # const ModelMarketplace: React.FC = () => {
        # const PlaygroundHome: React.FC = () => {
        # const Playground: React.FC = () => {
        
        comp_match = re.search(r'const\s+[A-Za-z0-9_]+\s*(:\s*React\.FC)?\s*=\s*\([^)]*\)\s*=>\s*\{', content)
        if comp_match:
            insert_pos = comp_match.end()
            content = content[:insert_pos] + "\n  const { themeMode } = useThemeStore();" + content[insert_pos:]
            
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)

print("Fixed themeMode declarations.")
