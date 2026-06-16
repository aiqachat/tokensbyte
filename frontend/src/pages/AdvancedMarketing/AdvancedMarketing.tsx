import React, { useState, useEffect } from 'react';
import { Typography, Table, Tag, Spin, Space, Button, Card, Statistic, Row, Col, message, Tooltip, Modal, Select, Progress, Tabs, Input, Grid, List, Popconfirm, DatePicker, Radio, Switch } from 'antd';
import { TeamOutlined, UserOutlined, DollarOutlined, ReloadOutlined, CrownOutlined, RiseOutlined, CopyOutlined, LinkOutlined, TrophyOutlined, EditOutlined, UserDeleteOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import request from '../../utils/request';
import useSettingsStore from '../../store/settings';
import useAuthStore from '../../store/auth';
import type { ReferralUser, ReferralRecharge } from '../../types';
import dayjs from 'dayjs';
import { useThemeStore } from '../../store/theme';
import WalletBalanceDisplay from '../../components/WalletBalanceDisplay';
import WalletDetailsView from '../../components/WalletDetailsView';

const { Title, Text } = Typography;

const AdvancedMarketing: React.FC = () => {
  const { t } = useTranslation('team_marketing');
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

  // Search
  const [referralSearchText, setReferralSearchText] = useState('');
  const [teamMemberSearchText, setTeamMemberSearchText] = useState('');
  const [walletTimeFilter, setWalletTimeFilter] = useState<'all' | 'month'>(() => {
    return (localStorage.getItem('walletTimeFilter') as 'all' | 'month') || 'all';
  });
  const [selectedWalletUser, setSelectedWalletUser] = useState<any>(null);
  const [rechargeDetailVisible, setRechargeDetailVisible] = useState(false);
  const [rechargeDetailRange, setRechargeDetailRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().startOf('month'),
    dayjs().endOf('month'),
  ]);
  const [consumptionTotal, setConsumptionTotal] = useState<number>(0);
  const [selectedPayEnabled, setSelectedPayEnabled] = useState(1);

  // 充值记录缓存时间戳（30秒 TTL）
  const rechargeCacheTime = React.useRef<Record<string, number>>({});
  const CACHE_TTL = 30 * 1000; // 30秒

  const openWalletDetails = (user: any) => {
    setSelectedWalletUser(user);
    const targetId = user.id || user.user_id;
    fetchRecharges(targetId);
  };

  useEffect(() => {
    fetchReferrals();
    fetchTeamOverview();
    fetchMyTeam();
    fetchAllowedLevels();
    fetchAllowedMemberLevels();
  }, []);

  useEffect(() => {
    if (rechargeDetailVisible) {
      const [start, end] = rechargeDetailRange;
      const fetchStats = async () => {
        try {
          const res = await (request.get(`/team-marketing/my-referrals/stats?start_date=${start.toISOString()}&end_date=${end.toISOString()}`) as any);
          if (res) setConsumptionTotal(res.total_consumption || 0);
        } catch (e) {
          console.error(e);
        }
      };
      fetchStats();
    }
  }, [rechargeDetailRange, rechargeDetailVisible]);

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
    // 30秒内缓存有效，不重复请求
    const lastFetch = rechargeCacheTime.current[userId];
    if (lastFetch && Date.now() - lastFetch < CACHE_TTL && expandedRecharges[userId]) return;
    try {
      setLoadingRecharges(prev => ({ ...prev, [userId]: true }));
      const res = await (request.get(`/team-marketing/referral/${userId}/recharges`) as any);
      setExpandedRecharges(prev => ({ ...prev, [userId]: res.recharges || [] }));
      rechargeCacheTime.current[userId] = Date.now();
    } catch (e) {
      message.error(t('recharge_failed'));
    } finally {
      setLoadingRecharges(prev => ({ ...prev, [userId]: false }));
    }
  };

  const fetchAllRecharges = async () => {
    try {
      const res = await (request.get(`/team-marketing/my-referrals/all-recharges`) as any);
      const recharges = res.recharges || [];
      const grouped: Record<string, any[]> = {};
      recharges.forEach((r: any) => {
        if (!grouped[r.user_id]) grouped[r.user_id] = [];
        grouped[r.user_id].push(r);
      });
      setExpandedRecharges(prev => ({ ...prev, ...grouped }));
      const now = Date.now();
      Object.keys(grouped).forEach(uid => {
        rechargeCacheTime.current[uid] = now;
      });
    } catch (e) {
      console.error(e);
    }
  };

  const copyTeamInviteLink = (inviteCode: string) => {
    const link = `${window.location.origin}/register?aff=${user?.uid}&team=${inviteCode}`;
    copyToClipboard(link, t('team_invite_copied'));
  };

  const copyMyInviteLink = () => {
    const link = `${window.location.origin}/register?aff=${user?.uid}`;
    copyToClipboard(link, t('invite_link_copied'));
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
      message.error(t('copy_failed'));
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
    setSelectedPayEnabled(record.pay_enabled);
    setLevelModalVisible(true);
  };

  const handleSetLevel = async () => {
    if (!levelTargetUser) return;
    try {
      setSettingLevel(true);
      const promises: Promise<any>[] = [];

      const isLevelChanged = selectedGroupKey !== levelTargetUser.user_group;
      if (isLeader && allowedLevels.length > 0 && isLevelChanged) {
        promises.push(
          request.put(`/team-marketing/referral/${levelTargetUser.id}/level`, {
            group_key: selectedGroupKey,
          })
        );
      }

      const isPayChanged = selectedPayEnabled !== levelTargetUser.pay_enabled;
      if (canSetPay && isPayChanged) {
        promises.push(
          request.put(`/team-marketing/referral/${levelTargetUser.id}/pay`, {
            pay_enabled: selectedPayEnabled,
          })
        );
      }

      if (promises.length > 0) {
        await Promise.all(promises);
        message.success('更新成功');
      } else {
        message.info('数据未发生修改');
      }
      setLevelModalVisible(false);
      fetchReferrals();
    } catch (e: any) {
      message.error(e?.response?.data?.error?.message || '更新失败');
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
      message.success(res.message || t('member_level_set_success'));
      setMemberLevelModalVisible(false);
      fetchTeamOverview();
    } catch (e: any) {
      message.error(e?.response?.data?.error?.message || t('level_set_failed'));
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
      const targetId = remarkTargetUser.id || remarkTargetUser.user_id;
      await (request.put(`/team-marketing/referral/${targetId}/remark`, {
        remark: editingRemark || null,
      }) as any);
      message.success(t('remark_success'));
      setRemarkModalVisible(false);
      fetchReferrals();
      fetchTeamOverview();
    } catch (e: any) {
      message.error(e?.response?.data?.error?.message || t('remark_failed'));
    } finally {
      setSettingRemark(false);
    }
  };

  const handleRemoveMember = async (userId: string, username: string) => {
    try {
      const res = await (request.delete(`/team-marketing/member/${userId}/remove`) as any);
      message.success(res.message || `已成功移除成员 ${username}`);
      fetchTeamOverview();
    } catch (e: any) {
      message.error(e?.response?.data?.error?.message || '移除成员失败');
    }
  };

  // Stats
  const totalReferrals = referrals.length;
  const totalSystemFunds = referrals.reduce((sum, r) => sum + (r.current_month_system_recharge || 0), 0);
  const totalGiftFunds = referrals.reduce((sum, r) => sum + (r.current_month_gift_recharge || 0), 0);
  const totalRecharge = totalSystemFunds + totalGiftFunds;
  const activeReferrals = referrals.filter(r => r.is_active === 1).length;

  const filteredReferrals = referrals.filter(r => {
    if (!referralSearchText) return true;
    const lowerSearch = referralSearchText.toLowerCase();
    return (
      (r.username && r.username.toLowerCase().includes(lowerSearch)) ||
      (r.uid && r.uid.toString().toLowerCase().includes(lowerSearch)) ||
      (r.remark && r.remark.toLowerCase().includes(lowerSearch))
    );
  });

  const filterMembers = (members: any[]) => {
    if (!teamMemberSearchText) return members || [];
    const lowerSearch = teamMemberSearchText.toLowerCase();
    return (members || []).filter(m => (
      (m.username && m.username.toLowerCase().includes(lowerSearch)) ||
      (m.uid && m.uid.toString().toLowerCase().includes(lowerSearch)) ||
      (m.remark && m.remark.toLowerCase().includes(lowerSearch))
    ));
  };

  const canSetPay = isLeader || (myTeamData?.teams || []).some((t: any) => t.role === 'member' && t.members_can_set_pay === 1);

  const columns = [
    {
      title: t('username'),
      dataIndex: 'username',
      key: 'username',
      render: (username: string, record: ReferralUser) => (
        <div>
          <Text strong style={{ color: _isLight ? '#1f2937' : '#fff', display: 'block', lineHeight: 1.3 }}>{username}</Text>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
            <Text style={{ fontSize: 12, color: record.remark ? (_isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)') : (_isLight ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.25)') }}>
              {record.remark || t('no_remark')}
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
      title: t('detail_info'),
      dataIndex: 'email',
      key: 'email',
      ellipsis: true,
      render: (email: string, record: ReferralUser) => (
        <div>
          {email && !email.endsWith('@tokensbyte.local') && (
            <Text style={{ fontSize: 13, display: 'block' }}>{email}</Text>
          )}
          <Text style={{ color: _isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)', fontSize: 11 }}>UID: {record.uid}</Text>
        </div>
      ),
    },

    {
      title: t('user_level'),
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
      title: t('status'),
      dataIndex: 'is_active',
      key: 'is_active',
      width: 80,
      render: (v: number) => v === 1
        ? <Tag color="success">{ t('active') }</Tag>
        : <Tag color="default">{ t('inactive') }</Tag>,
    },

    {
      title: (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <span>{t('wallet_balance')}</span>
          <Select
            size="small"
            value={walletTimeFilter}
            onChange={(v) => {
              setWalletTimeFilter(v);
              localStorage.setItem('walletTimeFilter', v);
            }}
            bordered={false}
            options={[
              { label: '全部数据', value: 'all' },
              { label: '当月数据', value: 'month' },
            ]}
            style={{ width: 100, marginLeft: 8 }}
            popupMatchSelectWidth={false}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ),
      key: 'balance_quota',
      width: 320,
      render: (_: any, record: ReferralUser) => (
        <WalletBalanceDisplay 
          record={record} 
          onWalletClick={openWalletDetails} 
          systemLabel={t('system_wallet')} 
          giftLabel={t('gift_wallet')} 
          totalRecharge={record.total_recharge}
          monthStats={
            walletTimeFilter === 'month'
              ? {
                  recharge_amount: record.current_month_system_recharge || 0,
                  gift_amount: record.current_month_gift_recharge || 0,
                }
              : undefined
          }
        />
      ),
    },
    {
      title: t('time_info'),
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (timeStr: string, record: ReferralUser) => (
        <div>
          <Text style={{ fontSize: 12, display: 'block', color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)' }}>{t('register_time')}: {dayjs(timeStr).format('YYYY/MM/DD HH:mm')}</Text>
          <Text style={{ fontSize: 12, display: 'block', color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)' }}>{t('bindtime')}: {dayjs(record.updated_at).format('YYYY/MM/DD HH:mm')}</Text>
        </div>
      ),
    },
    // 操作列：等级分配或支付权限修改
    ...((isLeader && allowedLevels.length > 0) || canSetPay ? [{
      title: t('actions'),
      key: 'action',
      width: 80,
      render: (_: any, record: ReferralUser) => (
        <Tooltip title="编辑推广用户">
          <Button
            icon={<EditOutlined />}
            onClick={() => openLevelModal(record)}
          />
        </Tooltip>
      ),
    }] : []),
  ];


  // 判断用户是否只是成员（不是负责人）
  const memberOnlyTeams = (myTeamData?.teams || []).filter((t: any) => t.role === 'member');

  return (
    <div style={{ width: '100%' }}>
      <>
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
            <Title level={4} style={{ margin: 0, color: _isLight ? '#1f2937' : '#fff', lineHeight: 1.3 }}>{ t('title') }</Title>
            <Text style={{ color: _isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)', fontSize: 12 }}>{ t('subtitle') }</Text>
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
              <span style={{ color: _isLight ? '#1f2937' : '#fff' }}>{ t('my_teams') }</span>
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
                  prefix={<TeamOutlined />}
                  suffix={<span style={{ fontSize: screens.xs ? 11 : 14, color: _isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)' }}>/ {totalReferrals}</span>}
                  styles={{
                    content: {
                      color: '#1677ff',
                      fontSize: screens.xs ? 18 : 22,
                      fontWeight: 'bold',
                      wordBreak: 'break-all',
                      whiteSpace: 'normal',
                      lineHeight: '1.2'
                    }
                  }}
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
                  title={<span style={{ color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)' }}>当月累计充值</span>}
                  value={totalRecharge}
                  precision={2}
                  prefix={<span style={{ fontSize: screens.xs ? (totalRecharge && totalRecharge.toLocaleString().length > 12 ? 12 : 16) : 18 }}>{currencySymbol}</span>}
                  styles={{
                    content: {
                      color: '#52c41a',
                      fontSize: screens.xs
                        ? (totalRecharge && totalRecharge.toLocaleString().length > 12 ? 13 : 18)
                        : 22,
                      fontWeight: 'bold',
                      wordBreak: 'break-all',
                      whiteSpace: 'normal',
                      lineHeight: '1.2'
                    }
                  }}
                />
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4, width: '100%', overflowWrap: 'break-word', wordBreak: 'break-all' }}>
                  <Text style={{ fontSize: screens.xs ? 10 : 12, color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)', display: 'block', lineHeight: 1.3 }}>
                    系统资金：<span style={{ color: '#1677ff', fontWeight: 500 }}>{currencySymbol}{totalSystemFunds.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </Text>
                  <Text style={{ fontSize: screens.xs ? 10 : 12, color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)', display: 'block', lineHeight: 1.3 }}>
                    赠送资金：<span style={{ color: '#faad14', fontWeight: 500 }}>🎁 {currencySymbol}{totalGiftFunds.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </Text>
                  <Button
                    type="link"
                    size="small"
                    style={{ padding: 0, fontSize: screens.xs ? 10 : 12, height: 'auto', color: '#52c41a' }}
                    onClick={() => {
                      setRechargeDetailVisible(true);
                      fetchAllRecharges();
                    }}
                  >
                    查看明细 →
                  </Button>
                </div>
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
                  label: <span><UserOutlined /> 推荐的普通用户 <Tag style={{ margin: '0 0 0 8px', borderRadius: 10, background: 'rgba(22,119,255,0.1)', border: '1px solid rgba(22,119,255,0.2)', color: '#1677ff' }}>{totalReferrals} 人</Tag></span>,
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

        {/* Search */}
        <div style={{ marginBottom: 16 }}>
          <Input.Search
            placeholder="通过 UID、用户名、备注搜索推荐用户..."
            allowClear
            onChange={(e) => setReferralSearchText(e.target.value)}
            style={{ maxWidth: 320 }}
          />
        </div>

        {isMobile ? (
          <List
            dataSource={filteredReferrals}
            loading={loading}
            pagination={{ defaultPageSize: 10, showSizeChanger: true, pageSizeOptions: ['10', '15', '20', '50'] }}
            locale={{ emptyText: '暂无推荐用户' }}
            renderItem={record => (
              <Card size="small" style={{ marginBottom: 12, borderRadius: 8, background: _isLight ? '#fff' : '#141414', border: _isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Text strong style={{ fontSize: 15, color: _isLight ? '#1f2937' : '#fff' }}>{record.username}</Text>
                  {record.is_active === 1 ? <Tag color="success" style={{ margin: 0 }}>{ t('active') }</Tag> : <Tag color="default" style={{ margin: 0 }}>{ t('inactive') }</Tag>}
                </div>
                <div style={{ marginBottom: 12 }}>
                  {record.email && !record.email.endsWith('@tokensbyte.local') && (
                    <Text style={{ fontSize: 13, color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)', display: 'block' }}>{record.email}</Text>
                  )}
                  <Text style={{ fontSize: 12, color: _isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)' }}>UID: {record.uid}</Text>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 12, padding: '8px', background: _isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)', borderRadius: 6 }}>
                  <Text style={{ fontSize: 12, color: record.remark ? (_isLight ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.85)') : (_isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)'), flex: 1 }}>
                    {record.remark || t('no_remark')}
                  </Text>
                  <Button type="text" size="small" icon={<EditOutlined style={{ color: '#1677ff' }} />} onClick={() => openRemarkModal(record)} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <Tag color="blue" style={{ margin: 0 }}>{record.level_name || record.user_group} {allowedLevels.find((l: any) => l.group_key === record.user_group)?.discount !== undefined ? `(${allowedLevels.find((l: any) => l.group_key === record.user_group)?.discount}x)` : ''}</Tag>
                  <div style={{ textAlign: 'right' }}>
                    <Text style={{ fontSize: 12, display: 'block', color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)' }}>系统: <span style={{ color: _isLight ? '#1f2937' : '#fff', fontWeight: 500 }}>{currencySymbol}{(record.balance || 0).toFixed(2)}</span><span style={{ color: _isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)' }}> / {currencySymbol}{((record.balance || 0) + (record.used_quota || 0)).toFixed(2)}</span></Text>
                    {((record.gift_balance || 0) + (record.gift_used_quota || 0)) > 0 && (
                      <Text style={{ fontSize: 12, display: 'block', color: '#faad14' }}>🎁 {currencySymbol}{(record.gift_balance || 0).toFixed(2)}<span style={{ color: _isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)' }}> / {currencySymbol}{((record.gift_balance || 0) + (record.gift_used_quota || 0)).toFixed(2)}</span></Text>
                    )}
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
                                  <Text type="secondary" style={{ fontSize: 12 }}>{{ 'manual': t('type_manual'), 'gift': t('type_registration'), 'commission': t('type_commission'), 'transfer': t('type_transfer'), 'alipay': t('type_alipay'), 'wechat': t('type_wechat'), 'redemption': t('type_redemption') }[r.recharge_type as string] || r.recharge_type}</Text>
                                </div>
                                <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>{r.created_at}{r.operator ? ` · 操作人: ${r.operator}` : ''}</Text>
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
          dataSource={filteredReferrals}
          columns={columns}
          rowKey="id"
          loading={loading}
          size="small"
          pagination={{ defaultPageSize: 15, showSizeChanger: true, pageSizeOptions: ['10', '15', '20', '50'] }}
          scroll={{ x: 'max-content' }}
          locale={{ emptyText: '暂无推荐用户' }}
        />
        )}
      </div>
                    </div>
                  )
                },
                teamData?.is_leader && teamData.teams?.length > 0 ? {
                  key: '2',
                  label: <span><CrownOutlined /> 业务员管理</span>,
                  children: (
                    <div style={{ paddingTop: 8 }}>
{/* Team Leader Section */}
      {teamData?.is_leader && teamData.teams?.length > 0 && (
        <div>
          <div style={{ marginBottom: 16 }}>
            <Input.Search
              placeholder="通过 UID、用户名、备注搜索业务员..."
              allowClear
              onChange={(e) => setTeamMemberSearchText(e.target.value)}
              style={{ maxWidth: 320 }}
            />
          </div>
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
                  dataSource={filterMembers(team.members)}
                  pagination={{ defaultPageSize: 10, showSizeChanger: true, pageSizeOptions: ['10', '15', '20', '50'] }}
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 12, padding: '8px', background: _isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)', borderRadius: 6 }}>
                        <Text style={{ fontSize: 12, color: record.remark ? (_isLight ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.85)') : (_isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)'), flex: 1 }}>
                          {record.remark || t('no_remark')}
                        </Text>
                        <Button type="text" size="small" icon={<EditOutlined style={{ color: '#1677ff' }} />} onClick={() => openRemarkModal(record)} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <div>
                          <Text style={{ fontSize: 12, display: 'block', color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)' }}>推荐人数: <span style={{ color: _isLight ? '#1f2937' : '#fff', fontWeight: 500 }}>{record.referred_count}</span></Text>
                          <Text style={{ fontSize: 12, display: 'block', color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)' }}>推荐充值: <span style={{ color: '#52c41a', fontWeight: 500 }}>{currencySymbol}{(record.total_recharge_from_referrals || 0).toFixed(2)}</span></Text>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <Text style={{ fontSize: 12, display: 'block', color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)' }}>余额: <span style={{ color: _isLight ? '#1f2937' : '#fff', fontWeight: 500 }}>{currencySymbol}{(record.balance || 0).toFixed(2)}</span></Text>
                          {(record.credit_limit || 0) > 0 && <Text style={{ fontSize: 12, display: 'block', color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)' }}>信控: <span style={{ color: '#1677ff', fontWeight: 500 }}>{currencySymbol}{(record.credit_limit || 0).toFixed(0)}</span></Text>}
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
                      {team.leader_can_remove_members === 1 && (
                        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 8, textAlign: 'center' }}>
                          <Popconfirm
                            title={`确定移除成员 ${record.username}？`}
                            description={<div style={{ maxWidth: 220 }}>移除后用户不再属于此团队，<br/>用户等级恢复默认等级</div>}
                            onConfirm={() => handleRemoveMember(record.user_id, record.username)}
                            okText="确定移除"
                            cancelText="取消"
                            okButtonProps={{ danger: true }}
                          >
                            <Button
                              type="link"
                              size="small"
                              danger
                              icon={<UserDeleteOutlined />}
                              style={{ padding: 0 }}
                            >
                              移除成员
                            </Button>
                          </Popconfirm>
                        </div>
                      )}
                    </Card>
                  )}
                />
              ) : (
                <Table
                dataSource={filterMembers(team.members)}
                rowKey="user_id"
                size="small"
                pagination={{ defaultPageSize: 15, showSizeChanger: true, pageSizeOptions: ['10', '15', '20', '50'] }}
                scroll={{ x: 'max-content' }}
                columns={[
                  {
                    title: '推广员',
                    dataIndex: 'username',
                    key: 'username',
                    render: (name: string, record: any) => (
                      <div>
                        <Text strong style={{ color: _isLight ? '#1f2937' : '#fff', display: 'block', lineHeight: 1.3 }}>{name}</Text>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, marginBottom: 4 }}>
                          <Text style={{ fontSize: 12, color: record.remark ? (_isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)') : (_isLight ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.25)') }}>
                            {record.remark || t('no_remark')}
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
                        <Text style={{ color: _isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)', fontSize: 11 }}>
                          UID: {record.uid}
                        </Text>
                      </div>
                    ),
                  },
                  {
                    title: t('user_level'),
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
                    title: t('wallet_balance'),
                    key: 'member_balance_quota',
                    width: 320,
                    render: (_: any, record: any) => (
                      <WalletBalanceDisplay 
                        record={record} 
                        onWalletClick={openWalletDetails} 
                        systemLabel={t('system_wallet')} 
                        giftLabel={t('gift_wallet')} 
                        totalRecharge={record.total_recharge}
                      />
                    ),
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
                  ...(allowedMemberLevels.length > 0 || teamData?.teams?.some((t: any) => t.leader_can_remove_members === 1) ? [{
                    title: t('actions'),
                    key: 'action',
                    width: allowedMemberLevels.length > 0 && teamData?.teams?.some((t: any) => t.leader_can_remove_members === 1) ? 180 : 100,
                    render: (_: any, record: any) => (
                      <Space size={4}>
                        {allowedMemberLevels.length > 0 && (
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
                        )}
                        {team.leader_can_remove_members === 1 && (
                          <Popconfirm
                            title={`确定移除成员 ${record.username}？`}
                            description={<div style={{ maxWidth: 220 }}>移除后用户不再属于此团队，<br/>用户等级恢复默认等级</div>}
                            onConfirm={() => handleRemoveMember(record.user_id, record.username)}
                            okText="确定移除"
                            cancelText="取消"
                            okButtonProps={{ danger: true }}
                          >
                            <Button
                              type="link"
                              size="small"
                              danger
                              icon={<UserDeleteOutlined />}
                              style={{ padding: 0 }}
                            >
                              移除
                            </Button>
                          </Popconfirm>
                        )}
                      </Space>
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
      </>

      {/* 钱包明细 Modal */}
      <Modal
        title={`${selectedWalletUser?.username || ''} 的钱包明细`}
        open={!!selectedWalletUser}
        onCancel={() => { setSelectedWalletUser(null); }}
        footer={null}
        width={800}
        destroyOnClose
      >
        {selectedWalletUser && (() => {
          const uid = selectedWalletUser.id || selectedWalletUser.user_id;
          const allRecharges = expandedRecharges[uid] || [];
          return (
            <WalletDetailsView
              key={uid}
              user={selectedWalletUser}
              recharges={allRecharges}
              loading={loadingRecharges[uid]}
              useReferralApi
            />
          );
        })()}
      </Modal>

      {/* 推广数据明细 Modal */}
      <Modal
        title="推广数据明细"
        open={rechargeDetailVisible}
        onCancel={() => setRechargeDetailVisible(false)}
        footer={null}
        width={780}
        destroyOnClose
      >
        {/* 日期过滤 */}
        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>时间范围：</Text>
          <Radio.Group
            size="small"
            buttonStyle="outline"
            value={(() => {
              const [s, e] = rechargeDetailRange;
              const now = dayjs();
              if (s.isSame(now.startOf('month'), 'day') && e.isSame(now.endOf('month'), 'day')) return 'thisMonth';
              const lm = now.subtract(1, 'month');
              if (s.isSame(lm.startOf('month'), 'day') && e.isSame(lm.endOf('month'), 'day')) return 'lastMonth';
              if (s.isSame(now.startOf('year'), 'day') && e.isSame(now.endOf('year'), 'day')) return 'thisYear';
              if (s.isSame(now.subtract(6, 'month').startOf('day'), 'day') && e.isSame(now.endOf('day'), 'day')) return 'lastHalfYear';
              if (s.isSame(now.subtract(1, 'year').startOf('day'), 'day') && e.isSame(now.endOf('day'), 'day')) return 'lastYear';
              if (s.isSame(dayjs('2000-01-01'), 'day') && e.isSame(now.add(10, 'year').endOf('day'), 'day')) return 'all';
              return 'custom';
            })()}
            onChange={e => {
              const now = dayjs();
              if (e.target.value === 'thisMonth') setRechargeDetailRange([now.startOf('month'), now.endOf('month')]);
              else if (e.target.value === 'lastMonth') { const lm = now.subtract(1,'month'); setRechargeDetailRange([lm.startOf('month'), lm.endOf('month')]); }
              else if (e.target.value === 'thisYear') setRechargeDetailRange([now.startOf('year'), now.endOf('year')]);
              else if (e.target.value === 'lastHalfYear') setRechargeDetailRange([now.subtract(6, 'month').startOf('day'), now.endOf('day')]);
              else if (e.target.value === 'lastYear') setRechargeDetailRange([now.subtract(1, 'year').startOf('day'), now.endOf('day')]);
              else if (e.target.value === 'all') setRechargeDetailRange([dayjs('2000-01-01'), now.add(10, 'year').endOf('day')]);
            }}
          >
            <Radio.Button value="thisMonth">当月</Radio.Button>
            <Radio.Button value="lastMonth">上月</Radio.Button>
            <Radio.Button value="thisYear">当年</Radio.Button>
            <Radio.Button value="lastHalfYear">最近半年</Radio.Button>
            <Radio.Button value="lastYear">最近一年</Radio.Button>
            <Radio.Button value="all">全部</Radio.Button>
          </Radio.Group>
          <DatePicker.RangePicker
            size="small"
            value={rechargeDetailRange}
            onChange={v => { if (v && v[0] && v[1]) setRechargeDetailRange([v[0], v[1]]); }}
            style={{ flex: 1, minWidth: 200 }}
          />
        </div>

        {/* 三个 Tab */}
        {(() => {
          // 按日期范围过滤 expandedRecharges 中某用户指定钱包类型的合计
          const calcAmount = (userId: string, walletType: string): number => {
            const records = expandedRecharges[userId] || [];
            const [start, end] = rechargeDetailRange;
            return records
              .filter(r => {
                if ((r.wallet_type || 'system') !== walletType) return false;
                const d = dayjs(r.created_at);
                return (d.isAfter(start.startOf('day').subtract(1,'ms')) && d.isBefore(end.endOf('day').add(1,'ms')));
              })
              .reduce((sum, r) => sum + (r.amount || 0), 0);
          };

          // 累计充值Tab：展开每一条 system 钱包充值流水记录
          const [start, end] = rechargeDetailRange;
          const allRechargeRows: any[] = [];
          referrals.forEach(r => {
            const records = expandedRecharges[r.id] || [];
            records
              .filter(rec => {
                if ((rec.wallet_type || 'system') !== 'system') return false;
                const d = dayjs(rec.created_at);
                return d.isAfter(start.startOf('day').subtract(1, 'ms')) && d.isBefore(end.endOf('day').add(1, 'ms'));
              })
              .forEach(rec => {
                allRechargeRows.push({ ...rec, _username: r.username, _uid: r.uid, _rowKey: `${r.id}_${rec.id}` });
              });
          });
          allRechargeRows.sort((a, b) => dayjs(b.created_at).valueOf() - dayjs(a.created_at).valueOf());
          const allRechargeTotal = allRechargeRows.reduce((s, r) => s + (r.amount || 0), 0);

          // 各Tab流水行数据（展开每条记录，按时间降序）
          const buildRows = (walletType: string) => {
            const rows: any[] = [];
            referrals.forEach(r => {
              (expandedRecharges[r.id] || [])
                .filter(rec => {
                  if ((rec.wallet_type || 'system') !== walletType) return false;
                  const d = dayjs(rec.created_at);
                  return d.isAfter(start.startOf('day').subtract(1, 'ms')) && d.isBefore(end.endOf('day').add(1, 'ms'));
                })
                .forEach(rec => rows.push({ ...rec, _username: r.username, _uid: r.uid, _rowKey: `${walletType}_${r.id}_${rec.id}` }));
            });
            return rows.sort((a, b) => dayjs(b.created_at).valueOf() - dayjs(a.created_at).valueOf());
          };
          const allSystemRows = buildRows('system');
          const allGiftRows = buildRows('gift');
          const allSystemTotal = allSystemRows.reduce((s, r) => s + (r.amount || 0), 0);
          const allGiftTotal = allGiftRows.reduce((s, r) => s + (r.amount || 0), 0);
          const allUsedQuotaTotal = consumptionTotal;

          const isLoading = referrals.some(r => loadingRecharges[r.id]);
          const loadedCount = referrals.filter(r => expandedRecharges[r.id] !== undefined).length;

          const getLabelPrefix = () => {
            const [s, e] = rechargeDetailRange;
            const now = dayjs();
            if (s.isSame(now.startOf('month'), 'day') && e.isSame(now.endOf('month'), 'day')) return '当月';
            const lm = now.subtract(1, 'month');
            if (s.isSame(lm.startOf('month'), 'day') && e.isSame(lm.endOf('month'), 'day')) return '上月';
            if (s.isSame(now.startOf('year'), 'day') && e.isSame(now.endOf('year'), 'day')) return '当年';
            if (s.isSame(now.subtract(6, 'month').startOf('day'), 'day') && e.isSame(now.endOf('day'), 'day')) return '近半年';
            if (s.isSame(now.subtract(1, 'year').startOf('day'), 'day') && e.isSame(now.endOf('day'), 'day')) return '近一年';
            if (s.isSame(dayjs('2000-01-01'), 'day') && e.isSame(now.add(10, 'year').endOf('day'), 'day')) return '总';
            return '所选时间段';
          };
          const labelPrefix = getLabelPrefix();

          const userCol = {
            title: '用户名',
            key: 'username',
            render: (_: any, record: any) => (
              <div>
                <Text strong style={{ fontSize: 13 }}>{record.username}</Text>
                <br />
                <Text type="secondary" style={{ fontSize: 11 }}>UID: {record.uid}</Text>
              </div>
            ),
          };

          const amountCol = (title: string, key: string, color = '#52c41a') => ({
            title,
            key,
            align: 'right' as const,
            render: (_: any, record: any) => {
              const v: number = record._amount;
              const loaded = expandedRecharges[record.id] !== undefined;
              if (!loaded && loadingRecharges[record.id]) return <Spin size="small" />;
              return (
                <Text style={{ color: v > 0 ? color : v < 0 ? '#ff4d4f' : undefined, fontWeight: 600, fontSize: 13 }}>
                  {currencySymbol}{v.toFixed(2)}
                </Text>
              );
            },
          });

          return (
            <>
              <div style={{ display: 'flex', gap: 24, marginBottom: 16, background: _isLight ? '#fafafa' : '#141414', padding: '12px 16px', borderRadius: 8, border: `1px solid ${_isLight ? '#f0f0f0' : '#303030'}`, flexWrap: 'wrap' }}>
                <Statistic title={`${labelPrefix}充值合计`} value={allRechargeTotal} precision={2} prefix={currencySymbol} valueStyle={{ color: '#52c41a', fontSize: 18, fontWeight: 600 }} />
                <Statistic title={`${labelPrefix}系统资金消费合计`} value={allUsedQuotaTotal} precision={2} prefix={currencySymbol} valueStyle={{ color: '#eb2f96', fontSize: 18, fontWeight: 600 }} />
                <Statistic title={`${labelPrefix}系统资金合计`} value={allSystemTotal} precision={2} prefix={currencySymbol} valueStyle={{ color: '#1677ff', fontSize: 18, fontWeight: 600 }} />
                <Statistic title={`${labelPrefix}赠送资金合计`} value={allGiftTotal} precision={2} prefix={currencySymbol} valueStyle={{ color: '#faad14', fontSize: 18, fontWeight: 600 }} />
              </div>
              {isLoading && (
                <div style={{ marginBottom: 8 }}>
                  <Text type="secondary" style={{ fontSize: 11 }}>正在加载明细数据... {loadedCount}/{referrals.length}</Text>
                </div>
              )}
              <Tabs
                size="small"
                items={[
                  {
                    key: 'recharge',
                    label: '累计充值',
                    children: (
                      <Table
                        size="small"
                        rowKey="_rowKey"
                        pagination={false}
                        scroll={{ y: 380 }}
                        dataSource={allRechargeRows}
                        locale={{ emptyText: loadedCount < referrals.length ? '数据加载中...' : '该时间段内无充值记录' }}
                        columns={[
                          {
                            title: '时间',
                            key: 'created_at',
                            width: 150,
                            render: (_: any, record: any) => (
                              <Text style={{ fontSize: 12, color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)' }}>
                                {dayjs(record.created_at).format('MM-DD HH:mm:ss')}
                              </Text>
                            ),
                          },
                          {
                            title: '用户',
                            key: 'user',
                            render: (_: any, record: any) => (
                              <div>
                                <Text strong style={{ fontSize: 13 }}>{record._username}</Text>
                                <br />
                                <Text type="secondary" style={{ fontSize: 11 }}>UID: {record._uid}</Text>
                              </div>
                            ),
                          },
                          {
                            title: '备注',
                            key: 'remark',
                            render: (_: any, record: any) => (
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                {record.remark || record.recharge_type || '—'}
                              </Text>
                            ),
                          },
                          {
                            title: `金额 (${currencySymbol})`,
                            key: 'amount',
                            align: 'right' as const,
                            width: 100,
                            render: (_: any, record: any) => {
                              const v = record.amount || 0;
                              return (
                                <Text style={{ color: v > 0 ? '#52c41a' : v < 0 ? '#ff4d4f' : undefined, fontWeight: 600, fontSize: 13 }}>
                                  {v > 0 ? '+' : ''}{currencySymbol}{v.toFixed(2)}
                                </Text>
                              );
                            },
                          },
                        ]}
                        summary={() => (
                          <Table.Summary fixed>
                            <Table.Summary.Row>
                              <Table.Summary.Cell index={0} colSpan={3}>
                                <Text strong>合计（{allRechargeRows.length} 笔）</Text>
                              </Table.Summary.Cell>
                              <Table.Summary.Cell index={1} align="right">
                                <Text strong style={{ color: allRechargeTotal >= 0 ? '#52c41a' : '#ff4d4f', fontSize: 14 }}>
                                  {allRechargeTotal > 0 ? '+' : ''}{currencySymbol}{allRechargeTotal.toFixed(2)}
                                </Text>
                              </Table.Summary.Cell>
                            </Table.Summary.Row>
                          </Table.Summary>
                        )}
                      />
                    ),
                  },

                  {
                    key: 'system',
                    label: '系统资金',
                    children: (
                      <Table
                        size="small" rowKey="_rowKey" pagination={false} scroll={{ y: 380 }}
                        dataSource={allSystemRows}
                        locale={{ emptyText: loadedCount < referrals.length ? '数据加载中...' : '该时间段内无系统资金记录' }}
                        columns={[
                          {
                            title: '时间', key: 'created_at', width: 150,
                            render: (_: any, record: any) => (
                              <Text style={{ fontSize: 12, color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)' }}>
                                {dayjs(record.created_at).format('MM-DD HH:mm:ss')}
                              </Text>
                            ),
                          },
                          {
                            title: '用户', key: 'user',
                            render: (_: any, record: any) => (
                              <div>
                                <Text strong style={{ fontSize: 13 }}>{record._username}</Text>
                                <br />
                                <Text type="secondary" style={{ fontSize: 11 }}>UID: {record._uid}</Text>
                              </div>
                            ),
                          },
                          {
                            title: '备注', key: 'remark',
                            render: (_: any, record: any) => (
                              <Text type="secondary" style={{ fontSize: 12 }}>{record.remark || record.recharge_type || '—'}</Text>
                            ),
                          },
                          {
                            title: `金额 (${currencySymbol})`, key: 'amount', align: 'right' as const, width: 100,
                            render: (_: any, record: any) => {
                              const v = record.amount || 0;
                              return <Text style={{ color: v > 0 ? '#1677ff' : v < 0 ? '#ff4d4f' : undefined, fontWeight: 600, fontSize: 13 }}>{v > 0 ? '+' : ''}{currencySymbol}{v.toFixed(2)}</Text>;
                            },
                          },
                        ]}
                        summary={() => (
                          <Table.Summary fixed>
                            <Table.Summary.Row>
                              <Table.Summary.Cell index={0} colSpan={3}><Text strong>合计（{allSystemRows.length} 笔）</Text></Table.Summary.Cell>
                              <Table.Summary.Cell index={1} align="right">
                                <Text strong style={{ color: allSystemTotal >= 0 ? '#1677ff' : '#ff4d4f', fontSize: 14 }}>
                                  {allSystemTotal > 0 ? '+' : ''}{currencySymbol}{allSystemTotal.toFixed(2)}
                                </Text>
                              </Table.Summary.Cell>
                            </Table.Summary.Row>
                          </Table.Summary>
                        )}
                      />
                    ),
                  },
                  {
                    key: 'gift',
                    label: '赠送资金',
                    children: (
                      <Table
                        size="small" rowKey="_rowKey" pagination={false} scroll={{ y: 380 }}
                        dataSource={allGiftRows}
                        locale={{ emptyText: loadedCount < referrals.length ? '数据加载中...' : '该时间段内无赠送记录' }}
                        columns={[
                          {
                            title: '时间', key: 'created_at', width: 150,
                            render: (_: any, record: any) => (
                              <Text style={{ fontSize: 12, color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)' }}>
                                {dayjs(record.created_at).format('MM-DD HH:mm:ss')}
                              </Text>
                            ),
                          },
                          {
                            title: '用户', key: 'user',
                            render: (_: any, record: any) => (
                              <div>
                                <Text strong style={{ fontSize: 13 }}>{record._username}</Text>
                                <br />
                                <Text type="secondary" style={{ fontSize: 11 }}>UID: {record._uid}</Text>
                              </div>
                            ),
                          },
                          {
                            title: '备注', key: 'remark',
                            render: (_: any, record: any) => (
                              <Text type="secondary" style={{ fontSize: 12 }}>{record.remark || record.recharge_type || '—'}</Text>
                            ),
                          },
                          {
                            title: `金额 (${currencySymbol})`, key: 'amount', align: 'right' as const, width: 100,
                            render: (_: any, record: any) => {
                              const v = record.amount || 0;
                              return <Text style={{ color: v > 0 ? '#faad14' : v < 0 ? '#ff4d4f' : undefined, fontWeight: 600, fontSize: 13 }}>{v > 0 ? '+' : ''}{currencySymbol}{v.toFixed(2)}</Text>;
                            },
                          },
                        ]}
                        summary={() => (
                          <Table.Summary fixed>
                            <Table.Summary.Row>
                              <Table.Summary.Cell index={0} colSpan={3}><Text strong>合计（{allGiftRows.length} 笔）</Text></Table.Summary.Cell>
                              <Table.Summary.Cell index={1} align="right">
                                <Text strong style={{ color: allGiftTotal >= 0 ? '#faad14' : '#ff4d4f', fontSize: 14 }}>
                                  {allGiftTotal > 0 ? '+' : ''}{currencySymbol}{allGiftTotal.toFixed(2)}
                                </Text>
                              </Table.Summary.Cell>
                            </Table.Summary.Row>
                          </Table.Summary>
                        )}
                      />
                    ),
                  },
                ]}
              />
            </>
          );
        })()}
      </Modal>

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
            <EditOutlined style={{ color: '#1677ff' }} />
            <span>编辑推广用户</span>
          </Space>
        }
        open={levelModalVisible}
        onCancel={() => setLevelModalVisible(false)}
        onOk={handleSetLevel}
        confirmLoading={settingLevel}
        okText="确认修改"
        width={480}
        destroyOnClose
      >
        {levelTargetUser && (
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{
              padding: '12px 16px',
              background: _isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.04)',
              borderRadius: 8,
              border: _isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.08)',
              display: 'flex',
              flexDirection: 'column',
              gap: 4
            }}>
              <Text style={{ color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)', fontSize: 13 }}>
                目标用户：<Text strong style={{ color: _isLight ? '#1f2937' : '#fff' }}>{levelTargetUser.username}</Text>
                <Text style={{ color: _isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)', fontSize: 11, marginLeft: 8 }}>UID: {levelTargetUser.uid}</Text>
              </Text>
              {selectedPayEnabled === 0 && (
                <div style={{ marginTop: 2 }}>
                  <Tag color="error" style={{ margin: 0 }}>关闭支付</Tag>
                </div>
              )}
            </div>

            {/* 等级设置 */}
            {isLeader && allowedLevels.length > 0 ? (
              <div>
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
            ) : (
              <div>
                <Text style={{ color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)', fontSize: 13, display: 'block', marginBottom: 4 }}>
                  用户当前等级：
                </Text>
                <Tag style={{ margin: 0, borderRadius: 4, background: 'rgba(22,119,255,0.1)', border: '1px solid rgba(22,119,255,0.2)', color: '#1677ff' }}>
                  {levelTargetUser.level_name || levelTargetUser.user_group}
                </Tag>
              </div>
            )}

            {/* 支付设置 */}
            {canSetPay ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderTop: `1px solid ${_isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)'}` }}>
                <div>
                  <Text style={{ color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)', fontSize: 13, display: 'block' }}>
                    在线支付权限
                  </Text>
                  <Text style={{ color: _isLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)', fontSize: 11 }}>允许或禁止该用户进行在线余额充值</Text>
                </div>
                <Switch 
                  checked={selectedPayEnabled !== 0} 
                  onChange={(c) => setSelectedPayEnabled(c ? 1 : 0)} 
                />
              </div>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderTop: `1px solid ${_isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)'}` }}>
                <div>
                  <Text style={{ color: _isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.65)', fontSize: 13, display: 'block' }}>
                    在线支付权限
                  </Text>
                </div>
                {levelTargetUser.pay_enabled !== 0 ? <Tag color="success">允许</Tag> : <Tag color="default">禁止</Tag>}
              </div>
            )}
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
                  {memberLevelTarget.level_name || allowedMemberLevels.find((l: any) => l.group_key === memberLevelTarget.user_group)?.name || memberLevelTarget.user_group || 'default'}
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
