# Build Stage
FROM node:22-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Nginx Production Stage
FROM nginx:stable-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
# Custom Nginx configuration for React router support
RUN echo 'map $http_x_forwarded_proto $forwarded_proto { \
    default $http_x_forwarded_proto; \
    "" $scheme; \
    } \
    server { \
    listen 80; \
    client_max_body_size 512m; \
    proxy_next_upstream off; \
    # 门户路径代理到后端
    location /home { \
    proxy_pass http://backend:3000; \
    proxy_set_header Host $host; \
    proxy_set_header X-Real-IP $remote_addr; \
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; \
    proxy_set_header X-Forwarded-Proto $forwarded_proto; \
    proxy_connect_timeout 900s; \
    proxy_send_timeout 900s; \
    proxy_read_timeout 900s; \
    } \
    # 其他路径保持原有前端SPA逻辑
    location / { \
    root /usr/share/nginx/html; \
    index index.html index.htm; \
    try_files $uri $uri/ /index.html; \
    } \
    location /assets/icons/ { \
    proxy_pass http://backend:3000; \
    proxy_set_header Host $host; \
    proxy_set_header X-Real-IP $remote_addr; \
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; \
    proxy_set_header X-Forwarded-Proto $forwarded_proto; \
    proxy_connect_timeout 900s; \
    proxy_send_timeout 900s; \
    proxy_read_timeout 900s; \
    } \
    location /api { \
    proxy_pass http://backend:3000; \
    proxy_set_header Host $host; \
    proxy_set_header X-Real-IP $remote_addr; \
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; \
    proxy_set_header X-Forwarded-Proto $forwarded_proto; \
    proxy_set_header X-Forwarded-Host $host; \
    proxy_connect_timeout 900s; \
    proxy_send_timeout 900s; \
    proxy_read_timeout 900s; \
    } \
    location /v1 { \
        proxy_pass http://backend:3000; \
        proxy_set_header Host $host; \
        proxy_set_header X-Real-IP $remote_addr; \
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; \
        proxy_set_header X-Forwarded-Proto $forwarded_proto; \
        proxy_buffering off; \
        proxy_cache off; \
        chunked_transfer_encoding on; \
        proxy_connect_timeout 900s; \
        proxy_send_timeout 900s; \
        proxy_read_timeout 900s; \
    } \
    location /compatible-mode { \
        proxy_pass http://backend:3000; \
        proxy_set_header Host $host; \
        proxy_set_header X-Real-IP $remote_addr; \
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; \
        proxy_set_header X-Forwarded-Proto $forwarded_proto; \
        proxy_buffering off; \
        proxy_cache off; \
        chunked_transfer_encoding on; \
        proxy_connect_timeout 900s; \
        proxy_send_timeout 900s; \
        proxy_read_timeout 900s; \
    } \
    location /compatible-api { \
        proxy_pass http://backend:3000; \
        proxy_set_header Host $host; \
        proxy_set_header X-Real-IP $remote_addr; \
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; \
        proxy_set_header X-Forwarded-Proto $forwarded_proto; \
        proxy_buffering off; \
        proxy_cache off; \
        chunked_transfer_encoding on; \
        proxy_connect_timeout 900s; \
        proxy_send_timeout 900s; \
        proxy_read_timeout 900s; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["sh", "-c", "sed -i \"s/client_max_body_size [0-9]*[kmgMGTK]*;/client_max_body_size ${CLIENT_MAX_BODY_SIZE:-50m};/\" /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
