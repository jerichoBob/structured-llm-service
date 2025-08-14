# Multi-stage Dockerfile for structured-llm-service
# Optimized for production deployment with security best practices

# Build stage - Install dependencies and compile TypeScript
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Install pnpm globally
RUN npm install -g pnpm@10.14.0

# Copy package files for dependency installation
COPY package.json pnpm-lock.yaml ./

# Install all dependencies (including devDependencies for building)
RUN pnpm install --frozen-lockfile

# Copy source code and configuration files
COPY src/ ./src/
COPY tsconfig.json ./
COPY jest.config.js ./
COPY jest.setup.js ./
COPY eslint.config.js ./
COPY .prettierrc.json ./

# Build the TypeScript code
RUN pnpm run build

# Run linting and type checking
RUN pnpm run lint
RUN pnpm run typecheck

# Production stage - Create minimal runtime image
FROM node:20-alpine AS production

# Install security updates and create non-root user
RUN apk update && apk upgrade && \
    apk add --no-cache dumb-init && \
    addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Install pnpm globally
RUN npm install -g pnpm@10.14.0

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install only production dependencies
RUN pnpm install --frozen-lockfile --prod && \
    pnpm store prune && \
    npm cache clean --force

# Copy compiled JavaScript from builder stage
COPY --from=builder /app/dist ./dist

# Copy any additional runtime files if needed
COPY --from=builder /app/docs ./docs

# Change ownership of the app directory to nodejs user
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port (configurable via environment variable)
EXPOSE 3000

# Add health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 3000) + '/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/index.js"]

# Metadata labels
LABEL maintainer="structured-llm-service"
LABEL version="1.0.0"
LABEL description="Production-ready structured LLM service with instructor-js integration"
LABEL org.opencontainers.image.source="https://github.com/your-org/structured-llm-service"
LABEL org.opencontainers.image.documentation="https://github.com/your-org/structured-llm-service/blob/main/README.md"
LABEL org.opencontainers.image.licenses="ISC"
