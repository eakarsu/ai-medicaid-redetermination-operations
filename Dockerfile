# Multi-stage build: compile the React frontend, then run the Node API which serves
# the compiled assets with an SPA fallback (backend/server.mjs static layer).
FROM node:22-alpine AS build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json* ./frontend/
RUN cd frontend && npm install
COPY frontend/ ./frontend/
RUN cd frontend && npx vite build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY backend/package.json ./backend/
RUN cd backend && npm install --omit=dev
COPY backend/ ./backend/
COPY app.json ./
COPY --from=build /app/frontend/dist ./frontend/dist
RUN chmod +x backend/entrypoint.sh
EXPOSE 5542
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:5542/api/health || exit 1
WORKDIR /app/backend
ENTRYPOINT ["./entrypoint.sh"]
