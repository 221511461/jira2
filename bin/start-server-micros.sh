#!/bin/sh

cd "$(dirname "$0")/.."

case "$MICROS_GROUP" in
  "WebServer")
    COMMAND="start:main:production"
  ;;
  "Worker")
    COMMAND="start:worker:production"
  ;;
  *)
    echo "Wrong MICROS_GROUP environment parameter: ${MICROS_GROUP}"
    exit 1
  ;;
esac

export DATABASE_URL=postgres://$PG_DATABASE_ROLE:$PG_DATABASE_PASSWORD@$PG_DATABASE_BOUNCER:$PG_DATABASE_PORT/$PG_DATABASE_SCHEMA

npm run "${COMMAND}"
