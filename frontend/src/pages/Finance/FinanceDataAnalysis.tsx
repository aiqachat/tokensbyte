/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import React, { useEffect, useState, useCallback } from 'react';
import { Card, DatePicker, Row, Col, Typography, Spin, Segmented } from 'antd';
import { useTranslation } from 'react-i18next';
import request from '../../utils/request';
import dayjs from 'dayjs';
import { toCalendarDateParam } from '../../utils/dateRangeParams';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  ComposedChart,
} from 'recharts';
import { useThemeStore } from '../../store/theme';
import useSettingsStore from '../../store/settings';

const { RangePicker } = DatePicker;
const { Title } = Typography;

interface DailyStat {
  date: string;
  total_requests: number;
  total_tokens: number;
  total_cost: number;
  active_tokens: number;
  active_users: number;
  new_users: number;
  total_users: number;
  system_recharge_total: number;
  system_cost_total: number;
  system_retained_total: number;
  online_recharge: number;
  daily_system_balance: number;
  daily_gift_recharge: number;
  daily_system_recharge: number;
}

interface FinanceModelDailyStatInfo {
  date: string;
  count: number;
  total_cost: number;
}

interface FinanceModelStat {
  model: string;
  count: number;
  total_cost: number;
  last_three_days: FinanceModelDailyStatInfo[];
}

const COLORS = ['#1677ff', '#52c41a', '#faad14', '#f5222d', '#722ed1', '#13c2c2', '#eb2f96', '#fa8c16', '#a0d911', '#2f54eb'];

const FinanceDataAnalysis: React.FC = () => {
  const { t } = useTranslation();
  const [data, setData] = useState<DailyStat[]>([]);
  const [modelData, setModelData] = useState<FinanceModelStat[]>([]);
  const [loading, setLoading] = useState(false);
  const [dates, setDates] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().subtract(30, 'day'),
    dayjs(),
  ]);
  const { themeMode } = useThemeStore();
  const isDark = themeMode === 'dark';
  const { settings } = useSettingsStore();
  const currencySymbol = settings?.currency?.currency_symbol || '￥';
  const currencyUnit = settings?.currency?.currency_unit || '元';

  const textColor = isDark ? 'rgba(255, 255, 255, 0.85)' : 'rgba(0, 0, 0, 0.85)';
  const gridColor = isDark ? '#434343' : '#f0f0f0';
  const cardBg = isDark ? 'rgba(255, 255, 255, 0.04)' : '#ffffff';

  // 模型排行榜独立筛选
  const [modelRangeMode, setModelRangeMode] = useState<'range' | 'month' | 'all'>('range');
  const [independentModelData, setIndependentModelData] = useState<FinanceModelStat[] | null>(null);
  const [modelLoading, setModelLoading] = useState(false);

  const fetchData = async (start: string, end: string) => {
    setLoading(true);
    try {
      const res: any = await request.get(
        `/finance/daily-stats?start_date=${encodeURIComponent(start)}&end_date=${encodeURIComponent(end)}`,
      );
      if (res && res.daily_stats) {
        setData(res.daily_stats);
        setModelData(res.model_stats || []);
      } else if (res && res.data && res.data.daily_stats) {
        setData(res.data.daily_stats);
        setModelData(res.data.model_stats || []);
      }
    } catch (error) {
      console.error('Failed to fetch daily stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchModelStats = useCallback(async (mode: 'range' | 'month' | 'all') => {
    if (mode === 'range') {
      setIndependentModelData(null);
      return;
    }
    setModelLoading(true);
    try {
      let url = '/finance/daily-stats';
      if (mode === 'month') {
        const start = encodeURIComponent(toCalendarDateParam(dayjs().startOf('month')));
        const end = encodeURIComponent(toCalendarDateParam(dayjs().endOf('month')));
        url += `?start_date=${start}&end_date=${end}`;
      }
      // mode === 'all' 时不传日期参数
      const res: any = await request.get(url);
      const stats = res?.model_stats || res?.data?.model_stats || [];
      setIndependentModelData(stats);
    } catch (error) {
      console.error('Failed to fetch model stats:', error);
    } finally {
      setModelLoading(false);
    }
  }, []);

  useEffect(() => {
    if (dates && dates[0] && dates[1]) {
      fetchData(toCalendarDateParam(dates[0]), toCalendarDateParam(dates[1]));
    }
  }, [dates]);

  useEffect(() => {
    fetchModelStats(modelRangeMode);
  }, [modelRangeMode, fetchModelStats]);

  // 当前模型排行榜显示的数据和时间描述
  const displayModelData = independentModelData !== null ? independentModelData : modelData;
  const modelTimeLabel = modelRangeMode === 'all'
    ? '全部时间'
    : modelRangeMode === 'month'
      ? `${dayjs().format('YYYY年M月')}`
      : `${dates[0].format('YYYY-MM-DD')} ~ ${dates[1].format('YYYY-MM-DD')}`;

  return (
    <div style={{ padding: 24, minHeight: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={4} style={{ margin: 0, color: textColor }}>
          {t('menu.finance_analysis', '财务数据分析')}
        </Title>
        <RangePicker
          value={dates}
          onChange={(val) => {
            if (val && val[0] && val[1]) {
              setDates([val[0], val[1]]);
            }
          }}
          allowClear={false}
        />
      </div>

      <Spin spinning={loading}>
        <Row gutter={[24, 24]}>
          <Col span={24} lg={12}>
            <Card 
              title="系统余额与赠送增加趋势 (Balance & Gift Trends)" 
              bordered={false} 
              style={{ background: cardBg, borderRadius: 12, boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)' }}
              headStyle={{ borderBottom: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #f0f0f0' }}
            >
              <div style={{ height: 350 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                    <XAxis dataKey="date" stroke={textColor} tick={{fill: textColor}} tickLine={false} axisLine={false} />
                    <YAxis 
                      stroke={textColor} 
                      tick={{fill: textColor}} 
                      tickLine={false} 
                      axisLine={false} 
                      tickFormatter={(value: number) => parseFloat(Number(value).toFixed(6)).toString()}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: isDark ? '#1f1f1f' : '#fff', color: textColor, borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }} 
                      itemStyle={{ color: textColor }}
                      formatter={(value: any) => parseFloat(Number(value).toFixed(6))}
                    />
                    <Legend iconType="circle" wrapperStyle={{ paddingTop: 20 }} />
                    <Line type="monotone" dataKey="daily_system_recharge" stroke="#1677ff" strokeWidth={3} activeDot={{ r: 6 }} name={`每日系统钱包余额增加 (${currencyUnit})`} dot={false} />
                    <Line type="monotone" dataKey="daily_gift_recharge" stroke="#faad14" strokeWidth={3} activeDot={{ r: 6 }} name={`赠送余额增加数 (${currencyUnit})`} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </Col>

          <Col span={24} lg={12}>
            <Card 
              title="每日系统在线充值合计趋势 (Daily Online Recharge)" 
              bordered={false} 
              style={{ background: cardBg, borderRadius: 12, boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)' }}
              headStyle={{ borderBottom: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #f0f0f0' }}
            >
              <div style={{ height: 350 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                    <XAxis dataKey="date" stroke={textColor} tick={{fill: textColor}} tickLine={false} axisLine={false} />
                    <YAxis 
                      stroke={textColor} 
                      tick={{fill: textColor}} 
                      tickLine={false} 
                      axisLine={false} 
                      tickFormatter={(value: number) => parseFloat(Number(value).toFixed(6)).toString()}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: isDark ? '#1f1f1f' : '#fff', color: textColor, borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }} 
                      formatter={(value: any) => parseFloat(Number(value).toFixed(6))}
                    />
                    <Legend iconType="circle" wrapperStyle={{ paddingTop: 20 }} />
                    <Line type="monotone" dataKey="online_recharge" stroke="#52c41a" strokeWidth={3} activeDot={{ r: 6 }} name={`在线充值金额 (${currencyUnit})`} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </Col>

          <Col span={24} lg={12}>
            <Card 
              title="站点资金趋势 (Site Funds Trend)" 
              bordered={false} 
              style={{ background: cardBg, borderRadius: 12, boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)' }}
              headStyle={{ borderBottom: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #f0f0f0' }}
            >
              <div style={{ height: 350 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                    <XAxis dataKey="date" stroke={textColor} tick={{fill: textColor}} tickLine={false} axisLine={false} />
                    <YAxis 
                      stroke={textColor} 
                      tick={{fill: textColor}} 
                      tickLine={false} 
                      axisLine={false} 
                      tickFormatter={(value: number) => parseFloat(Number(value).toFixed(6)).toString()}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: isDark ? '#1f1f1f' : '#fff', color: textColor, borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }} 
                      formatter={(value: any) => parseFloat(Number(value).toFixed(6))}
                    />
                    <Legend iconType="circle" wrapperStyle={{ paddingTop: 20 }} />
                    <Line type="monotone" dataKey="system_recharge_total" stroke="#52c41a" strokeWidth={3} activeDot={{ r: 6 }} name={`系统充值金额总和 (${currencyUnit})`} dot={false} />
                    <Line type="monotone" dataKey="system_cost_total" stroke="#f5222d" strokeWidth={3} activeDot={{ r: 6 }} name={`系统消费金额总和 (${currencyUnit})`} dot={false} />
                    <Line type="monotone" dataKey="system_retained_total" stroke="#1677ff" strokeWidth={3} activeDot={{ r: 6 }} name={`系统沉淀资金总和 (${currencyUnit})`} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </Col>

          <Col span={24} lg={12}>
            <Card 
              title="活跃令牌数 (Active Tokens)" 
              bordered={false} 
              style={{ background: cardBg, borderRadius: 12, boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)' }}
              headStyle={{ borderBottom: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #f0f0f0' }}
            >
              <div style={{ height: 350 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }} barSize={20}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                    <XAxis dataKey="date" stroke={textColor} tick={{fill: textColor}} tickLine={false} axisLine={false} />
                    <YAxis stroke={textColor} tick={{fill: textColor}} tickLine={false} axisLine={false} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: isDark ? '#1f1f1f' : '#fff', color: textColor, borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }} 
                      cursor={{fill: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'}}
                    />
                    <Legend iconType="circle" wrapperStyle={{ paddingTop: 20 }} />
                    <Bar dataKey="active_tokens" fill="#722ed1" radius={[4, 4, 0, 0]} name="活跃令牌数" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </Col>

          <Col span={24} lg={12}>
            <Card 
              title="用户数据趋势 (User Trends)" 
              bordered={false} 
              style={{ background: cardBg, borderRadius: 12, boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)' }}
              headStyle={{ borderBottom: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #f0f0f0' }}
            >
              <div style={{ height: 350 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                    <XAxis dataKey="date" stroke={textColor} tick={{fill: textColor}} tickLine={false} axisLine={false} />
                    <YAxis yAxisId="left" stroke={textColor} tick={{fill: textColor}} tickLine={false} axisLine={false} />
                    <YAxis yAxisId="right" orientation="right" stroke={textColor} tick={{fill: textColor}} tickLine={false} axisLine={false} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: isDark ? '#1f1f1f' : '#fff', color: textColor, borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }} 
                      cursor={{fill: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'}}
                    />
                    <Legend iconType="circle" wrapperStyle={{ paddingTop: 20 }} />
                    <Bar yAxisId="left" dataKey="new_users" fill="#faad14" radius={[4, 4, 0, 0]} name="新增用户" barSize={15} />
                    <Bar yAxisId="left" dataKey="active_users" fill="#13c2c2" radius={[4, 4, 0, 0]} name="活跃用户" barSize={15} />
                    <Line yAxisId="right" type="monotone" dataKey="total_users" stroke="#eb2f96" strokeWidth={3} name="平台总用户" dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </Col>

          <Col span={24} lg={12}>
            <Card 
              title={
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <span>模型分布排行榜 (按成本)</span>
                    <div style={{ fontSize: 11, fontWeight: 400, color: isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)', marginTop: 2 }}>
                      📅 {modelTimeLabel}
                    </div>
                  </div>
                  <Segmented
                    size="small"
                    value={modelRangeMode}
                    onChange={(val) => setModelRangeMode(val as 'range' | 'month' | 'all')}
                    options={[
                      { label: '自选范围', value: 'range' },
                      { label: '当月', value: 'month' },
                      { label: '全部', value: 'all' },
                    ]}
                  />
                </div>
              }
              bordered={false} 
              style={{ background: cardBg, borderRadius: 12, boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)' }}
              headStyle={{ borderBottom: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #f0f0f0' }}
            >
              <style>{`
                .custom-scrollbar::-webkit-scrollbar {
                  width: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                  background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                  background: ${isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'};
                  border-radius: 3px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                  background: ${isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'};
                }
              `}</style>
              <Spin spinning={modelLoading}>
              <div 
                className="custom-scrollbar"
                style={{ 
                  height: 380, 
                  overflowY: 'auto', 
                  paddingRight: 8 
                }}
              >
                {displayModelData.length > 0 ? (
                  (() => {
                    const maxCost = displayModelData.reduce((max, item) => Math.max(max, item.total_cost), 0) || 1;
                    const getRankBadgeStyle = (index: number) => {
                      const base = {
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 20,
                        height: 20,
                        borderRadius: '50%',
                        fontWeight: 'bold',
                        fontSize: 10,
                        marginRight: 8,
                        color: '#fff',
                        flexShrink: 0,
                      };
                      if (index === 0) {
                        return {
                          ...base,
                          background: 'linear-gradient(135deg, #FFE066 0%, #F5A623 100%)',
                          boxShadow: '0 1px 4px rgba(245, 166, 35, 0.3)',
                        };
                      }
                      if (index === 1) {
                        return {
                          ...base,
                          background: 'linear-gradient(135deg, #E2E8F0 0%, #94A3B8 100%)',
                          boxShadow: '0 1px 4px rgba(148, 163, 184, 0.3)',
                        };
                      }
                      if (index === 2) {
                        return {
                          ...base,
                          background: 'linear-gradient(135deg, #FDBA74 0%, #C2410C 100%)',
                          boxShadow: '0 1px 4px rgba(194, 65, 12, 0.3)',
                        };
                      }
                      return {
                        ...base,
                        background: isDark ? 'rgba(255, 255, 255, 0.15)' : '#e8e8e8',
                        color: textColor,
                      };
                    };

                    const getBarColor = (index: number) => {
                      if (index === 0) return 'linear-gradient(90deg, #F5A623 0%, #FFE066 100%)';
                      if (index === 1) return 'linear-gradient(90deg, #94A3B8 0%, #CBD5E1 100%)';
                      if (index === 2) return 'linear-gradient(90deg, #C2410C 0%, #FDBA74 100%)';
                      return 'linear-gradient(90deg, #1677ff 0%, #40a9ff 100%)';
                    };

                    return displayModelData.map((item, index) => {
                      const percentage = (item.total_cost / maxCost) * 100;
                      return (
                        <div 
                          key={item.model} 
                          style={{ 
                            display: 'flex', 
                            flexDirection: 'column',
                            padding: '5px 2px',
                            borderBottom: index === displayModelData.length - 1 
                              ? 'none' 
                              : (isDark ? '1px dashed rgba(255, 255, 255, 0.08)' : '1px dashed #e8e8e8'),
                            transition: 'all 0.3s ease',
                          }}
                        >
                          {/* Main Row */}
                          <div style={{ display: 'flex', alignItems: 'center' }}>
                            {/* Rank Badge */}
                            <div style={getRankBadgeStyle(index)}>{index + 1}</div>
                            
                            {/* Info & Progress bar */}
                            <div style={{ flex: 1, minWidth: 0, marginRight: 12 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2, alignItems: 'center' }}>
                                <span style={{ fontWeight: 600, color: textColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 13 }}>
                                  {item.model}
                                </span>
                                <span style={{ fontSize: 11, color: isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)', flexShrink: 0 }}>
                                  共 {item.count.toLocaleString()} 次
                                </span>
                              </div>
                              {/* Progress Bar Container */}
                              <div style={{ 
                                height: 4, 
                                borderRadius: 2, 
                                background: isDark ? 'rgba(255,255,255,0.06)' : '#f5f5f5', 
                                overflow: 'hidden' 
                              }}>
                                <div style={{ 
                                  height: '100%', 
                                  width: `${percentage}%`, 
                                  borderRadius: 2, 
                                  background: getBarColor(index),
                                  transition: 'width 0.8s cubic-bezier(0.4, 0, 0.2, 1)' 
                                }} />
                              </div>
                            </div>

                            {/* Cost Display */}
                            <div style={{ width: 110, textAlign: 'right', flexShrink: 0 }}>
                              <span style={{ 
                                fontFamily: 'SFMono-Regular, Consolas, "Liberation Mono", Menlo, Courier, monospace', 
                                fontWeight: 700, 
                                color: index === 0 ? '#F5A623' : textColor,
                                fontSize: 14 
                              }}>
                                {currencySymbol}{Number(item.total_cost).toFixed(6)}
                              </span>
                            </div>
                          </div>

                          {/* Last 3 Days Row */}
                          {item.last_three_days && item.last_three_days.length > 0 && (
                            <div style={{ 
                              display: 'flex', 
                              gap: 6, 
                              marginTop: 4, 
                              paddingLeft: 28, 
                              flexWrap: 'wrap' 
                            }}>
                              {item.last_three_days.map((day) => {
                                const dateLabel = day.date.slice(5);
                                return (
                                  <div 
                                    key={day.date} 
                                    style={{ 
                                      background: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)',
                                      borderRadius: 4,
                                      padding: '1px 6px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 4,
                                      fontSize: 10,
                                    }}
                                  >
                                    <span style={{ color: isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)', fontWeight: 500 }}>
                                      {dateLabel}
                                    </span>
                                    <span style={{ color: index === 0 ? '#faad14' : textColor, fontFamily: 'monospace', fontWeight: 600 }}>
                                      {currencySymbol}{day.total_cost.toFixed(6)}
                                    </span>
                                    <span style={{ color: isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)', fontSize: 9 }}>
                                      ({day.count}次)
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    });
                  })()
                ) : (
                  <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)' }}>
                    暂无数据
                  </div>
                )}
              </div>
              </Spin>
            </Card>
          </Col>
        </Row>
      </Spin>
    </div>
  );
};

export default FinanceDataAnalysis;
