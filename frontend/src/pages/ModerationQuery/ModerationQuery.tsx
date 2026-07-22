/*
 * tokensbyte opensource
 * (c) 2026 tokensbyte.ai
 * @copyright      Copyright netbcloud/wstianxia 
 * @license        MIT (https://www.tokensbyte.ai/)
 */

import React, { useRef, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  Segmented,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import { CopyOutlined, SearchOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import request from '../../utils/request';
import { useThemeStore } from '../../store/theme';

const { Text } = Typography;

type IdType = 'asset_id' | 'task_id' | 'request_id';

interface BlockReason {
  label?: string | null;
  sub_label?: string | null;
  detail?: string | null;
}

interface QueryResult {
  id: string;
  type: IdType;
  reasons: BlockReason[];
}

const LABEL_COLOR: Record<string, string> = {
  Safety: 'red',
  Copyright: 'orange',
  Celebrity: 'purple',
  Deepfake: 'magenta',
};

const ID_TYPES: IdType[] = ['asset_id', 'task_id', 'request_id'];

function errText(err: any): string {
  const data = err?.response?.data;
  return data?.error?.message || data?.message || (typeof data?.error === 'string' ? data.error : '') || err?.message || '';
}

/** pluginNs 决定使用哪套审核凭证（asset_manager / asset_manager_intl） */
const ModerationQuery: React.FC<{ pluginNs: string }> = ({ pluginNs }) => {
  const { t } = useTranslation();
  const { themeMode } = useThemeStore();
  const isLight = themeMode === 'light';
  const [form] = Form.useForm<{ id: string; type: IdType }>();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const reqSeq = useRef(0);

  const mainText = isLight ? '#1f2937' : '#fff';
  const subText = isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.45)';
  const cardStyle: React.CSSProperties = {
    borderRadius: 12,
    background: isLight ? '#fff' : '#141414',
    border: isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.08)',
  };

  const typeOptions = ID_TYPES.map((value) => ({
    value,
    label: t(`moderation_query.type_${value}`),
  }));

  const codeLabel = (prefix: 'label' | 'sub', code?: string | null) =>
    code ? t(`moderation_query.${prefix}_${code}`, { defaultValue: code }) : '-';

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      message.success(t('moderation_query.copy_success'));
    } catch {
      message.error(t('moderation_query.copy_failed'));
    }
  };

  const onQuery = async (values: { id: string; type: IdType }) => {
    const id = values.id.trim();
    const seq = ++reqSeq.current;
    setLoading(true);
    setErrorMsg(null);
    setResult(null);
    try {
      const res = (await request.post(
        '/assets/admin/moderation-result',
        { id, type: values.type },
        { skipErrorHandler: true, headers: { 'x-plugin-ns': pluginNs } } as any,
      )) as { block_reasons?: BlockReason[] };
      if (seq !== reqSeq.current) return;
      setResult({ id, type: values.type, reasons: res?.block_reasons || [] });
    } catch (err: any) {
      if (seq !== reqSeq.current) return;
      setErrorMsg(errText(err) || t('moderation_query.query_failed'));
    } finally {
      if (seq === reqSeq.current) setLoading(false);
    }
  };

  const hitCount = result?.reasons.length ?? 0;

  return (
    <div style={{ width: '100%' }}>
      <Card size="small" style={{ ...cardStyle, marginBottom: 16 }} styles={{ body: { padding: 20 } }}>
        <Form
          form={form}
          layout="vertical"
          initialValues={{ type: 'asset_id' as IdType }}
          onFinish={onQuery}
          requiredMark={false}
        >
          <Form.Item
            name="type"
            label={t('moderation_query.id_type')}
            rules={[{ required: true }]}
            style={{ marginBottom: 16 }}
          >
            <Segmented options={typeOptions} block disabled={loading} />
          </Form.Item>

          <Form.Item
            name="id"
            label={t('moderation_query.id')}
            rules={[
              { required: true, whitespace: true, message: t('moderation_query.id_required') },
              { max: 256, message: t('moderation_query.id_too_long') },
            ]}
            style={{ marginBottom: 12 }}
          >
            <Input.Search
              allowClear
              size="large"
              disabled={loading}
              placeholder={t('moderation_query.id_placeholder')}
              enterButton={
                <Button type="primary" icon={<SearchOutlined />} loading={loading}>
                  {t('moderation_query.query')}
                </Button>
              }
              onSearch={() => form.submit()}
            />
          </Form.Item>

          <Text style={{ color: subText, fontSize: 12, lineHeight: 1.6 }}>
            {t('moderation_query.tip_desc')}
          </Text>
        </Form>
      </Card>

      {result && (
        <Card
          size="small"
          style={{ ...cardStyle, marginBottom: errorMsg ? 16 : 0 }}
          styles={{ body: { padding: '12px 20px 16px' } }}
          title={
            <Space size={8} wrap>
              <Text style={{ color: mainText, fontWeight: 600, fontSize: 14 }}>
                {t('moderation_query.result_title')}
              </Text>
              {hitCount > 0 && (
                <Tag color="blue" style={{ margin: 0 }}>
                  {t('moderation_query.hit_count', { count: hitCount })}
                </Tag>
              )}
            </Space>
          }
          extra={
            <Space size={4} wrap>
              <Text style={{ fontSize: 12, color: subText }}>
                {t(`moderation_query.type_${result.type}`)}
              </Text>
              <Tooltip title={result.id}>
                <Text
                  code
                  style={{
                    maxWidth: 240,
                    display: 'inline-block',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    verticalAlign: 'bottom',
                    fontSize: 12,
                  }}
                >
                  {result.id}
                </Text>
              </Tooltip>
              <Button type="text" size="small" icon={<CopyOutlined />} onClick={() => copyText(result.id)} />
            </Space>
          }
        >
          {hitCount > 0 && (
            <Table
              rowKey={(_, idx) => String(idx)}
              dataSource={result.reasons}
              pagination={false}
              size="small"
              scroll={{ x: 520 }}
              style={{ marginBottom: 12 }}
              columns={[
                {
                  title: t('moderation_query.col_label'),
                  dataIndex: 'label',
                  width: 120,
                  render: (v: string) => (
                    <Tag color={LABEL_COLOR[v] || 'default'}>{codeLabel('label', v)}</Tag>
                  ),
                },
                {
                  title: t('moderation_query.col_sub_label'),
                  dataIndex: 'sub_label',
                  width: 140,
                  render: (v: string) => codeLabel('sub', v),
                },
                {
                  title: t('moderation_query.col_detail'),
                  dataIndex: 'detail',
                  render: (v?: string | null) => (
                    <Space size={4}>
                      <Text style={{ wordBreak: 'break-word', fontSize: 13 }}>{v || '-'}</Text>
                      {v ? (
                        <Button type="text" size="small" icon={<CopyOutlined />} onClick={() => copyText(v)} />
                      ) : null}
                    </Space>
                  ),
                },
              ]}
            />
          )}
          <Alert
            type={hitCount > 0 ? 'warning' : 'info'}
            showIcon
            message={
              hitCount > 0
                ? t('moderation_query.status_hits', { count: hitCount })
                : t('moderation_query.status_empty')
            }
          />
        </Card>
      )}

      {errorMsg && (
        <Alert
          type="error"
          showIcon
          message={t('moderation_query.query_failed')}
          description={errorMsg === t('moderation_query.query_failed') ? undefined : errorMsg}
        />
      )}
    </div>
  );
};

export default ModerationQuery;
