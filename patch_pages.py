import re
import os

def process_file(filepath):
    if not os.path.exists(filepath):
        return
        
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Import useThemeStore if not present
    if 'useThemeStore' not in content:
        if "import request from '../../utils/request';" in content:
            content = content.replace("import request from '../../utils/request';", "import request from '../../utils/request';\nimport { useThemeStore } from '../../store/theme';")
        elif "import useSettingsStore from '../../store/settings';" in content:
            content = content.replace("import useSettingsStore from '../../store/settings';", "import useSettingsStore from '../../store/settings';\nimport { useThemeStore } from '../../store/theme';")
        else:
            # Just append at top below react
            content = re.sub(r'(import React.*?;\n)', r'\1import { useThemeStore } from "../../store/theme";\n', content)

    # 2. Add themeMode to component
    # We look for "const { t } = useTranslation();" or similar
    if 'const { themeMode } = useThemeStore();' not in content:
        content = content.replace("const { t } = useTranslation();", "const { t } = useTranslation();\n  const { themeMode } = useThemeStore();")
        content = content.replace("const { settings } = useSettingsStore();", "const { settings } = useSettingsStore();\n  const { themeMode } = useThemeStore();")

    # 3. Replace hardcoded dark colors
    content = content.replace("background: '#141414'", "background: themeMode === 'light' ? '#ffffff' : '#141414'")
    content = content.replace("background: '#000'", "background: themeMode === 'light' ? '#f8f9fa' : '#000'")
    content = content.replace("background: '#1f1f1f'", "background: themeMode === 'light' ? '#ffffff' : '#1f1f1f'")
    content = content.replace("backgroundColor: '#141414'", "backgroundColor: themeMode === 'light' ? '#ffffff' : '#141414'")
    content = content.replace("backgroundColor: '#000'", "backgroundColor: themeMode === 'light' ? '#f8f9fa' : '#000'")
    content = content.replace("color: '#fff'", "color: themeMode === 'light' ? '#1f2937' : '#fff'")
    content = content.replace("border: '1px solid #303030'", "border: themeMode === 'light' ? '1px solid #e5e7eb' : '1px solid #303030'")
    content = content.replace("borderBottom: '1px solid #303030'", "borderBottom: themeMode === 'light' ? '1px solid #e5e7eb' : '1px solid #303030'")
    content = content.replace("borderColor: '#303030'", "borderColor: themeMode === 'light' ? '#e5e7eb' : '#303030'")
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

process_file('frontend/src/pages/Playground/PlaygroundHome.tsx')
process_file('frontend/src/pages/Playground/Playground.tsx')
process_file('frontend/src/pages/ModelMarketplace/ModelMarketplace.tsx')

print("Pages patched.")
