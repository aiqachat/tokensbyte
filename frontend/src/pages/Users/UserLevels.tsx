import React, { useEffect, useState } from 'react';
import { Table, Button, Space, Tag, Modal, Form, Input, InputNumber, message, Popconfirm, Card, Typography } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SyncOutlined, TrophyOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import request from '../../utils/request';
import dayjs from 'dayjs';
import type { UserLevel } from '../../types';

const { Title, Text } = Typography;



const UserLevels: React.FC = () => {
  const { t } = useTranslation();
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
      render: (text: string) => <Space><TrophyOutlined style={{ color: '#faad14' }} /><Text strong>{text}</Text></Space>,
    },
    {
      title: t('user_levels.group_key'),
      dataIndex: 'group_key',
      key: 'group_key',
      render: (key: string) => <Tag color="blue">{key}</Tag>,
    },
    {
      title: t('user_levels.discount'),
      dataIndex: 'discount',
      key: 'discount',
      render: (val: number) => {
        const off = Math.round((1 - val) * 100);
        return (
          <Space>
            <Text>{val.toFixed(2)}x</Text>
            {off > 0 && <Tag color="red">-{off}%</Tag>}
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
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
        <Title level={2} style={{ margin: 0 }}>{t('user_levels.title')}</Title>
        <Space>
          <Button icon={<SyncOutlined />} onClick={fetchLevels}>{t('common.refresh')}</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>{t('user_levels.add_level')}</Button>
        </Space>
      </div>

      <Table
        dataSource={levels}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={false}
        scroll={{ x: 'max-content' }}
      />


    </Card>
  );
};

export default UserLevels;
