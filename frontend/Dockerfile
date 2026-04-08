# Build Stage
FROM node:22-alpine as builder

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Nginx Production Stage
FROM nginx:stable-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
# Custom Nginx configuration for React router support
RUN echo 'server { \
    listen 80; \
    location / { \
        root /usr/share/nginx/html; \
        index index.html index.htm; \
        try_files $uri $uri/ /index.html; \
    } \
    location /api/v1 { \
        proxy_pass http://backend:3300; \
        proxy_set_header Host $host; \
        proxy_set_header X-Real-IP $remote_addr; \
    } \
    location /v1 { \
        proxy_pass http://backend:3300; \
        proxy_set_header Host $host; \
        proxy_set_header X-Real-IP $remote_addr; \
        proxy_buffering off; \
        proxy_cache off; \
        chunked_transfer_encoding on; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
