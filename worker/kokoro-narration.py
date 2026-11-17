"""Synthesize one reviewed beat from locally provisioned Kokoro weights."""

import sys
import wave
from pathlib import Path

import numpy as np
import onnxruntime as ort
from kokoro_onnx import Kokoro


def main():
    model_directory, source, output = sys.argv[1:]
    model_directory = Path(model_directory)
    options = ort.SessionOptions()
    options.intra_op_num_threads = 1
    options.inter_op_num_threads = 1
    inference = ort.InferenceSession(
        str(model_directory / "kokoro-v1.0.int8.onnx"), sess_options=options,
        providers=["CPUExecutionProvider"],
    )
    kokoro = Kokoro.from_session(inference, str(model_directory / "voices-v1.0.bin"))
    samples, sample_rate = kokoro.create(
        Path(source).read_text(encoding="utf-8"), voice="af_heart", speed=0.95, lang="en-us",
    )
    if not len(samples) or not np.isfinite(samples).all():
        raise ValueError("The voice returned no usable audio.")
    pcm = np.clip(samples * 32767, -32768, 32767).astype("<i2")
    with wave.open(output, "wb") as audio:
        audio.setparams((1, 2, sample_rate, 0, "NONE", "not compressed"))
        audio.writeframes(pcm.tobytes())


if __name__ == "__main__":
    main()
