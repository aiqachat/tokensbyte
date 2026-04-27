import re

with open('frontend/src/pages/AdvancedMarketing/AdvancedMarketing.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Extract "Member Section: 我加入的团队"
member_section_start = content.find('{/* Member Section: 我加入的团队 */}')
# Find the end of this section:
member_section_end = content.find('</Col>', member_section_start)
if member_section_start == -1 or member_section_end == -1:
    print("Could not find member section.")
    exit(1)

member_section_jsx = content[member_section_start:member_section_end].strip()

# Remove it from its original place (and the enclosing `<Col xs={24} lg={6}>` since it's the only thing there now)
col_start = content.rfind('<Col xs={24} lg={6}>', 0, member_section_start)
new_content = content[:col_start] + content[member_section_end + len('</Col>'):]

# Also change `<Col xs={24} lg={18}>` to `<Col xs={24} lg={24}>`
new_content = new_content.replace('<Col xs={24} lg={18}>', '<Col xs={24} lg={24}>')

# Fix formatting if member_section_jsx ends with something we didn't want
# Wait, member_section_jsx is just the Card. Let's make sure it's correct.
# Actually, it's safer to extract the exact Card.
card_start = content.find('{memberOnlyTeams.length > 0 && (', member_section_start)
# we can balance brackets to find the end of this condition, but it's simpler:
card_end = content.find(')}', card_start) + 2
# Wait, the card contains inner divs which also have `)}`.
# Let's extract between `{/* Member Section: 我加入的团队 */}` and `</Col>`
# wait, `</Col>` is at line 730+.
