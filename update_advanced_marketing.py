import re

with open('frontend/src/pages/AdvancedMarketing/AdvancedMarketing.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Import Grid
if 'Grid' not in content:
    content = content.replace('Tabs, Input } from \'antd\';', 'Tabs, Input, Grid, List } from \'antd\';')

# 2. Add isMobile
if 'const screens = Grid.useBreakpoint();' not in content:
    content = content.replace('const [settingRemark, setSettingRemark] = useState(false);', '''const [settingRemark, setSettingRemark] = useState(false);
  const screens = Grid.useBreakpoint();
  const isMobile = screens.md === false;''')

# 3. Update columns
# Find username column
old_username = '''    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
      render: (username: string, record: ReferralUser) => (
        <div>
          <Text strong style={{ color: '#fff', display: 'block', lineHeight: 1.3 }}>{username}</Text>
          <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11 }}>UID: {record.uid}</Text>
        </div>
      ),
    },'''
new_username = '''    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
      render: (username: string, record: ReferralUser) => (
        <div>
          <Text strong style={{ color: '#fff', display: 'block', lineHeight: 1.3 }}>{username}</Text>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
            <Text style={{ fontSize: 12, color: record.remark ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.25)' }}>
              {record.remark || '暂无备注'}
            </Text>
            <Tooltip title="修改备注">
              <Button
                type="text"
                size="small"
                icon={<EditOutlined style={{ color: '#1677ff', fontSize: 12 }} />}
                onClick={(e) => { e.stopPropagation(); openRemarkModal(record); }}
                style={{ padding: 0, minWidth: 20, height: 20 }}
              />
            </Tooltip>
          </div>
        </div>
      ),
    },'''
content = content.replace(old_username, new_username)

# Find email column
old_email = '''    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email',
      ellipsis: true,
      render: (email: string) => <Text style={{ fontSize: 13 }}>{email}</Text>,
    },'''
new_email = '''    {
      title: '详细信息',
      dataIndex: 'email',
      key: 'email',
      ellipsis: true,
      render: (email: string, record: ReferralUser) => (
        <div>
          <Text style={{ fontSize: 13, display: 'block' }}>{email}</Text>
          <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11 }}>UID: {record.uid}</Text>
        </div>
      ),
    },'''
content = content.replace(old_email, new_email)

# Remove remark column
remark_col = '''    {
      title: '备注',
      dataIndex: 'remark',
      key: 'remark',
      ellipsis: true,
      render: (text: string, record: any) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Text style={{ fontSize: 13, color: text ? '#fff' : 'rgba(255,255,255,0.25)' }}>
            {text || '暂无备注'}
          </Text>
          <Tooltip title="修改备注">
            <Button
              type="text"
              size="small"
              icon={<EditOutlined style={{ color: '#1677ff', fontSize: 12 }} />}
              onClick={() => openRemarkModal(record)}
              style={{ padding: 0, minWidth: 20, height: 20 }}
            />
          </Tooltip>
        </div>
      ),
    },'''
content = content.replace(remark_col, '')


# 4. Modify Table rendering to conditionally render List on mobile
old_table = '''        <Table
          dataSource={referrals}
          columns={columns}
          rowKey="id"
          loading={loading}
          size="small"
          pagination={{ pageSize: 15, showSizeChanger: true }}
          expandable={{
            expandedRowRender: (record) => {
              const recharges = expandedRecharges[record.id];
              const isLoading = loadingRecharges[record.id];

              if (isLoading || !recharges) {
                return <div style={{ padding: 16, textAlign: 'center' }}><Spin size="small" /></div>;
              }

              if (recharges.length === 0) {
                return (
                  <div style={{ padding: 16, textAlign: 'center' }}>
                    <Text type="secondary">该用户暂无充值记录</Text>
                  </div>
                );
              }

              return (
                <div style={{ padding: '8px 16px', background: '#1a1a1a', borderRadius: 8 }}>
                  <Text strong style={{ color: '#1677ff', display: 'block', marginBottom: 12, fontSize: 13 }}>
                    <DollarOutlined style={{ marginRight: 4 }} />
                    {record.username} 的充值明细（共 {recharges.length} 条）
                  </Text>
                  <Table
                    dataSource={recharges}
                    columns={rechargeColumns}
                    rowKey="id"
                    size="small"
                    pagination={false}
                  />
                </div>
              );
            },
            onExpand: (expanded, record) => {
              if (expanded) fetchRecharges(record.id);
            },
          }}
          locale={{ emptyText: '暂无推荐用户' }}
        />'''

new_table_logic = '''        {isMobile ? (
          <List
            dataSource={referrals}
            loading={loading}
            pagination={{ pageSize: 10 }}
            locale={{ emptyText: '暂无推荐用户' }}
            renderItem={record => (
              <Card size="small" style={{ marginBottom: 12, borderRadius: 8, background: '#141414', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Text strong style={{ fontSize: 15, color: '#fff' }}>{record.username}</Text>
                  {record.is_active === 1 ? <Tag color="success" style={{ margin: 0 }}>活跃</Tag> : <Tag color="default" style={{ margin: 0 }}>停用</Tag>}
                </div>
                <div style={{ marginBottom: 12 }}>
                  <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', display: 'block' }}>{record.email}</Text>
                  <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>UID: {record.uid}</Text>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 12, padding: '8px', background: 'rgba(255,255,255,0.02)', borderRadius: 6 }}>
                  <Text style={{ fontSize: 12, color: record.remark ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.35)', flex: 1 }}>
                    {record.remark || '暂无备注'}
                  </Text>
                  <Button type="text" size="small" icon={<EditOutlined style={{ color: '#1677ff' }} />} onClick={() => openRemarkModal(record)} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <Tag color="blue" style={{ margin: 0 }}>{record.level_name || record.user_group}</Tag>
                  <div style={{ textAlign: 'right' }}>
                    <Text style={{ fontSize: 12, display: 'block', color: 'rgba(255,255,255,0.65)' }}>余额: <span style={{ color: '#fff', fontWeight: 500 }}>{currencySymbol}{(record.balance || 0).toFixed(2)}</span></Text>
                    <Text style={{ fontSize: 12, display: 'block', color: 'rgba(255,255,255,0.65)' }}>总充值: <span style={{ color: '#52c41a', fontWeight: 500 }}>{currencySymbol}{(record.total_recharge || 0).toFixed(2)}</span></Text>
                  </div>
                </div>
                
                {/* Expand Recharges Mobile */}
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12 }}>
                  <Button 
                    type="link" 
                    size="small" 
                    style={{ padding: 0, width: '100%', textAlign: 'center' }}
                    onClick={() => {
                      if (!expandedRecharges[record.id]) fetchRecharges(record.id);
                      else setExpandedRecharges(prev => ({...prev, [record.id]: null as any}));
                    }}
                  >
                    {expandedRecharges[record.id] ? '收起充值明细' : '查看充值明细'}
                  </Button>
                  
                  {expandedRecharges[record.id] && (
                    <div style={{ marginTop: 12, padding: 8, background: '#000', borderRadius: 8 }}>
                      {loadingRecharges[record.id] ? (
                        <div style={{ textAlign: 'center', padding: 12 }}><Spin size="small" /></div>
                      ) : expandedRecharges[record.id].length === 0 ? (
                        <Text type="secondary" style={{ display: 'block', textAlign: 'center', fontSize: 12, padding: 8 }}>暂无记录</Text>
                      ) : (
                        <List
                          size="small"
                          dataSource={expandedRecharges[record.id]}
                          renderItem={(r: any) => (
                            <List.Item style={{ padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                              <div style={{ width: '100%' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                  <Text style={{ color: r.amount > 0 ? '#52c41a' : '#ff4d4f', fontWeight: 'bold' }}>
                                    {r.amount > 0 ? '+' : ''}{currencySymbol}{Math.abs(r.amount).toFixed(2)}
                                  </Text>
                                  <Text type="secondary" style={{ fontSize: 12 }}>{r.recharge_type}</Text>
                                </div>
                                <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>{r.created_at}</Text>
                              </div>
                            </List.Item>
                          )}
                        />
                      )}
                    </div>
                  )}
                </div>
              </Card>
            )}
          />
        ) : (
''' + old_table + '''
        )}'''

content = content.replace(old_table, new_table_logic)

with open('frontend/src/pages/AdvancedMarketing/AdvancedMarketing.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Frontend updated successfully.")
