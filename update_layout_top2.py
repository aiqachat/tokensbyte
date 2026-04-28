import re

with open('frontend/src/pages/AdvancedMarketing/AdvancedMarketing.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Extract "Member Section: 我加入的团队"
start_str = '{/* Member Section: 我加入的团队 */}'
end_str = '</Col>\n      </Row>'

start_idx = content.find(start_str)
end_idx = content.find(end_str, start_idx)

if start_idx == -1 or end_idx == -1:
    print("Could not find Member Section")
    exit(1)

member_section_code = content[start_idx:end_idx].strip()

# Adjust the styling of member_section_code to match a horizontal top layout
member_section_code = member_section_code.replace('marginBottom: 16', 'marginBottom: 0')
member_section_code = member_section_code.replace('size="small"\n', '')

# Remove the old Member Section and the Col it was in.
# Wait, the Col start is `<Col xs={24} lg={6}>`
col_start_idx = content.rfind('<Col xs={24} lg={6}>', 0, start_idx)
content = content[:col_start_idx] + content[end_idx:]

# Change the tabs Col to full width
content = content.replace('<Col xs={24} lg={18}>', '<Col xs={24} lg={24}>')

# 2. Extract and modify the Stats Cards
stats_start_str = '{/* Stats Cards */}'
stats_end_str = '</Row>\n\n\n      <Row gutter={[24, 24]}>'
stats_start_idx = content.find(stats_start_str)
stats_end_idx = content.find(stats_end_str, stats_start_idx) + len('</Row>')

if stats_start_idx == -1 or stats_end_idx == -1:
    # Maybe the newlines are different
    stats_end_idx = content.find('</Row>', stats_start_idx) + len('</Row>')

stats_old_code = content[stats_start_idx:stats_end_idx]

# We want to replace the Stats Cards with a new combined layout
new_stats_layout = f'''      {{/* 顶部区域: 我加入的团队 & 统计卡片 */}}
      <Row gutter={{[16, 16]}} style={{{{ marginBottom: 24 }}}}>
        {{memberOnlyTeams.length > 0 && (
          <Col xs={{24}} lg={{12}}>
{member_section_code}
          </Col>
        )}}
        
        <Col xs={{24}} lg={{memberOnlyTeams.length > 0 ? 12 : 24}}>
          <Row gutter={{[16, 16]}}>
            <Col xs={{12}}>
              <Card style={{{{
                borderRadius: 12,
                background: 'linear-gradient(135deg, rgba(22,119,255,0.15) 0%, rgba(22,119,255,0.05) 100%)',
                border: '1px solid rgba(22,119,255,0.2)',
                height: '100%'
              }}}}>
                <Statistic
                  title={{<span style={{{{ color: 'rgba(255,255,255,0.65)' }}}}>活跃 / 推荐用户</span>}}
                  value={{activeReferrals}}
                  styles={{{{ content: {{ color: '#1677ff', fontSize: 28, fontWeight: 'bold' }} }}}}
                  prefix={{<TeamOutlined />}}
                  suffix={{<span style={{{{ fontSize: 14, color: 'rgba(255,255,255,0.35)' }}}}>/ {{totalReferrals}}</span>}}
                />
              </Card>
            </Col>
            <Col xs={{12}}>
              <Card style={{{{
                borderRadius: 12,
                background: 'linear-gradient(135deg, rgba(82,196,26,0.15) 0%, rgba(82,196,26,0.05) 100%)',
                border: '1px solid rgba(82,196,26,0.2)',
                height: '100%'
              }}}}>
                <Statistic
                  title={{<span style={{{{ color: 'rgba(255,255,255,0.65)' }}}}>累计充值</span>}}
                  value={{totalRecharge}}
                  precision={{2}}
                  prefix={{currencySymbol}}
                  styles={{{{ content: {{ color: '#52c41a', fontSize: 28, fontWeight: 'bold' }} }}}}
                />
              </Card>
            </Col>
          </Row>
        </Col>
      </Row>'''

# Combine
final_content = content[:stats_start_idx] + new_stats_layout + content[stats_end_idx:]

with open('frontend/src/pages/AdvancedMarketing/AdvancedMarketing.tsx', 'w', encoding='utf-8') as f:
    f.write(final_content)

print("Layout successfully combined and replaced.")
