# RELEASE build - the image that ships to ghcr.io and carries our CLIENT changes.
#
# Unlike server.Dockerfile (which grafts a rebuilt sync-server onto upstream's
# PREBUILT web client and therefore cannot carry UI patches), this image is built
# from a client + sync-server that we compiled ourselves with the full overlay
# applied. To keep Docker fast and small we do NOT compile here: the heavy
# `build:browser` React compile runs on the CI runner (see release.yml), and this
# Dockerfile only assembles the prebuilt artifacts onto a slim runtime.
#
# Build context = the prepared upstream checkout that release.yml produced. It
# already contains, with the overlay applied and everything built + trimmed to
# production deps:
#   - node_modules/                     (production deps, web client grafted in)
#   - packages/sync-server/build/       (compiled sync-server bundle)
#   - packages/sync-server/package.json
#   - entrypoint.sh                     (copied in by the workflow)
#
# This runtime stage mirrors server-fullbuild.Dockerfile's `prod` stage.

FROM node:22-bookworm-slim AS prod
RUN apt-get update && apt-get install -y tini && apt-get clean -y && rm -rf /var/lib/apt/lists/*

ARG USERNAME=actual
ARG USER_UID=1001
ARG USER_GID=$USER_UID
RUN groupadd --gid $USER_GID $USERNAME \
    && useradd --uid $USER_UID --gid $USER_GID -m $USERNAME \
    && mkdir /data && chown -R ${USERNAME}:${USERNAME} /data

WORKDIR /app
ENV NODE_ENV=production

# Copy the prebuilt artifacts straight in - no compile in this image.
COPY node_modules /app/node_modules
COPY packages/sync-server/package.json ./
COPY packages/sync-server/build ./build
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

USER $USERNAME
EXPOSE 5006
ENTRYPOINT ["/usr/bin/tini", "-g", "--", "/usr/local/bin/entrypoint.sh"]
