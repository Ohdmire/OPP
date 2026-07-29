# osu-difficulty-runtime

Read-only OPP runtime for datasets produced by
[`osu-difficulty-lab`](https://github.com/osuplusplus/osu-difficulty-lab) at
commit `429352875ae4e0d7f44c45a64c4d604127b8c3b4`.

This crate contains the compatible analyzer, normalizer and HNSW reader only.
It intentionally contains no dataset, downloader, importer, training pipeline,
or export tooling. Dataset directories are opened read-only and are never
modified by this crate.
