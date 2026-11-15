# Third-party software and model notices

M4 uses Tesseract4Android 4.9.0 (Apache-2.0), which bundles Tesseract 5.5.1 (Apache-2.0), Leptonica 1.85.0, libjpeg 9f, and libpng 1.6.48. See the upstream project and its license notices: https://github.com/adaptech-cz/Tesseract4Android/tree/4.9.0

The Russian and English OCR data are from `tesseract-ocr/tessdata_fast`, pinned to commit `87416418657359cb625c412a48b6e1d6d41c29bd`; files are `rus.traineddata` and `eng.traineddata`. Upstream license: https://github.com/tesseract-ocr/tessdata_fast/blob/87416418657359cb625c412a48b6e1d6d41c29bd/LICENSE

The test video and rendered test frame are generated in CI and contain synthetic text only. They are not supplied by Yandex and are not production evidence.
