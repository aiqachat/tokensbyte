import React, { useState, useEffect } from 'react';
import { Typography, Button, Table, Modal, Input, InputNumber, Select, Space, Tag, message, Popconfirm, Spin, Tooltip } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined, TeamOutlined, CrownOutlined, CopyOutlined, LinkOutlined, TrophyOutlined } from '@ant-design/icons';
import request from '../../../utils/request';
import type { MarketingTeam, TeamMember, UserLevel } from '../../../types';

const { Text } = Typography;

interface UserOption {
  user_id: string;
  username: string;
  uid: string;
}

const TeamConfig: React.FC = () => {
  const [teams, setTeams] = useState<MarketingTeam[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingTeam, setEditingTeam] = useState<MarketingTeam | null>(null);
  const [saving, setSaving] = useState(false);

  // Form fields
  const [teamName, setTeamName] = useState('');
  const [teamDesc, setTeamDesc] = useState('');
  const [maxMembers, setMaxMembers] = useState(10);
  const [selectedLeaders, setSelectedLeaders] = useState<string[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [userOptions, setUserOptions] = useState<UserOption[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedLevels, setSelectedLevels] = useState<number[]>([]);
  const [selectedMemberLevels, setSelectedMemberLevels] = useState<number[]>([]);
  const [allLevels, setAllLevels] = useState<UserLevel[]>([]);

  useEffect(() => {
    fetchTeams();
    fetchAllLevels();
  }, []);

  const fetchAllLevels = async () => {
    try {
      const resp = await (request.get('/user_levels') as unknown as Promise<{ data: UserLevel[] }>);
      setAllLevels(resp.data || []);
    } catch (e) {
      console.error('获取用户等级列表失败', e);
    }
  };

  const fetchTeams = async () => {
    try {
      setLoading(true);
      const res = await (request.get('/team-marketing/teams') as any);
      if (res.teams) setTeams(res.teams);
    } catch (e) {
      message.error('获取团队列表失败');
    } finally {
      setLoading(false);
    }
  };

  const searchUsers = async (keyword: string) => {
    if (!keyword || keyword.length < 1) return;
    try {
      setSearchLoading(true);
      const res = await (request.get('/team-marketing/search-users', { params: { keyword } }) as any);
      if (res.users) setUserOptions(res.users);
    } catch (e) {
      console.error('搜索用户失败', e);
    } finally {
      setSearchLoading(false);
    }
  };

  const openCreateModal = () => {
    setEditingTeam(null);
    setTeamName('');
    setTeamDesc('');
    setMaxMembers(10);
    setSelectedLeaders([]);
    setSelectedMembers([]);
    setSelectedLevels([]);
    setSelectedMemberLevels([]);
    setUserOptions([]);
    setModalVisible(true);
  };

  const openEditModal = (team: MarketingTeam) => {
    setEditingTeam(team);
    setTeamName(team.name);
    setTeamDesc(team.description || '');
    setMaxMembers(team.max_members || 10);
    setSelectedLeaders(team.leaders.map(l => l.user_id));
    setSelectedMembers(team.members.map(m => m.user_id));
    // Pre-populate user options with existing leaders and members
    const existingUsers: UserOption[] = [
      ...team.leaders.map(l => ({ user_id: l.user_id, username: l.username, uid: l.uid })),
      ...team.members.map(m => ({ user_id: m.user_id, username: m.username, uid: m.uid })),
    ];
    // Deduplicate
    const seen = new Set<string>();
    const deduped = existingUsers.filter(u => {
      if (seen.has(u.user_id)) return false;
      seen.add(u.user_id);
      return true;
    });
    setUserOptions(deduped);
    setSelectedLevels(team.allowed_level_ids || []);
    setSelectedMemberLevels(team.allowed_member_level_ids || []);
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!teamName.trim()) {
      message.warning('请输入团队名称');
      return;
    }
    if (selectedLeaders.length === 0) {
      message.warning('请至少选择一个负责人');
      return;
    }

    try {
      setSaving(true);
      const payload = {
        name: teamName.trim(),
        description: teamDesc.trim() || null,
        leader_ids: selectedLeaders,
        member_ids: selectedMembers,
        max_members: maxMembers,
        allowed_level_ids: selectedLevels,
        allowed_member_level_ids: selectedMemberLevels,
      };

      if (editingTeam) {
        await request.put(`/team-marketing/teams/${editingTeam.id}`, payload);
        message.success('团队更新成功');
      } else {
        await request.post('/team-marketing/teams', payload);
        message.success('团队创建成功');
      }
      setModalVisible(false);
      fetchTeams();
    } catch (e: any) {
      message.error(e?.response?.data?.error?.message || '操作失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await request.delete(`/team-marketing/teams/${id}`);
      message.success('团队已删除');
      fetchTeams();
    } catch (e) {
      message.error('删除失败');
    }
  };

  const copyInviteLink = (inviteCode: string) => {
    const link = `${window.location.origin}/register?team=${inviteCode}`;
    navigator.clipboard.writeText(link);
    message.success('邀请链接已复制到剪贴板');
  };

  const selectOptions = userOptions.map(u => ({
    value: u.user_id,
    label: `${u.username} (${u.uid})`,
  }));

  const columns = [
    {
      title: '团队名称',
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => <Text strong style={{ color: '#fff' }}>{name}</Text>,
    },
    {
      title: '负责人',
      dataIndex: 'leaders',
      key: 'leaders',
      render: (leaders: TeamMember[]) => (
        <Space wrap size={4}>
          {leaders.map(l => (
            <Tag key={l.user_id} icon={<CrownOutlined />} color="gold" style={{ margin: 0, borderRadius: 4 }}>
              {l.username}
            </Tag>
          ))}
          {leaders.length === 0 && <Text type="secondary">未设置</Text>}
        </Space>
      ),
    },
    {
      title: '成员',
      dataIndex: 'members',
      key: 'members',
      render: (members: TeamMember[], record: MarketingTeam) => (
        <Space wrap size={4}>
          {members.slice(0, 3).map(m => (
            <Tag key={m.user_id} icon={<TeamOutlined />} style={{ margin: 0, borderRadius: 4, background: 'rgba(22,119,255,0.1)', border: '1px solid rgba(22,119,255,0.2)', color: '#1677ff' }}>
              {m.username}
            </Tag>
          ))}
          {members.length > 3 && <Tag style={{ margin: 0, borderRadius: 4 }}>+{members.length - 3}</Tag>}
          <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11 }}>
            {members.length}/{record.max_members || 10}
          </Text>
        </Space>
      ),
    },
    {
      title: '邀请链接',
      dataIndex: 'invite_code',
      key: 'invite_code',
      width: 160,
      render: (code: string) => (
        <Space size={4}>
          <Tag
            icon={<LinkOutlined />}
            style={{
              margin: 0,
              borderRadius: 4,
              background: 'rgba(82,196,26,0.1)',
              border: '1px solid rgba(82,196,26,0.2)',
              color: '#52c41a',
              fontFamily: 'monospace',
              fontSize: 12,
            }}
          >
            {code}
          </Tag>
          <Tooltip title="复制邀请链接">
            <Button
              type="text"
              size="small"
              icon={<CopyOutlined />}
              onClick={() => copyInviteLink(code)}
              style={{ color: '#1677ff' }}
            />
          </Tooltip>
        </Space>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (t: string) => <Text style={{ fontSize: 12 }}>{new Date(t).toLocaleString('zh-CN')}</Text>,
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_: any, record: MarketingTeam) => (
        <Space size={4}>
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => openEditModal(record)}
            style={{ color: '#1677ff' }}
          />
          <Popconfirm title="确定删除此团队？" onConfirm={() => handleDelete(record.id)} okText="删除" cancelText="取消">
            <Button type="text" size="small" icon={<DeleteOutlined />} danger />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>
          共 {teams.length} 个推广团队
        </Text>
        <Space>
          <Button size="small" onClick={fetchTeams} loading={loading}>刷新</Button>
          <Button type="primary" size="small" icon={<PlusOutlined />} onClick={openCreateModal}>
            新建团队
          </Button>
        </Space>
      </div>

      <Table
        dataSource={teams}
        columns={columns}
        rowKey="id"
        loading={loading}
        size="small"
        pagination={{ pageSize: 10 }}
      />

      {/* Create/Edit Modal */}
      <Modal
        title={editingTeam ? '编辑推广团队' : '新建推广团队'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={handleSave}
        confirmLoading={saving}
        okText={editingTeam ? '保存' : '创建'}
        width={600}
        destroyOnClose
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 16 }}>
          <div>
            <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13, display: 'block', marginBottom: 6 }}>
              团队名称 <span style={{ color: '#ff4d4f' }}>*</span>
            </Text>
            <Input
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="输入团队名称"
              style={{ background: '#1f1f1f', borderColor: 'rgba(255,255,255,0.1)' }}
            />
          </div>

          <div>
            <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13, display: 'block', marginBottom: 6 }}>
              团队描述
            </Text>
            <Input.TextArea
              value={teamDesc}
              onChange={(e) => setTeamDesc(e.target.value)}
              placeholder="简要描述团队用途（可选）"
              rows={2}
              style={{ background: '#1f1f1f', borderColor: 'rgba(255,255,255,0.1)' }}
            />
          </div>

          <div>
            <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13, display: 'block', marginBottom: 6 }}>
              <TeamOutlined style={{ color: '#52c41a', marginRight: 4 }} />
              团队人数上限
              <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, marginLeft: 8 }}>通过邀请链接加入的成员总数限制</Text>
            </Text>
            <InputNumber
              value={maxMembers}
              onChange={(v) => setMaxMembers(v || 10)}
              min={1}
              max={10000}
              style={{ width: '100%', background: '#1f1f1f', borderColor: 'rgba(255,255,255,0.1)' }}
              placeholder="默认 10"
            />
          </div>

          {/* 团队负责人 */}
          <div>
            <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13, display: 'block', marginBottom: 6 }}>
              <CrownOutlined style={{ color: '#faad14', marginRight: 4 }} />
              团队负责人 <span style={{ color: '#ff4d4f' }}>*</span>
              <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, marginLeft: 8 }}>负责人可以查看团队成员的推广详细数据</Text>
            </Text>
            <Select
              mode="multiple"
              value={selectedLeaders}
              onChange={setSelectedLeaders}
              options={selectOptions}
              placeholder="搜索并选择负责人..."
              showSearch
              filterOption={false}
              onSearch={searchUsers}
              loading={searchLoading}
              notFoundContent={searchLoading ? <Spin size="small" /> : '输入关键词搜索用户'}
              style={{ width: '100%' }}
              suffixIcon={<SearchOutlined />}
            />
          </div>

          {/* 团队成员授权等级 */}
          <div>
            <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13, display: 'block', marginBottom: 6 }}>
              <TrophyOutlined style={{ color: '#1677ff', marginRight: 4 }} />
              团队成员授权等级
              <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, marginLeft: 8 }}>负责人可将团队成员设置为以下等级</Text>
            </Text>
            <Select
              mode="multiple"
              value={selectedMemberLevels}
              onChange={setSelectedMemberLevels}
              options={allLevels.map(l => ({
                value: l.id,
                label: `${l.name} (${l.group_key})`,
              }))}
              placeholder="选择可分配给团队成员的用户等级..."
              style={{ width: '100%' }}
              optionFilterProp="label"
              notFoundContent="暂无可用等级"
            />
          </div>

          {/* 团队成员 */}
          <div>
            <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13, display: 'block', marginBottom: 6 }}>
              <TeamOutlined style={{ color: '#1677ff', marginRight: 4 }} />
              团队成员
              <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, marginLeft: 8 }}>选择此团队的推广人员</Text>
            </Text>
            <Select
              mode="multiple"
              value={selectedMembers}
              onChange={setSelectedMembers}
              options={selectOptions}
              placeholder="搜索并选择团队成员..."
              showSearch
              filterOption={false}
              onSearch={searchUsers}
              loading={searchLoading}
              notFoundContent={searchLoading ? <Spin size="small" /> : '输入关键词搜索用户'}
              style={{ width: '100%' }}
              suffixIcon={<SearchOutlined />}
            />
          </div>

          {/* 授权用户等级（推荐用户） */}
          <div>
            <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13, display: 'block', marginBottom: 6 }}>
              <TrophyOutlined style={{ color: '#52c41a', marginRight: 4 }} />
              授权用户等级
              <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, marginLeft: 8 }}>负责人可将推荐用户设置为以下等级</Text>
            </Text>
            <Select
              mode="multiple"
              value={selectedLevels}
              onChange={setSelectedLevels}
              options={allLevels.map(l => ({
                value: l.id,
                label: `${l.name} (${l.group_key})`,
              }))}
              placeholder="选择可分配的用户等级..."
              style={{ width: '100%' }}
              optionFilterProp="label"
              notFoundContent="暂无可用等级"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default TeamConfig;
