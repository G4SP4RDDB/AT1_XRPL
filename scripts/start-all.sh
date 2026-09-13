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
  echo "⚡ [1/5] Funding the platform broker & enforcer from the faucet, writing .env / .enforcer.env, generating test accounts..."
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
echo "🖥️  [5/5] Starting tmux session '$SESSION_NAME' with 4 split panes (2x2 grid)..."

# Create detached session and capture pane ID for Enforcer (Top-Left)
PANE_ENFORCER=$(tmux new-session -d -s "$SESSION_NAME" -n "AT1-Services" -x 190 -y 52 -c "$PROJECT_DIR" -P -F "#{pane_id}")
tmux set-option -t "$SESSION_NAME" mouse on
tmux set-option -t "$SESSION_NAME" pane-border-status top
tmux set-option -t "$SESSION_NAME" pane-border-format " #[bold]#{pane_title}#[default] "

# Split horizontally -> PANE_SHIM (Top-Right)
PANE_SHIM=$(tmux split-window -h -t "$PANE_ENFORCER" -c "$PROJECT_DIR" -P -F "#{pane_id}")

# Split PANE_ENFORCER vertically -> PANE_FRONTEND (Bottom-Left)
PANE_FRONTEND=$(tmux split-window -v -t "$PANE_ENFORCER" -c "$PROJECT_DIR/frontend" -P -F "#{pane_id}")

# Split PANE_SHIM vertically -> PANE_SEEDS (Bottom-Right)
PANE_SEEDS=$(tmux split-window -v -t "$PANE_SHIM" -c "$PROJECT_DIR" -P -F "#{pane_id}")

# Set titles & start processes in each exact pane:
# 1. Enforcer
tmux select-pane -t "$PANE_ENFORCER" -T "🛡️ 1. Multisig Enforcer (:8788)"
tmux send-keys -t "$PANE_ENFORCER" "npm run enforcer" C-m
sleep 1

# 2. Chain Shim
tmux select-pane -t "$PANE_SHIM" -T "🔗 2. Chain Shim (:8787)"
tmux send-keys -t "$PANE_SHIM" "ENFORCER_URL=http://localhost:8788 npm run serve" C-m
sleep 1

# 3. Frontend Dev Server
tmux select-pane -t "$PANE_FRONTEND" -T "💻 3. Frontend Dev Server (:5173)"
tmux send-keys -t "$PANE_FRONTEND" "npm run dev -- --host 0.0.0.0" C-m

# 4. Account Seeds & Credentials
tmux select-pane -t "$PANE_SEEDS" -T "💎 4. Account Seeds & Credentials"
tmux send-keys -t "$PANE_SEEDS" "npx tsx scripts/show-accounts.ts" C-m

# Arrange into an equal 2x2 grid and focus pane 4
tmux select-layout -t "$SESSION_NAME:0" tiled
tmux select-pane -t "$PANE_SEEDS"

echo ""
echo "========================================================"
echo "✅ All services & accounts running in tmux '$SESSION_NAME' (4 Panes)!"
echo "========================================================"
echo "  • Volet 0 : 🛡️ Enforcer        -> http://localhost:8788"
echo "  • Volet 1 : 🔗 Chain Shim      -> http://localhost:8787"
echo "  • Volet 2 : 💻 Frontend Vite   -> http://localhost:5173"
echo "  • Volet 3 : 💎 Seeds & Comptes -> Affichage des clés en direct"
echo ""
echo "👉 Pour afficher le terminal tmux split-screen (4 volets) :"
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
