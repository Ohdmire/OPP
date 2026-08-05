# 相似铺面数据集

## 获取与使用

OPP 不会在应用 EXE 中内置大型谱面索引。请从 [`osu-difficulty-lab` Releases](https://github.com/osuplusplus/osu-difficulty-lab/releases) 单独下载与 Analyzer v3（`five-dimension-slider-v3`）兼容的数据集并完整解压。

在 OPP 的“相似谱面”页面选择数据集根目录。正确的目录应直接包含：

```text
metadata.sqlite
features-v*.bin
indexes/difficulty-main.hnsw
normalizers/v*.bin
```

功能只读用户选择的本地索引，OPP 不会修改或上传它。应用会展示索引的数据截止时间，避免将结果误认为实时数据。

Analyzer v3 使用 Slider 维度替换旧版 Flashlight 维度。由于旧数据不包含连续 Slider 速度变化，Analyzer v2 的特征、归一化文件和 HNSW 索引无法直接迁移。

## 仓库策略

本地索引、特征文件、归一化文件和生成的检索文件会被刻意排除在版本控制之外。这样既避免私有数据和大型生成物进入源码仓库，也让功能实现始终可审阅。

## 常见问题

- 如果解压后出现两层同名文件夹，请选择实际包含 `metadata.sqlite` 的内层目录。
- 如果应用提示算法版本不兼容，请重新下载 v3 数据集，不要混用不同版本的特征、归一化文件和索引。
- 数据集生成、覆盖范围和校验信息以对应的 `osu-difficulty-lab` Release 说明为准。
