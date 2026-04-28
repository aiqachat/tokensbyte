import re

with open('frontend/src/pages/ModelMarketplace/ModelMarketplace.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# The block to move
# It starts at: <div style={{ background: 'linear-gradient(135deg, #1677ff 0%, #0958d9 100%)'
# Ends at: </div> right before <div style={{ background: '#161b22', border: '1px solid #21262d', borderRadius: 16, padding: '20px' }}>

start_str = "<div style={{ background: 'linear-gradient(135deg, #1677ff 0%, #0958d9 100%)'"
end_str = "                      ) : (\n                        <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 15 }}>暂未配置计费规则，该模型当前可能为免费使用或不可用。</div>\n                      )}\n                    </div>"

start_idx = content.find(start_str)
end_idx = content.find(end_str) + len(end_str)

if start_idx == -1 or content.find(end_str) == -1:
    print("Could not find the block to move.")
    exit(1)

block_to_move = content[start_idx:end_idx]

# Remove the block from its current location
content = content[:start_idx] + content[end_idx:]

# Find where to insert it: right after </Descriptions>
insert_target = "</Descriptions>"
insert_idx = content.find(insert_target) + len(insert_target)

if content.find(insert_target) == -1:
    print("Could not find </Descriptions>")
    exit(1)

# Add a wrapper or some margin if needed
inserted_block = "\n\n                    <div style={{ marginTop: 40 }}>\n                      " + block_to_move.replace("\n", "\n                      ") + "\n                    </div>"

content = content[:insert_idx] + inserted_block + content[insert_idx:]

with open('frontend/src/pages/ModelMarketplace/ModelMarketplace.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Successfully moved the detailed billing rules block.")
