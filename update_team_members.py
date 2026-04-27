import re

with open('frontend/src/pages/AdvancedMarketing/AdvancedMarketing.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Find the Table for team members
table_start = content.find('<Table\n                dataSource={team.members}')
if table_start != -1:
    # Find the end of this Table
    table_end = content.find('/>\n            </div>\n          ))}', table_start)
    if table_end != -1:
        table_code = content[table_start:table_end + 2]
        
        new_mobile_logic = '''{isMobile ? (
                <List
                  dataSource={team.members}
                  pagination={false}
                  locale={{ emptyText: '暂无团队成员' }}
                  renderItem={(record: any) => (
                    <Card size="small" style={{ marginBottom: 12, borderRadius: 8, background: '#141414', border: '1px solid rgba(255,255,255,0.08)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                        <Text strong style={{ fontSize: 15, color: '#fff' }}>{record.username}</Text>
                        <Tag style={{ margin: 0, borderRadius: 4, background: 'rgba(22,119,255,0.1)', border: '1px solid rgba(22,119,255,0.2)', color: '#1677ff' }}>
                          {record.level_name || record.user_group || 'default'}
                        </Tag>
                      </div>
                      <div style={{ marginBottom: 12 }}>
                        <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>UID: {record.uid}</Text>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <div>
                          <Text style={{ fontSize: 12, display: 'block', color: 'rgba(255,255,255,0.65)' }}>推荐人数: <span style={{ color: '#fff', fontWeight: 500 }}>{record.referred_count}</span></Text>
                          <Text style={{ fontSize: 12, display: 'block', color: 'rgba(255,255,255,0.65)' }}>推荐充值: <span style={{ color: '#52c41a', fontWeight: 500 }}>{currencySymbol}{(record.total_recharge_from_referrals || 0).toFixed(2)}</span></Text>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <Text style={{ fontSize: 12, display: 'block', color: 'rgba(255,255,255,0.65)' }}>余额: <span style={{ color: '#fff', fontWeight: 500 }}>{currencySymbol}{(record.balance || 0).toFixed(2)}</span></Text>
                          <Text style={{ fontSize: 12, display: 'block', color: 'rgba(255,255,255,0.65)' }}>总充值: <span style={{ color: '#52c41a', fontWeight: 500 }}>{currencySymbol}{(record.total_recharge || 0).toFixed(2)}</span></Text>
                        </div>
                      </div>
                      {allowedMemberLevels.length > 0 && (
                        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12, textAlign: 'center' }}>
                          <Button
                            type="link"
                            size="small"
                            icon={<TrophyOutlined />}
                            onClick={() => openMemberLevelModal(record)}
                            style={{ color: '#faad14', padding: 0 }}
                          >
                            设置等级
                          </Button>
                        </div>
                      )}
                    </Card>
                  )}
                />
              ) : (
                ''' + table_code + '''
              )}'''
        
        content = content[:table_start] + new_mobile_logic + content[table_end + 2:]
        
        with open('frontend/src/pages/AdvancedMarketing/AdvancedMarketing.tsx', 'w', encoding='utf-8') as f:
            f.write(content)
        print("Successfully updated team members mobile logic.")
    else:
        print("Could not find the end of the Table.")
else:
    print("Could not find the Table.")
