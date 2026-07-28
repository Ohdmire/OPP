use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct ManiaConversionItem {
    pub input: String,
    pub status: String,
    pub output: Option<String>,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ManiaConversionResult {
    pub items: Vec<ManiaConversionItem>,
}
