import React, { useState, useEffect } from 'react';
import { Typography, Table, Tag, Spin, Space, Button, Card, Statistic, Row, Col, message, Tooltip, Modal, Select, Progress } from 'antd';
import { TeamOutlined, UserOutlined, DollarOutlined, ReloadOutlined, CrownOutlined, RiseOutlined, CopyOutlined, LinkOutlined, TrophyOutlined } from '@ant-design/icons';
import request from '../../utils/request';
import useSettingsStore from '../../store/settings';
import useAuthStore from '../../store/auth';
import type { ReferralUser, ReferralRecharge } from '../../types';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const AdvancedMarketing: React.FC = () => {
  const { settings } = useSettingsStore();
  const { user } = useAuthStore();
  const currencySymbol = settings?.currency?.currency_symbol || '$';

  const [referrals, setReferrals] = useState<ReferralUser[]>([]);
  const [loading, setLoading] = useState(true);

  // Team overview (for leaders)
  const [teamData, setTeamData] = useState<any>(null);
  const [teamLoading, setTeamLoading] = useState(false);

  // My team (for members)
  const [myTeamData, setMyTeamData] = useState<any>(null);
  const [myTeamLoading, setMyTeamLoading] = useState(false);

  // Expanded recharge records
  const [expandedRecharges, setExpandedRecharges] = useState<Record<string, ReferralRecharge[]>>({});
  const [loadingRecharges, setLoadingRecharges] = useState<Record<string, boolean>>({});

  // Team leader level assignment (for referrals)
  const [allowedLevels, setAllowedLevels] = useState<any[]>([]);
  const [isLeader, setIsLeader] = useState(false);
  const [levelModalVisible, setLevelModalVisible] = useState(false);
  const [levelTargetUser, setLevelTargetUser] = useState<ReferralUser | null>(null);
  const [selectedGroupKey, setSelectedGroupKey] = useState<string>('');
  const [settingLevel, setSettingLevel] = useState(false);

  // Team leader level assignment (for members)
  const [allowedMemberLevels, setAllowedMemberLevels] = useState<any[]>([]);
  const [memberLevelModalVisible, setMemberLevelModalVisible] = useState(false);
  const [memberLevelTarget, setMemberLevelTarget] = useState<any>(null);
  const [selectedMemberGroupKey, setSelectedMemberGroupKey] = useState<string>('');
  const [settingMemberLevel, setSettingMemberLevel] = useState(false);

  useEffect(() => {
    fetchReferrals();
    fetchTeamOverview();
    fetchMyTeam();
    fetchAllowedLevels();
    fetchAllowedMemberLevels();
  }, []);

  const fetchReferrals = async () => {
    try {
      setLoading(true);
      const res = await (request.get('/team-marketing/my-referrals') as any);
      if (res.referrals) setReferrals(res.referrals);
    } catch (e) {
      console.error('获取推荐用户失败', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchTeamOverview = async () => {
    try {
      setTeamLoading(true);
      const res = await (request.get('/team-marketing/team-overview') as any);
      setTeamData(res);
    } catch (e) {
      console.error('获取团队数据失败', e);
    } finally {
      setTeamLoading(false);
    }
  };

  const fetchMyTeam = async () => {
    try {
      setMyTeamLoading(true);
      const res = await (request.get('/team-marketing/my-team') as any);
      setMyTeamData(res);
    } catch (e) {
      console.error('获取我的团队失败', e);
    } finally {
      setMyTeamLoading(false);
    }
  };

  const fetchRecharges = async (userId: string) => {
    if (expandedRecharges[userId]) return;
    try {
      setLoadingRecharges(prev => ({ ...prev, [userId]: true }));
      const res = await (request.get(`/team-marketing/referral/${userId}/recharges`) as any);
      setExpandedRecharges(prev => ({ ...prev, [userId]: res.recharges || [] }));
    } catch (e) {
      message.error('获取充值明细失败');
    } finally {
      setLoadingRecharges(prev => ({ ...prev, [userId]: false }));
    }
  };

  const copyTeamInviteLink = (inviteCode: string) => {
    const link = `${window.location.origin}/register?aff=${user?.uid}&team=${inviteCode}`;
    navigator.clipboard.writeText(link);
    message.success('团队邀请链接已复制');
  };

  const copyMyInviteLink = () => {
    const link = `${window.location.origin}/register?aff=${user?.uid}`;
    navigator.clipboard.writeText(link);
    message.success('推广邀请链接已复制到剪贴板');
  };

  const fetchAllowedLevels = async () => {
    try {
      const res = await (request.get('/team-marketing/allowed-levels') as any);
      if (res.levels) setAllowedLevels(res.levels);
      if (res.is_leader !== undefined) setIsLeader(res.is_leader);
    } catch (e) {
      console.error('获取授权等级失败', e);
    }
  };

  const openLevelModal = (record: ReferralUser) => {
    setLevelTargetUser(record);
    setSelectedGroupKey(record.user_group);
    setLevelModalVisible(true);
  };

  const handleSetLevel = async () => {
    if (!levelTargetUser || !selectedGroupKey) return;
    try {
      setSettingLevel(true);
      const res = await (request.put(`/team-marketing/referral/${levelTargetUser.id}/level`, {
        group_key: selectedGroupKey,
      }) as any);
      message.success(res.message || '用户等级设置成功');
      setLevelModalVisible(false);
      fetchReferrals();
    } catch (e: any) {
      message.error(e?.response?.data?.error?.message || '设置失败');
    } finally {
      setSettingLevel(false);
    }
  };

  const fetchAllowedMemberLevels = async () => {
    try {
      const res = await (request.get('/team-marketing/allowed-member-levels') as any);
      if (res.levels) setAllowedMemberLevels(res.levels);
    } catch (e) {
      console.error('获取成员授权等级失败', e);
    }
  };

  const openMemberLevelModal = (member: any) => {
    setMemberLevelTarget(member);
    setSelectedMemberGroupKey(member.user_group || '');
    setMemberLevelModalVisible(true);
  };

  const handleSetMemberLevel = async () => {
    if (!memberLevelTarget || !selectedMemberGroupKey) return;
    try {
      setSettingMemberLevel(true);
      const res = await (request.put(`/team-marketing/member/${memberLevelTarget.user_id}/level`, {
        group_key: selectedMemberGroupKey,
      }) as any);
      message.success(res.message || '成员等级设置成功');
      setMemberLevelModalVisible(false);
      fetchTeamOverview();
    } catch (e: any) {
      message.error(e?.response?.data?.error?.message || '设置失败');
    } finally {
      setSettingMemberLevel(false);
    }
  };

  // Stats
  const totalReferrals = referrals.length;
  const totalRecharge = referrals.reduce((sum, r) => sum + (r.total_recharge || 0), 0);
  const activeReferrals = referrals.filter(r => r.is_active === 1).length;

  const columns = [
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
      render: (username: string, record: ReferralUser) => (
        <div>
          <Text strong style={{ color: '#fff', display: 'block', lineHeight: 1.3 }}>{username}</Text>
          <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11 }}>UID: {record.uid}</Text>
        </div>
      ),
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email',
      ellipsis: true,
      render: (email: string) => <Text style={{ fontSize: 13 }}>{email}</Text>,
    },
    {
      title: '用户等级',
      dataIndex: 'level_name',
      key: 'level_name',
      width: 120,
      render: (name: string, record: ReferralUser) => (
        <Tag style={{
          margin: 0, borderRadius: 4,
          background: 'rgba(22,119,255,0.1)',
          border: '1px solid rgba(22,119,255,0.2)',
          color: '#1677ff',
        }}>
          {name || record.user_group}
        </Tag>
      ),
    },
    {
      title: '状态',
      dataIndex: 'is_active',
      key: 'is_active',
      width: 80,
      render: (v: number) => v === 1
        ? <Tag color="success">活跃</Tag>
        : <Tag color="default">停用</Tag>,
    },
    {
      title: '剩余额度/总额度',
      key: 'balance_quota',
      width: 220,
      render: (_: any, record: ReferralUser) => {
        const balance = record.balance || 0;
        const total = record.total_recharge || 0;
        const percent = total > 0 ? Math.min((balance / total) * 100, 100) : 0;
        return (
          <div style={{ minWidth: 160 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '4px 10px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 20,
              marginBottom: 4,
            }}>
              <DollarOutlined style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13 }} />
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: 500 }}>
                {currencySymbol}{balance.toFixed(2)}
              </Text>
              <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>/</Text>
              <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13 }}>
                {currencySymbol}{total.toFixed(2)}
              </Text>
            </div>
            <Progress
              percent={percent}
              showInfo={false}
              size="small"
              strokeColor={percent > 50 ? '#52c41a' : percent > 20 ? '#faad14' : '#ff4d4f'}
              trailColor="rgba(255,255,255,0.08)"
              style={{ margin: 0, padding: '0 4px' }}
            />
          </div>
        );
      },
    },
    {
      title: '注册时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (t: string) => <Text style={{ fontSize: 12 }}>{dayjs(t).format('YYYY/MM/DD HH:mm')}</Text>,
    },
    // 团队负责人专属：设置等级操作列
    ...(isLeader && allowedLevels.length > 0 ? [{
      title: '操作',
      key: 'action',
      width: 100,
      render: (_: any, record: ReferralUser) => (
        <Tooltip title="设置用户等级">
          <Button
            type="link"
            size="small"
            icon={<TrophyOutlined />}
            onClick={() => openLevelModal(record)}
            style={{ color: '#faad14', padding: 0 }}
          >
            设置等级
          </Button>
        </Tooltip>
      ),
    }] : []),
  ];

  const rechargeColumns = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
    {
      title: '金额',
      dataIndex: 'amount',
      key: 'amount',
      render: (amount: number) => (
        <Text style={{ color: amount > 0 ? '#52c41a' : '#ff4d4f', fontWeight: 'bold' }}>
          {amount > 0 ? '+' : ''}{currencySymbol}{Math.abs(amount).toFixed(2)}
        </Text>
      ),
    },
    {
      title: '类型',
      dataIndex: 'recharge_type',
      key: 'recharge_type',
      render: (type: string) => {
        const typeMap: Record<string, { text: string; color: string }> = {
          'manual': { text: '手动充值', color: 'blue' },
          'online': { text: '在线充值', color: 'green' },
          'transfer': { text: '奖励转入', color: 'purple' },
          'gift': { text: '注册赠送', color: 'gold' },
          'commission': { text: '佣金到账', color: 'cyan' },
        };
        const t = typeMap[type] || { text: type, color: 'default' };
        return <Tag color={t.color}>{t.text}</Tag>;
      },
    },
    {
      title: '备注',
      dataIndex: 'remark',
      key: 'remark',
      render: (text: string) => text || '-',
    },
    {
      title: '时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (t: string) => <Text style={{ fontSize: 12 }}>{dayjs(t).format('YYYY/MM/DD HH:mm:ss')}</Text>,
    },
  ];

  // 判断用户是否只是成员（不是负责人）
  const memberOnlyTeams = (myTeamData?.teams || []).filter((t: any) => t.role === 'member');

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 20, paddingBottom: 16,
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8, background: 'rgba(22,119,255,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1677ff',
          }}>
            <TeamOutlined style={{ fontSize: 20 }} />
          </div>
          <div>
            <Title level={4} style={{ margin: 0, color: '#fff', lineHeight: 1.3 }}>高级营销</Title>
            <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>查看我的推荐用户和推广数据</Text>
          </div>
        </div>
        <Button icon={<ReloadOutlined />} onClick={() => { fetchReferrals(); fetchTeamOverview(); fetchMyTeam(); }} loading={loading}>
          刷新
        </Button>
      </div>

      {/* Stats Cards */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col xs={8}>
          <Card style={{
            borderRadius: 12,
            background: 'linear-gradient(135deg, rgba(22,119,255,0.15) 0%, rgba(22,119,255,0.05) 100%)',
            border: '1px solid rgba(22,119,255,0.2)',
          }}>
            <Statistic
              title={<span style={{ color: 'rgba(255,255,255,0.65)' }}>推荐用户数</span>}
              value={totalReferrals}
              styles={{ content: { color: '#1677ff', fontSize: 28, fontWeight: 'bold' } }}
              prefix={<TeamOutlined />}
            />
          </Card>
        </Col>
        <Col xs={8}>
          <Card style={{
            borderRadius: 12,
            background: 'linear-gradient(135deg, rgba(82,196,26,0.15) 0%, rgba(82,196,26,0.05) 100%)',
            border: '1px solid rgba(82,196,26,0.2)',
          }}>
            <Statistic
              title={<span style={{ color: 'rgba(255,255,255,0.65)' }}>累计充值</span>}
              value={totalRecharge}
              precision={2}
              prefix={currencySymbol}
              styles={{ content: { color: '#52c41a', fontSize: 28, fontWeight: 'bold' } }}
            />
          </Card>
        </Col>
        <Col xs={8}>
          <Card style={{
            borderRadius: 12,
            background: 'linear-gradient(135deg, rgba(114,46,209,0.15) 0%, rgba(114,46,209,0.05) 100%)',
            border: '1px solid rgba(114,46,209,0.2)',
          }}>
            <Statistic
              title={<span style={{ color: 'rgba(255,255,255,0.65)' }}>活跃用户</span>}
              value={activeReferrals}
              styles={{ content: { color: '#722ed1', fontSize: 28, fontWeight: 'bold' } }}
              prefix={<UserOutlined />}
              suffix={<span style={{ fontSize: 14, color: 'rgba(255,255,255,0.35)' }}>/ {totalReferrals}</span>}
            />
          </Card>
        </Col>
      </Row>

      {/* My Personal Invite Link */}
      <Card
        style={{
          marginBottom: 24,
          borderRadius: 12,
          background: '#141414',
          border: '1px solid rgba(82,196,26,0.2)',
        }}
        title={
          <Space>
            <LinkOutlined style={{ color: '#52c41a' }} />
            <span style={{ color: '#fff' }}>我的推广邀请链接</span>
          </Space>
        }
        headStyle={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <Text style={{ color: 'rgba(255,255,255,0.55)', display: 'block', marginBottom: 12, fontSize: 13 }}>
          分享您的专属推广链接，通过此链接注册的用户将成为您的推荐下级。
        </Text>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '12px 16px',
          background: '#000',
          border: '1px dashed rgba(82,196,26,0.3)',
          borderRadius: 8,
        }}>
          <LinkOutlined style={{ color: '#52c41a', fontSize: 14, flexShrink: 0 }} />
          <Text ellipsis style={{ color: '#fff', fontSize: 13, flex: 1, fontFamily: 'monospace' }}>
            {window.location.origin}/register?aff={user?.uid}
          </Text>
          <Tooltip title="复制链接">
            <Button
              type="primary"
              size="small"
              icon={<CopyOutlined />}
              onClick={copyMyInviteLink}
              style={{ background: '#52c41a', borderColor: '#52c41a', borderRadius: 6 }}
            >
              复制
            </Button>
          </Tooltip>
        </div>
      </Card>

      {/* Team Leader Section */}
      {teamData?.is_leader && teamData.teams?.length > 0 && (
        <Card
          style={{
            marginBottom: 24,
            borderRadius: 12,
            background: '#141414',
            border: '1px solid rgba(250,173,20,0.2)',
          }}
          title={
            <Space>
              <CrownOutlined style={{ color: '#faad14' }} />
              <span style={{ color: '#fff' }}>我管理的团队</span>
            </Space>
          }
          headStyle={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
        >
          {teamData.teams.map((team: any) => (
            <div key={team.id} style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Text strong style={{ color: '#fff', fontSize: 15 }}>{team.name}</Text>
                {team.description && (
                  <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>— {team.description}</Text>
                )}
                <Tag style={{
                  margin: 0, borderRadius: 10, marginLeft: 'auto',
                  background: 'rgba(22,119,255,0.1)', border: '1px solid rgba(22,119,255,0.2)', color: '#1677ff', fontSize: 11,
                }}>
                  {team.member_count || team.members?.length || 0}/{team.max_members || 10} 人
                </Tag>
              </div>

              {/* Invite Link for Leader */}
              {team.invite_code && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 14px', marginBottom: 12,
                  background: 'rgba(82,196,26,0.06)',
                  border: '1px dashed rgba(82,196,26,0.25)',
                  borderRadius: 8,
                }}>
                  <LinkOutlined style={{ color: '#52c41a', fontSize: 14 }} />
                  <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12 }}>邀请链接：</Text>
                  <Text ellipsis style={{ color: '#fff', fontSize: 12, flex: 1, fontFamily: 'monospace' }}>
                    {window.location.origin}/register?aff={user?.uid}&team={team.invite_code}
                  </Text>
                  <Tooltip title="复制邀请链接">
                    <Button
                      type="text"
                      size="small"
                      icon={<CopyOutlined style={{ color: '#52c41a' }} />}
                      onClick={() => copyTeamInviteLink(team.invite_code)}
                    />
                  </Tooltip>
                </div>
              )}

              <Table
                dataSource={team.members}
                rowKey="user_id"
                size="small"
                pagination={false}
                columns={[
                  {
                    title: '推广员',
                    dataIndex: 'username',
                    key: 'username',
                    render: (name: string, record: any) => (
                      <div>
                        <Text strong style={{ color: '#fff' }}>{name}</Text>
                        <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, marginLeft: 8 }}>
                          {record.uid}
                        </Text>
                      </div>
                    ),
                  },
                  {
                    title: '用户等级',
                    dataIndex: 'user_group',
                    key: 'user_group',
                    width: 100,
                    render: (v: string) => (
                      <Tag style={{ margin: 0, borderRadius: 4, background: 'rgba(22,119,255,0.1)', border: '1px solid rgba(22,119,255,0.2)', color: '#1677ff' }}>
                        {v || 'default'}
                      </Tag>
                    ),
                  },
                  {
                    title: '推荐人数',
                    dataIndex: 'referred_count',
                    key: 'referred_count',
                    width: 100,
                    render: (v: number) => (
                      <Space>
                        <TeamOutlined style={{ color: '#1677ff' }} />
                        <Text style={{ fontWeight: 'bold' }}>{v}</Text>
                      </Space>
                    ),
                  },
                  {
                    title: '剩余额度/总额度',
                    key: 'member_balance_quota',
                    width: 220,
                    render: (_: any, record: any) => {
                      const balance = record.balance || 0;
                      const total = record.total_recharge || 0;
                      const percent = total > 0 ? Math.min((balance / total) * 100, 100) : 0;
                      return (
                        <div style={{ minWidth: 160 }}>
                          <div style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '4px 10px',
                            background: 'rgba(255,255,255,0.04)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: 20,
                            marginBottom: 4,
                          }}>
                            <DollarOutlined style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13 }} />
                            <Text style={{ color: '#fff', fontSize: 13, fontWeight: 500 }}>
                              {currencySymbol}{balance.toFixed(2)}
                            </Text>
                            <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>/</Text>
                            <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13 }}>
                              {currencySymbol}{total.toFixed(2)}
                            </Text>
                          </div>
                          <Progress
                            percent={percent}
                            showInfo={false}
                            size="small"
                            strokeColor={percent > 50 ? '#52c41a' : percent > 20 ? '#faad14' : '#ff4d4f'}
                            trailColor="rgba(255,255,255,0.08)"
                            style={{ margin: 0, padding: '0 4px' }}
                          />
                        </div>
                      );
                    },
                  },
                  {
                    title: '推荐用户充值',
                    dataIndex: 'total_recharge_from_referrals',
                    key: 'total_recharge_from_referrals',
                    width: 130,
                    render: (v: number) => (
                      <Text style={{ color: v > 0 ? '#52c41a' : 'rgba(255,255,255,0.45)', fontWeight: 'bold' }}>
                        <RiseOutlined style={{ marginRight: 4 }} />
                        {currencySymbol}{(v || 0).toFixed(2)}
                      </Text>
                    ),
                  },
                  ...(allowedMemberLevels.length > 0 ? [{
                    title: '操作',
                    key: 'action',
                    width: 100,
                    render: (_: any, record: any) => (
                      <Tooltip title="设置成员等级">
                        <Button
                          type="link"
                          size="small"
                          icon={<TrophyOutlined />}
                          onClick={() => openMemberLevelModal(record)}
                          style={{ color: '#1677ff', padding: 0 }}
                        >
                          设置等级
                        </Button>
                      </Tooltip>
                    ),
                  }] : []),
                ]}
              />
            </div>
          ))}
        </Card>
      )}

      {/* Member Section: 我加入的团队 */}
      {memberOnlyTeams.length > 0 && (
        <Card
          style={{
            marginBottom: 24,
            borderRadius: 12,
            background: '#141414',
            border: '1px solid rgba(22,119,255,0.2)',
          }}
          title={
            <Space>
              <TeamOutlined style={{ color: '#1677ff' }} />
              <span style={{ color: '#fff' }}>我加入的团队</span>
            </Space>
          }
          headStyle={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
          loading={myTeamLoading}
        >
          {memberOnlyTeams.map((team: any) => (
            <div key={team.id} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '14px 16px', marginBottom: 8,
              background: 'rgba(255,255,255,0.02)',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.06)',
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 8,
                background: 'rgba(22,119,255,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <TeamOutlined style={{ color: '#1677ff', fontSize: 18 }} />
              </div>
              <div style={{ flex: 1 }}>
                <Text strong style={{ color: '#fff', display: 'block', lineHeight: 1.3 }}>{team.name}</Text>
                {team.description && (
                  <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>{team.description}</Text>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {team.leaders?.map((l: any) => (
                  <Tag key={l.user_id} icon={<CrownOutlined />} color="gold" style={{ margin: 0, borderRadius: 4 }}>
                    {l.username}
                  </Tag>
                ))}
                <Tag style={{
                  margin: 0, borderRadius: 4,
                  background: 'rgba(22,119,255,0.1)',
                  border: '1px solid rgba(22,119,255,0.2)',
                  color: '#1677ff',
                }}>
                  成员
                </Tag>
              </div>
            </div>
          ))}
        </Card>
      )}

      {/* My Referrals Table */}
      <Card
        style={{
          borderRadius: 12,
          background: '#141414',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
        title={
          <Space>
            <TeamOutlined style={{ color: '#1677ff' }} />
            <span style={{ color: '#fff' }}>我的推荐用户</span>
            <Tag style={{
              margin: 0, borderRadius: 10, background: 'rgba(22,119,255,0.1)',
              border: '1px solid rgba(22,119,255,0.2)', color: '#1677ff',
            }}>
              {totalReferrals} 人
            </Tag>
          </Space>
        }
        headStyle={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <Table
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
        />
      </Card>

      {/* Set Level Modal */}
      <Modal
        title={
          <Space>
            <TrophyOutlined style={{ color: '#faad14' }} />
            <span>设置用户等级</span>
          </Space>
        }
        open={levelModalVisible}
        onCancel={() => setLevelModalVisible(false)}
        onOk={handleSetLevel}
        confirmLoading={settingLevel}
        okText="确认设置"
        width={480}
        destroyOnClose
      >
        {levelTargetUser && (
          <div style={{ marginTop: 16 }}>
            <div style={{
              padding: '12px 16px', marginBottom: 16,
              background: 'rgba(255,255,255,0.04)',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.08)',
            }}>
              <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13 }}>
                目标用户：<Text strong style={{ color: '#fff' }}>{levelTargetUser.username}</Text>
                <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, marginLeft: 8 }}>UID: {levelTargetUser.uid}</Text>
              </Text>
              <br />
              <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>
                当前等级：<Tag style={{ margin: '0 0 0 4px', borderRadius: 4, background: 'rgba(22,119,255,0.1)', border: '1px solid rgba(22,119,255,0.2)', color: '#1677ff' }}>
                  {levelTargetUser.level_name || levelTargetUser.user_group}
                </Tag>
              </Text>
            </div>
            <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13, display: 'block', marginBottom: 8 }}>
              选择新等级：
            </Text>
            <Select
              value={selectedGroupKey}
              onChange={setSelectedGroupKey}
              options={allowedLevels.map((l: any) => ({
                value: l.group_key,
                label: (
                  <Space>
                    <TrophyOutlined style={{ color: '#faad14' }} />
                    <span>{l.name}</span>
                    <Tag style={{ margin: 0, borderRadius: 4, fontSize: 11, background: 'rgba(22,119,255,0.1)', border: '1px solid rgba(22,119,255,0.2)', color: '#1677ff' }}>
                      {l.group_key}
                    </Tag>
                  </Space>
                ),
              }))}
              style={{ width: '100%' }}
              placeholder="选择用户等级"
            />
          </div>
        )}
      </Modal>

      {/* Set Member Level Modal */}
      <Modal
        title={
          <Space>
            <TrophyOutlined style={{ color: '#1677ff' }} />
            <span>设置成员等级</span>
          </Space>
        }
        open={memberLevelModalVisible}
        onCancel={() => setMemberLevelModalVisible(false)}
        onOk={handleSetMemberLevel}
        confirmLoading={settingMemberLevel}
        okText="确认设置"
        width={480}
        destroyOnClose
      >
        {memberLevelTarget && (
          <div style={{ marginTop: 16 }}>
            <div style={{
              padding: '12px 16px', marginBottom: 16,
              background: 'rgba(255,255,255,0.04)',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.08)',
            }}>
              <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13 }}>
                团队成员：<Text strong style={{ color: '#fff' }}>{memberLevelTarget.username}</Text>
                <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, marginLeft: 8 }}>UID: {memberLevelTarget.uid}</Text>
              </Text>
              <br />
              <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>
                当前等级：<Tag style={{ margin: '0 0 0 4px', borderRadius: 4, background: 'rgba(22,119,255,0.1)', border: '1px solid rgba(22,119,255,0.2)', color: '#1677ff' }}>
                  {memberLevelTarget.user_group || 'default'}
                </Tag>
              </Text>
            </div>
            <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13, display: 'block', marginBottom: 8 }}>
              选择新等级：
            </Text>
            <Select
              value={selectedMemberGroupKey}
              onChange={setSelectedMemberGroupKey}
              options={allowedMemberLevels.map((l: any) => ({
                value: l.group_key,
                label: (
                  <Space>
                    <TrophyOutlined style={{ color: '#1677ff' }} />
                    <span>{l.name}</span>
                    <Tag style={{ margin: 0, borderRadius: 4, fontSize: 11, background: 'rgba(22,119,255,0.1)', border: '1px solid rgba(22,119,255,0.2)', color: '#1677ff' }}>
                      {l.group_key}
                    </Tag>
                  </Space>
                ),
              }))}
              style={{ width: '100%' }}
              placeholder="选择用户等级"
            />
          </div>
        )}
      </Modal>
    </div>
  );
};

export default AdvancedMarketing;
