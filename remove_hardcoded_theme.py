import re
import os

files_to_check = [
    'frontend/src/layouts/AuthLayout.tsx',
    'frontend/src/layouts/DashboardLayout.tsx',
    'frontend/src/pages/Playground/Playground.tsx',
    'frontend/src/pages/Playground/PlaygroundHome.tsx',
    'frontend/src/pages/ModelMarketplace/ModelMarketplace.tsx',
    'frontend/src/pages/Legal/LegalPage.tsx',
    'frontend/src/pages/AdminLogin/AdminLogin.tsx'
]

for filepath in files_to_check:
    if not os.path.exists(filepath):
        continue
        
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
        
    # We want to remove the specific <ConfigProvider theme={...}> wrapper 
    # but some components might just use <ConfigProvider> for things like locale or menu item height.
    # Actually, if they use ConfigProvider ONLY for `theme={{ algorithm: theme.darkAlgorithm }}`, we can remove it.
    
    # In AuthLayout.tsx:
    # <ConfigProvider theme={{ algorithm: theme.darkAlgorithm }}>
    # ...
    # </ConfigProvider>
    
    # Replace ConfigProvider wrapper with <>...</> or just remove if it's the root return.
    
    # Since writing reliable regex for nested JSX tags is hard, let's use a simpler approach:
    # Just delete `theme={{ algorithm: theme.darkAlgorithm }}` or `algorithm: theme.darkAlgorithm`
    
    content = re.sub(r'algorithm:\s*theme\.darkAlgorithm,?', '', content)
    
    # In ModelMarketplace.tsx, it might be:
    # <ConfigProvider theme={{ algorithm: theme.darkAlgorithm }}>
    content = re.sub(r'algorithm:\s*theme\.darkAlgorithm\s*\}', '}', content)
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

print("Removed darkAlgorithm hardcodes.")
