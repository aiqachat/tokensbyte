import re

with open('frontend/src/pages/ModelMarketplace/ModelMarketplace.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix getBillingLabel
content = content.replace("case 'token':", "case 'tokens':")
content = content.replace("case 'fixed':", "case 'requests':")

# Fix conditions
content = content.replace("billing_type === 'token'", "billing_type === 'tokens'")
content = content.replace("billing_type === 'fixed'", "billing_type === 'requests'")

# Add currency symbol state
if "const [siteName, setSiteName]" in content and "currencySymbol" not in content:
    content = content.replace(
        "const [siteName, setSiteName] = useState<string>('TokensByte');",
        "const [siteName, setSiteName] = useState<string>('TokensByte');\n  const [currencySymbol, setCurrencySymbol] = useState<string>('¥');"
    )

# Set currency symbol
if "setSiteName(settingsRes.site.name);" in content:
    content = content.replace(
        "if (settingsRes.site.logo) setSiteLogo(settingsRes.site.logo);\n      }",
        "if (settingsRes.site.logo) setSiteLogo(settingsRes.site.logo);\n      }\n      if (settingsRes?.currency?.currency_symbol) {\n        setCurrencySymbol(settingsRes.currency.currency_symbol);\n      }"
    )

# Replace ¥ with {currencySymbol}
content = content.replace("¥{selectedModel.billing.prompt_rate", "{currencySymbol}{selectedModel.billing.prompt_rate")
content = content.replace("¥{selectedModel.billing.completion_rate", "{currencySymbol}{selectedModel.billing.completion_rate")
content = content.replace("¥{selectedModel.billing.fixed_rate", "{currencySymbol}{selectedModel.billing.fixed_rate")
content = content.replace("¥{selectedModel.billing.duration_rate", "{currencySymbol}{selectedModel.billing.duration_rate")
content = content.replace("¥{t.prompt_rate}", "{currencySymbol}{t.prompt_rate}")
content = content.replace("¥{t.completion_rate}", "{currencySymbol}{t.completion_rate}")

with open('frontend/src/pages/ModelMarketplace/ModelMarketplace.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Successfully patched billing display.")
