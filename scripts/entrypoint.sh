#!/bin/bash
set -e

echo "MemGuard API starting..."
echo "Running database migrations..."
alembic upgrade head
echo "Migrations complete."

echo "Starting: $@"
exec "$@"
