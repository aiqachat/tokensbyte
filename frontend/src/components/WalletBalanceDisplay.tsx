import React from 'react';
import { Typography, Tag, Progress, Tooltip } from 'antd';
import { useTranslation } from 'react-i18next';
import { useThemeStore } from '../store/theme';
import useSettingsStore from '../store/settings';

const { Text } = Typography;

interface WalletBalanceDisplayProps {
  record: {
    balance?: number;
    used_quota?: number;
    gift_balance?: number;
    gift_used_quota?: number;
    credit_limit?: number;
    pay_enabled?: number;
  };
  onWalletClick?: (record: any) => void;
  isLight?: boolean;
  currencySymbol?: string;
  systemLabel?: React.ReactNode;
  giftLabel?: React.ReactNode;
  width?: string | number;
  gap?: string | number;
  monthStats?: {
    recharge_amount: number;
    gift_amount: number;
  };
  /** 系统钱包总充值金额（来自充值记录合计），传入后显示"总充值"而非 balance+used_quota */
  totalRecharge?: number;
  /** 赠送钱包总充值金额（来自充值记录合计） */
  totalGiftRecharge?: number;
}

const WalletBalanceDisplay: React.FC<WalletBalanceDisplayProps> = ({
  record,
  onWalletClick,
  isLight: customIsLight,
  currencySymbol: customCurrencySymbol,
  systemLabel,
  giftLabel,
  width,
  gap = 16,
  monthStats,
  totalRecharge,
  totalGiftRecharge,
}) => {
  const { t } = useTranslation('team_marketing');
  
  // 动态读取主题 (若未传)
  const { themeMode } = useThemeStore();
  const isLight = customIsLight !== undefined ? customIsLight : themeMode === 'light';
  
  // 动态读取币种符号 (若未传)
  const { settings } = useSettingsStore();
  const currencySymbol = customCurrencySymbol !== undefined ? customCurrencySymbol : (settings?.currency?.currency_symbol || '$');

  const balance = record.balance || 0;
  const used = record.used_quota || 0;
  const total = balance + used;
  const percent = total > 0 ? (balance / total) * 100 : 0;

  const gift = record.gift_balance || 0;
  const gift_used = record.gift_used_quota || 0;
  const gift_total = gift + gift_used;
  const gift_percent = gift_total > 0 ? (gift / gift_total) * 100 : 0;

  const creditLimit = record.credit_limit || 0;

  const isMonthView = !!monthStats;
  const hasTotalRecharge = totalRecharge !== undefined;
  const displayTotal = isMonthView ? monthStats.recharge_amount : (hasTotalRecharge ? totalRecharge : total);
  const displayGiftTotal = isMonthView ? monthStats.gift_amount : (totalGiftRecharge !== undefined ? totalGiftRecharge : gift_total);
  const labelPrefix = isMonthView ? '本月' : (hasTotalRecharge ? '总充值' : '总');

  const displaySystemLabel = systemLabel || t('system_wallet', '系统钱包');
  const displayGiftLabel = giftLabel || t('gift_wallet', '赠送钱包');

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'flex-start',
    gap: typeof gap === 'number' ? `${gap}px` : gap,
  };

  const itemStyle: React.CSSProperties = width !== undefined
    ? { width, cursor: onWalletClick ? 'pointer' : 'default' }
    : { flex: 1, minWidth: 0, maxWidth: 160, cursor: onWalletClick ? 'pointer' : 'default' };

  const handleWalletClick = () => {
    if (onWalletClick) {
      onWalletClick(record);
    }
  };

  // 可用余额 = 系统余额 + 信控额度
  const availableBalance = balance + creditLimit;

  // 格式化信控额度显示：整数不带小数，有小数则保留最多6位并去除多余零
  const formatCreditLimit = (val: number) => {
    if (Number.isInteger(val)) {
      return val.toString();
    }
    return parseFloat(val.toFixed(6)).toString();
  };

  return (
    <div style={containerStyle}>
      {/* 系统钱包 */}
      <div style={itemStyle} onClick={handleWalletClick}>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '2px 6px', marginBottom: 2 }}>
          <Text style={{ color: isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)', fontSize: 11, whiteSpace: 'nowrap', flexShrink: 0 }}>
            {displaySystemLabel}
          </Text>
          {/* 关闭支付标识 */}
          {record.pay_enabled === 0 && (
            <Tag color="error" style={{ fontSize: 10, padding: '0 4px', margin: 0, lineHeight: '16px', border: 'none', whiteSpace: 'nowrap' }}>
              关闭支付
            </Tag>
          )}
          {/* 信控额度标识 */}
          {creditLimit > 0 && (
            <Tooltip title={
              <div style={{ fontSize: 12, lineHeight: '20px' }}>
                <div>系统余额: {currencySymbol}{balance.toFixed(6)}</div>
                <div>信控额度: {currencySymbol}{creditLimit.toFixed(6)}</div>
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.2)', marginTop: 4, paddingTop: 4, fontWeight: 500 }}>
                  可用余额: {currencySymbol}{availableBalance.toFixed(6)}
                </div>
              </div>
            }>
              <Tag color="blue" style={{ fontSize: 10, padding: '0 4px', margin: 0, lineHeight: '16px', cursor: 'pointer', border: 'none', whiteSpace: 'nowrap' }}>
                💳 信控 {currencySymbol}{formatCreditLimit(creditLimit)}
              </Tag>
            </Tooltip>
          )}
        </div>
        <div style={{ lineHeight: 1.2, marginBottom: 4 }}>
          <div style={{ fontSize: 12, fontWeight: 500 }}>
            <span style={{ color: isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)', fontSize: 11, marginRight: 4 }}>余额</span>
            {currencySymbol}{balance.toFixed(6)}
          </div>
          <div style={{ fontSize: 11, marginTop: 2, color: isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)' }}>
            <span style={{ marginRight: 4 }}>{labelPrefix}</span>
            {currencySymbol}{displayTotal.toFixed(6)}
          </div>
        </div>
        <Progress 
          percent={percent} 
          showInfo={false} 
          size="small" 
          strokeColor={percent < 10 ? '#ff4d4f' : percent < 40 ? '#faad14' : '#52c41a'} 
          trailColor={isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)'} 
          style={{ margin: 0, lineHeight: 1 }} 
        />
      </div>

      {/* 赠送钱包 */}
      <div style={itemStyle} onClick={handleWalletClick}>
        <Text style={{ color: isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)', fontSize: 11, display: 'block', marginBottom: 2, whiteSpace: 'nowrap' }}>
          {displayGiftLabel}
        </Text>
        <div style={{ lineHeight: 1.2, marginBottom: 4, opacity: displayGiftTotal > 0 || gift > 0 ? 1 : 0.6 }}>
          <div style={{ fontSize: 12, fontWeight: 500 }}>
            <span style={{ color: isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)', fontSize: 11, marginRight: 4 }}>余额</span>
            {currencySymbol}{gift.toFixed(6)}
          </div>
          <div style={{ fontSize: 11, marginTop: 2, color: isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)' }}>
            <span style={{ marginRight: 4 }}>{labelPrefix}</span>
            {currencySymbol}{displayGiftTotal.toFixed(6)}
          </div>
        </div>
        <Progress 
          percent={gift_percent} 
          showInfo={false} 
          size="small" 
          strokeColor={gift > 0 ? (isLight ? '#18181b' : '#fafafa') : '#ff4d4f'} 
          trailColor={isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)'} 
          style={{ margin: 0, lineHeight: 1 }} 
        />
      </div>
    </div>
  );
};

export default WalletBalanceDisplay;
