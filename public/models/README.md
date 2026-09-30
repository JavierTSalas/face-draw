# Models

Both models come from Google MediaPipe and are licensed under Apache-2.0.
They are self-hosted so the app loads fast, works offline after the first
visit, and does not depend on a third-party CDN.

| File | Source | Use |
| --- | --- | --- |
| `face_landmarker.task` | https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task | 478 face landmarks, 52 blendshapes, head pose |
| `selfie_segmenter.tflite` | https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite | Person / background mask (256x256) |

Model cards: https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker and
https://ai.google.dev/edge/mediapipe/solutions/vision/image_segmenter
