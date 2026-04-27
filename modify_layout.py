import re

with open('frontend/src/pages/AdvancedMarketing/AdvancedMarketing.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# We need to find the start of the layout:
# It starts right after `<Row gutter={[16, 16]} style={{ marginBottom: 24 }}>` 's closing `</Row>`
# Let's find: `      </Row>\n\n      {/* My Personal Invite Link */}`

parts = content.split('      </Row>\n\n      {/* My Personal Invite Link */}')
if len(parts) != 2:
    print("Could not split at </Row>")
    exit(1)

top_part = parts[0] + '      </Row>\n\n'
rest = '      {/* My Personal Invite Link */}' + parts[1]

# Now we need to find the end of the layout we want to change.
# It ends right before `{/* Set Level Modal */}`
parts2 = rest.split('      {/* Set Level Modal */}')
if len(parts2) != 2:
    print("Could not split at {/* Set Level Modal */}")
    exit(1)

middle_part = parts2[0]
bottom_part = '      {/* Set Level Modal */}' + parts2[1]

# Now `middle_part` contains the Invite Link Card, Team Leader Section Card, Member Section Card, and My Referrals Table Card.
# Let's extract the JSX of each card.
# Invite Link Card
invite_link_start = middle_part.find('{/* My Personal Invite Link */}')
team_leader_start = middle_part.find('{/* Team Leader Section */}')
member_section_start = middle_part.find('{/* Member Section: 我加入的团队 */}')
referrals_table_start = middle_part.find('{/* My Referrals Table */}')

invite_link_jsx = middle_part[invite_link_start:team_leader_start].strip()
team_leader_jsx = middle_part[team_leader_start:member_section_start].strip()
member_section_jsx = middle_part[member_section_start:referrals_table_start].strip()
referrals_table_jsx = middle_part[referrals_table_start:].strip()

# Adjust the Invite Link Card styles to fit a small column
invite_link_jsx = invite_link_jsx.replace(
    '''        style={{
          marginBottom: 24,
          borderRadius: 12,
          background: '#141414',
          border: '1px solid rgba(82,196,26,0.2)',
        }}''',
    '''        style={{
          marginBottom: 16,
          borderRadius: 12,
          background: '#141414',
          border: '1px solid rgba(82,196,26,0.2)',
        }}
        size="small"'''
)

# Replace the text inside invite link to make it more compact
invite_link_jsx = invite_link_jsx.replace(
    '<Text style={{ color: \'rgba(255,255,255,0.55)\', display: \'block\', marginBottom: 12, fontSize: 13 }}>\n          分享您的专属推广链接，通过此链接注册的用户将成为您的推荐下级。\n        </Text>',
    '<Text style={{ color: \'rgba(255,255,255,0.55)\', display: \'block\', marginBottom: 12, fontSize: 12 }}>\n          分享此链接，注册用户将成为您的推荐下级。\n        </Text>'
)

# Adjust Member Section Card to fit a small column
member_section_jsx = member_section_jsx.replace(
    '''        <Card
          style={{
            marginBottom: 24,
            borderRadius: 12,
            background: '#141414',
            border: '1px solid rgba(22,119,255,0.2)',
          }}''',
    '''        <Card
          style={{
            marginBottom: 16,
            borderRadius: 12,
            background: '#141414',
            border: '1px solid rgba(22,119,255,0.2)',
          }}
          size="small"'''
)

# Remove the Card wrapper from Team Leader Section and Referrals Table since they will be inside Tabs
team_leader_inner = team_leader_jsx.replace('{teamData?.is_leader && teamData.teams?.length > 0 && (\n        <Card', '{teamData?.is_leader && teamData.teams?.length > 0 && (\n        <div')
team_leader_inner = team_leader_inner.replace('</Card>\n      )}', '</div>\n      )}')
team_leader_inner = re.sub(r'''\s*style={{[\s\S]*?}}\n\s*title={[\s\S]*?}\n\s*headStyle={{[\s\S]*?}}\n\s*>''', '>', team_leader_inner, count=1)

referrals_table_inner = referrals_table_jsx.replace('{/* My Referrals Table */}\n      <Card', '{/* My Referrals Table */}\n      <div')
referrals_table_inner = referrals_table_inner.replace('locale={{ emptyText: \'暂无推荐用户\' }}\n        />\n      </Card>', 'locale={{ emptyText: \'暂无推荐用户\' }}\n        />\n      </div>')
referrals_table_inner = re.sub(r'''\s*style={{[\s\S]*?}}\n\s*title={[\s\S]*?}\n\s*headStyle={{[\s\S]*?}}\n\s*>''', '>', referrals_table_inner, count=1)


new_layout = f'''
      <Row gutter={[24, 24]}>
        <Col xs={{24}} lg={{18}}>
          <Card
            style={{{{ borderRadius: 12, background: '#141414', border: '1px solid rgba(255,255,255,0.08)' }}}}
            bodyStyle={{{{ padding: '0 16px 16px' }}}}
          >
            <Tabs 
              defaultActiveKey="1"
              items={{[
                {{
                  key: '1',
                  label: <span><UserOutlined /> 我的推荐用户 <Tag style={{{{ margin: '0 0 0 8px', borderRadius: 10, background: 'rgba(22,119,255,0.1)', border: '1px solid rgba(22,119,255,0.2)', color: '#1677ff' }}}}>{{totalReferrals}} 人</Tag></span>,
                  children: (
                    <div style={{{{ paddingTop: 8 }}}}>
{referrals_table_inner}
                    </div>
                  )
                }},
                teamData?.is_leader && teamData.teams?.length > 0 ? {{
                  key: '2',
                  label: <span><CrownOutlined /> 我管理的团队</span>,
                  children: (
                    <div style={{{{ paddingTop: 8 }}}}>
{team_leader_inner}
                    </div>
                  )
                }} : null
              ].filter(Boolean) as any}}
            />
          </Card>
        </Col>

        <Col xs={{24}} lg={{6}}>
{invite_link_jsx}

{member_section_jsx}
        </Col>
      </Row>

'''

with open('frontend/src/pages/AdvancedMarketing/AdvancedMarketing.tsx', 'w', encoding='utf-8') as f:
    f.write(top_part + new_layout + bottom_part)

print("Layout updated successfully.")
