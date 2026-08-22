FROM nginx:alpine

# Copy the built React files from your local dist folder
COPY ./dist /usr/share/nginx/html

# We write the Nginx config using a single RUN command. 
# The backslashes (\) at the end of lines are critical!
RUN echo 'server { \
    listen 80; \
    client_max_body_size 100M; \
    location / { \
        root /usr/share/nginx/html; \
        index index.html; \
        try_files $uri /index.html; \
    } \
    location /api { \
        client_max_body_size 100M; \
        proxy_pass http://buildesk-backend:5000; \
        proxy_set_header Host $host; \
        proxy_set_header X-Real-IP $remote_addr; \
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; \
        proxy_set_header Cookie $http_cookie; \
        proxy_connect_timeout 600s; \
        proxy_send_timeout 600s; \
        proxy_read_timeout 600s; \
        send_timeout 600s; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80