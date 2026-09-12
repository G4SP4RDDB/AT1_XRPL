#!/usr/bin/env bash
set -e

SESSION_NAME="at1"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "========================================================"
echo "🚀 AT1 XRPL — Test, Compile & Launch Pipeline"
echo "========================================================"

echo ""
if [ "$SKIP_FUND" = "1" ]; then
  echo "⚡ [1/5] Skipping account generation (SKIP_FUND=1)..."
else
  echo "⚡ [1/5] Generating fresh accounts from faucet, updating .env & configuring borrower multisig..."
  npx tsx "$PROJECT_DIR/scripts/fund-and-setup.ts"
fi

echo ""
echo "🧪 [2/5] Running Backend & Frontend Test Suites..."
npm test
(cd "$PROJECT_DIR/frontend" && npm test)

echo ""
echo "⚙️  [3/5] Compiling & Typechecking Codebase..."
npx tsc --noEmit
(cd "$PROJECT_DIR/frontend" && npm run build)

echo ""
echo "🧹 [4/5] Ensuring ports (8788, 8787, 5173) and old session are free..."
tmux kill-session -t "$SESSION_NAME" 2>/dev/null || true

# Kill any leftover process on the target ports
for port in 8788 8787 5173; do
  pid=$(lsof -ti :$port 2>/dev/null || true)
  if [ -n "$pid" ]; then
    echo "  Killing leftover process on port $port (PID: $pid)..."
    kill -9 $pid 2>/dev/null || true
  fi
done

echo ""
echo "🖥️  [5/5] Starting tmux session '$SESSION_NAME' with 3 split panes..."

# Create detached session in the project directory with generous window dimensions
tmux new-session -d -s "$SESSION_NAME" -n "AT1-Services" -x 180 -y 50 -c "$PROJECT_DIR"
tmux set-option -t "$SESSION_NAME" mouse on
tmux set-option -t "$SESSION_NAME" pane-border-status top
tmux set-option -t "$SESSION_NAME" pane-border-format " #[bold]#{pane_title}#[default] "

# Pane 0: Enforcer
tmux select-pane -t "$SESSION_NAME:0.0" -T "🛡️ 1. Multisig Enforcer (:8788)"
tmux send-keys -t "$SESSION_NAME:0.0" "npm run enforcer" C-m

# Wait for Enforcer to start
sleep 1

# Pane 1: Chain Shim (horizontal split)
tmux split-window -h -t "$SESSION_NAME:0" -c "$PROJECT_DIR"
tmux select-pane -t "$SESSION_NAME:0.1" -T "🔗 2. Chain Shim (:8787)"
tmux send-keys -t "$SESSION_NAME:0.1" "ENFORCER_URL=http://localhost:8788 npm run serve" C-m

# Wait for Chain Shim to start
sleep 1

# Pane 2: Frontend (vertical split on pane 1)
tmux split-window -v -t "$SESSION_NAME:0.1" -c "$PROJECT_DIR/frontend"
tmux select-pane -t "$SESSION_NAME:0.2" -T "💻 3. Frontend Dev Server (:5173)"
tmux send-keys -t "$SESSION_NAME:0.2" "npm run dev -- --host 0.0.0.0" C-m

# Layout panes: main-vertical for nice side-by-side view
tmux select-layout -t "$SESSION_NAME:0" main-vertical
tmux select-pane -t "$SESSION_NAME:0.0"

echo ""
echo "========================================================"
echo "✅ All 3 processes are running in tmux session '$SESSION_NAME'!"
echo "========================================================"
echo "  • Pane 0 : 🛡️ Enforcer       -> http://localhost:8788"
echo "  • Pane 1 : 🔗 Chain Shim     -> http://localhost:8787"
echo "  • Pane 2 : 💻 Frontend Vite  -> http://localhost:5173"
echo ""
echo "👉 Pour afficher le terminal tmux :"
echo "   tmux attach -t $SESSION_NAME"
echo ""
echo "👉 Pour naviguer entre les fenêtres : Ctrl+b puis les flèches (ou clic souris)"
echo "👉 Pour quitter tmux sans fermer les services : Ctrl+b puis d"
echo "👉 Pour fermer tous les services :"
echo "   npm run stop:tmux   (ou tmux kill-session -t $SESSION_NAME)"
echo "========================================================"

# If running inside an interactive terminal and not already inside tmux, attach automatically
if [ -t 0 ] && [ -t 1 ] && [ -z "$TMUX" ]; then
  tmux attach -t "$SESSION_NAME" || true
fi
