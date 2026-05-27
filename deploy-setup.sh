#!/bin/bash
set -e

echo "========================================="
echo "  CyberX Deployment Setup on Kali Linux"
echo "========================================="

PROJECT_DIR="$HOME/cyberx"

# Create project directory
mkdir -p "$PROJECT_DIR"
cd "$PROJECT_DIR"

# Extract the archive
echo "[1/5] Extracting project files..."
tar -xzf "$HOME/cyberx-deploy.tar.gz" -C "$PROJECT_DIR"
echo "  ✓ Files extracted"

# Check if Node.js is installed
echo "[2/5] Checking Node.js..."
if command -v node &> /dev/null; then
    echo "  ✓ Node.js $(node -v) found"
else
    echo "  ✗ Node.js not found. Installing..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
    echo "  ✓ Node.js $(node -v) installed"
fi

# Install server dependencies
echo "[3/5] Installing server dependencies..."
cd "$PROJECT_DIR/server"
npm install --production
echo "  ✓ Dependencies installed"

# Create production .env for server if not exists
if [ ! -f "$PROJECT_DIR/server/.env" ]; then
    echo "  ⚠ No .env found for server — you'll need to create one"
fi

# Install cloudflared
echo "[4/5] Checking cloudflared..."
if command -v cloudflared &> /dev/null; then
    echo "  ✓ cloudflared found"
else
    echo "  Installing cloudflared..."
    curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /tmp/cloudflared
    chmod +x /tmp/cloudflared
    sudo mv /tmp/cloudflared /usr/local/bin/cloudflared
    echo "  ✓ cloudflared installed"
fi

# Start everything
echo "[5/5] Starting services..."
cd "$PROJECT_DIR/server"

# Kill any existing instances
pkill -f "node index.js" 2>/dev/null || true
pkill -f "cloudflared tunnel" 2>/dev/null || true
sleep 1

# Start the Node server in background
echo "  Starting Express server on port 3001..."
NODE_ENV=production nohup node index.js > "$PROJECT_DIR/server.log" 2>&1 &
SERVER_PID=$!
echo "  ✓ Server started (PID: $SERVER_PID)"

# Wait for server to be ready
sleep 2

# Start cloudflared tunnel
echo "  Starting Cloudflare tunnel..."
echo ""
echo "========================================="
echo "  TUNNEL STARTING — Your public URL will"
echo "  appear below. Share it with anyone!"
echo "========================================="
echo ""
cloudflared tunnel --url http://localhost:3001
