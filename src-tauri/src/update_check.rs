use std::time::Duration;

use semver::Version;
use serde::{Deserialize, Serialize};

use crate::error::{CommandError, CommandResult};

const LATEST_RELEASE_URL: &str = "https://api.github.com/repos/osuplusplus/OPP/releases/latest";

#[derive(Debug, Deserialize)]
struct GitHubRelease {
    tag_name: String,
    name: Option<String>,
    html_url: String,
    published_at: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct UpdateCheckResult {
    current_version: String,
    latest_version: String,
    latest_tag: String,
    is_latest: bool,
    release_name: Option<String>,
    release_url: String,
    published_at: Option<String>,
}

fn parse_release_version(value: &str) -> Result<Version, semver::Error> {
    Version::parse(value.trim().trim_start_matches(['v', 'V']))
}

#[tauri::command]
pub async fn check_for_updates(app: tauri::AppHandle) -> CommandResult<UpdateCheckResult> {
    let current_version = app.package_info().version.to_string();
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .user_agent(format!("OPP/{current_version}"))
        .build()
        .map_err(|error| CommandError::network(format!("无法创建版本检查请求：{error}")))?;

    let response = client
        .get(LATEST_RELEASE_URL)
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .send()
        .await
        .map_err(|error| CommandError::network(format!("无法连接 GitHub：{error}")))?;

    if !response.status().is_success() {
        let status = response.status();
        return Err(CommandError::network(format!(
            "GitHub 版本检查失败（HTTP {status}）"
        )));
    }

    let release = response.json::<GitHubRelease>().await.map_err(|error| {
        CommandError::new(
            "INVALID_RELEASE_DATA",
            format!("无法读取 GitHub Release：{error}"),
        )
    })?;
    let latest = parse_release_version(&release.tag_name).map_err(|_| {
        CommandError::new(
            "INVALID_RELEASE_TAG",
            format!("GitHub Release 标签不是有效版本号：{}", release.tag_name),
        )
    })?;
    let current = parse_release_version(&current_version).map_err(|_| {
        CommandError::new(
            "INVALID_APP_VERSION",
            format!("当前应用版本号无效：{current_version}"),
        )
    })?;

    Ok(UpdateCheckResult {
        current_version,
        latest_version: latest.to_string(),
        latest_tag: release.tag_name,
        is_latest: current >= latest,
        release_name: release.name,
        release_url: release.html_url,
        published_at: release.published_at,
    })
}

#[cfg(test)]
mod tests {
    use super::parse_release_version;

    #[test]
    fn parses_release_tags_with_optional_v_prefix() {
        assert_eq!(
            parse_release_version("v1.2.3").unwrap().to_string(),
            "1.2.3"
        );
        assert_eq!(
            parse_release_version("V2.0.0").unwrap().to_string(),
            "2.0.0"
        );
        assert_eq!(parse_release_version("1.4.0").unwrap().to_string(), "1.4.0");
    }

    #[test]
    fn follows_semantic_version_ordering() {
        let current = parse_release_version("0.10.0").unwrap();
        let older = parse_release_version("v0.9.9").unwrap();
        assert!(current > older);
    }
}
