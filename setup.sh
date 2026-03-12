#!/bin/bash
# VAULT macOS App - Quick Start Script

echo "🎬 VAULT for macOS - Setup Script"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Installing..."
    brew install node
fi

# Check if VAULT server is running
echo "📡 Checking VAULT server..."
if curl -s http://localhost:5420/api/stats > /dev/null 2>&1; then
    echo "✅ VAULT server is running on port 5420"
else
    echo "⚠️  VAULT server not detected on port 5420"
    echo "   Please start it with: python3 server.py"
    echo ""
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

echo ""
echo "✅ Setup complete!"
echo ""
echo "To start the app:"
echo "  npm start"
echo ""
echo "To build .dmg installer:"
echo "  npm run build"
echo ""
