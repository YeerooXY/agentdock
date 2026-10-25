# Linux test environment: builds node-pty from source and runs the unit and
# desktop tests under a virtual display with a GNOME keyring for safeStorage.
# docker build -f scripts/linux/Dockerfile -t paddock-linux .
# docker run --rm paddock-linux
FROM node:24.22.1-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ git xvfb xauth dbus-x11 gnome-keyring libsecret-1-0 \
      libgtk-3-0 libnss3 libxss1 libasound2 libgbm1 libxshmfence1 libxtst6 libatspi2.0-0 libdrm2 \
      fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*
RUN useradd --create-home --shell /bin/bash paddock
USER paddock
WORKDIR /home/paddock/app
COPY --chown=paddock package.json package-lock.json ./
COPY --chown=paddock vendor ./vendor
COPY --chown=paddock scripts/fix-node-pty.cjs ./scripts/
RUN npm ci --no-audit --no-fund && node node_modules/electron/install.js
COPY --chown=paddock . .
ENV XDG_CURRENT_DESKTOP=GNOME SHELL=/bin/bash
CMD ["bash", "scripts/linux/run-tests.sh"]
