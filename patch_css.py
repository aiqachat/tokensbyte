import re

with open('frontend/src/index.css', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace prefers-color-scheme with class based approach
content = content.replace("@media (prefers-color-scheme: dark) {", "body[data-theme='dark'] {")
content = content.replace("  :root {", "  ")

# We need to format the nested blocks inside the body[data-theme='dark'] { block
# It's easier to just do it via regex
content = re.sub(r'body\[data-theme=\'dark\'\] \{\s*--text', 'body[data-theme=\'dark\'] {\n  --text', content)

# But wait, there is also:
#  #social .button-icon {
#    filter: invert(1) brightness(2);
#  }
# inside the media query.
# Let's write the CSS manually to be safe.
