import React, { useEffect, useState } from 'react';
import { Table, Button, Space, Tag, Modal, Form, Input, InputNumber, message, Popconfirm, Card, Typography, Grid } from 'antd';
import MobileCardList, { MobileCard, CardRow, CardActions } from '../../components/MobileCardList';
import { PlusOutlined, EditOutlined, DeleteOutlined, SyncOutlined, TrophyOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import request from '../../utils/request';
import dayjs from 'dayjs';
import type { UserLevel } from '../../types';

const { Title, Text } = Typography;
const { useBreakpoint } = Grid;



const UserLevels: React.FC = () => {
  const { t } = useTranslation();
  const screens = useBreakpoint();
  const navigate = useNavigate();
  const [levels, setLevels] = useState<UserLevel[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLevels = async () => {
    setLoading(true);
    try {
      const resp = await (request.get('/user_levels') as unknown as Promise<{ data: UserLevel[] }>);
      setLevels(resp.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLevels();
  }, []);

  const handleAdd = () => {
    navigate('/admin0755/user-levels/new');
  };

  const handleEdit = (record: UserLevel) => {
    navigate(`/admin0755/user-levels/${record.id}`);
  };

  const handleDelete = async (id: number) => {
    try {
      await request.delete(`/user_levels/${id}`);
      message.success(t('user_levels.success'));
      fetchLevels();
    } catch (e: any) {
      console.error(e);
      message.error(e.response?.data?.message || t('common.error'));
    }
  };



  const columns = [
    {
      title: t('user_levels.name'),
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: UserLevel) => (
        <div>
          <Space align="center" size={8}>
            <TrophyOutlined style={{ color: '#faad14' }} />
            <Text strong>{text}</Text>
            <Tag bordered={false} style={{ margin: 0, background: 'rgba(22,119,255,0.1)', color: '#1677ff', borderRadius: 4 }}>
              ID: {record.id.toString().padStart(4, '0')}
            </Tag>
            {record.is_default === 1 && <Tag color="green">默认注册</Tag>}
          </Space>
          <div style={{ marginTop: 4 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>标志: {record.group_key}</Text>
          </div>
        </div>
      ),
    },
    {
      title: t('user_levels.discount'),
      dataIndex: 'discount',
      key: 'discount',
      render: (val: number) => {
        const off = Math.round((1 - val) * 100);
        const up = Math.round((val - 1) * 100);
        return (
          <Space>
            <Text>{val.toFixed(2)}x</Text>
            {off > 0 && <Tag color="green">-{off}% (优惠)</Tag>}
            {up > 0 && <Tag color="volcano">+{up}% (涨价)</Tag>}
          </Space>
        );
      },
    },
    {
      title: '返利比例',
      dataIndex: 'commission_ratio',
      key: 'commission_ratio',
      render: (val: number) => {
        const percent = Math.round((val || 0) * 100);
        return <Tag color="green">{percent}%</Tag>;
      },
    },
    {
      title: t('user_levels.description'),
      dataIndex: 'description',
      key: 'description',
    },
    {
      title: t('user_levels.created_at'),
      dataIndex: 'created_at',
      key: 'created_at',
      render: (text: string) => dayjs(text).format('YYYY-MM-DD'),
    },
    {
      title: t('common.actions'),
      key: 'actions',
      render: (_: any, record: UserLevel) => (
        <Space>
          <Button icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          <Popconfirm 
            title={t('user_levels.delete_confirm')} 
            onConfirm={() => handleDelete(record.id)}
            disabled={record.group_key === 'default'}
          >
            <Button icon={<DeleteOutlined />} danger disabled={record.group_key === 'default'} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card bordered={false}>
      <div style={{ display: 'flex', flexDirection: screens.xs ? 'column' : 'row', justifyContent: 'space-between', marginBottom: 24, gap: 12 }}>
        <Title level={screens.xs ? 4 : 2} style={{ margin: 0 }}>{t('user_levels.title')}</Title>
        <Space>
          <Button icon={<SyncOutlined />} onClick={fetchLevels}>{t('common.refresh')}</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>{t('user_levels.add_level')}</Button>
        </Space>
      </div>

      {screens.xs ? (
        <MobileCardList
          dataSource={levels}
          loading={loading}
          rowKey="id"
          pagination={false}
          renderCard={(record: any) => {
            const off = Math.round((1 - record.discount) * 100);
            const up = Math.round((record.discount - 1) * 100);
            const commPercent = Math.round((record.commission_ratio || 0) * 100);
            return (
              <MobileCard
                title={
                  <div>
                    <Space align="center" size={8} wrap>
                      <TrophyOutlined style={{ color: '#faad14' }} />
                      <Text strong>{record.name}</Text>
                      <Tag bordered={false} style={{ margin: 0, background: 'rgba(22,119,255,0.1)', color: '#1677ff', borderRadius: 4 }}>
                        ID: {record.id.toString().padStart(4, '0')}
                      </Tag>
                      {record.is_default === 1 && <Tag color="green">默认注册</Tag>}
                    </Space>
                    <div style={{ marginTop: 4 }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>标志: {record.group_key}</Text>
                    </div>
                  </div>
                }
                extra={null}
              >
                <CardRow label="折扣倍率">
                  <Space>
                    <Text>{record.discount.toFixed(2)}x</Text>
                    {off > 0 && <Tag color="green">-{off}%</Tag>}
                    {up > 0 && <Tag color="volcano">+{up}%</Tag>}
                  </Space>
                </CardRow>
                <CardRow label="返利比例"><Tag color="green">{commPercent}%</Tag></CardRow>
                {record.description && <CardRow label="说明"><Text type="secondary" style={{ fontSize: 12 }}>{record.description}</Text></CardRow>}
                <CardRow label="创建时间"><Text type="secondary" style={{ fontSize: 12 }}>{dayjs(record.created_at).format('YYYY-MM-DD')}</Text></CardRow>
                <CardActions>
                  <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
                  <Popconfirm title={t('user_levels.delete_confirm')} onConfirm={() => handleDelete(record.id)} disabled={record.group_key === 'default'}>
                    <Button size="small" icon={<DeleteOutlined />} danger disabled={record.group_key === 'default'} />
                  </Popconfirm>
                </CardActions>
              </MobileCard>
            );
          }}
        />
      ) : (
        <Table
          dataSource={levels}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={false}
          scroll={{ x: 'max-content' }}
        />
      )}


    </Card>
  );
};

export default UserLevels;
