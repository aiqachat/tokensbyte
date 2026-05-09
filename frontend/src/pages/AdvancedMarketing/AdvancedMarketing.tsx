import React, { useState, useEffect } from 'react';
import { Typography, Table, Tag, Spin, Space, Button, Card, Statistic, Row, Col, message, Tooltip, Modal, Select, Progress, Tabs, Input, Grid, List } from 'antd';
import { TeamOutlined, UserOutlined, DollarOutlined, ReloadOutlined, CrownOutlined, RiseOutlined, CopyOutlined, LinkOutlined, TrophyOutlined, EditOutlined } from '@ant-design/icons';
import request from '../../utils/request';
import useSettingsStore from '../../store/settings';
import useAuthStore from '../../store/auth';
import type { ReferralUser, ReferralRecharge } from '../../types';
import dayjs from 'dayjs';
import { useThemeStore } from '../../store/theme';

const { Title, Text } = Typography;

const AdvancedMarketing: React.FC = () => {
  const { themeMode } = useThemeStore();
  const _isLight = themeMode === 'light';
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

  // Remark
  const [remarkModalVisible, setRemarkModalVisible] = useState(false);
  const [remarkTargetUser, setRemarkTargetUser] = useState<any>(null);
  const [editingRemark, setEditingRemark] = useState('');
  const [settingRemark, setSettingRemark] = useState(false);
  const screens = Grid.useBreakpoint();
  const isMobile = screens.md === false;

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
    copyToClipboard(link, '团队邀请链接已复制');
  };

  const copyMyInviteLink = () => {
    const link = `${window.location.origin}/register?aff=${user?.uid}`;
    copyToClipboard(link, '推广邀请链接已复制到剪贴板');
  };

  const copyToClipboard = (text: string, successMsg: string) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
          message.success(successMsg);
        }).catch(() => { throw new Error(); });
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
          document.execCommand('copy');
          message.success(successMsg);
        } finally {
          textArea.remove();
        }
      }
    } catch (e) {
      message.error('复制失败，请手动选择复制');
    }
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

  const openRemarkModal = (user: any) => {
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
          <Text strong style={{ color: _isLight ? '#1f2937' : '#fff', display: 'block', lineHeight: 1.3 }}>{username}</Text>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
            <Text style={{ fontSize: 12, color: record.remark ? (_isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)') : (_isLight ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.25)') }}>
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
    },
    {
      title: '详细信息',
      dataIndex: 'email',
      key: 'email',
      ellipsis: true,
      render: (email: string, record: ReferralUser) => (
        <div>
          <Text style={{ fontSize: 13, display: 'block' }}>{email}</Text>
          <Text style={{ color: _isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)', fontSize: 11 }}>UID: {record.uid}</Text>
        </div>
      ),
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
          {name || record.user_group} {allowedLevels.find((l: any) => l.group_key === record.user_group)?.discount !== undefined ? `(${allowedLevels.find((l: any) => l.group_key === record.user_group)?.discount}x)` : ''}
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
      width: 180,
      render: (_: any, record: ReferralUser) => {
        const balance = record.balance || 0;
        const total = record.total_recharge || 0;
        const percent = total > 0 ? Math.min((balance / total) * 100, 100) : 0;
        return (
          <div style={{ minWidth: 120 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 4,
              marginBottom: 4,
            }}>
              <DollarOutlined style={{ color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)', fontSize: 12 }} />
              <Text style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 12, fontWeight: 500 }}>
                {currencySymbol}{balance.toFixed(2)}
              </Text>
              <Text style={{ color: _isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)', fontSize: 12 }}>/</Text>
              <Text style={{ color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)', fontSize: 12 }}>
                {currencySymbol}{total.toFixed(2)}
              </Text>
            </div>
            <Progress
              percent={percent}
              showInfo={false}
              size="small"
              strokeColor={percent > 50 ? '#52c41a' : percent > 20 ? '#faad14' : '#ff4d4f'}
              trailColor="rgba(255,255,255,0.08)"
              style={{ margin: 0, lineHeight: 1, width: 100 }}
            />
          </div>
        );
      },
    },
    {
      title: '时间信息',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (t: string, record: ReferralUser) => (
        <div>
          <Text style={{ fontSize: 12, display: 'block', color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)' }}>注册时间: {dayjs(t).format('YYYY/MM/DD HH:mm')}</Text>
          <Text style={{ fontSize: 12, display: 'block', color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)' }}>关联时间: {dayjs(record.updated_at).format('YYYY/MM/DD HH:mm')}</Text>
        </div>
      ),
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
    <div style={{ width: '100%' }}>
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
            <Title level={4} style={{ margin: 0, color: _isLight ? '#1f2937' : '#fff', lineHeight: 1.3 }}>高级营销</Title>
            <Text style={{ color: _isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)', fontSize: 12 }}>查看我的推荐用户和推广数据</Text>
          </div>
        </div>
        <Button icon={<ReloadOutlined />} onClick={() => { fetchReferrals(); fetchTeamOverview(); fetchMyTeam(); }} loading={loading}>
          刷新
        </Button>
      </div>

            {/* 顶部区域: 我加入的团队 & 统计卡片 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24, alignItems: 'stretch' }}>
        {memberOnlyTeams.length > 0 && (
          <Col xs={24} lg={12}>
{/* Member Section: 我加入的团队 */}
      {memberOnlyTeams.length > 0 && (
        <Card
          size="small"
          style={{
            marginBottom: 0,
            borderRadius: 12,
            background: _isLight ? '#fff' : '#141414',
            border: '1px solid rgba(22,119,255,0.2)',
            height: '100%',
          }}
                    title={
            <Space>
              <TeamOutlined style={{ color: '#1677ff' }} />
              <span style={{ color: _isLight ? '#1f2937' : '#fff' }}>我加入的团队</span>
            </Space>
          }
          headStyle={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
          loading={myTeamLoading}
        >
          {memberOnlyTeams.map((team: any) => (
            <div key={team.id} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '8px 12px', marginBottom: 4,
              background: _isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)',
              borderRadius: 8,
              border: _isLight ? '1px solid rgba(0,0,0,0.06)' : '1px solid rgba(255,255,255,0.06)',
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 8,
                background: 'rgba(22,119,255,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <TeamOutlined style={{ color: '#1677ff', fontSize: 18 }} />
              </div>
              <div style={{ flex: 1 }}>
                <Text strong style={{ color: _isLight ? '#1f2937' : '#fff', display: 'block', lineHeight: 1.3 }}>{team.name}</Text>
                {team.description && (
                  <Text style={{ color: _isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)', fontSize: 12 }}>{team.description}</Text>
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
          </Col>
        )}
        
        <Col xs={24} lg={memberOnlyTeams.length > 0 ? 12 : 24}>
          <Row gutter={[16, 16]} style={{ height: '100%', alignItems: 'stretch' }}>
            <Col xs={12}>
              <Card size="small" loading={loading} style={{
                borderRadius: 12,
                background: 'linear-gradient(135deg, rgba(22,119,255,0.15) 0%, rgba(22,119,255,0.05) 100%)',
                border: '1px solid rgba(22,119,255,0.2)',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center'
              }}>
                <Statistic
                  title={<span style={{ color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)' }}>活跃 / 推荐用户</span>}
                  value={activeReferrals}
                  styles={{ content: { color: '#1677ff', fontSize: 22, fontWeight: 'bold' } }}
                  prefix={<TeamOutlined />}
                  suffix={<span style={{ fontSize: 14, color: _isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)' }}>/ {totalReferrals}</span>}
                />
              </Card>
            </Col>
            <Col xs={12}>
              <Card size="small" loading={loading} style={{
                borderRadius: 12,
                background: 'linear-gradient(135deg, rgba(82,196,26,0.15) 0%, rgba(82,196,26,0.05) 100%)',
                border: '1px solid rgba(82,196,26,0.2)',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center'
              }}>
                <Statistic
                  title={<span style={{ color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)' }}>累计充值</span>}
                  value={totalRecharge}
                  precision={2}
                  prefix={currencySymbol}
                  styles={{ content: { color: '#52c41a', fontSize: 22, fontWeight: 'bold' } }}
                />
              </Card>
            </Col>
          </Row>
        </Col>
      </Row>


      <Row gutter={[24, 24]}>
        <Col xs={24} lg={24}>
          <Card
            style={{ borderRadius: 12, background: _isLight ? '#fff' : '#141414', border: _isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.08)' }}
            bodyStyle={{ padding: '0 16px 16px' }}
          >
            <Tabs 
              defaultActiveKey="1"
              items={[
                {
                  key: '1',
                  label: <span><UserOutlined /> 我的推荐用户 <Tag style={{ margin: '0 0 0 8px', borderRadius: 10, background: 'rgba(22,119,255,0.1)', border: '1px solid rgba(22,119,255,0.2)', color: '#1677ff' }}>{totalReferrals} 人</Tag></span>,
                  children: (
                    <div style={{ paddingTop: 8 }}>
{/* My Referrals Table */}
      <div>
        {/* Personal Invite Link */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 14px', marginBottom: 16,
          background: 'rgba(82,196,26,0.06)',
          border: '1px dashed rgba(82,196,26,0.25)',
          borderRadius: 8,
        }}>
          <LinkOutlined style={{ color: '#52c41a', fontSize: 14 }} />
          <Text style={{ color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)', fontSize: 12 }}>专属客户邀请链接：</Text>
          <Text ellipsis style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 12, flex: 1, fontFamily: 'monospace' }}>
            {window.location.origin}/register?aff={user?.uid}
          </Text>
          <Tooltip title="复制邀请链接">
            <Button
              type="text"
              size="small"
              icon={<CopyOutlined style={{ color: '#52c41a' }} />}
              onClick={copyMyInviteLink}
            />
          </Tooltip>
        </div>
        {isMobile ? (
          <List
            dataSource={referrals}
            loading={loading}
            pagination={{ pageSize: 10 }}
            locale={{ emptyText: '暂无推荐用户' }}
            renderItem={record => (
              <Card size="small" style={{ marginBottom: 12, borderRadius: 8, background: _isLight ? '#fff' : '#141414', border: _isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Text strong style={{ fontSize: 15, color: _isLight ? '#1f2937' : '#fff' }}>{record.username}</Text>
                  {record.is_active === 1 ? <Tag color="success" style={{ margin: 0 }}>活跃</Tag> : <Tag color="default" style={{ margin: 0 }}>停用</Tag>}
                </div>
                <div style={{ marginBottom: 12 }}>
                  <Text style={{ fontSize: 13, color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)', display: 'block' }}>{record.email}</Text>
                  <Text style={{ fontSize: 12, color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)' }}>UID: {record.uid}</Text>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 12, padding: '8px', background: _isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)', borderRadius: 6 }}>
                  <Text style={{ fontSize: 12, color: record.remark ? (_isLight ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.85)') : (_isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)'), flex: 1 }}>
                    {record.remark || '暂无备注'}
                  </Text>
                  <Button type="text" size="small" icon={<EditOutlined style={{ color: '#1677ff' }} />} onClick={() => openRemarkModal(record)} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <Tag color="blue" style={{ margin: 0 }}>{record.level_name || record.user_group} {allowedLevels.find((l: any) => l.group_key === record.user_group)?.discount !== undefined ? `(${allowedLevels.find((l: any) => l.group_key === record.user_group)?.discount}x)` : ''}</Tag>
                  <div style={{ textAlign: 'right' }}>
                    <Text style={{ fontSize: 12, display: 'block', color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)' }}>余额: <span style={{ color: _isLight ? '#1f2937' : '#fff', fontWeight: 500 }}>{currencySymbol}{(record.balance || 0).toFixed(2)}</span></Text>
                    <Text style={{ fontSize: 12, display: 'block', color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)' }}>总充值: <span style={{ color: '#52c41a', fontWeight: 500 }}>{currencySymbol}{(record.total_recharge || 0).toFixed(2)}</span></Text>
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
                <div style={{ padding: '8px 16px', background: _isLight ? '#fafafa' : '#1a1a1a', borderRadius: 8 }}>
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
        )}
      </div>
                    </div>
                  )
                },
                teamData?.is_leader && teamData.teams?.length > 0 ? {
                  key: '2',
                  label: <span><CrownOutlined /> 我的团队成员</span>,
                  children: (
                    <div style={{ paddingTop: 8 }}>
{/* Team Leader Section */}
      {teamData?.is_leader && teamData.teams?.length > 0 && (
        <div>
          {teamData.teams.map((team: any) => (
            <div key={team.id} style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Text strong style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 15 }}>{team.name}</Text>
                {team.description && (
                  <Text style={{ color: _isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)', fontSize: 12 }}>— {team.description}</Text>
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
                  <Text style={{ color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)', fontSize: 12 }}>团队成员邀请链接：</Text>
                  <Text ellipsis style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 12, flex: 1, fontFamily: 'monospace' }}>
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

              {isMobile ? (
                <List
                  dataSource={team.members}
                  pagination={false}
                  locale={{ emptyText: '暂无团队成员' }}
                  renderItem={(record: any) => (
                    <Card size="small" style={{ marginBottom: 12, borderRadius: 8, background: _isLight ? '#fff' : '#141414', border: _isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.08)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                        <Text strong style={{ fontSize: 15, color: _isLight ? '#1f2937' : '#fff' }}>{record.username}</Text>
                        <Tag style={{ margin: 0, borderRadius: 4, background: 'rgba(22,119,255,0.1)', border: '1px solid rgba(22,119,255,0.2)', color: '#1677ff' }}>
                          {record.level_name || record.user_group || 'default'} {allowedMemberLevels.find((l: any) => l.group_key === record.user_group)?.discount !== undefined ? `(${allowedMemberLevels.find((l: any) => l.group_key === record.user_group)?.discount}x)` : ''}
                        </Tag>
                      </div>
                      <div style={{ marginBottom: 12 }}>
                        <Text style={{ fontSize: 12, color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)' }}>UID: {record.uid}</Text>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <div>
                          <Text style={{ fontSize: 12, display: 'block', color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)' }}>推荐人数: <span style={{ color: _isLight ? '#1f2937' : '#fff', fontWeight: 500 }}>{record.referred_count}</span></Text>
                          <Text style={{ fontSize: 12, display: 'block', color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)' }}>推荐充值: <span style={{ color: '#52c41a', fontWeight: 500 }}>{currencySymbol}{(record.total_recharge_from_referrals || 0).toFixed(2)}</span></Text>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <Text style={{ fontSize: 12, display: 'block', color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)' }}>余额: <span style={{ color: _isLight ? '#1f2937' : '#fff', fontWeight: 500 }}>{currencySymbol}{(record.balance || 0).toFixed(2)}</span></Text>
                          <Text style={{ fontSize: 12, display: 'block', color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)' }}>总充值: <span style={{ color: '#52c41a', fontWeight: 500 }}>{currencySymbol}{(record.total_recharge || 0).toFixed(2)}</span></Text>
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
                        <Text strong style={{ color: _isLight ? '#1f2937' : '#fff' }}>{name}</Text>
                        <Text style={{ color: _isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)', fontSize: 11, marginLeft: 8 }}>
                          {record.uid}
                        </Text>
                      </div>
                    ),
                  },
                  {
                    title: '用户等级',
                    dataIndex: 'level_name',
                    key: 'level_name',
                    width: 100,
                    render: (name: string, record: any) => (
                      <Tag style={{ margin: 0, borderRadius: 4, background: 'rgba(22,119,255,0.1)', border: '1px solid rgba(22,119,255,0.2)', color: '#1677ff' }}>
                        {name || record.user_group || 'default'} {allowedMemberLevels.find((l: any) => l.group_key === record.user_group)?.discount !== undefined ? `(${allowedMemberLevels.find((l: any) => l.group_key === record.user_group)?.discount}x)` : ''}
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
                    width: 180,
                    render: (_: any, record: any) => {
                      const balance = record.balance || 0;
                      const total = record.total_recharge || 0;
                      const percent = total > 0 ? Math.min((balance / total) * 100, 100) : 0;
                      return (
                        <div style={{ minWidth: 120 }}>
                          <div style={{
                            display: 'flex', alignItems: 'center', gap: 4,
                            marginBottom: 4,
                          }}>
                            <DollarOutlined style={{ color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)', fontSize: 12 }} />
                            <Text style={{ color: _isLight ? '#1f2937' : '#fff', fontSize: 12, fontWeight: 500 }}>
                              {currencySymbol}{balance.toFixed(2)}
                            </Text>
                            <Text style={{ color: _isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)', fontSize: 12 }}>/</Text>
                            <Text style={{ color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)', fontSize: 12 }}>
                              {currencySymbol}{total.toFixed(2)}
                            </Text>
                          </div>
                          <Progress
                            percent={percent}
                            showInfo={false}
                            size="small"
                            strokeColor={percent > 50 ? '#52c41a' : percent > 20 ? '#faad14' : '#ff4d4f'}
                            trailColor="rgba(255,255,255,0.08)"
                            style={{ margin: 0, lineHeight: 1, width: 100 }}
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
              )}
            </div>
          ))}
        </div>
      )}
                    </div>
                  )
                } : null
              ].filter(Boolean) as any}
            />
          </Card>
        </Col>
      </Row>

      {/* Set Remark Modal */}
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
      </Modal>

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
              background: _isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.04)',
              borderRadius: 8,
              border: _isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.08)',
            }}>
              <Text style={{ color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)', fontSize: 13 }}>
                目标用户：<Text strong style={{ color: _isLight ? '#1f2937' : '#fff' }}>{levelTargetUser.username}</Text>
                <Text style={{ color: _isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)', fontSize: 11, marginLeft: 8 }}>UID: {levelTargetUser.uid}</Text>
              </Text>
              <br />
              <Text style={{ color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)', fontSize: 12 }}>
                当前等级：<Tag style={{ margin: '0 0 0 4px', borderRadius: 4, background: 'rgba(22,119,255,0.1)', border: '1px solid rgba(22,119,255,0.2)', color: '#1677ff' }}>
                  {levelTargetUser.level_name || levelTargetUser.user_group}
                </Tag>
              </Text>
            </div>
            <Text style={{ color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)', fontSize: 13, display: 'block', marginBottom: 8 }}>
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
                    <span>{l.name} ({l.discount !== undefined ? l.discount : 1}x)</span>
                    <Tag style={{ margin: 0, borderRadius: 4, fontSize: 11, background: 'rgba(22,119,255,0.1)', border: '1px solid rgba(22,119,255,0.2)', color: '#1677ff' }}>
                      ULID: {l.id?.toString().padStart(4, '0') || l.group_key}
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
              background: _isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.04)',
              borderRadius: 8,
              border: _isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.08)',
            }}>
              <Text style={{ color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)', fontSize: 13 }}>
                团队成员：<Text strong style={{ color: _isLight ? '#1f2937' : '#fff' }}>{memberLevelTarget.username}</Text>
                <Text style={{ color: _isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)', fontSize: 11, marginLeft: 8 }}>UID: {memberLevelTarget.uid}</Text>
              </Text>
              <br />
              <Text style={{ color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)', fontSize: 12 }}>
                当前等级：<Tag style={{ margin: '0 0 0 4px', borderRadius: 4, background: 'rgba(22,119,255,0.1)', border: '1px solid rgba(22,119,255,0.2)', color: '#1677ff' }}>
                  {memberLevelTarget.user_group || 'default'}
                </Tag>
              </Text>
            </div>
            <Text style={{ color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)', fontSize: 13, display: 'block', marginBottom: 8 }}>
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
                    <span>{l.name} ({l.discount !== undefined ? l.discount : 1}x)</span>
                    <Tag style={{ margin: 0, borderRadius: 4, fontSize: 11, background: 'rgba(22,119,255,0.1)', border: '1px solid rgba(22,119,255,0.2)', color: '#1677ff' }}>
                      ULID: {l.id?.toString().padStart(4, '0') || l.group_key}
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
