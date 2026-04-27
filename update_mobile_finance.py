import re

def update_file(filepath, list_render_code):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Add Grid, List to antd imports
    if 'Grid' not in content:
        content = content.replace("from 'antd';", ", Grid, List } from 'antd';")
        content = content.replace("} from 'antd';", "from 'antd';") # fix if it became ,, Grid
        # Actually a safer way:
        content = re.sub(r"import \{(.*?)\} from 'antd';", lambda m: f"import {{{m.group(1)}, Grid, List}} from 'antd';" if 'Grid' not in m.group(1) else m.group(0), content)

    # Add screens hook
    if 'const screens = Grid.useBreakpoint();' not in content:
        hook_insert_str = "  const { t } = useTranslation();\n  const screens = Grid.useBreakpoint();"
        content = content.replace("  const { t } = useTranslation();", hook_insert_str)

    # Replace <Table ... /> with conditional render
    table_regex = re.compile(r'(<Table\s+dataSource=\{data\}.*?/>)', re.DOTALL)
    
    match = table_regex.search(content)
    if not match:
        print(f"Could not find Table in {filepath}")
        return
        
    table_code = match.group(1)
    
    new_code = f"{{screens.xs ? (\n{list_render_code}\n      ) : (\n        {table_code}\n      )}}"
    
    content = content[:match.start()] + new_code + content[match.end():]

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)


order_list_code = """        <List
          dataSource={data}
          loading={loading}
          pagination={{
            total,
            current: page,
            pageSize,
            onChange: (p, s) => {
              setPage(p);
              setPageSize(s);
            },
            showSizeChanger: true,
            size: "small",
            showTotal: (t) => `共 ${t} 条`
          }}
          renderItem={(record) => {
            const statusInfo = statusMap[record.status] || { color: 'default', label: record.status };
            const methodInfo = methodMap[record.payment_method] || { color: 'default', label: record.payment_method };
            return (
              <List.Item style={{ padding: '0 0 16px 0', border: 'none' }}>
                <Card 
                  size="small" 
                  style={{ width: '100%', borderRadius: 8, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
                  title={<Text strong>{record.username}</Text>}
                  extra={<Tag color={statusInfo.color}>{statusInfo.label}</Tag>}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>订单号</Text>
                    <Text copyable style={{ fontFamily: 'monospace', fontSize: 12 }}>{record.out_trade_no}</Text>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>UID</Text>
                    <Text style={{ fontSize: 12 }}>{record.uid}</Text>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>支付方式</Text>
                    <Tag color={methodInfo.color} style={{ margin: 0 }}>{methodInfo.label}</Tag>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>金额</Text>
                    <Text strong style={{ color: '#ff4d4f' }}>¥ {record.amount.toFixed(2)}</Text>
                  </div>
                  {record.trade_no && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>第三方交易号</Text>
                      <Text copyable style={{ fontFamily: 'monospace', fontSize: 12 }}>{record.trade_no}</Text>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>创建时间</Text>
                    <Text style={{ fontSize: 12 }}>{dayjs(record.created_at).format('YYYY-MM-DD HH:mm:ss')}</Text>
                  </div>
                  {record.paid_at && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 0 }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>支付时间</Text>
                      <Text style={{ fontSize: 12 }}>{dayjs(record.paid_at).format('YYYY-MM-DD HH:mm:ss')}</Text>
                    </div>
                  )}
                </Card>
              </List.Item>
            );
          }}
        />"""

recharge_list_code = """        <List
          dataSource={data}
          loading={loading}
          pagination={{
            total,
            current: page,
            pageSize,
            pageSizeOptions: ['50', '100', '200'],
            onChange: (p, s) => {
              setPage(p);
              setPageSize(s);
            },
            showSizeChanger: true,
            size: "small"
          }}
          renderItem={(record) => {
            let color = 'default';
            if (record.recharge_type === 'registration') color = 'magenta';
            if (record.recharge_type === 'manual') color = 'orange';
            if (record.recharge_type === 'redemption') color = 'blue';
            const label = t(`finance.recharge_type_${record.recharge_type}`) || t('finance.recharge_type_other');

            return (
              <List.Item style={{ padding: '0 0 16px 0', border: 'none' }}>
                <Card 
                  size="small" 
                  style={{ width: '100%', borderRadius: 8, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
                  title={<Text strong>{record.username}</Text>}
                  extra={<Tag color={color}>{label}</Tag>}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>UID</Text>
                    <Text style={{ fontSize: 12 }}>{record.uid}</Text>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>金额</Text>
                    <Text strong style={{ color: record.amount >= 0 ? '#52c41a' : '#ff4d4f' }}>
                      {record.amount >= 0 ? '+' : '-'}{currencySymbol}{Math.abs(record.amount).toFixed(2)}
                    </Text>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>时间</Text>
                    <Text style={{ fontSize: 12 }}>{dayjs(record.created_at).format('YYYY-MM-DD HH:mm:ss')}</Text>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 0 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>备注</Text>
                    <Text style={{ fontSize: 12, wordBreak: 'break-all', maxWidth: '60%', textAlign: 'right' }}>{record.remark || '-'}</Text>
                  </div>
                </Card>
              </List.Item>
            );
          }}
        />"""

update_file('frontend/src/pages/Finance/OrderDetails.tsx', order_list_code)
update_file('frontend/src/pages/Finance/RechargeRecords.tsx', recharge_list_code)

print("Updated files successfully.")
