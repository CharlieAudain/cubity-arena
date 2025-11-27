#!/bin/bash

# Helper script to add admin email to .env.local

echo "🔧 Cubity Arena - Add Admin Email"
echo ""

# Check if .env.local exists
if [ ! -f .env.local ]; then
    echo "❌ .env.local not found!"
    echo "Creating from .env.example..."
    cp .env.example .env.local
fi

# Prompt for email
read -p "Enter your Gmail address: " EMAIL

# Check if VITE_ADMIN_EMAILS already exists
if grep -q "VITE_ADMIN_EMAILS" .env.local; then
    echo "⚠️  VITE_ADMIN_EMAILS already exists in .env.local"
    read -p "Replace it? (y/n): " REPLACE
    if [ "$REPLACE" = "y" ]; then
        # Replace existing line
        sed -i "s/^VITE_ADMIN_EMAILS=.*/VITE_ADMIN_EMAILS=$EMAIL/" .env.local
        echo "✅ Updated VITE_ADMIN_EMAILS to: $EMAIL"
    fi
else
    # Add new line
    echo "" >> .env.local
    echo "# Admin Emails" >> .env.local
    echo "VITE_ADMIN_EMAILS=$EMAIL" >> .env.local
    echo "✅ Added VITE_ADMIN_EMAILS: $EMAIL"
fi

echo ""
echo "📝 Current .env.local:"
cat .env.local

echo ""
echo "⚠️  IMPORTANT: Restart your dev server for changes to take effect!"
echo "   Run: npm run dev"
