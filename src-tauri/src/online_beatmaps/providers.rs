use std::{
    io::{Cursor, Read},
    time::Duration,
};

use reqwest::{Response, StatusCode, header::CONTENT_DISPOSITION};
use serde_json::Value;

use crate::error::{CommandError, CommandResult};

pub const NERINYAN_BASE_URL: &str = "https://api.nerinyan.moe";
pub const CATBOY_BASE_URL: &str = "https://catboy.best";
pub const HINAI_BASE_URL: &str = "https://mirror.hinamizawa.ai";

#[derive(Debug, Clone, serde::Serialize)]
pub struct ProviderStatus {
    pub id: String,
    pub label: String,
    pub online: bool,
    pub supports_search: bool,
    pub supports_metadata: bool,
    pub supports_osu_download: bool,
    pub supports_osz_download: bool,
    pub retry_after_seconds: Option<u64>,
    pub message: Option<String>,
}

#[derive(Debug, Clone)]
pub struct ProviderBytes {
    pub bytes: Vec<u8>,
    pub suggested_filename: Option<String>,
    pub source: String,
}

#[derive(Clone)]
pub struct ProviderRegistry {
    client: reqwest::Client,
}

impl ProviderRegistry {
    pub fn new() -> CommandResult<Self> {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(120))
            .user_agent(concat!(
                "OPP/",
                env!("CARGO_PKG_VERSION"),
                " (beatmap adapters)"
            ))
            .build()
            .map_err(|error| CommandError::network(error.to_string()))?;
        Ok(Self { client })
    }

    pub async fn nerinyan_beatmap(&self, id: u64) -> CommandResult<Value> {
        self.json_get(
            &format!("{NERINYAN_BASE_URL}/v2/beatmaps/{id}"),
            "NERINYAN_METADATA_FAILED",
        )
        .await
    }

    pub async fn nerinyan_osz(&self, id: u64) -> CommandResult<ProviderBytes> {
        self.bytes_get(
            &format!("{NERINYAN_BASE_URL}/d/{id}"),
            "NERINYAN_DOWNLOAD_FAILED",
            "nerinyan",
        )
        .await
    }

    pub async fn catboy_osz(&self, id: u64) -> CommandResult<ProviderBytes> {
        self.bytes_or_json_get(
            &format!("{CATBOY_BASE_URL}/d/{id}"),
            "CATBOY_DOWNLOAD_FAILED",
            "catboy",
            format!("{id}.osz"),
        )
        .await
    }

    /// Downloads through Hinamizawa.ai's public cascade endpoint.
    pub async fn hinai_osz(&self, id: u64) -> CommandResult<ProviderBytes> {
        self.bytes_get(
            &format!("{HINAI_BASE_URL}/api/v1/hinai/d/{id}"),
            "HINAI_DOWNLOAD_FAILED",
            "hinai",
        )
        .await
    }

    pub async fn catboy_osu(&self, id: u64) -> CommandResult<ProviderBytes> {
        self.bytes_or_json_get(
            &format!("{CATBOY_BASE_URL}/osu/{id}"),
            "CATBOY_OSU_DOWNLOAD_FAILED",
            "catboy",
            format!("{id}.osu"),
        )
        .await
    }

    pub async fn nerinyan_osu(&self, id: u64) -> CommandResult<ProviderBytes> {
        let metadata = self.nerinyan_beatmap(id).await?;
        let set_id = metadata
            .get("beatmapset_id")
            .and_then(Value::as_u64)
            .ok_or_else(|| {
                CommandError::new("INVALID_DATA", "Nerinyan 返回数据缺少 beatmapset_id")
            })?;
        let file_name = metadata
            .get("osu_file")
            .and_then(Value::as_str)
            .map(str::to_string);
        let archive = self.nerinyan_osz(set_id).await?;
        let mut zip = zip::ZipArchive::new(Cursor::new(archive.bytes))
            .map_err(|error| CommandError::new("INVALID_ARCHIVE", error.to_string()))?;
        let index = file_name
            .as_deref()
            .and_then(|name| zip.index_for_name(name))
            .or_else(|| {
                (0..zip.len()).find(|index| {
                    zip.by_index(*index)
                        .map(|file| file.name().to_ascii_lowercase().ends_with(".osu"))
                        .unwrap_or(false)
                })
            })
            .ok_or_else(|| {
                CommandError::new(
                    "BEATMAP_FILE_NOT_FOUND",
                    "Nerinyan 压缩包中没有找到 .osu 文件",
                )
            })?;
        let mut file = zip
            .by_index(index)
            .map_err(|error| CommandError::new("INVALID_ARCHIVE", error.to_string()))?;
        let mut bytes = Vec::new();
        file.read_to_end(&mut bytes)
            .map_err(|error| CommandError::new("BEATMAP_READ_FAILED", error.to_string()))?;
        Ok(ProviderBytes {
            bytes,
            suggested_filename: file_name,
            source: "nerinyan".into(),
        })
    }

    pub async fn statuses(&self) -> Vec<ProviderStatus> {
        let nerinyan_health = format!("{NERINYAN_BASE_URL}/health");
        let catboy_health = format!("{CATBOY_BASE_URL}/health");
        let hinai_health = format!("{HINAI_BASE_URL}/docs/beatmap-download");
        let (nerinyan, catboy, hinai) = tokio::join!(
            self.health("nerinyan", &nerinyan_health),
            self.health("catboy", &catboy_health),
            self.health("hinai", &hinai_health),
        );
        vec![
            ProviderStatus {
                id: "official".into(),
                label: "osu! 官方".into(),
                online: true,
                supports_search: true,
                supports_metadata: true,
                supports_osu_download: false,
                supports_osz_download: false,
                retry_after_seconds: None,
                message: Some("官方筛选与信息基准".into()),
            },
            nerinyan.unwrap_or_else(|error| ProviderStatus {
                id: "nerinyan".into(),
                label: "Nerinyan".into(),
                online: false,
                supports_search: true,
                supports_metadata: true,
                supports_osu_download: false,
                supports_osz_download: true,
                retry_after_seconds: error.retry_after_seconds,
                message: Some(error.message),
            }),
            catboy.unwrap_or_else(|error| ProviderStatus {
                id: "catboy".into(),
                label: "Catboy".into(),
                online: false,
                supports_search: false,
                supports_metadata: true,
                supports_osu_download: true,
                supports_osz_download: true,
                retry_after_seconds: error.retry_after_seconds,
                message: Some(error.message),
            }),
            hinai.unwrap_or_else(|error| ProviderStatus {
                id: "hinai".into(),
                label: "Hinai Mirror".into(),
                online: false,
                supports_search: false,
                supports_metadata: false,
                supports_osu_download: false,
                supports_osz_download: true,
                retry_after_seconds: error.retry_after_seconds,
                message: Some(error.message),
            }),
        ]
    }

    async fn health(&self, id: &str, url: &str) -> CommandResult<ProviderStatus> {
        let response = self
            .client
            .get(url)
            .send()
            .await
            .map_err(|error| CommandError::network(error.to_string()))?;
        let retry_after = retry_after(&response);
        if response.status().is_success() {
            Ok(ProviderStatus {
                id: id.into(),
                label: id.into(),
                online: true,
                supports_search: id == "nerinyan",
                supports_metadata: id != "hinai",
                supports_osu_download: id == "catboy",
                supports_osz_download: true,
                retry_after_seconds: retry_after,
                message: None,
            })
        } else {
            Err(status_error(
                &response,
                "PROVIDER_UNAVAILABLE",
                id,
                retry_after,
            ))
        }
    }

    async fn json_get(&self, url: &str, code: &str) -> CommandResult<Value> {
        let response = self
            .client
            .get(url)
            .header("Accept", "application/json")
            .send()
            .await
            .map_err(|error| CommandError::network(error.to_string()))?;
        parse_json(response, code).await
    }

    async fn bytes_get(&self, url: &str, code: &str, source: &str) -> CommandResult<ProviderBytes> {
        let response = self
            .client
            .get(url)
            .send()
            .await
            .map_err(|error| CommandError::network(error.to_string()))?;
        let suggested_filename = filename(&response);
        let bytes = parse_bytes(response, code).await?;
        Ok(ProviderBytes {
            bytes,
            suggested_filename,
            source: source.into(),
        })
    }

    async fn bytes_or_json_get(
        &self,
        url: &str,
        code: &str,
        source: &str,
        fallback_name: String,
    ) -> CommandResult<ProviderBytes> {
        let response = self
            .client
            .get(url)
            .send()
            .await
            .map_err(|error| CommandError::network(error.to_string()))?;
        let suggested_filename = filename(&response).or(Some(fallback_name));
        let status = response.status();
        let content_type = response
            .headers()
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .to_string();
        if !status.is_success() {
            return Err(status_error(
                &response,
                code,
                source,
                retry_after(&response),
            ));
        }
        let bytes = response
            .bytes()
            .await
            .map_err(|error| CommandError::network(error.to_string()))?
            .to_vec();
        if content_type.contains("json")
            && let Ok(value) = serde_json::from_slice::<Value>(&bytes)
            && let Some(data) = value.get("data").and_then(Value::as_array)
        {
            let bytes = data
                .iter()
                .filter_map(Value::as_u64)
                .map(|v| v as u8)
                .collect::<Vec<_>>();
            return Ok(ProviderBytes {
                bytes,
                suggested_filename,
                source: source.into(),
            });
        }
        Ok(ProviderBytes {
            bytes,
            suggested_filename,
            source: source.into(),
        })
    }
}

async fn parse_json<T: serde::de::DeserializeOwned>(
    response: Response,
    code: &str,
) -> CommandResult<T> {
    if !response.status().is_success() {
        return Err(status_error(
            &response,
            code,
            "provider",
            retry_after(&response),
        ));
    }
    response
        .json()
        .await
        .map_err(|error| CommandError::new("INVALID_DATA", error.to_string()))
}

async fn parse_bytes(response: Response, code: &str) -> CommandResult<Vec<u8>> {
    if !response.status().is_success() {
        return Err(status_error(
            &response,
            code,
            "provider",
            retry_after(&response),
        ));
    }
    response
        .bytes()
        .await
        .map(|bytes| bytes.to_vec())
        .map_err(|error| CommandError::network(error.to_string()))
}

fn retry_after(response: &Response) -> Option<u64> {
    response
        .headers()
        .get("retry-after")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse().ok())
}

fn status_error(
    response: &Response,
    code: &str,
    source: &str,
    retry_after: Option<u64>,
) -> CommandError {
    let status = response.status();
    let message = format!("{source} 请求失败（{status}）");
    if status == StatusCode::TOO_MANY_REQUESTS {
        CommandError::new("RATE_LIMITED", message).retry_after(retry_after)
    } else if status.is_server_error() {
        CommandError::new("SERVER_ERROR", message).retry_after(retry_after)
    } else {
        CommandError::new(code, message).retry_after(retry_after)
    }
}

fn filename(response: &Response) -> Option<String> {
    response
        .headers()
        .get(CONTENT_DISPOSITION)
        .and_then(|v| v.to_str().ok())
        .and_then(|value| {
            value.split(';').find_map(|part| {
                let (key, value) = part.trim().split_once('=')?;
                key.eq_ignore_ascii_case("filename")
                    .then(|| value.trim_matches('"').to_string())
            })
        })
}
