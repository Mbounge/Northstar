FROM node:22-bookworm-slim AS build
WORKDIR /app/worker
COPY worker/package.json worker/package-lock.json ./
RUN npm ci
WORKDIR /app
COPY lib/canvas-v2 ./lib/canvas-v2
COPY lib/preview/graet-navigation.ts lib/preview/simulator-registry.ts ./lib/preview/
COPY lib/app-data/canvas-v2-catalog.ts lib/app-data/review-media.ts ./lib/app-data/
COPY worker/*.ts worker/*.mjs worker/*.py ./worker/
COPY tsconfig.json ./
RUN npm --prefix worker run build && npm --prefix worker prune --omit=dev

FROM node:22-bookworm-slim AS media
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl xz-utils python3-venv \
    && rm -rf /var/lib/apt/lists/*
RUN mkdir -p /opt/northstar-blender /opt/northstar-kokoro/weights \
    && (curl --fail --show-error --silent --location --retry 2 --max-time 180 \
        https://ftp.halifax.rwth-aachen.de/blender/release/Blender4.5/blender-4.5.9-linux-x64.tar.xz -o /tmp/blender.tar.xz \
      || curl --fail --show-error --silent --location --retry 2 --max-time 180 \
        https://ftp.nluug.nl/pub/graphics/blender/release/Blender4.5/blender-4.5.9-linux-x64.tar.xz -o /tmp/blender.tar.xz \
      || curl --fail --show-error --silent --location --retry 2 --max-time 180 \
        https://download.blender.org/release/Blender4.5/blender-4.5.9-linux-x64.tar.xz -o /tmp/blender.tar.xz) \
    && echo 'dcdc3eca6c9825bb35a8033b689c053f3cb5a9b0cd2a61b2eac2a49436b4ad3d  /tmp/blender.tar.xz' | sha256sum -c - \
    && tar -xJf /tmp/blender.tar.xz --strip-components=1 -C /opt/northstar-blender \
    && rm /tmp/blender.tar.xz
WORKDIR /opt/northstar-kokoro/weights
RUN curl --fail --show-error --silent --location --retry 3 \
      https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.int8.onnx -o kokoro-v1.0.int8.onnx \
    && curl --fail --show-error --silent --location --retry 3 \
      https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin -o voices-v1.0.bin \
    && echo '6e742170d309016e5891a994e1ce1559c702a2ccd0075e67ef7157974f6406cb  kokoro-v1.0.int8.onnx' | sha256sum -c - \
    && echo 'bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d  voices-v1.0.bin' | sha256sum -c -
RUN python3 -m venv /opt/northstar-kokoro/venv \
    && /opt/northstar-kokoro/venv/bin/pip install --no-cache-dir \
      kokoro-onnx==0.4.9 onnxruntime==1.22.1 numpy==2.2.6 espeakng-loader==0.2.4 phonemizer-fork==3.3.2

FROM node:22-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates tini ffmpeg python3 libsm6 libxi6 libxfixes3 libxrender1 libxxf86vm1 libgl1 libegl1 libglu1-mesa libgomp1 && rm -rf /var/lib/apt/lists/*
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/northstar-browsers
ENV NODE_ENV=production PORT=10000 NORTHSTAR_CODEX_BINARY=/app/worker/node_modules/.bin/codex
ENV NORTHSTAR_BLENDER_BINARY=/opt/northstar-blender/blender \
    NORTHSTAR_KOKORO_PYTHON=/opt/northstar-kokoro/venv/bin/python \
    NORTHSTAR_KOKORO_MODEL_DIR=/opt/northstar-kokoro/weights \
    NORTHSTAR_FILM_BROWSER=chromium
COPY --from=media /opt/northstar-blender /opt/northstar-blender
COPY --from=media /opt/northstar-kokoro /opt/northstar-kokoro
WORKDIR /app/worker
COPY --from=build --chown=node:node /app/worker/node_modules ./node_modules
COPY --from=build --chown=node:node /app/worker/dist ./dist
RUN node ./node_modules/playwright-core/cli.js install --with-deps firefox chromium && chmod -R a+rX /opt/northstar-browsers
USER node
RUN /app/worker/node_modules/.bin/codex --version | grep -Fx 'codex-cli 0.153.4' \
    && "$NORTHSTAR_BLENDER_BINARY" --background --disable-autoexec --version | grep -m1 'Blender 4.5.9' \
    && printf 'Northstar film narration is ready.' > /tmp/northstar-voice.txt \
    && "$NORTHSTAR_KOKORO_PYTHON" -I dist/kokoro-narration.py "$NORTHSTAR_KOKORO_MODEL_DIR" /tmp/northstar-voice.txt /tmp/northstar-voice.wav \
    && ffprobe -v error -select_streams a:0 -show_entries stream=codec_type -of csv=p=0 /tmp/northstar-voice.wav | grep -Fx audio \
    && rm /tmp/northstar-voice.txt /tmp/northstar-voice.wav
EXPOSE 10000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/readyz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/worker.mjs"]
