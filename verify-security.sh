#!/bin/bash

echo "🔒 Security Verification Script"
echo "================================"

# Check if .env files exist but are ignored
echo "📋 Checking .env files..."

if [ -f ".env" ]; then
    echo "✅ Frontend .env file exists"
else
    echo "⚠️  Frontend .env file not found"
fi

if [ -f "server-simple/.env" ]; then
    echo "✅ Backend .env file exists"
else
    echo "⚠️  Backend .env file not found"
fi

# Check git status for .env files
echo ""
echo "🔍 Checking git tracking status..."

if git status --porcelain | grep -q "\.env"; then
    echo "❌ DANGER: .env files are being tracked by git!"
    echo "   Run: git rm --cached .env server-simple/.env"
else
    echo "✅ .env files are properly ignored by git"
fi

# Check for hardcoded credentials
echo ""
echo "🔍 Scanning for hardcoded credentials..."

if grep -r "AIzaSy" src/ server-simple/ --exclude-dir=node_modules 2>/dev/null; then
    echo "❌ DANGER: Found hardcoded API keys!"
else
    echo "✅ No hardcoded API keys found"
fi

# Check .gitignore
echo ""
echo "📝 Checking .gitignore..."

if grep -q "\.env" .gitignore; then
    echo "✅ .env files are in .gitignore"
else
    echo "❌ DANGER: .env files not in .gitignore!"
fi

echo ""
echo "🚀 Security check complete!"
echo "If all checks show ✅, your project is safe to push to GitHub."