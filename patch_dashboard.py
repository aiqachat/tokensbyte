import re

with open('frontend/src/layouts/DashboardLayout.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Import useThemeStore
if 'useThemeStore' not in content:
    content = content.replace("import useAuthStore from '../store/auth';", "import useAuthStore from '../store/auth';\nimport { useThemeStore } from '../store/theme';")

# 2. Get themeMode in the component
if 'const { themeMode, toggleTheme } = useThemeStore();' not in content:
    content = content.replace("const { user, logout, setUser, isLoggedIn } = useAuthStore();", "const { user, logout, setUser, isLoggedIn } = useAuthStore();\n  const { themeMode, toggleTheme } = useThemeStore();")

# 3. Replace Sider theme="dark" with theme={themeMode}
content = content.replace('theme="dark"', 'theme={themeMode}')

# 4. Replace hardcoded colors
# For siderBg in ConfigProvider
content = content.replace("siderBg: '#141414',", "/* siderBg handled by global */")

# Header background
content = content.replace("background: '#141414',", "background: themeMode === 'light' ? '#ffffff' : '#141414',")

# Content background
content = content.replace("background: '#000',", "background: themeMode === 'light' ? '#f0f4f9' : '#000',")

# Text colors
content = content.replace("color: '#fff'", "color: themeMode === 'light' ? '#1f2937' : '#fff'")
content = content.replace("color: 'rgba(255,255,255,0.65)'", "color: themeMode === 'light' ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)'")

# Top right action buttons background hover
content = content.replace("background: 'rgba(255,255,255,0.12)'", "background: themeMode === 'light' ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.12)'")
content = content.replace("e.currentTarget.style.background = 'rgba(255,255,255,0.2)'", "e.currentTarget.style.background = themeMode === 'light' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.2)'")
content = content.replace("e.currentTarget.style.background = 'rgba(255,255,255,0.12)'", "e.currentTarget.style.background = themeMode === 'light' ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.12)'")

# Announcement background
content = content.replace("background: 'rgba(30, 30, 30, 0.45)'", "background: themeMode === 'light' ? 'rgba(255, 255, 255, 0.85)' : 'rgba(30, 30, 30, 0.45)'")
content = content.replace("border: '1px solid rgba(255,255,255,0.15)'", "border: themeMode === 'light' ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.15)'")

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

# Insert before GlobalOutlined
content = content.replace("<Dropdown menu={{ items: langItems }} placement=\"bottomRight\">", theme_button + "\n              <Dropdown menu={{ items: langItems }} placement=\"bottomRight\">")

with open('frontend/src/layouts/DashboardLayout.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Dashboard patched.")
