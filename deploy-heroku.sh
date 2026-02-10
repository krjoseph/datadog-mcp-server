#!/bin/bash

# Exit on error
set -e

# BRANCH_TO_DEPLOY is optional (default: current branch)
# HEROKU_APP is optional (default: datadog-mcp)
BRANCH_TO_DEPLOY="${1:-$(git branch --show-current)}"
HEROKU_APP="${2:-datadog-mcp}"

if [ -z "$BRANCH_TO_DEPLOY" ]; then
    echo "Usage: $0 [BRANCH_TO_DEPLOY] [HEROKU_APP]"
    echo "Example: $0              # deploy current branch"
    echo "Example: $0 main"
    echo "Example: $0 streamable-http datadog-mcp"
    echo ""
    echo "Deploys to Heroku with streamable-http (BYOT: credentials via request headers)."
    exit 1
fi

# Ensure the branch exists locally
if ! git show-ref --quiet "refs/heads/$BRANCH_TO_DEPLOY"; then
    echo "❌ Branch '$BRANCH_TO_DEPLOY' not found locally."
    echo ""
    echo "   Local branches:"
    git branch --list | sed 's/^/     /'
    echo ""
    echo "   Deploy the current branch with: $0"
    echo "   Or checkout/create the branch first, then run $0 $BRANCH_TO_DEPLOY"
    exit 1
fi

echo "🚀 Deploying Datadog MCP Server to Heroku"
echo "=========================================="
echo "Branch: $BRANCH_TO_DEPLOY"
echo "App: $HEROKU_APP"
echo ""

# Check for Heroku CLI
if ! command -v heroku &> /dev/null
then
    echo "❌ Heroku CLI not found. Please install it first."
    echo "   Install: https://devcenter.heroku.com/articles/heroku-cli"
    exit 1
fi

# Login to Heroku (if not already logged in; skip when HEROKU_API_KEY is set for CI)
if [ -z "${HEROKU_API_KEY:-}" ]; then
    echo "🔐 Checking Heroku authentication..."
    heroku whoami &> /dev/null || heroku login
fi

# Create Procfile if it doesn't exist
if [ ! -f Procfile ]; then
    echo "📝 Creating Procfile..."
    echo 'web: node dist/index.js --http' > Procfile
    echo "   ✅ Procfile created."
fi

# Check for uncommitted changes
echo ""
echo "🔍 Checking for uncommitted changes..."
UNCOMMITTED_CHANGES=$(git status --porcelain)
if [ -n "$UNCOMMITTED_CHANGES" ]; then
    echo "⚠️  WARNING: You have uncommitted changes:"
    echo ""
    git status --short
    echo ""
    echo "   These changes will NOT be deployed unless committed."
    echo "   Commit them first with: git add . && git commit -m 'your message'"
    echo ""
    read -p "   Continue deployment anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ Deployment cancelled."
        exit 1
    fi
fi

# Build the project
echo ""
echo "🔨 Building TypeScript..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed. Please fix errors before deploying."
    exit 1
fi
echo "   ✅ Build successful."

# Set Heroku remote to target app
echo ""
echo "🔗 Setting up Heroku remote..."
heroku git:remote -a "$HEROKU_APP" 2>/dev/null || {
    echo "❌ Failed to set Heroku remote. Does the app '$HEROKU_APP' exist?"
    echo "   Create it with: heroku create $HEROKU_APP"
    exit 1
}
echo "   ✅ Heroku remote configured."

# In CI, git push needs the API key in the URL (no interactive auth)
if [ -n "${HEROKU_API_KEY:-}" ]; then
    git remote set-url heroku "https://heroku:${HEROKU_API_KEY}@git.heroku.com/${HEROKU_APP}.git"
fi

# Ensure Node.js buildpack is set (ignore "already set" message)
echo ""
echo "📦 Configuring buildpack..."
heroku buildpacks:set heroku/nodejs -a "$HEROKU_APP" 2>/dev/null || true
echo "   ✅ Node.js buildpack configured."

# Commit Procfile if needed
if [ -n "$(git status --porcelain Procfile 2>/dev/null)" ]; then
    echo ""
    echo "📝 Committing Procfile..."
    git add Procfile
    git commit -m "Add Procfile for Heroku deployment"
    echo "   ✅ Procfile committed."
fi

# Commit package.json if needed (for heroku-postbuild script)
if [ -n "$(git status --porcelain package.json 2>/dev/null)" ]; then
    echo ""
    echo "📝 Committing package.json..."
    git add package.json
    git commit -m "Add heroku-postbuild script for Heroku deployment"
    echo "   ✅ package.json committed."
fi

# Push to Heroku
echo ""
echo "🚀 Deploying to Heroku..."
echo "   This may take a few minutes..."
echo ""
git push heroku $BRANCH_TO_DEPLOY:main

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Deployment successful!"
    echo ""
    
    # Get the actual Heroku app URL
    APP_URL=$(heroku info -a $HEROKU_APP | grep "Web URL" | awk '{print $3}' | tr -d '\r')
    
    if [ -n "$APP_URL" ]; then
        # Remove trailing slash if present
        APP_URL=${APP_URL%/}
        
        echo "📊 View logs:"
        echo "   heroku logs --tail -a $HEROKU_APP"
        echo ""
        echo "🌐 App URL:"
        echo "   $APP_URL"
        echo ""
        echo "🔍 Check status:"
        echo "   curl ${APP_URL}/health"
        echo ""
        echo "📡 MCP endpoint:"
        echo "   ${APP_URL}/mcp"
        echo "   (BYOT: pass DD_API_KEY and DD_APP_KEY via request headers.)"
        echo ""
    else
        echo "📊 View logs:"
        echo "   heroku logs --tail -a $HEROKU_APP"
        echo ""
        echo "🌐 Open app:"
        echo "   heroku open -a $HEROKU_APP"
        echo ""
    fi
else
    echo ""
    echo "❌ Deployment failed!"
    echo "   Check logs: heroku logs --tail -a $HEROKU_APP"
    exit 1
fi
