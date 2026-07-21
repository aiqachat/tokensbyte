//! DB `TIMESTAMPTZ` ↔ API/业务侧字符串（timesystem = UTC）
//!
//! sqlx 不将 timestamptz 直接解码为 `String`；本类型在边界完成转换，
//! 对外仍以字符串形态参与 JSON / 既有 `&str` 逻辑，降低迁移成本。

use chrono::{DateTime, NaiveDateTime, SecondsFormat, Utc};
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use sqlx::encode::IsNull;
use sqlx::error::BoxDynError;
use sqlx::postgres::{PgArgumentBuffer, PgTypeInfo, PgValueRef};
use sqlx::{Decode, Encode, Postgres, Type, ValueRef};
use std::fmt;
use std::ops::Deref;

/// 落库时间戳：Postgres `TIMESTAMPTZ`，序列化为 RFC3339 UTC 字符串。
#[derive(Debug, Clone, PartialEq, Eq, Default, Hash)]
pub struct DbTs(String);

impl DbTs {
    pub fn new(s: impl Into<String>) -> Self {
        Self(s.into())
    }

    pub fn from_utc(dt: DateTime<Utc>) -> Self {
        Self(dt.to_rfc3339_opts(SecondsFormat::Millis, true))
    }

    pub fn now() -> Self {
        Self::from_utc(Utc::now())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }

    pub fn into_string(self) -> String {
        self.0
    }

    pub fn to_utc(&self) -> Option<DateTime<Utc>> {
        parse_flexible_ts(&self.0)
    }

    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }
}

impl Deref for DbTs {
    type Target = str;
    fn deref(&self) -> &str {
        &self.0
    }
}

impl AsRef<str> for DbTs {
    fn as_ref(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for DbTs {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl From<String> for DbTs {
    fn from(s: String) -> Self {
        Self(s)
    }
}

impl From<&str> for DbTs {
    fn from(s: &str) -> Self {
        Self(s.to_string())
    }
}

impl From<DateTime<Utc>> for DbTs {
    fn from(dt: DateTime<Utc>) -> Self {
        Self::from_utc(dt)
    }
}

impl From<DbTs> for String {
    fn from(v: DbTs) -> String {
        v.0
    }
}

impl PartialEq<str> for DbTs {
    fn eq(&self, other: &str) -> bool {
        self.0 == other
    }
}

impl PartialEq<&str> for DbTs {
    fn eq(&self, other: &&str) -> bool {
        self.0 == *other
    }
}

impl PartialEq<String> for DbTs {
    fn eq(&self, other: &String) -> bool {
        &self.0 == other
    }
}

impl Serialize for DbTs {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.0)
    }
}

impl<'de> Deserialize<'de> for DbTs {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        String::deserialize(deserializer).map(DbTs)
    }
}

impl Type<Postgres> for DbTs {
    fn type_info() -> PgTypeInfo {
        <DateTime<Utc> as Type<Postgres>>::type_info()
    }

    fn compatible(ty: &PgTypeInfo) -> bool {
        <DateTime<Utc> as Type<Postgres>>::compatible(ty)
            || <String as Type<Postgres>>::compatible(ty)
    }
}

impl Encode<'_, Postgres> for DbTs {
    fn encode_by_ref(&self, buf: &mut PgArgumentBuffer) -> Result<IsNull, BoxDynError> {
        let dt = if self.0.is_empty() {
            Utc::now()
        } else {
            parse_flexible_ts(&self.0).ok_or_else(|| {
                Box::<dyn std::error::Error + Send + Sync>::from(format!(
                    "DbTs: cannot parse timestamp {:?}",
                    self.0
                ))
            })?
        };
        <DateTime<Utc> as Encode<Postgres>>::encode_by_ref(&dt, buf)
    }
}

impl<'r> Decode<'r, Postgres> for DbTs {
    fn decode(value: PgValueRef<'r>) -> Result<Self, BoxDynError> {
        let ty = value.type_info();
        if <DateTime<Utc> as Type<Postgres>>::compatible(&ty) {
            let dt = <DateTime<Utc> as Decode<Postgres>>::decode(value)?;
            return Ok(DbTs::from_utc(dt));
        }
        // 兼容迁移前偶发仍读到 TEXT 的路径
        let s = <String as Decode<Postgres>>::decode(value)?;
        if let Some(dt) = parse_flexible_ts(&s) {
            Ok(DbTs::from_utc(dt))
        } else {
            Ok(DbTs(s))
        }
    }
}

/// 解析历史 TEXT / RFC3339 / 朴素 UTC 时间字符串。
pub fn parse_flexible_ts(raw: &str) -> Option<DateTime<Utc>> {
    let s = raw.trim();
    if s.is_empty() {
        return None;
    }
    if let Ok(dt) = DateTime::parse_from_rfc3339(s) {
        return Some(dt.with_timezone(&Utc));
    }
    let with_tz = [
        "%Y-%m-%d %H:%M:%S%.f%z",
        "%Y-%m-%d %H:%M:%S%z",
        "%Y-%m-%dT%H:%M:%S%.f%z",
        "%Y-%m-%dT%H:%M:%S%z",
        "%Y-%m-%d %H:%M:%S%.f%:z",
        "%Y-%m-%d %H:%M:%S%:z",
    ];
    for fmt in &with_tz {
        if let Ok(dt) = DateTime::parse_from_str(s, fmt) {
            return Some(dt.with_timezone(&Utc));
        }
    }
    // `+0000` 无冒号：chrono `%z` 可解析；再尝试把 `+00` 补成 `+0000`
    if let Some(normalized) = normalize_short_offset(s) {
        for fmt in &with_tz {
            if let Ok(dt) = DateTime::parse_from_str(&normalized, fmt) {
                return Some(dt.with_timezone(&Utc));
            }
        }
    }
    let naive_fmts = [
        "%Y-%m-%d %H:%M:%S%.f",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S%.f",
        "%Y-%m-%dT%H:%M:%S",
    ];
    for fmt in &naive_fmts {
        if let Ok(ndt) = NaiveDateTime::parse_from_str(s, fmt) {
            return Some(ndt.and_utc());
        }
    }
    None
}

fn normalize_short_offset(s: &str) -> Option<String> {
    // e.g. "2026-07-19 12:00:00+00" → "+0000"
    let bytes = s.as_bytes();
    if bytes.len() < 3 {
        return None;
    }
    let last3 = &s[s.len() - 3..];
    if (last3.starts_with('+') || last3.starts_with('-'))
        && last3[1..].chars().all(|c| c.is_ascii_digit())
    {
        return Some(format!("{}00", s));
    }
    None
}
