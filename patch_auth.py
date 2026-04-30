import re

with open('frontend/src/layouts/AuthLayout.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Import useThemeStore
if 'useThemeStore' not in content:
    content = content.replace("import useSettingsStore from '../store/settings';", "import useSettingsStore from '../store/settings';\nimport { useThemeStore } from '../store/theme';")

# 2. Get themeMode in the component
if 'const { themeMode, toggleTheme } = useThemeStore();' not in content:
    content = content.replace("const { settings } = useSettingsStore();", "const { settings } = useSettingsStore();\n  const { themeMode, toggleTheme } = useThemeStore();")

# 3. Replace hardcoded ConfigProvider wrappers
# AuthLayout.tsx has <ConfigProvider theme={{ algorithm: theme.darkAlgorithm }}>
# Let's completely remove it because AppThemeProvider already wraps AuthLayout from main.tsx > App.tsx.
# Or if it doesn't, we can just replace algorithm: theme.darkAlgorithm with nothing, which we did earlier.
# Wait, let's remove the nested ConfigProvider entirely to avoid local theme overrides if empty.
# Actually, empty ConfigProvider is harmless.

# 4. Replace hardcoded colors
content = content.replace("background: '#000'", "background: themeMode === 'light' ? '#f0f4f9' : '#000'")
content = content.replace("background: '#141414'", "background: themeMode === 'light' ? '#ffffff' : '#141414'")
content = content.replace("color: '#fff'", "color: themeMode === 'light' ? '#1f2937' : '#fff'")
content = content.replace("borderColor: '#303030'", "borderColor: themeMode === 'light' ? '#e5e7eb' : '#303030'")

# 5. Add Theme Toggle Button
theme_button = """
          <Tooltip title={themeMode === 'light' ? '切换暗色模式' : '切换亮色模式'} placement="bottom">
            <Button 
              type="text" 
              shape="circle" 
              onClick={toggleTheme}
              icon={
                themeMode === 'light' 
                ? <span style={{fontSize: 18}}>🌙</span> 
                : <span style={{fontSize: 18}}>☀️</span>
              } 
              style={{ color: themeMode === 'light' ? '#1f2937' : '#fff', width: 42, height: 42 }} 
            />
          </Tooltip>
"""

content = content.replace("<Dropdown menu={{ items: langItems }} placement=\"bottomRight\">", theme_button + "\n          <Dropdown menu={{ items: langItems }} placement=\"bottomRight\">")

with open('frontend/src/layouts/AuthLayout.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("AuthLayout patched.")
