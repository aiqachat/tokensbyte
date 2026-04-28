import re

with open('frontend/src/pages/AdvancedMarketing/AdvancedMarketing.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add EditOutlined to imports
content = content.replace('TrophyOutlined } from \'@ant-design/icons\';', 'TrophyOutlined, EditOutlined } from \'@ant-design/icons\';')

# 2. Add Input to antd imports
if 'Input,' not in content and ' Input ' not in content:
    content = content.replace('Tabs } from \'antd\';', 'Tabs, Input } from \'antd\';')

# 3. Add state variables
state_vars = '''  // Remark
  const [remarkModalVisible, setRemarkModalVisible] = useState(false);
  const [remarkTargetUser, setRemarkTargetUser] = useState<any>(null);
  const [editingRemark, setEditingRemark] = useState('');
  const [settingRemark, setSettingRemark] = useState(false);'''

content = content.replace('  // Team leader level assignment (for members)', state_vars + '\n\n  // Team leader level assignment (for members)')

# 4. Add handlers
handlers = '''  const openRemarkModal = (user: any) => {
    setRemarkTargetUser(user);
    setEditingRemark(user.remark || '');
    setRemarkModalVisible(true);
  };

  const handleSetRemark = async () => {
    if (!remarkTargetUser) return;
    try {
      setSettingRemark(true);
      await (request.put(`/team-marketing/referral/${remarkTargetUser.id}/remark`, {
        remark: editingRemark || null,
      }) as any);
      message.success('备注修改成功');
      setRemarkModalVisible(false);
      fetchReferrals();
    } catch (e: any) {
      message.error(e?.response?.data?.error?.message || '设置备注失败');
    } finally {
      setSettingRemark(false);
    }
  };'''

content = content.replace('  // Stats', handlers + '\n\n  // Stats')

# 5. Add Remark column
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

# Insert it after the email column
content = content.replace('''    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email',
      ellipsis: true,
      render: (email: string) => <Text style={{ fontSize: 13 }}>{email}</Text>,
    },''', '''    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email',
      ellipsis: true,
      render: (email: string) => <Text style={{ fontSize: 13 }}>{email}</Text>,
    },
''' + remark_col)

# 6. Add Modal
remark_modal = '''      {/* Set Remark Modal */}
      <Modal
        title={
          <Space>
            <EditOutlined style={{ color: '#1677ff' }} />
            <span>修改备注</span>
          </Space>
        }
        open={remarkModalVisible}
        onCancel={() => setRemarkModalVisible(false)}
        onOk={handleSetRemark}
        confirmLoading={settingRemark}
        okText="保存"
        width={400}
      >
        <div style={{ padding: '16px 0' }}>
          <div style={{ marginBottom: 16 }}>
            <Text type="secondary">正在为 {remarkTargetUser?.username} 设置备注：</Text>
          </div>
          <Input.TextArea
            value={editingRemark}
            onChange={e => setEditingRemark(e.target.value)}
            placeholder="请输入备注内容，例如：XX公司大客户"
            autoSize={{ minRows: 3, maxRows: 5 }}
            maxLength={200}
            showCount
          />
        </div>
      </Modal>'''

content = content.replace('      {/* Set Level Modal */}', remark_modal + '\n\n      {/* Set Level Modal */}')

with open('frontend/src/pages/AdvancedMarketing/AdvancedMarketing.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Frontend updated.")
