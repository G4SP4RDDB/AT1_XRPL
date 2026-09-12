#!/usr/bin/env bash
SESSION_NAME="at1"
echo "Stopping tmux session '$SESSION_NAME' and freeing ports (8788, 8787, 5173)..."
tmux kill-session -t "$SESSION_NAME" 2>/dev/null || true
for port in 8788 8787 5173; do
  pid=$(lsof -ti :$port 2>/dev/null || true)
  if [ -n "$pid" ]; then
    kill -9 $pid 2>/dev/null || true
  fi
done
echo "✅ All AT1 services stopped and ports freed."
