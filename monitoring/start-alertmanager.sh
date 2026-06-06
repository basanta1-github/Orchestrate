#!/bin/sh

export SLACK_WEBHOOK_URL=$(cat /run/secrets/slack_webhook)

echo "Starting Alertmanager..."

exec /bin/alertmanager \
  --config.file=/etc/alertmanager/alertmanager.yml \
  --storage.path=/alertmanager \
  --web.external-url=http://localhost:9093