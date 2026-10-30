#!/usr/bin/env bash
# Node.js Virtual Environment Activation Script (Bash/Zsh)
# Usage: source ./scripts/activate.sh

echo "=========================================================="
echo " Activating Node.js Project Virtual Environment           "
echo "=========================================================="

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# 1. Add local node_modules/.bin to PATH
if [ -d "$PROJECT_ROOT/node_modules/.bin" ]; then
    export PATH="$PROJECT_ROOT/node_modules/.bin:$PATH"
    echo "[+] Added local node_modules/.bin to PATH"
fi

# 2. Check Node & NPM versions
if command -v node >/dev/null 2>&1; then
    echo "[i] Node Version: $(node -v)"
    echo "[i] NPM Version:  $(npm -v)"
else
    echo "[!] Warning: Node is not installed or not in PATH."
fi

# 3. Create .env if missing
if [ ! -f "$PROJECT_ROOT/.env" ] && [ -f "$PROJECT_ROOT/.env.example" ]; then
    cp "$PROJECT_ROOT/.env.example" "$PROJECT_ROOT/.env"
    echo "[+] Created .env file from .env.example"
fi

# 4. Prompt adjustment
if [ -z "$_NODE_VENV_OLD_PS1" ]; then
    export _NODE_VENV_OLD_PS1="$PS1"
    export PS1="(node-venv) $PS1"
fi

deactivate-node() {
    if [ -n "$_NODE_VENV_OLD_PS1" ]; then
        export PS1="$_NODE_VENV_OLD_PS1"
        unset _NODE_VENV_OLD_PS1
    fi
    unset -f deactivate-node
    echo "[*] Node.js Virtual Environment Deactivated"
}

echo ""
echo "Environment active! Run 'npm run dev' to start the server in development mode."
echo "Type 'deactivate-node' to leave the virtual environment."
